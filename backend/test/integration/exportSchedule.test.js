import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/server';
import pool from '../../src/db';
import xlsx from 'xlsx';
import jwt from 'jsonwebtoken';

describe('Flujo de Exportación de Horarios', () => {
    const testTenantId = 'tenant-export-test';
    let token;

    beforeEach(async () => {
        // Limpiar base de datos de pruebas
        await pool.query('DELETE FROM horarios WHERE tenant_id = $1', [testTenantId]);
        
        // Generar token de prueba
        token = jwt.sign(
            { id: 'user1', tenant_id: testTenantId, rol: 'role-coord' }, 
            process.env.JWT_SECRET || 'planta_academica_super_secret_jwt_key_2026', 
            { expiresIn: '15m' }
        );
    });

    afterAll(async () => {
        await pool.query('DELETE FROM horarios WHERE tenant_id = $1', [testTenantId]);
    });

    it('Criterio 1: Debe exportar un archivo no corrupto con la misma cantidad de registros asignados', async () => {
        // 1. Sembrar datos de prueba
        await pool.query(`
            INSERT INTO horarios (materia, profesor, dia, hora_inicio, hora_fin, tenant_id)
            VALUES 
            ('Matemáticas', 'DOC-001', 'Lunes', '08:00', '10:00', $1),
            ('Física', 'DOC-002', 'Martes', '10:00', '12:00', $1)
        `, [testTenantId]);

        // 2. Realizar petición de exportación
        // IMPORTANTE: responseType('blob') asegura que Supertest no altere el binario
        const res = await request(app)
            .get('/api/schedules/export')
            .set('Authorization', `Bearer ${token}`)
            .responseType('blob'); 

        // 3. Validar respuesta HTTP y Cabeceras
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('spreadsheetml');
        expect(res.headers['content-disposition']).toContain('attachment');

        // 4. Leer el buffer para comprobar que NO está corrupto
        const workbook = xlsx.read(res.body, { type: 'buffer' });
        expect(workbook.SheetNames.length).toBeGreaterThan(0);

        // 5. Validar la cantidad de registros (Criterio 1)
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet);
        
        expect(data.length).toBe(2);
        expect(data[0].materia).toBe('Matemáticas');
    });

    it('Criterio 2: Dado un tenant sin horarios, la exportación debe retornar un archivo con encabezados pero sin registros', async () => {
        // No sembramos datos, la tabla está vacía para este tenant

        const res = await request(app)
            .get('/api/schedules/export')
            .set('Authorization', `Bearer ${token}`)
            .responseType('blob');

        expect(res.status).toBe(200);

        // Leer el archivo generado
        const workbook = xlsx.read(res.body, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        
        // sheet_to_json omite la primera fila de encabezados. 
        // Si no hay datos, el arreglo resultante debe estar vacío (longitud 0).
        const data = xlsx.utils.sheet_to_json(sheet);
        
        expect(data.length).toBe(0);
        
        // Verificamos que la celda A1 (primer encabezado) exista
        expect(sheet['A1']).toBeDefined();
        expect(sheet['A1'].v).toBe('materia');
    });
});
