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

    it('Debe rechazar con 400 si hay empalme de horario', async () => {
        client.conflictRows = [{ start_time: '13:00', end_time: '15:00' }];
        const res = await request(app)
            .post('/api/schedules/upload-excel')
            .attach('file', buildXlsx([validRow]), 'horarios.xlsx');

        expect(res.status).toBe(400);
        expect(res.body.errors[0].error).toContain('Empalme');
        expect(sqlCalls()).toContain('ROLLBACK');
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
