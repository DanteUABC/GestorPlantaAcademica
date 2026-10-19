import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/server';
import pool from '../../src/db';
import jwt from 'jsonwebtoken';

describe('Flujo de Registro Externo y Generación de ID', () => {
    const testEmail = 'test.integration@gmail.com';
    let validToken;

    beforeEach(async () => {
        // Limpiar la BD antes de cada prueba para tener un entorno predecible
        await pool.query('DELETE FROM usuarios_roles');
        await pool.query('DELETE FROM usuarios');
        
        validToken = jwt.sign(
            { email: testEmail, provider: 'google', provider_id: 'integration-123' }, 
            process.env.JWT_SECRET || 'secret123', 
            { expiresIn: '15m' }
        );
    });

    afterAll(async () => {
        await pool.query('DELETE FROM usuarios_roles');
        await pool.query('DELETE FROM usuarios');
    });

    it('Criterio 1: Debe generar el ID, asociarlo al usuario y guardarlo exitosamente', async () => {
        const res = await request(app)
            .post('/api/auth/external-register')
            .send({
                token: validToken,
                nombre: 'Carlos',
                apellidos: 'Prueba',
                rol_id: 2, // 2 = Profesor
                tenant_id: 1 // Asegúrate de que este tenant exista en tu BD de pruebas
            });

        expect([200, 201]).toContain(res.status); // o 201 dependiendo de tu implementación final
        
        // Verificación exhaustiva en BD
        const dbCheck = await pool.query('SELECT * FROM usuarios WHERE email = $1', [testEmail]);
        expect(dbCheck.rows).toHaveLength(1);
        expect(dbCheck.rows[0].identificador).toMatch(/^DOC-\d+$/); // Verifica que empiece con DOC- y termine en números
    });

    it('Criterio 2: Si el servicio falla durante la asignación, hace rollback y no crea al usuario a medias', async () => {
        // Inducimos un fallo forzado enviando un tenant_id inexistente que viole una llave foránea en usuarios_roles
        const res = await request(app)
            .post('/api/auth/external-register')
            .send({
                token: validToken,
                nombre: 'Fallo',
                apellidos: 'Atomicidad',
                rol_id: 2,
                tenant_id: 999999 // Tenant inválido para forzar el error en el segundo INSERT
            });

        expect(res.status).toBe(500);

        // Verificamos que la tabla usuarios esté vacía (el ROLLBACK borró la inserción inicial)
        const dbCheck = await pool.query('SELECT * FROM usuarios WHERE email = $1', [testEmail]);
        expect(dbCheck.rows).toHaveLength(0);
    });

    it('Criterio 3: Debe rechazar la solicitud si el correo externo ya está registrado', async () => {
        // Primer registro (Exitoso)
        await request(app).post('/api/auth/external-register').send({
            token: validToken, nombre: 'Original', apellidos: 'Usuario', rol_id: 2, tenant_id: 1
        });

        // Segundo intento con el mismo token/correo (Fallo esperado)
        const resDuplicate = await request(app).post('/api/auth/external-register').send({
            token: validToken, nombre: 'Clon', apellidos: 'Usuario', rol_id: 2, tenant_id: 1
        });

        expect(resDuplicate.status).toBe(409);
        expect(resDuplicate.body.error).toContain('ya está registrado');
    });
});
