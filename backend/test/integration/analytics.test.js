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

        // Calentamiento previo de la ruta Express / JWT para evitar overhead de arranque inicial
        const warmupToken = jwt.sign(
            { id: 'coord-warmup', tenant_id: testTenantId, rol: 'role-coord', role: 'Coordinador' }, 
            JWT_SECRET,
            { expiresIn: '15m' }
        );
        await request(app).get('/api/analytics/classroom-occupancy').set('Authorization', `Bearer ${warmupToken}`);
    });

    beforeEach(async () => {
        token = jwt.sign(
            { id: 'coord1', tenant_id: testTenantId, rol: 'role-coord', role: 'Coordinador' }, 
            JWT_SECRET,
            { expiresIn: '15m' }
        );
    });

    afterAll(async () => {
        await pool.query('DELETE FROM schedules WHERE tenant_id = $1', [testTenantId]);
        await pool.query('DELETE FROM horarios WHERE tenant_id = $1', [testTenantId]);
        await pool.query('DELETE FROM classrooms WHERE tenant_id = $1', [testTenantId]);
        await pool.query('DELETE FROM subjects WHERE tenant_id = $1', [testTenantId]);
        await pool.query('DELETE FROM users WHERE tenant_id = $1', [testTenantId]);
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

    it('Criterio 3: Debe calcular métricas precisas con datos de prueba sembrados en horarios (retrocompatibilidad)', async () => {
        // 1. Limpiar datos previos
        await pool.query('DELETE FROM schedules WHERE tenant_id = $1', [testTenantId]);
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

    it('Criterio 4: Debe consultar la tabla oficial "schedules" y normalizar días con mayúsculas y acentos (Bugfix)', async () => {
        // 1. Limpiar datos previos
        await pool.query('DELETE FROM schedules WHERE tenant_id = $1', [testTenantId]);
        await pool.query('DELETE FROM horarios WHERE tenant_id = $1', [testTenantId]);
        await pool.query('DELETE FROM classrooms WHERE tenant_id = $1', [testTenantId]);
        await pool.query('DELETE FROM subjects WHERE tenant_id = $1', [testTenantId]);
        await pool.query('DELETE FROM users WHERE tenant_id = $1', [testTenantId]);

        // 2. Sembrar aulas, materias y usuarios en el módulo oficial
        await pool.query(`
            INSERT INTO classrooms (id, tenant_id, name, building, capacity, type)
            VALUES 
            ('cr-fix-1', $1, 'Aula 101', 'Edificio Central', 40, 'Aula Teórica'),
            ('cr-fix-2', $1, 'Aula 102', 'Edificio Central', 40, 'Aula Teórica')
            ON CONFLICT (id) DO NOTHING;
        `, [testTenantId]);

        await pool.query(`
            INSERT INTO subjects (id, tenant_id, code, name, credits)
            VALUES ('sub-fix-1', $1, 'MAT-FIX', 'Cálculo Avanzado', 4)
            ON CONFLICT (id) DO NOTHING;
        `, [testTenantId]);

        await pool.query(`
            INSERT INTO users (id, tenant_id, nombre, apellidos, email, role_id)
            VALUES 
            ('usr-fix-1', $1, 'Profesor', 'Miercoles', 'prof1@analitica.com', 'role-teacher'),
            ('usr-fix-2', $1, 'Profesor', 'Sabado', 'prof2@analitica.com', 'role-teacher')
            ON CONFLICT (id) DO NOTHING;
        `, [testTenantId]);

        // 3. Sembrar en 'schedules' usando variantes de acentos y mayúsculas:
        // - 'miercoles' (minúscula y sin acento) de 08:00 a 11:00 (3 hrs)
        // - 'JUEVES' (mayúscula completa) de 08:00 a 11:00 (3 hrs)
        //   -> usr-fix-1 total: 6 hrs (< 10 -> profesores_subutilizados: 1)
        // - 'sabado' (minúscula y sin acento) de 07:00 a 19:00 (12 hrs)
        //   -> usr-fix-2 total: 12 hrs (10 a 40 -> profesores_optimos: 1)
        await pool.query(`
            INSERT INTO schedules (id, tenant_id, subject_id, teacher_id, classroom_id, day_of_week, start_time, end_time, max_students)
            VALUES 
            ('sch-fix-1', $1, 'sub-fix-1', 'usr-fix-1', 'cr-fix-1', 'miercoles', '08:00', '11:00', 30),
            ('sch-fix-2', $1, 'sub-fix-1', 'usr-fix-1', 'cr-fix-1', 'JUEVES', '08:00', '11:00', 30),
            ('sch-fix-3', $1, 'sub-fix-1', 'usr-fix-2', 'cr-fix-2', 'sabado', '07:00', '19:00', 30);
        `, [testTenantId]);

        // Probar utilización docente desde 'schedules'
        const resDocentes = await request(app)
            .get('/api/analytics/teacher-utilization')
            .set('Authorization', `Bearer ${token}`);

        expect(resDocentes.status).toBe(200);
        expect(Number(resDocentes.body.total_profesores)).toBe(2);
        expect(Number(resDocentes.body.profesores_subutilizados)).toBe(1);
        expect(Number(resDocentes.body.profesores_optimos)).toBe(1);
        expect(Number(resDocentes.body.profesores_sobrecupo)).toBe(0);

        // Probar ocupación física reconociendo 'miercoles' como 'Miércoles' y 'sabado' como 'Sábado'
        const resAulas = await request(app)
            .get('/api/analytics/classroom-occupancy')
            .set('Authorization', `Bearer ${token}`);

        expect(resAulas.status).toBe(200);
        expect(resAulas.body.length).toBe(84);

        // Validar que el bloque 'Miércoles' a las 8hrs mapee la clase insertada con 'miercoles'
        const miercoles8 = resAulas.body.find(b => b.dia === 'Miércoles' && b.hora_inicio === 8);
        expect(miercoles8).toBeDefined();
        expect(Number(miercoles8.aulas_ocupadas)).toBe(1);
        expect(Number(miercoles8.aulas_totales)).toBe(2);
        expect(Number(miercoles8.porcentaje_ocupacion)).toBe(50);

        // Validar que el bloque 'Sábado' a las 7hrs mapee la clase insertada con 'sabado'
        const sabado7 = resAulas.body.find(b => b.dia === 'Sábado' && b.hora_inicio === 7);
        expect(sabado7).toBeDefined();
        expect(Number(sabado7.aulas_ocupadas)).toBe(1);
        expect(Number(sabado7.aulas_totales)).toBe(2);
        expect(Number(sabado7.porcentaje_ocupacion)).toBe(50);
    });

    it('Criterio 5: Debe respetar el filtro dinámico por edificio (?edificio=...) en aulas_totales y aulas_ocupadas', async () => {
        // En testTenantId tenemos cr-fix-1 y cr-fix-2 en 'Edificio Central'.
        // Añadir una tercera aula en un edificio distinto ('Edificio de Ciencias'):
        await pool.query(`
            INSERT INTO classrooms (id, tenant_id, name, building, capacity, type)
            VALUES ('cr-fix-ciencias', $1, 'Aula Ciencias 1', 'Edificio de Ciencias', 25, 'Laboratorio')
            ON CONFLICT (id) DO NOTHING;
        `, [testTenantId]);

        // 1. Sin filtro de edificio: aulas_totales debe ser 3
        const resSinFiltro = await request(app)
            .get('/api/analytics/classroom-occupancy')
            .set('Authorization', `Bearer ${token}`);
        expect(resSinFiltro.status).toBe(200);
        expect(Number(resSinFiltro.body[0].aulas_totales)).toBe(3);

        // 2. Con filtro edificio = 'Edificio Central': aulas_totales debe ser 2
        const resCentral = await request(app)
            .get('/api/analytics/classroom-occupancy?edificio=Edificio%20Central')
            .set('Authorization', `Bearer ${token}`);
        expect(resCentral.status).toBe(200);
        expect(Number(resCentral.body[0].aulas_totales)).toBe(2);

        // Bloque Miércoles 8: clase de cr-fix-1 está en 'Edificio Central', debe figurar 1 ocupada de 2 (50%)
        const miercoles8Central = resCentral.body.find(b => b.dia === 'Miércoles' && b.hora_inicio === 8);
        expect(Number(miercoles8Central.aulas_ocupadas)).toBe(1);
        expect(Number(miercoles8Central.aulas_totales)).toBe(2);
        expect(Number(miercoles8Central.porcentaje_ocupacion)).toBe(50);

        // 3. Con filtro edificio = 'Edificio de Ciencias': aulas_totales debe ser 1 y ocupadas 0 (0%)
        const resCiencias = await request(app)
            .get('/api/analytics/classroom-occupancy?edificio=Edificio%20de%20Ciencias')
            .set('Authorization', `Bearer ${token}`);
        expect(resCiencias.status).toBe(200);
        expect(Number(resCiencias.body[0].aulas_totales)).toBe(1);
        const miercoles8Ciencias = resCiencias.body.find(b => b.dia === 'Miércoles' && b.hora_inicio === 8);
        expect(Number(miercoles8Ciencias.aulas_ocupadas)).toBe(0);
        expect(Number(miercoles8Ciencias.porcentaje_ocupacion)).toBe(0);

        // 4. Con filtro edificio en teacher-utilization: no hay clases en Edificio de Ciencias
        const resDocentesCiencias = await request(app)
            .get('/api/analytics/teacher-utilization?edificio=Edificio%20de%20Ciencias')
            .set('Authorization', `Bearer ${token}`);
        expect(resDocentesCiencias.status).toBe(200);
        expect(Number(resDocentesCiencias.body.total_profesores)).toBe(0);
    });

    it('Criterio 6: GET /api/auth/tenants debe retornar instituciones únicas sin duplicados y filtrando registros activos', async () => {
        await pool.query(`
            INSERT INTO tenants (id, name, slug, status)
            VALUES 
            ('test-dup-1', 'Universidad Duplicada', 'dup-1', 'active'),
            ('test-dup-2', 'Universidad Duplicada', 'dup-2', 'active'),
            ('test-inact-1', 'Universidad Inactiva', 'inact-1', 'inactive')
            ON CONFLICT (id) DO NOTHING;
        `);

        const res = await request(app).get('/api/auth/tenants');
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);

        // No debe aparecer la inactiva
        const inactiva = res.body.find(t => t.id === 'test-inact-1' || t.name === 'Universidad Inactiva');
        expect(inactiva).toBeUndefined();

        // 'Universidad Duplicada' debe aparecer exactamente una vez
        const duplicadas = res.body.filter(t => t.name === 'Universidad Duplicada');
        expect(duplicadas.length).toBe(1);

        // Limpieza de datos de prueba
        await pool.query("DELETE FROM tenants WHERE id IN ('test-dup-1', 'test-dup-2', 'test-inact-1')");
    });

    it('Criterio 7: GET /api/analytics/available-classrooms debe devolver aulas libres y respetar filtros', async () => {
        // Limpiar y preparar aulas en testTenantId
        await pool.query('DELETE FROM schedules WHERE tenant_id = $1', [testTenantId]);
        await pool.query('DELETE FROM classrooms WHERE tenant_id = $1', [testTenantId]);
        await pool.query('DELETE FROM subjects WHERE tenant_id = $1', [testTenantId]);
        await pool.query('DELETE FROM users WHERE tenant_id = $1', [testTenantId]);

        // Crear 3 aulas: 2 en Edificio A y 1 en Edificio B
        await pool.query(`
            INSERT INTO classrooms (id, tenant_id, name, building, capacity, type)
            VALUES 
            ('cr-avail-1', $1, 'Aula 101', 'Edificio A', 30, 'Aula Teórica'),
            ('cr-avail-2', $1, 'Aula 102', 'Edificio A', 25, 'Aula Teórica'),
            ('cr-avail-3', $1, 'Lab 201', 'Edificio B', 20, 'Laboratorio')
            ON CONFLICT (id) DO NOTHING;
        `, [testTenantId]);

        // Crear profesor y materia para el schedule
        await pool.query(`
            INSERT INTO users (id, tenant_id, nombre, apellidos, email, identificador)
            VALUES ('usr-avail-1', $1, 'Prof', 'Test', 'prof.avail@pavilion.com', 'DOC-AVAIL-1')
            ON CONFLICT (id) DO NOTHING;
        `, [testTenantId]);

        await pool.query(`
            INSERT INTO subjects (id, tenant_id, code, name, credits)
            VALUES ('sub-avail-1', $1, 'MAT-AV1', 'Materia Disponible 1', 4)
            ON CONFLICT (id) DO NOTHING;
        `, [testTenantId]);

        // Ocupar Aula 101 el Lunes de 08:00 a 10:00 (bloques 8 y 9)
        await pool.query(`
            INSERT INTO schedules (id, tenant_id, subject_id, teacher_id, classroom_id, day_of_week, start_time, end_time, max_students, group_code, session_type)
            VALUES ('sch-avail-1', $1, 'sub-avail-1', 'usr-avail-1', 'cr-avail-1', 'Lunes', '08:00', '10:00', 30, 'G1', 'Clase Teórica')
            ON CONFLICT (id) DO NOTHING;
        `, [testTenantId]);

        // 1. Requerir parámetros: debe retornar 400 si falta dia o bloque
        const resFaltaDia = await request(app)
            .get('/api/analytics/available-classrooms?bloque=8')
            .set('Authorization', `Bearer ${token}`);
        expect(resFaltaDia.status).toBe(400);

        const resFaltaBloque = await request(app)
            .get('/api/analytics/available-classrooms?dia=Lunes')
            .set('Authorization', `Bearer ${token}`);
        expect(resFaltaBloque.status).toBe(400);

        // 2. Consulta Lunes bloque 8 (Aula 101 ocupada, Aula 102 y Lab 201 libres)
        const resLunes8 = await request(app)
            .get('/api/analytics/available-classrooms?dia=Lunes&bloque=8')
            .set('Authorization', `Bearer ${token}`);
        expect(resLunes8.status).toBe(200);
        expect(Array.isArray(resLunes8.body)).toBe(true);
        expect(resLunes8.body.length).toBe(2);
        const namesLunes8 = resLunes8.body.map(c => c.name);
        expect(namesLunes8).not.toContain('Aula 101');
        expect(namesLunes8).toContain('Aula 102');
        expect(namesLunes8).toContain('Lab 201');

        // 3. Consulta Lunes bloque 11 (todas libres)
        const resLunes11 = await request(app)
            .get('/api/analytics/available-classrooms?dia=Lunes&bloque=11')
            .set('Authorization', `Bearer ${token}`);
        expect(resLunes11.status).toBe(200);
        expect(resLunes11.body.length).toBe(3);

        // 4. Filtro por edificio = 'Edificio A' en bloque 8: solo debe figurar Aula 102
        const resEdificioA = await request(app)
            .get('/api/analytics/available-classrooms?dia=Lunes&bloque=8&edificio=Edificio%20A')
            .set('Authorization', `Bearer ${token}`);
        expect(resEdificioA.status).toBe(200);
        expect(resEdificioA.body.length).toBe(1);
        expect(resEdificioA.body[0].name).toBe('Aula 102');
    });

    it('Debe rechazar solicitudes no autenticadas con 401', async () => {
        const resAulas = await request(app).get('/api/analytics/classroom-occupancy');
        expect(resAulas.status).toBe(401);

        const resDocentes = await request(app).get('/api/analytics/teacher-utilization');
        expect(resDocentes.status).toBe(401);

        const resDisponibles = await request(app).get('/api/analytics/available-classrooms?dia=Lunes&bloque=8');
        expect(resDisponibles.status).toBe(401);
    });
});
