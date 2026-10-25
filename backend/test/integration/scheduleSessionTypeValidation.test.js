import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/server';
import { pool, initDatabase } from '../../src/db';
import { JWT_SECRET } from '../../src/middleware/auth';

describe('Integración: Validación de coherencia entre tipo de sesión y tipo de aula física', () => {
  const coordToken = jwt.sign(
    { id: 'usr-coord-1', role_name: 'Coordinador', tenant_id: 'tenant-itc', email: 'coord@itc.edu' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const testSubject = {
    id: 'sub-test-session',
    tenant_id: 'tenant-itc',
    code: 'SES-101',
    name: 'Sistemas Digitales',
    credits: 5
  };

  const testTeoricaClassroom = {
    id: 'cr-test-teorica',
    tenant_id: 'tenant-itc',
    name: 'Aula Teórica 105',
    building: 'Edificio B',
    capacity: 35,
    type: 'Aula Teórica'
  };

  const testLabClassroom = {
    id: 'cr-test-lab',
    tenant_id: 'tenant-itc',
    name: 'Laboratorio de Electrónica 1',
    building: 'Edificio Tecnologías',
    capacity: 25,
    type: 'Laboratorio'
  };

  const testTeacher = {
    id: 'usr-prof-sess-1',
    tenant_id: 'tenant-itc',
    name: 'Prof. Gabriel Montes',
    email: 'gabriel.montes@pavilion.com',
    role_id: 'role-teacher',
    identifier: 'PSESS01'
  };

  beforeAll(async () => {
    await initDatabase();

    // Limpieza preventiva
    await pool.query("DELETE FROM schedules WHERE tenant_id = 'tenant-itc' AND subject_id = 'sub-test-session'");
    await pool.query("DELETE FROM classrooms WHERE id IN ('cr-test-teorica', 'cr-test-lab')");
    await pool.query("DELETE FROM subjects WHERE id = 'sub-test-session'");
    await pool.query("DELETE FROM users WHERE id = 'usr-prof-sess-1'");

    // Insertar materia
    await pool.query(
      'INSERT INTO subjects (id, tenant_id, code, name, credits) VALUES ($1, $2, $3, $4, $5)',
      [testSubject.id, testSubject.tenant_id, testSubject.code, testSubject.name, testSubject.credits]
    );

    // Insertar aula teórica y aula laboratorio
    await pool.query(
      'INSERT INTO classrooms (id, tenant_id, name, building, capacity, type) VALUES ($1, $2, $3, $4, $5, $6)',
      [testTeoricaClassroom.id, testTeoricaClassroom.tenant_id, testTeoricaClassroom.name, testTeoricaClassroom.building, testTeoricaClassroom.capacity, testTeoricaClassroom.type]
    );
    await pool.query(
      'INSERT INTO classrooms (id, tenant_id, name, building, capacity, type) VALUES ($1, $2, $3, $4, $5, $6)',
      [testLabClassroom.id, testLabClassroom.tenant_id, testLabClassroom.name, testLabClassroom.building, testLabClassroom.capacity, testLabClassroom.type]
    );

    // Insertar docente
    await pool.query(
      'INSERT INTO users (id, tenant_id, nombre, apellidos, email, role_id, identificador) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [testTeacher.id, testTeacher.tenant_id, testTeacher.name, '', testTeacher.email, testTeacher.role_id, testTeacher.identifier]
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM schedules WHERE tenant_id = 'tenant-itc' AND subject_id = 'sub-test-session'");
    await pool.query("DELETE FROM classrooms WHERE id IN ('cr-test-teorica', 'cr-test-lab')");
    await pool.query("DELETE FROM subjects WHERE id = 'sub-test-session'");
    await pool.query("DELETE FROM users WHERE id = 'usr-prof-sess-1'");
  });

  describe('Criterio 1: POST /api/schedules acepta group_code y session_type', () => {
    it('Acepta group_code y session_type explícitos y los persiste correctamente', async () => {
      const res = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          subject_id: testSubject.id,
          teacher_id: testTeacher.id,
          classroom_id: testLabClassroom.id,
          day_of_week: 'Viernes',
          start_time: '14:00',
          end_time: '16:00',
          group_code: '301',
          session_type: 'Laboratorio',
          max_students: 20
        });

      expect(res.status).toBe(201);
      expect(res.body.schedule).toBeDefined();
      expect(res.body.schedule.group_code).toBe('301');
      expect(res.body.schedule.session_type).toBe('Laboratorio');

      // Limpieza
      await pool.query('DELETE FROM schedules WHERE id = $1', [res.body.schedule.id]);
    });
  });

  describe('Criterio 2: Validación de coherencia cuando session_type = "Laboratorio"', () => {
    it('Rechaza con HTTP 400 Bad Request si session_type = "Laboratorio" y el aula física es de tipo "Aula Teórica"', async () => {
      const res = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          subject_id: testSubject.id,
          teacher_id: testTeacher.id,
          classroom_id: testTeoricaClassroom.id, // Aula Teórica
          day_of_week: 'Viernes',
          start_time: '16:00',
          end_time: '18:00',
          group_code: '302',
          session_type: 'Laboratorio',
          max_students: 25
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('Incoherencia de espacio');
      expect(res.body.error).toContain('Laboratorio');
      expect(res.body.session_type).toBe('Laboratorio');
      expect(res.body.classroom_type).toBe('Aula Teórica');

      // Verificar que NO se insertó el horario en la base de datos
      const check = await pool.query(
        "SELECT id FROM schedules WHERE subject_id = $1 AND group_code = '302'",
        [testSubject.id]
      );
      expect(check.rows.length).toBe(0);
    });

    it('Permite guardar con HTTP 201 si session_type = "Laboratorio" y el aula física es de tipo "Laboratorio"', async () => {
      const res = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          subject_id: testSubject.id,
          teacher_id: testTeacher.id,
          classroom_id: testLabClassroom.id, // Laboratorio
          day_of_week: 'Viernes',
          start_time: '16:00',
          end_time: '18:00',
          group_code: '302',
          session_type: 'Laboratorio',
          max_students: 25
        });

      expect(res.status).toBe(201);
      expect(res.body.schedule.session_type).toBe('Laboratorio');
      expect(res.body.schedule.classroom_id).toBe(testLabClassroom.id);

      // Limpieza
      await pool.query('DELETE FROM schedules WHERE id = $1', [res.body.schedule.id]);
    });

    it('Permite guardar con HTTP 201 si session_type = "Clase Teórica" en cualquier aula (ej. Aula Teórica)', async () => {
      const res = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          subject_id: testSubject.id,
          teacher_id: testTeacher.id,
          classroom_id: testTeoricaClassroom.id,
          day_of_week: 'Viernes',
          start_time: '18:00',
          end_time: '20:00',
          group_code: '303',
          session_type: 'Clase Teórica',
          max_students: 30
        });

      expect(res.status).toBe(201);
      expect(res.body.schedule.session_type).toBe('Clase Teórica');

      // Limpieza
      await pool.query('DELETE FROM schedules WHERE id = $1', [res.body.schedule.id]);
    });
  });

  describe('Criterio 3: Omisión de group_code asigna por defecto "G1"', () => {
    it('Asigna por defecto group_code = "G1" y session_type = "Clase Teórica" cuando no se envía en la petición', async () => {
      const res = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          subject_id: testSubject.id,
          teacher_id: testTeacher.id,
          classroom_id: testTeoricaClassroom.id,
          day_of_week: 'Sábado',
          start_time: '08:00',
          end_time: '10:00',
          max_students: 30
          // group_code y session_type omitidos intencionalmente
        });

      expect(res.status).toBe(201);
      expect(res.body.schedule.group_code).toBe('G1');
      expect(res.body.schedule.session_type).toBe('Clase Teórica');

      // Verificar en base de datos
      const dbCheck = await pool.query('SELECT group_code, session_type FROM schedules WHERE id = $1', [res.body.schedule.id]);
      expect(dbCheck.rows[0].group_code).toBe('G1');
      expect(dbCheck.rows[0].session_type).toBe('Clase Teórica');

      // Limpieza
      await pool.query('DELETE FROM schedules WHERE id = $1', [res.body.schedule.id]);
    });

    it('Asigna por defecto group_code = "G1" si se envía vacío o en blanco', async () => {
      const res = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          subject_id: testSubject.id,
          teacher_id: testTeacher.id,
          classroom_id: testTeoricaClassroom.id,
          day_of_week: 'Sábado',
          start_time: '10:00',
          end_time: '12:00',
          group_code: '   ',
          max_students: 30
        });

      expect(res.status).toBe(201);
      expect(res.body.schedule.group_code).toBe('G1');

      // Limpieza
      await pool.query('DELETE FROM schedules WHERE id = $1', [res.body.schedule.id]);
    });
  });
});
