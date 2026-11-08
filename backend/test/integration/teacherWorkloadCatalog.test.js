import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/server';
import { pool, initDatabase } from '../../src/db';
import { JWT_SECRET } from '../../src/middleware/auth';
import { getTeachers } from '../../src/controllers/catalogController';

describe('Integración y Rendimiento: Catálogo Enriquecido de Docentes con Métricas de Carga (GET /api/teachers)', () => {
  const tenantId = 'tenant-itc';
  const otherTenantId = 'tenant-upn';

  const coordToken = jwt.sign(
    { id: 'usr-coord-test', role_name: 'Coordinador', tenant_id: tenantId, email: 'coord.workload@pavilion.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const testTeacherIdWithSchedules = 'usr-prof-wl-1';
  const testTeacherIdNoSchedules = 'usr-prof-wl-2';
  const testTeacherOtherTenant = 'usr-prof-wl-other';

  const testSubject = {
    id: 'sub-test-wl-1',
    tenant_id: tenantId,
    code: 'MAT-WL1',
    name: 'Materia Carga 1',
    credits: 4
  };

  const testClassroom = {
    id: 'cr-test-wl-1',
    tenant_id: tenantId,
    name: 'Aula WL 1',
    building: 'Edificio WL',
    capacity: 30,
    type: 'Aula Teórica'
  };

  beforeAll(async () => {
    await initDatabase();

    // Limpieza preventiva
    await pool.query("DELETE FROM schedules WHERE teacher_id IN ($1, $2, $3)", [
      testTeacherIdWithSchedules,
      testTeacherIdNoSchedules,
      testTeacherOtherTenant
    ]);
    await pool.query("DELETE FROM users WHERE id IN ($1, $2, $3)", [
      testTeacherIdWithSchedules,
      testTeacherIdNoSchedules,
      testTeacherOtherTenant
    ]);
    await pool.query("DELETE FROM subjects WHERE id = $1", [testSubject.id]);
    await pool.query("DELETE FROM classrooms WHERE id = $1", [testClassroom.id]);

    // Insertar subject y classroom para pruebas
    await pool.query(
      `INSERT INTO subjects (id, tenant_id, code, name, credits)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [testSubject.id, testSubject.tenant_id, testSubject.code, testSubject.name, testSubject.credits]
    );

    await pool.query(
      `INSERT INTO classrooms (id, tenant_id, name, building, capacity, type)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [testClassroom.id, testClassroom.tenant_id, testClassroom.name, testClassroom.building, testClassroom.capacity, testClassroom.type]
    );

    // 1. Docente con horarios asignados
    await pool.query(
      `INSERT INTO users (id, tenant_id, nombre, apellidos, email, role_id, identificador, horas_contratadas, estatus, email_activo)
       VALUES ($1, $2, 'ProfesorCon', 'Horarios', 'prof.con.horarios@pavilion.com', 'role-teacher', 'DOC-WL-01', 30, 'activo', TRUE)
       ON CONFLICT (id) DO UPDATE SET horas_contratadas = 30, estatus = 'activo'`,
      [testTeacherIdWithSchedules, tenantId]
    );

    // 2. Docente sin horarios asignados
    await pool.query(
      `INSERT INTO users (id, tenant_id, nombre, apellidos, email, role_id, identificador, horas_contratadas, estatus, email_activo)
       VALUES ($1, $2, 'ProfesorSin', 'Horarios', 'prof.sin.horarios@pavilion.com', 'role-teacher', 'DOC-WL-02', 20, 'inactivo', FALSE)
       ON CONFLICT (id) DO UPDATE SET horas_contratadas = 20, estatus = 'inactivo'`,
      [testTeacherIdNoSchedules, tenantId]
    );

    // 3. Docente en otro tenant para validar aislamiento multi-tenant
    await pool.query(
      `INSERT INTO users (id, tenant_id, nombre, apellidos, email, role_id, identificador, horas_contratadas, estatus, email_activo)
       VALUES ($1, $2, 'ProfesorOtro', 'Tenant', 'prof.otro.tenant@pavilion.com', 'role-teacher', 'DOC-WL-99', 25, 'activo', TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [testTeacherOtherTenant, otherTenantId]
    );

    // Crear 3 horarios para testTeacherIdWithSchedules:
    // Horario 1: Lunes 08:00 - 10:00 (2.0 hrs), Grupo "501"
    // Horario 2: Miércoles 08:00 - 10:00 (2.0 hrs), Grupo "501"
    // Horario 3: Viernes 10:00 - 11:30 (1.5 hrs), Grupo "502"
    // Total horas esperadas: 2.0 + 2.0 + 1.5 = 5.5 horas
    // Total grupos académicos distintos: "501" y "502" = 2 grupos
    await pool.query(
      `INSERT INTO schedules (id, tenant_id, subject_id, teacher_id, classroom_id, day_of_week, start_time, end_time, max_students, group_code, session_type)
       VALUES 
       ('sch-wl-1', $1, $2, $3, $4, 'Lunes', '08:00', '10:00', 30, '501', 'Clase Teórica'),
       ('sch-wl-2', $1, $2, $3, $4, 'Miércoles', '08:00', '10:00', 30, '501', 'Clase Teórica'),
       ('sch-wl-3', $1, $2, $3, $4, 'Viernes', '10:00', '11:30', 30, '502', 'Clase Teórica')`,
      [tenantId, testSubject.id, testTeacherIdWithSchedules, testClassroom.id]
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM schedules WHERE teacher_id IN ($1, $2, $3)", [
      testTeacherIdWithSchedules,
      testTeacherIdNoSchedules,
      testTeacherOtherTenant
    ]);
    await pool.query("DELETE FROM users WHERE id IN ($1, $2, $3)", [
      testTeacherIdWithSchedules,
      testTeacherIdNoSchedules,
      testTeacherOtherTenant
    ]);
    await pool.query("DELETE FROM subjects WHERE id = $1", [testSubject.id]);
    await pool.query("DELETE FROM classrooms WHERE id = $1", [testClassroom.id]);
  });

  describe('Criterio 1: Rendimiento del endpoint GET /api/teachers', () => {
    it('responde con status 200 OK en menos de 150ms', async () => {
      // Warm up inicial
      await request(app).get('/api/teachers').set('Authorization', `Bearer ${coordToken}`);

      const start = performance.now();
      const res = await request(app)
        .get('/api/teachers')
        .set('Authorization', `Bearer ${coordToken}`);
      const duration = performance.now() - start;

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(duration).toBeLessThan(150);
    });
  });

  describe('Criterio 2: Estructura del Payload JSON', () => {
    it('cada maestro incluye id, name, nombre, apellidos, email, email_activo, identificador, horas_contratadas, horas_asignadas, grupos_asignados_count y estatus', async () => {
      const res = await request(app)
        .get('/api/teachers')
        .set('Authorization', `Bearer ${coordToken}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);

      for (const teacher of res.body) {
        expect(teacher).toHaveProperty('id');
        expect(teacher).toHaveProperty('name');
        expect(teacher).toHaveProperty('nombre');
        expect(teacher).toHaveProperty('apellidos');
        expect(teacher).toHaveProperty('email');
        expect(teacher).toHaveProperty('email_activo');
        expect(teacher).toHaveProperty('identificador');
        expect(teacher).toHaveProperty('horas_contratadas');
        expect(teacher).toHaveProperty('horas_asignadas');
        expect(teacher).toHaveProperty('grupos_asignados_count');
        expect(teacher).toHaveProperty('estatus');

        expect(typeof teacher.horas_contratadas).toBe('number');
        expect(typeof teacher.horas_asignadas).toBe('number');
        expect(typeof teacher.grupos_asignados_count).toBe('number');
        expect(typeof teacher.email_activo).toBe('boolean');
        expect(typeof teacher.estatus).toBe('string');
      }
    });
  });

  describe('Criterio 3: Cálculo exacto de horas_asignadas y grupos_asignados_count al vuelo', () => {
    it('calcula horas_asignadas coincidiendo exactamente con la suma de duraciones en schedules del tenant', async () => {
      const res = await request(app)
        .get('/api/teachers')
        .set('Authorization', `Bearer ${coordToken}`);

      expect(res.status).toBe(200);
      const teacher = res.body.find(t => t.id === testTeacherIdWithSchedules);
      expect(teacher).toBeDefined();

      // Duración calculada: 2.0 (Lunes) + 2.0 (Miércoles) + 1.5 (Viernes) = 5.5 horas
      expect(teacher.horas_asignadas).toBe(5.5);
      // Grupos calculados: "501" y "502" = 2 grupos distintos
      expect(teacher.grupos_asignados_count).toBe(2);
      expect(teacher.horas_contratadas).toBe(30);
      expect(teacher.estatus).toBe('activo');
      expect(teacher.email_activo).toBe(true);
    });
  });

  describe('Criterio 4: Docentes sin horarios asignados', () => {
    it('retornan horas_asignadas: 0 y grupos_asignados_count: 0 sin arrojar valores null', async () => {
      const res = await request(app)
        .get('/api/teachers')
        .set('Authorization', `Bearer ${coordToken}`);

      expect(res.status).toBe(200);
      const teacherNoSch = res.body.find(t => t.id === testTeacherIdNoSchedules);
      expect(teacherNoSch).toBeDefined();

      expect(teacherNoSch.horas_asignadas).toBe(0);
      expect(teacherNoSch.horas_asignadas).not.toBeNull();
      expect(teacherNoSch.grupos_asignados_count).toBe(0);
      expect(teacherNoSch.grupos_asignados_count).not.toBeNull();
      expect(teacherNoSch.horas_contratadas).toBe(20);
      expect(teacherNoSch.estatus).toBe('inactivo');
      expect(teacherNoSch.email_activo).toBe(false);
    });
  });

  describe('Aislamiento Multi-Tenant', () => {
    it('no lista docentes de otros tenants en la consulta', async () => {
      const res = await request(app)
        .get('/api/teachers')
        .set('Authorization', `Bearer ${coordToken}`);

      expect(res.status).toBe(200);
      const otherTeacher = res.body.find(t => t.id === testTeacherOtherTenant);
      expect(otherTeacher).toBeUndefined();
    });
  });

  describe('Prueba Unitaria de Controlador (Mocks)', () => {
    it('formatea y garantiza tipos numéricos aun si la consulta devuelve valores nulos o cadenas', async () => {
      const mockReq = { tenant_id: 'tenant-test' };
      let responseJson = null;
      const mockRes = {
        json: (data) => {
          responseJson = data;
        },
        status: () => mockRes
      };

      // Mock directo de query.all temporal
      const dbModule = require('../../src/db');
      const originalAll = dbModule.query.all;
      dbModule.query.all = async () => [
        {
          id: 'usr-mock-1',
          nombre: 'Docente',
          apellidos: 'Mock',
          name: 'Docente Mock',
          email: null,
          email_activo: null,
          identificador: 'MOCK-1',
          horas_contratadas: null,
          horas_asignadas: null,
          grupos_asignados_count: null,
          estatus: null
        }
      ];

      try {
        await getTeachers(mockReq, mockRes);
        expect(responseJson).toHaveLength(1);
        const doc = responseJson[0];
        expect(doc.horas_contratadas).toBe(25);
        expect(doc.horas_asignadas).toBe(0);
        expect(doc.grupos_asignados_count).toBe(0);
        expect(doc.estatus).toBe('activo');
        expect(doc.email_activo).toBe(true);
      } finally {
        dbModule.query.all = originalAll;
      }
    });
  });
});
