import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createRequire } from 'module';
import request from 'supertest';
import express from 'express';
import XLSX from 'xlsx';

const require = createRequire(import.meta.url);
const { pool } = require('../../src/db');
const scheduleController = require('../../src/controllers/scheduleController');

// App mínima: simula el tenant que inyecta authenticateJWT
const app = express();
app.post(
    '/api/schedules/upload-excel',
    (req, res, next) => { req.tenant_id = 'tenant-itc'; next(); },
    scheduleController.uploadExcelMiddleware,
    scheduleController.uploadExcelSchedule
);

const buildXlsx = (rows) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Horarios');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
};

const validRow = {
    'Código Materia': 'PROG101',
    'Correo Profesor': 'elena.salgado@pavilion.com',
    'Aula': 'Lab 1',
    'Día': 'miércoles',
    'Hora Inicio': '14:00',
    'Hora Fin': '16:00',
    'Cupo': 20
};

describe('Integración: carga de horarios desde Excel (transaccional)', () => {
    let client;
    let persistedSchedules = [];
    let txBuffer = null;

    const catalogSubjects = [
        { id: 'sub-prog', code: 'PROG101', name: 'Programación I' },
        { id: 'sub-mat', code: 'MAT202', name: 'Cálculo Diferencial' },
        { id: 'sub-bd', code: 'BD301', name: 'Bases de Datos' }
    ];
    const catalogTeachers = [
        { id: 'usr-prof-1', email: 'elena.salgado@pavilion.com', name: 'Elena' },
        { id: 'usr-prof-2', email: 'carlos.vega@pavilion.com', name: 'Carlos Vega' }
    ];
    const catalogClassrooms = [
        { id: 'cr-lab1', name: 'Lab 1', capacity: 25 },
        { id: 'cr-aula2', name: 'Aula A-102', capacity: 35 }
    ];

    beforeEach(() => {
        persistedSchedules = [];
        txBuffer = null;

        const handleQuery = async (sql, params = []) => {
            client.queries.push({ sql, params });
            const trimmed = sql.trim().toUpperCase();

            if (trimmed === 'BEGIN') {
                txBuffer = [...persistedSchedules];
                return { rows: [] };
            }
            if (trimmed === 'COMMIT') {
                if (txBuffer !== null) {
                    persistedSchedules = [...txBuffer];
                    txBuffer = null;
                }
                return { rows: [] };
            }
            if (trimmed === 'ROLLBACK') {
                txBuffer = null;
                return { rows: [] };
            }

            if (/FROM subjects/i.test(sql)) {
                return { rows: catalogSubjects };
            }
            if (/FROM users u/i.test(sql)) {
                return { rows: catalogTeachers };
            }
            if (/FROM classrooms/i.test(sql)) {
                return { rows: catalogClassrooms };
            }

            if (/^\s*INSERT INTO schedules/i.test(sql)) {
                const target = txBuffer !== null ? txBuffer : persistedSchedules;
                target.push({
                    id: params[0],
                    tenant_id: params[1],
                    subject_id: params[2],
                    teacher_id: params[3],
                    classroom_id: params[4],
                    day_of_week: params[5],
                    start_time: params[6],
                    end_time: params[7],
                    max_students: params[8],
                    group_code: params[9] || 'G1'
                });
                return { rows: [], rowCount: 1 };
            }

            if (/^\s*DELETE FROM schedules/i.test(sql)) {
                const target = txBuffer !== null ? txBuffer : persistedSchedules;
                if (params[1] && Array.isArray(params[1])) {
                    const idsToRemove = new Set(params[1]);
                    const before = target.length;
                    const filtered = target.filter((r) => !(r.tenant_id === params[0] && idsToRemove.has(r.id)));
                    target.length = 0;
                    target.push(...filtered);
                    const removedFromTarget = before - target.length;
                    const removedFromConflicts = client.conflictRows.filter((r) => idsToRemove.has(r.id)).length;
                    return { rows: [], rowCount: removedFromTarget || removedFromConflicts || params[1].length };
                }
                const before = target.length;
                const filtered = target.filter((r) => r.tenant_id !== params[0]);
                target.length = 0;
                target.push(...filtered);
                return { rows: [], rowCount: before - target.length };
            }

            if (/SELECT\s+COUNT\(\*\)/i.test(sql) && /FROM schedules/i.test(sql)) {
                const tenantRows = persistedSchedules.filter((r) => !params[0] || r.tenant_id === params[0]);
                return {
                    rows: [{ count: String(tenantRows.length), total: tenantRows.length }]
                };
            }

            if (/SELECT\s+\*\s+FROM schedules/i.test(sql)) {
                const tenantRows = persistedSchedules.filter((r) => !params[0] || r.tenant_id === params[0]);
                return { rows: [...tenantRows] };
            }

            if (/FROM schedules/i.test(sql)) {
                const activeRows = (txBuffer !== null ? txBuffer : persistedSchedules)
                    .filter((r) => !params[0] || r.tenant_id === params[0])
                    .map((r) => ({
                        ...r,
                        subject_name: catalogSubjects.find((s) => s.id === r.subject_id)?.name || 'Materia',
                        teacher_name: catalogTeachers.find((t) => t.id === r.teacher_id)?.name || 'Profesor',
                        classroom_name: catalogClassrooms.find((c) => c.id === r.classroom_id)?.name || 'Aula'
                    }));
                return { rows: [...client.conflictRows, ...activeRows] };
            }

            return { rows: [] };
        };

        client = {
            queries: [],
            conflictRows: [],
            query: vi.fn(handleQuery),
            release: vi.fn()
        };
        vi.spyOn(pool, 'connect').mockResolvedValue(client);
        vi.spyOn(pool, 'query').mockImplementation(handleQuery);
    });

    afterEach(async () => {
        await pool.query('DELETE FROM schedules WHERE tenant_id = $1', ['tenant-itc']);
        vi.restoreAllMocks();
    });

    const sqlCalls = () => client.queries.map((q) => q.sql.trim().split(/\s+/)[0]);

    it('Debe insertar filas válidas con tenant_id y confirmar con COMMIT (201)', async () => {
        const res = await request(app)
            .post('/api/schedules/upload-excel')
            .attach('file', buildXlsx([validRow]), 'horarios.xlsx');

        expect(res.status).toBe(201);
        expect(res.body.inserted).toBe(1);
        expect(sqlCalls()[0]).toBe('BEGIN');
        expect(sqlCalls()).toContain('COMMIT');
        expect(sqlCalls()).not.toContain('ROLLBACK');

        const insert = client.queries.find((q) => /INSERT INTO schedules/.test(q.sql));
        // [id, tenant_id, subject_id, teacher_id, classroom_id, day, start, end, max_students, group_code]
        expect(insert.params[1]).toBe('tenant-itc');
        expect(insert.params.slice(2)).toEqual(['sub-prog', 'usr-prof-1', 'cr-lab1', 'Miércoles', '14:00', '16:00', 20, 'G1']);
        expect(client.release).toHaveBeenCalled();
    });

    it('Debe filtrar por tenant_id en todos los catálogos consultados', async () => {
        await request(app)
            .post('/api/schedules/upload-excel')
            .attach('file', buildXlsx([validRow]), 'horarios.xlsx');

        const selects = client.queries.filter((q) => /^\s*SELECT/.test(q.sql));
        expect(selects.length).toBeGreaterThanOrEqual(3);
        selects.forEach((q) => {
            expect(q.sql).toContain('tenant_id = $1');
            expect(q.params[0]).toBe('tenant-itc');
        });
    });

    it('Debe hacer ROLLBACK y no insertar nada si alguna fila es inválida (400)', async () => {
        const badRow = { ...validRow, 'Código Materia': 'NOEXISTE' };
        const res = await request(app)
            .post('/api/schedules/upload-excel')
            .attach('file', buildXlsx([validRow, badRow]), 'horarios.xlsx');

        expect(res.status).toBe(400);
        expect(res.body.errors[0].fila).toBe(3);
        expect(sqlCalls()).toContain('ROLLBACK');
        expect(sqlCalls()).not.toContain('COMMIT');
        expect(client.release).toHaveBeenCalled();
    });

    // Horario ya existente en BD del mismo profesor y aula (miércoles)
    const existingRow = (start, end) => ({
        id: 'sch-sample-3',
        teacher_id: 'usr-prof-1',
        classroom_id: 'cr-lab1',
        day_of_week: 'Miércoles',
        start_time: start,
        end_time: end,
        subject_name: 'Bases de Datos',
        teacher_name: 'Elena',
        classroom_name: 'Lab 1'
    });

    it('Debe devolver 409 con el detalle de empalmes y hacer ROLLBACK si no se envía force', async () => {
        client.conflictRows = [existingRow('13:00', '15:00')];
        const res = await request(app)
            .post('/api/schedules/upload-excel')
            .attach('file', buildXlsx([validRow]), 'horarios.xlsx');

        expect(res.status).toBe(409);
        expect(res.body.conflictType).toBe('SCHEDULE_OVERLAP');
        expect(res.body.requiresForce).toBe(true);
        // Profesor y aula coinciden: 2 conflictos con la misma fila de BD
        expect(res.body.conflicts.map((c) => c.tipo).sort()).toEqual(['AULA', 'PROFESOR']);
        expect(res.body.conflicts[0].origen).toBe('BD');
        expect(res.body.conflicts[0].nuevo.fila).toBe(2);
        expect(res.body.conflicts[0].existente.id).toBe('sch-sample-3');
        expect(sqlCalls()).toContain('ROLLBACK');
        expect(sqlCalls()).not.toContain('COMMIT');
        expect(sqlCalls()).not.toContain('DELETE');
        expect(sqlCalls()).not.toContain('INSERT');
    });

    it('Debe sobrescribir los registros de BD que chocan cuando force=true (201)', async () => {
        client.conflictRows = [existingRow('13:00', '15:00')];
        const res = await request(app)
            .post('/api/schedules/upload-excel')
            .field('force', 'true')
            .attach('file', buildXlsx([validRow]), 'horarios.xlsx');

        expect(res.status).toBe(201);
        expect(res.body.inserted).toBe(1);
        expect(res.body.replaced).toBe(1); // un solo registro de BD, aunque chocó por profesor y por aula

        const del = client.queries.find((q) => /DELETE FROM schedules/.test(q.sql));
        expect(del.sql).toContain('tenant_id = $1');
        expect(del.params).toEqual(['tenant-itc', ['sch-sample-3']]);

        // El DELETE ocurre antes del INSERT y todo dentro de la transacción
        const calls = sqlCalls();
        expect(calls.indexOf('DELETE')).toBeLessThan(calls.indexOf('INSERT'));
        expect(calls[0]).toBe('BEGIN');
        expect(calls).toContain('COMMIT');
        expect(calls).not.toContain('ROLLBACK');
    });

    it('Debe aceptar force=true también por query string (?force=true)', async () => {
        client.conflictRows = [existingRow('13:00', '15:00')];
        const res = await request(app)
            .post('/api/schedules/upload-excel?force=true')
            .attach('file', buildXlsx([validRow]), 'horarios.xlsx');

        expect(res.status).toBe(201);
        expect(res.body.replaced).toBe(1);
    });

    it('Debe rechazar con 409 un empalme entre filas del mismo Excel aunque force=true', async () => {
        const rowB = { ...validRow, 'Hora Inicio': '15:00', 'Hora Fin': '17:00' }; // choca con 14:00-16:00
        const res = await request(app)
            .post('/api/schedules/upload-excel')
            .field('force', 'true')
            .attach('file', buildXlsx([validRow, rowB]), 'horarios.xlsx');

        expect(res.status).toBe(409);
        expect(res.body.conflictType).toBe('SCHEDULE_OVERLAP_IN_FILE');
        expect(res.body.requiresForce).toBe(false);
        expect(res.body.conflicts.every((c) => c.origen === 'EXCEL')).toBe(true);
        expect(res.body.conflicts[0].mensaje).toContain('Filas 2 y 3');
        expect(sqlCalls()).toContain('ROLLBACK');
        expect(sqlCalls()).not.toContain('DELETE');
        expect(sqlCalls()).not.toContain('INSERT');
    });

    it('No debe marcar empalme si los bloques son continuos (201 sin force)', async () => {
        client.conflictRows = [existingRow('12:00', '14:00')]; // termina justo cuando empieza validRow (14:00)
        const res = await request(app)
            .post('/api/schedules/upload-excel')
            .attach('file', buildXlsx([validRow]), 'horarios.xlsx');

        expect(res.status).toBe(201);
        expect(res.body.replaced).toBe(0);
        expect(sqlCalls()).not.toContain('DELETE');
    });

    it('Debe devolver 400 si faltan columnas obligatorias', async () => {
        const res = await request(app)
            .post('/api/schedules/upload-excel')
            .attach('file', buildXlsx([{ 'Código Materia': 'PROG101' }]), 'horarios.xlsx');

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Faltan columnas obligatorias');
        expect(pool.connect).not.toHaveBeenCalled();
    });

    it('Debe devolver 400 si no se adjunta archivo o la extensión no es .xlsx', async () => {
        const sinArchivo = await request(app).post('/api/schedules/upload-excel');
        expect(sinArchivo.status).toBe(400);

        const txt = await request(app)
            .post('/api/schedules/upload-excel')
            .attach('file', Buffer.from('hola'), 'horarios.txt');
        expect(txt.status).toBe(400);
        expect(txt.body.error).toContain('.xlsx');
    });

    it('Debe hacer ROLLBACK y devolver 500 si falla el INSERT', async () => {
        const original = client.query.getMockImplementation();
        client.query.mockImplementation(async (sql, params) => {
            if (/INSERT INTO schedules/.test(sql)) throw new Error('fallo de BD');
            return original(sql, params);
        });

        const res = await request(app)
            .post('/api/schedules/upload-excel')
            .attach('file', buildXlsx([validRow]), 'horarios.xlsx');

        expect(res.status).toBe(500);
        expect(sqlCalls()).toContain('ROLLBACK');
        expect(client.release).toHaveBeenCalled();
    });

    // =========================================================================
    // CRITERIOS DE ACEPTACIÓN: PROCESO COMPLETO DE CARGA E IMPORTACIÓN EXCEL
    // =========================================================================
    describe('Proceso completo de carga e importación desde Excel (Criterios 1, 2 y 3)', () => {
        const buildTenValidAssignments = () => [
            { 'Código Materia': 'PROG101', 'Correo Profesor': 'elena.salgado@pavilion.com', 'Aula': 'Lab 1', 'Día': 'Lunes', 'Hora Inicio': '07:00', 'Hora Fin': '09:00', 'Cupo': 20 },
            { 'Código Materia': 'PROG101', 'Correo Profesor': 'elena.salgado@pavilion.com', 'Aula': 'Lab 1', 'Día': 'Lunes', 'Hora Inicio': '09:00', 'Hora Fin': '11:00', 'Cupo': 22 },
            { 'Código Materia': 'MAT202', 'Correo Profesor': 'carlos.vega@pavilion.com', 'Aula': 'Aula A-102', 'Día': 'Lunes', 'Hora Inicio': '07:00', 'Hora Fin': '09:00', 'Cupo': 30 },
            { 'Código Materia': 'MAT202', 'Correo Profesor': 'carlos.vega@pavilion.com', 'Aula': 'Aula A-102', 'Día': 'Martes', 'Hora Inicio': '08:00', 'Hora Fin': '10:00', 'Cupo': 28 },
            { 'Código Materia': 'BD301', 'Correo Profesor': 'elena.salgado@pavilion.com', 'Aula': 'Lab 1', 'Día': 'Martes', 'Hora Inicio': '10:00', 'Hora Fin': '12:00', 'Cupo': 25 },
            { 'Código Materia': 'PROG101', 'Correo Profesor': 'elena.salgado@pavilion.com', 'Aula': 'Lab 1', 'Día': 'Miércoles', 'Hora Inicio': '08:00', 'Hora Fin': '10:00', 'Cupo': 20 },
            { 'Código Materia': 'BD301', 'Correo Profesor': 'carlos.vega@pavilion.com', 'Aula': 'Aula A-102', 'Día': 'Miércoles', 'Hora Inicio': '10:00', 'Hora Fin': '12:00', 'Cupo': 32 },
            { 'Código Materia': 'MAT202', 'Correo Profesor': 'carlos.vega@pavilion.com', 'Aula': 'Aula A-102', 'Día': 'Jueves', 'Hora Inicio': '08:00', 'Hora Fin': '10:00', 'Cupo': 30 },
            { 'Código Materia': 'BD301', 'Correo Profesor': 'elena.salgado@pavilion.com', 'Aula': 'Lab 1', 'Día': 'Viernes', 'Hora Inicio': '09:00', 'Hora Fin': '11:00', 'Cupo': 24 },
            { 'Código Materia': 'PROG101', 'Correo Profesor': 'carlos.vega@pavilion.com', 'Aula': 'Aula A-102', 'Día': 'Sábado', 'Hora Inicio': '08:00', 'Hora Fin': '10:00', 'Cupo': 25 }
        ];

        it('Criterio 1: Dado un archivo Excel válido con 10 asignaciones, registra exactamente 10 filas en la tabla schedules', async () => {
            const tenRows = buildTenValidAssignments();

            const res = await request(app)
                .post('/api/schedules/upload-excel')
                .attach('file', buildXlsx(tenRows), 'diez_horarios.xlsx');

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.inserted).toBe(10);

            const countRes = await pool.query(
                'SELECT COUNT(*) AS count FROM schedules WHERE tenant_id = $1',
                ['tenant-itc']
            );
            expect(Number(countRes.rows[0].count)).toBe(10);
        });

        it('Criterio 2: Dado un archivo Excel que contenga 1 registro con solapación de horarios, revierte la transacción (ROLLBACK) y notifica el error específico', async () => {
            const nineValid = buildTenValidAssignments().slice(0, 9);
            // Fila 10 se solapa con la Fila 1 (Lunes 07:00-09:00, misma profesora Elena y Lab 1 en horario 08:00-10:00)
            const overlappingRow = {
                'Código Materia': 'BD301',
                'Correo Profesor': 'elena.salgado@pavilion.com',
                'Aula': 'Lab 1',
                'Día': 'Lunes',
                'Hora Inicio': '08:00',
                'Hora Fin': '10:00',
                'Cupo': 20
            };

            const res = await request(app)
                .post('/api/schedules/upload-excel')
                .attach('file', buildXlsx([...nineValid, overlappingRow]), 'con_solapamiento.xlsx');

            expect(res.status).toBe(409);
            expect(res.body.success).toBe(false);
            expect(res.body.conflictType).toBe('SCHEDULE_OVERLAP');
            expect(res.body.conflicts.length).toBeGreaterThan(0);
            expect(res.body.conflicts[0].mensaje).toContain('Filas 2 y 11');
            expect(sqlCalls()).toContain('ROLLBACK');
            expect(sqlCalls()).not.toContain('COMMIT');

            // Verificación en BD: 0 filas persistidas tras el ROLLBACK
            const countRes = await pool.query(
                'SELECT COUNT(*) AS count FROM schedules WHERE tenant_id = $1',
                ['tenant-itc']
            );
            expect(Number(countRes.rows[0].count)).toBe(0);
        });

        it('Criterio 3: Verifica mediante consulta directa a la base de datos posterior al guardado que los campos persistidos coinciden exactamente con el Excel', async () => {
            const tenRows = buildTenValidAssignments();

            const res = await request(app)
                .post('/api/schedules/upload-excel')
                .attach('file', buildXlsx(tenRows), 'diez_horarios.xlsx');

            expect(res.status).toBe(201);

            const dbRes = await pool.query(
                'SELECT * FROM schedules WHERE tenant_id = $1',
                ['tenant-itc']
            );

            expect(dbRes.rows).toHaveLength(10);

            // Verificar coincidencia exacta del primer y último registro persistido
            const firstSaved = dbRes.rows[0];
            expect(firstSaved).toMatchObject({
                tenant_id: 'tenant-itc',
                subject_id: 'sub-prog',
                teacher_id: 'usr-prof-1',
                classroom_id: 'cr-lab1',
                day_of_week: 'Lunes',
                start_time: '07:00',
                end_time: '09:00',
                max_students: 20
            });

            const lastSaved = dbRes.rows[9];
            expect(lastSaved).toMatchObject({
                tenant_id: 'tenant-itc',
                subject_id: 'sub-prog',
                teacher_id: 'usr-prof-2',
                classroom_id: 'cr-aula2',
                day_of_week: 'Sábado',
                start_time: '08:00',
                end_time: '10:00',
                max_students: 25
            });
        });
    });
});
