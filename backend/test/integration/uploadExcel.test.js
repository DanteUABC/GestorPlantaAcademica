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

    beforeEach(() => {
        // Cliente de transacción simulado; cada SQL se enruta según su contenido
        client = {
            queries: [],
            conflictRows: [],
            query: vi.fn(async (sql, params) => {
                client.queries.push({ sql, params });
                if (/FROM subjects/.test(sql)) return { rows: [{ id: 'sub-prog', code: 'PROG101' }] };
                if (/FROM users u/.test(sql)) return { rows: [{ id: 'usr-prof-1', email: 'elena.salgado@pavilion.com', name: 'Elena' }] };
                if (/FROM classrooms/.test(sql)) return { rows: [{ id: 'cr-lab1', name: 'Lab 1', capacity: 25 }] };
                if (/^\s*DELETE FROM schedules/.test(sql)) return { rows: [], rowCount: params[1].length };
                if (/FROM schedules/.test(sql)) return { rows: client.conflictRows };
                return { rows: [] };
            }),
            release: vi.fn()
        };
        vi.spyOn(pool, 'connect').mockResolvedValue(client);
    });

    afterEach(() => vi.restoreAllMocks());

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
        // [id, tenant_id, subject_id, teacher_id, classroom_id, day, start, end, max_students]
        expect(insert.params[1]).toBe('tenant-itc');
        expect(insert.params.slice(2)).toEqual(['sub-prog', 'usr-prof-1', 'cr-lab1', 'Miércoles', '14:00', '16:00', 20]);
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
});
