import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import * as XLSX from 'xlsx';
import app from '../../src/server';
import { pool, initDatabase } from '../../src/db';
import { JWT_SECRET } from '../../src/middleware/auth';

describe('Integración: Motor Anti-Empalmes con Restricciones Horarias Docentes (schedulesCrud & Excel Upload)', () => {
  const tenantId = 'tenant-itc';

  const coordToken = jwt.sign(
    { id: 'usr-coord-sched-restr', role_name: 'Coordinador', tenant_id: tenantId, email: 'coord.sched.restr@pavilion.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const testSubject = {
    id: 'sub-sched-restr-1',
    tenant_id: tenantId,
    code: 'RESTR-101',
    name: 'Ingeniería de Software Avanzada',
    credits: 5
  };

  const testClassroom = {
    id: 'cr-sched-restr-1',
    tenant_id: tenantId,
    name: 'Aula Restr 201',
    building: 'Edificio Central',
    capacity: 35,
    type: 'Aula Teórica'
  };

  const teacherRestricted = {
    id: 'usr-prof-sched-restr-1',
    tenant_id: tenantId,
    nombre: 'Dr. Fernando',
    apellidos: 'Montes',
    email: 'fernando.montes@pavilion.com',
    role_id: 'role-teacher',
    identificador: 'DOC-SR01'
  };

  const teacherFree = {
    id: 'usr-prof-sched-free-1',
    tenant_id: tenantId,
    nombre: 'Mtra. Sofía',
    apellidos: 'Linares',
    email: 'sofia.linares@pavilion.com',
    role_id: 'role-teacher',
    identificador: 'DOC-SR02'
  };

  function buildExcelBuffer(rows) {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Horarios');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  beforeAll(async () => {
    await initDatabase();

    await pool.query("DELETE FROM teacher_restrictions WHERE teacher_id IN ($1, $2)", [
      teacherRestricted.id,
      teacherFree.id
    ]);
    await pool.query("DELETE FROM schedules WHERE subject_id = $1", [testSubject.id]);
    await pool.query("DELETE FROM users WHERE id IN ($1, $2)", [teacherRestricted.id, teacherFree.id]);
    await pool.query("DELETE FROM subjects WHERE id = $1", [testSubject.id]);
    await pool.query("DELETE FROM classrooms WHERE id = $1", [testClassroom.id]);

    await pool.query(
      `INSERT INTO subjects (id, tenant_id, code, name, credits) VALUES ($1, $2, $3, $4, $5)`,
      [testSubject.id, testSubject.tenant_id, testSubject.code, testSubject.name, testSubject.credits]
    );

    await pool.query(
      `INSERT INTO classrooms (id, tenant_id, name, building, capacity, type) VALUES ($1, $2, $3, $4, $5, $6)`,
      [testClassroom.id, testClassroom.tenant_id, testClassroom.name, testClassroom.building, testClassroom.capacity, testClassroom.type]
    );

    await pool.query(
      `INSERT INTO users (id, tenant_id, nombre, apellidos, email, role_id, identificador)
       VALUES ($1, $2, $3, $4, $5, $6, $7), ($8, $9, $10, $11, $12, $13, $14)`,
      [
        teacherRestricted.id, teacherRestricted.tenant_id, teacherRestricted.nombre, teacherRestricted.apellidos, teacherRestricted.email, teacherRestricted.role_id, teacherRestricted.identificador,
        teacherFree.id, teacherFree.tenant_id, teacherFree.nombre, teacherFree.apellidos, teacherFree.email, teacherFree.role_id, teacherFree.identificador
      ]
    );

    // Registrar dos restricciones para teacherRestricted:
    // 1) Lunes 09:00 - 11:00 con motivo explícito ("Investigación CONACYT")
    // 2) Jueves 14:00 - 16:00 con motivo nulo (para validar fallback "No especificado")
    await pool.query(
      `INSERT INTO teacher_restrictions (id, tenant_id, teacher_id, day_of_week, start_time, end_time, reason)
       VALUES
         ('tr-sched-1', $1, $2, 'Lunes', '09:00', '11:00', 'Investigación CONACYT'),
         ('tr-sched-2', $1, $2, 'Jueves', '14:00', '16:00', NULL)`,
      [tenantId, teacherRestricted.id]
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM teacher_restrictions WHERE teacher_id IN ($1, $2)", [
      teacherRestricted.id,
      teacherFree.id
    ]);
    await pool.query("DELETE FROM schedules WHERE subject_id = $1", [testSubject.id]);
    await pool.query("DELETE FROM users WHERE id IN ($1, $2)", [teacherRestricted.id, teacherFree.id]);
    await pool.query("DELETE FROM subjects WHERE id = $1", [testSubject.id]);
    await pool.query("DELETE FROM classrooms WHERE id = $1", [testClassroom.id]);
  });

  describe('1. Alta Manual (POST /api/schedules) contra teacher_restrictions', () => {
    it('Retorna HTTP 409 Conflict estructurado con conflictType TEACHER_RESTRICTION y objeto restriction cuando cruza con una franja restringida', async () => {
      // Intento de asignar Lunes 08:00 - 10:00 (cruza con Lunes 09:00 - 11:00)
      const res = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          subject_id: testSubject.id,
          teacher_id: teacherRestricted.id,
          classroom_id: testClassroom.id,
          day_of_week: 'Lunes',
          start_time: '08:00',
          end_time: '10:00',
          group_code: 'G-RESTR-1',
          max_students: 25
        });

      expect(res.status).toBe(409);
      expect(res.body.conflictType).toBe('TEACHER_RESTRICTION');
      expect(res.body.error).toContain('Dr. Fernando Montes');
      expect(res.body.restriction).toMatchObject({
        day_of_week: 'Lunes',
        start_time: '09:00',
        end_time: '11:00',
        reason: 'Investigación CONACYT'
      });
    });

    it('Usa "No especificado" cuando el motivo (reason) de la restricción en BD es nulo', async () => {
      // Intento de asignar Jueves 15:00 - 17:00 (cruza con Jueves 14:00 - 16:00 sin motivo)
      const res = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          subject_id: testSubject.id,
          teacher_id: teacherRestricted.id,
          classroom_id: testClassroom.id,
          day_of_week: 'Jueves',
          start_time: '15:00',
          end_time: '17:00',
          group_code: 'G-RESTR-2',
          max_students: 25
        });

      expect(res.status).toBe(409);
      expect(res.body.conflictType).toBe('TEACHER_RESTRICTION');
      expect(res.body.restriction.reason).toBe('No especificado');
    });

    it('Permite crear el horario cuando el bloque es contiguo y no se cruza con la restricción (ej. Lunes 11:00 - 13:00)', async () => {
      const res = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          subject_id: testSubject.id,
          teacher_id: teacherRestricted.id,
          classroom_id: testClassroom.id,
          day_of_week: 'Lunes',
          start_time: '11:00',
          end_time: '13:00',
          group_code: 'G-RESTR-OK',
          max_students: 25
        });

      expect(res.status).toBe(201);
      expect(res.body.schedule).toBeDefined();
    });
  });

  describe('2. Carga Masiva Excel (POST /api/schedules/upload-excel) contra teacher_restrictions', () => {
    it('Reporta el rechazo con origen/código RESTRICCION_DOCENTE y hace ROLLBACK cuando una fila choca con una restricción docente', async () => {
      const rows = [
        {
          'Código Materia': testSubject.code,
          'Correo Profesor': teacherFree.email,
          'Aula': testClassroom.name,
          'Día': 'Martes',
          'Hora Inicio': '08:00',
          'Hora Fin': '10:00',
          'Cupo': 25,
          'Grupo': 'G-EX-1'
        },
        {
          'Código Materia': testSubject.code,
          'Correo Profesor': teacherRestricted.email,
          'Aula': testClassroom.name,
          'Día': 'Lunes',
          'Hora Inicio': '09:30',
          'Hora Fin': '10:30', // Choca con restricción Lunes 09:00 - 11:00
          'Cupo': 25,
          'Grupo': 'G-EX-2'
        }
      ];

      const buffer = buildExcelBuffer(rows);

      const res = await request(app)
        .post('/api/schedules/upload-excel')
        .set('Authorization', `Bearer ${coordToken}`)
        .attach('file', buffer, 'horarios_con_restriccion.xlsx');

      expect(res.status).toBe(409);
      expect(res.body.conflicts).toBeDefined();
      expect(res.body.conflicts.length).toBe(1);
      expect(res.body.conflicts[0].origen).toBe('RESTRICCION_DOCENTE');
      expect(res.body.conflicts[0].codigo).toBe('RESTRICCION_DOCENTE');
      expect(res.body.conflicts[0].mensaje).toContain('Dr. Fernando Montes');
      expect(res.body.conflicts[0].motivo).toBe('Investigación CONACYT');

      // Verificar que hubo ROLLBACK total (tampoco se guardó la fila 1 de teacherFree)
      const checkFree = await pool.query(
        "SELECT id FROM schedules WHERE teacher_id = $1 AND group_code = 'G-EX-1'",
        [teacherFree.id]
      );
      expect(checkFree.rows.length).toBe(0);
    });
  });
});
