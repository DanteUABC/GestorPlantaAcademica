import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/server';
import pool, { initDatabase } from '../../src/db';
import xlsx from 'xlsx';
import ExcelJS from 'exceljs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../../src/middleware/auth';

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

describe('GET /api/schedules/export-excel - Sábana Oficial con ExcelJS (Task 4.2)', () => {
    const tenantA = 'tenant-excel-a';
    const tenantB = 'tenant-excel-b';
    const tenantEmpty = 'tenant-excel-empty';

    const expectedHeaders = [
        'Folio Horario',
        'Grupo',
        'Clave Materia',
        'Nombre Materia',
        'Créditos',
        'Profesor Titular',
        'Nómina Docente',
        'Aula',
        'Edificio',
        'Tipo Aula',
        'Día',
        'Hora Inicio',
        'Hora Fin'
    ];

    const coordTokenA = jwt.sign(
        { id: 'usr-coord-excel-a', tenant_id: tenantA, role_name: 'Coordinador', email: 'coord.a@excel.edu' },
        JWT_SECRET,
        { expiresIn: '1h' }
    );

    const coordTokenEmpty = jwt.sign(
        { id: 'usr-coord-excel-empty', tenant_id: tenantEmpty, role_name: 'Administrador', email: 'admin.empty@excel.edu' },
        JWT_SECRET,
        { expiresIn: '1h' }
    );

    const teacherTokenA = jwt.sign(
        { id: 'usr-prof-excel-a', tenant_id: tenantA, role_name: 'Profesor', email: 'prof.a@excel.edu' },
        JWT_SECRET,
        { expiresIn: '1h' }
    );

    beforeAll(async () => {
        await initDatabase();

        await pool.query('DELETE FROM tenants WHERE id IN ($1, $2, $3)', [tenantA, tenantB, tenantEmpty]);

        await pool.query(
            `INSERT INTO tenants (id, name, slug) VALUES
             ($1, 'Institución Excel A', 'excel-a'),
             ($2, 'Institución Excel B', 'excel-b'),
             ($3, 'Institución Excel Vacía', 'excel-empty')`,
            [tenantA, tenantB, tenantEmpty]
        );

        await pool.query(
            `INSERT INTO subjects (id, tenant_id, code, name, credits) VALUES
             ('sub-ex-a1', $1, 'MAT-101', 'Cálculo Diferencial', 5),
             ('sub-ex-b1', $2, 'FIS-999', 'Física Exclusiva Tenant B', 4)`,
            [tenantA, tenantB]
        );

        await pool.query(
            `INSERT INTO classrooms (id, tenant_id, name, building, capacity, type) VALUES
             ('cr-ex-a1', $1, 'Aula A-201', 'Edificio Norte', 40, 'Aula Teórica'),
             ('cr-ex-b1', $2, 'Lab B-999', 'Edificio B', 25, 'Laboratorio de Cómputo')`,
            [tenantA, tenantB]
        );

        await pool.query(
            `INSERT INTO users (id, tenant_id, nombre, apellidos, email, role_id, identificador) VALUES
             ('usr-prof-ex-a1', $1, 'Elena', 'Salgado', 'elena.ex@a.edu', 'role-teacher', 'DOC-EX-01'),
             ('usr-prof-ex-b1', $2, 'Carlos', 'Vega', 'carlos.ex@b.edu', 'role-teacher', 'DOC-EX-99')`,
            [tenantA, tenantB]
        );

        await pool.query(
            `INSERT INTO schedules (id, tenant_id, subject_id, teacher_id, classroom_id, day_of_week, start_time, end_time, max_students, group_code) VALUES
             ('sch-ex-a1', $1, 'sub-ex-a1', 'usr-prof-ex-a1', 'cr-ex-a1', 'Lunes', '08:00', '10:00', 35, 'G1'),
             ('sch-ex-b1', $2, 'sub-ex-b1', 'usr-prof-ex-b1', 'cr-ex-b1', 'Martes', '10:00', '12:00', 20, 'G9')`,
            [tenantA, tenantB]
        );
    });

    afterAll(async () => {
        await pool.query('DELETE FROM tenants WHERE id IN ($1, $2, $3)', [tenantA, tenantB, tenantEmpty]);
    });

    it('rechaza con 403 Forbidden a usuarios sin rol de Coordinador o Administrador (ej. Profesor)', async () => {
        const res = await request(app)
            .get('/api/schedules/export-excel')
            .set('Authorization', `Bearer ${teacherTokenA}`);

        expect(res.status).toBe(403);
    });

    it('responde 200 con sábana Excel válida, 13 columnas exactas, estilos y estricto aislamiento multi-tenant', async () => {
        const res = await request(app)
            .get('/api/schedules/export-excel')
            .set('Authorization', `Bearer ${coordTokenA}`)
            .responseType('blob');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain(
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );
        expect(res.headers['content-disposition']).toContain('attachment');
        expect(res.headers['content-disposition']).toContain('sabana_horarios.xlsx');

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(res.body);

        expect(workbook.worksheets.length).toBeGreaterThanOrEqual(1);
        const sheet = workbook.worksheets[0];

        const headerRow = sheet.getRow(1);
        const actualHeaders = headerRow.values.slice(1);
        expect(actualHeaders).toEqual(expectedHeaders);

        // Validar formato corporativo de la fila de encabezados
        const firstHeaderCell = headerRow.getCell(1);
        expect(firstHeaderCell.fill?.fgColor?.argb).toBe('FF1E3A8A');
        expect(firstHeaderCell.font?.bold).toBe(true);
        expect(firstHeaderCell.font?.color?.argb).toBe('FFFFFFFF');
        expect(firstHeaderCell.alignment?.horizontal).toBe('center');

        // Solo debe contener el horario del tenantA (1 fila de datos + 1 fila de encabezados = 2)
        expect(sheet.rowCount).toBe(2);
        const dataRow = sheet.getRow(2).values.slice(1);
        expect(dataRow).toEqual([
            'sch-ex-a1',
            'G1',
            'MAT-101',
            'Cálculo Diferencial',
            5,
            'Elena Salgado',
            'DOC-EX-01',
            'Aula A-201',
            'Edificio Norte',
            'Aula Teórica',
            'Lunes',
            '08:00',
            '10:00'
        ]);
    });

    it('retorna un .xlsx válido únicamente con la fila de encabezados cuando el tenant no tiene horarios', async () => {
        const res = await request(app)
            .get('/api/schedules/export-excel')
            .set('Authorization', `Bearer ${coordTokenEmpty}`)
            .responseType('blob');

        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain(
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        );

        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(res.body);
        const sheet = workbook.worksheets[0];

        expect(sheet.rowCount).toBe(1);
        expect(sheet.getRow(1).values.slice(1)).toEqual(expectedHeaders);
    });
});
