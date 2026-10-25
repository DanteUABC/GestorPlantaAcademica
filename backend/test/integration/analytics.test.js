import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../src/server';
import pool, { initDatabase } from '../../src/db';
import jwt from 'jsonwebtoken';
import { performance } from 'perf_hooks';

describe('Motor de Analítica y SLA', () => {
    const testTenantId = 'tenant-analytics';
    const JWT_SECRET = process.env.JWT_SECRET || 'planta_academica_super_secret_jwt_key_2026';
    let token;

    beforeAll(async () => {
        // Inicializar DB y calentar conexión para asegurar SLA < 250ms
        await initDatabase();
        await pool.query('SELECT 1');

        // Asegurar que el tenant exista en tenants para soporte de llaves foráneas en classrooms
        await pool.query(`
            INSERT INTO tenants (id, name, slug)
            VALUES ($1, 'Tenant Analitica', 'tenant-analitica')
            ON CONFLICT (id) DO NOTHING;
        `, [testTenantId]);
    });

    beforeEach(async () => {
        token = jwt.sign(
            { id: 'coord1', tenant_id: testTenantId, rol: 'role-coord', role: 'Coordinador' }, 
            JWT_SECRET,
            { expiresIn: '15m' }
        );
    });

    afterAll(async () => {
        await pool.query('DELETE FROM horarios WHERE tenant_id = $1', [testTenantId]);
        // Limpieza en tabla de classrooms / vista aulas
        try {
            await pool.query('DELETE FROM classrooms WHERE tenant_id = $1', [testTenantId]);
        } catch (e) {
            await pool.query('DELETE FROM aulas WHERE tenant_id = $1', [testTenantId]);
        }
        await pool.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
    });

    it('Criterio 1: Debe retornar la matriz de aulas completando en menos de 250ms (SLA)', async () => {
        const start = performance.now();
        const res = await request(app).get('/api/analytics/classroom-occupancy').set('Authorization', `Bearer ${token}`);
        const duration = performance.now() - start;

        expect(res.status).toBe(200);
        expect(res.body.length).toBeGreaterThan(0);
        expect(res.body[0]).toHaveProperty('porcentaje_ocupacion');
        expect(duration).toBeLessThan(250); 
    });

    it('Criterio 2: Debe agrupar correctamente a los docentes según sus horas asignadas', async () => {
        const res = await request(app).get('/api/analytics/teacher-utilization').set('Authorization', `Bearer ${token}`);
        
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('profesores_subutilizados');
        expect(res.body).toHaveProperty('total_profesores');
    });

    it('Criterio 3: Debe calcular métricas precisas con datos de prueba sembrados', async () => {
        // 1. Limpiar datos previos
        await pool.query('DELETE FROM horarios WHERE tenant_id = $1', [testTenantId]);
        await pool.query('DELETE FROM classrooms WHERE tenant_id = $1', [testTenantId]);

        // 2. Sembrar 2 aulas
        await pool.query(`
            INSERT INTO classrooms (id, tenant_id, name, building, capacity, type)
            VALUES 
            ('cr-an-1', $1, 'Aula Analitica 1', 'Edificio A', 30, 'Aula Teórica'),
            ('cr-an-2', $1, 'Aula Analitica 2', 'Edificio A', 30, 'Aula Teórica')
            ON CONFLICT (id) DO NOTHING;
        `, [testTenantId]);

        // 3. Sembrar horarios con tres profesores en rangos distintos:
        // - Docente Subutilizado: 8 horas (< 10)
        // - Docente Óptimo: 20 horas (10 a 40)
        // - Docente Sobrecupo: 42 horas (> 40)
        await pool.query(`
            INSERT INTO horarios (materia, profesor, dia, hora_inicio, hora_fin, tenant_id)
            VALUES 
            -- Docente 1 (8 hrs): Lunes y Martes de 08:00 a 12:00 (4h * 2 = 8h)
            ('Materia 1', 'DOC-SUB', 'Lunes', '08:00', '12:00', $1),
            ('Materia 1', 'DOC-SUB', 'Martes', '08:00', '12:00', $1),
            -- Docente 2 (20 hrs): Lunes a Viernes de 14:00 a 18:00 (4h * 5 = 20h)
            ('Materia 2', 'DOC-OPT', 'Lunes', '14:00', '18:00', $1),
            ('Materia 2', 'DOC-OPT', 'Martes', '14:00', '18:00', $1),
            ('Materia 2', 'DOC-OPT', 'Miércoles', '14:00', '18:00', $1),
            ('Materia 2', 'DOC-OPT', 'Jueves', '14:00', '18:00', $1),
            ('Materia 2', 'DOC-OPT', 'Viernes', '14:00', '18:00', $1),
            -- Docente 3 (42 hrs): Lunes a Sábado de 07:00 a 14:00 (7h * 6 = 42h)
            ('Materia 3', 'DOC-SOB', 'Lunes', '07:00', '14:00', $1),
            ('Materia 3', 'DOC-SOB', 'Martes', '07:00', '14:00', $1),
            ('Materia 3', 'DOC-SOB', 'Miércoles', '07:00', '14:00', $1),
            ('Materia 3', 'DOC-SOB', 'Jueves', '07:00', '14:00', $1),
            ('Materia 3', 'DOC-SOB', 'Viernes', '07:00', '14:00', $1),
            ('Materia 3', 'DOC-SOB', 'Sábado', '07:00', '14:00', $1)
        `, [testTenantId]);

        // Probar endpoint de utilización docente con datos
        const resDocentes = await request(app)
            .get('/api/analytics/teacher-utilization')
            .set('Authorization', `Bearer ${token}`);

        expect(resDocentes.status).toBe(200);
        expect(Number(resDocentes.body.total_profesores)).toBe(3);
        expect(Number(resDocentes.body.profesores_subutilizados)).toBe(1);
        expect(Number(resDocentes.body.profesores_optimos)).toBe(1);
        expect(Number(resDocentes.body.profesores_sobrecupo)).toBe(1);

        // Probar matriz de ocupación con las aulas totales y ocupadas
        const resAulas = await request(app)
            .get('/api/analytics/classroom-occupancy')
            .set('Authorization', `Bearer ${token}`);

        expect(resAulas.status).toBe(200);
        expect(resAulas.body.length).toBe(84); // 6 días * 14 bloques
        
        // Bloque 7 en Lunes tiene al docente DOC-SOB ocupando aula
        const lunes7 = resAulas.body.find(b => b.dia === 'Lunes' && b.hora_inicio === 7);
        expect(lunes7).toBeDefined();
        expect(Number(lunes7.aulas_totales)).toBe(2);
        expect(Number(lunes7.aulas_ocupadas)).toBe(1);
        expect(Number(lunes7.porcentaje_ocupacion)).toBe(50);
    });

    it('Debe rechazar solicitudes no autenticadas con 401', async () => {
        const resAulas = await request(app).get('/api/analytics/classroom-occupancy');
        expect(resAulas.status).toBe(401);

        const resDocentes = await request(app).get('/api/analytics/teacher-utilization');
        expect(resDocentes.status).toBe(401);
    });
});
