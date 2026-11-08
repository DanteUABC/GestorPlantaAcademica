import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/server';
import { pool, initDatabase } from '../../src/db';
import { JWT_SECRET } from '../../src/middleware/auth';

describe('Integración y Transaccionalidad: Revocación de Correo Institucional de Docentes (PUT /api/teachers/:id/revoke-email & POST /api/teachers/:id/deactivate-email)', () => {
  const tenantId = 'tenant-itc';
  const otherTenantId = 'tenant-upn';

  const coordToken = jwt.sign(
    { id: 'usr-coord-rev-test', role_name: 'Coordinador', tenant_id: tenantId, email: 'coord.rev@pavilion.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const adminToken = jwt.sign(
    { id: 'usr-admin-rev-test', role_name: 'Administrador', tenant_id: tenantId, email: 'admin.rev@pavilion.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const teacherToken = jwt.sign(
    { id: 'usr-teacher-rev-test', role_name: 'Profesor', tenant_id: tenantId, email: 'teacher.rev@pavilion.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const testTeacherId1 = 'usr-prof-rev-1';
  const testTeacherId2 = 'usr-prof-rev-2';
  const testTeacherIdOtherTenant = 'usr-prof-rev-other';

  const testSubject = {
    id: 'sub-rev-1',
    tenant_id: tenantId,
    code: 'REV-101',
    name: 'Materia Revocación',
    credits: 4
  };

  const testClassroom = {
    id: 'cr-rev-1',
    tenant_id: tenantId,
    name: 'Aula Revocación',
    building: 'Edificio R',
    capacity: 35,
    type: 'Aula Teórica'
  };

  let teacher1ActiveSessionToken = null;

  beforeAll(async () => {
    await initDatabase();

    // Limpieza preventiva
    await pool.query("DELETE FROM schedules WHERE teacher_id IN ($1, $2, $3)", [
      testTeacherId1,
      testTeacherId2,
      testTeacherIdOtherTenant
    ]);
    await pool.query("DELETE FROM bitacora_revocaciones_email WHERE user_id IN ($1, $2, $3)", [
      testTeacherId1,
      testTeacherId2,
      testTeacherIdOtherTenant
    ]);
    await pool.query("DELETE FROM users WHERE id IN ($1, $2, $3)", [
      testTeacherId1,
      testTeacherId2,
      testTeacherIdOtherTenant
    ]);
    await pool.query("DELETE FROM subjects WHERE id = $1", [testSubject.id]);
    await pool.query("DELETE FROM classrooms WHERE id = $1", [testClassroom.id]);

    // Insertar subject y classroom
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

    // 1. Docente 1 con horario y correo activo
    await pool.query(
      `INSERT INTO users (id, tenant_id, nombre, apellidos, email, role_id, identificador, horas_contratadas, estatus, email_activo)
       VALUES ($1, $2, 'Docente', 'Revocable Uno', 'docente.uno.rev@pavilion.com', 'role-teacher', 'DOC-REV-01', 25, 'activo', TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [testTeacherId1, tenantId]
    );

    // 2. Docente 2 para endpoint alternativo (POST /deactivate-email)
    await pool.query(
      `INSERT INTO users (id, tenant_id, nombre, apellidos, email, role_id, identificador, horas_contratadas, estatus, email_activo)
       VALUES ($1, $2, 'Docente', 'Revocable Dos', 'docente.dos.rev@pavilion.com', 'role-teacher', 'DOC-REV-02', 20, 'activo', TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [testTeacherId2, tenantId]
    );

    // 3. Docente en otro tenant para prueba de aislamiento
    await pool.query(
      `INSERT INTO users (id, tenant_id, nombre, apellidos, email, role_id, identificador, horas_contratadas, estatus, email_activo)
       VALUES ($1, $2, 'Docente', 'Otro Tenant', 'docente.otro.tenant@pavilion.com', 'role-teacher', 'DOC-REV-99', 25, 'activo', TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [testTeacherIdOtherTenant, otherTenantId]
    );

    // Asignar horario a Docente 1 para verificar integridad referencial (schedules.teacher_id)
    await pool.query(
      `INSERT INTO schedules (id, tenant_id, subject_id, teacher_id, classroom_id, day_of_week, start_time, end_time, max_students, group_code, session_type)
       VALUES ('sch-rev-t1', $1, $2, $3, $4, 'Martes', '08:00', '10:00', 30, 'G1', 'Clase Teórica')`,
      [tenantId, testSubject.id, testTeacherId1, testClassroom.id]
    );

    // Token activo de sesión para Docente 1 emitido antes de la revocación
    teacher1ActiveSessionToken = jwt.sign(
      { id: testTeacherId1, role_name: 'Profesor', tenant_id: tenantId, email: 'docente.uno.rev@pavilion.com' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM schedules WHERE teacher_id IN ($1, $2, $3)", [
      testTeacherId1,
      testTeacherId2,
      testTeacherIdOtherTenant
    ]);
    await pool.query("DELETE FROM bitacora_revocaciones_email WHERE user_id IN ($1, $2, $3)", [
      testTeacherId1,
      testTeacherId2,
      testTeacherIdOtherTenant
    ]);
    await pool.query("DELETE FROM users WHERE id IN ($1, $2, $3)", [
      testTeacherId1,
      testTeacherId2,
      testTeacherIdOtherTenant
    ]);
    await pool.query("DELETE FROM subjects WHERE id = $1", [testSubject.id]);
    await pool.query("DELETE FROM classrooms WHERE id = $1", [testClassroom.id]);
  });

  describe('Criterio 1: Control de Acceso por Roles (RBAC)', () => {
    it('rechaza con status 401 Unauthorized si no se envía token JWT', async () => {
      const res = await request(app).put(`/api/teachers/${testTeacherId1}/revoke-email`);
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Token ausente');
    });

    it('rechaza con status 403 Forbidden a usuarios con rol Profesor', async () => {
      const res = await request(app)
        .put(`/api/teachers/${testTeacherId1}/revoke-email`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Acceso denegado');
    });
  });

  describe('Criterio 2: Aislamiento Multi-Tenant Estricto', () => {
    it('responde 404 Not Found si se intenta revocar a un docente de otro tenant', async () => {
      const res = await request(app)
        .put(`/api/teachers/${testTeacherIdOtherTenant}/revoke-email`)
        .set('Authorization', `Bearer ${coordToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('no pertenece a esta institución');
    });

    it('responde 404 Not Found si el ID de docente no existe', async () => {
      const res = await request(app)
        .put('/api/teachers/usr-prof-inexistente/revoke-email')
        .set('Authorization', `Bearer ${coordToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBeDefined();
    });
  });

  describe('Criterio 3: Transacción en PostgreSQL, Auditoría en Bitácora y Desvinculación de Correo', () => {
    it('ejecuta la transacción con éxito respondiendo HTTP 200 y el objeto actualizado del docente', async () => {
      const res = await request(app)
        .put(`/api/teachers/${testTeacherId1}/revoke-email`)
        .set('Authorization', `Bearer ${coordToken}`)
        .send({ reason: 'Baja administrativa por término de contrato' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testTeacherId1);
      expect(res.body.email).toBeNull();
      expect(res.body.email_activo).toBe(false);
      expect(res.body.email_revocado_at).toBeDefined();
      expect(res.body.horas_asignadas).toBe(2);
      expect(res.body.grupos_asignados_count).toBe(1);

      // 1. Verificar actualización en base de datos PostgreSQL
      const dbCheck = await pool.query(
        'SELECT id, email, email_activo, email_revocado_at, token_version FROM users WHERE id = $1',
        [testTeacherId1]
      );
      expect(dbCheck.rows[0].email).toBeNull();
      expect(dbCheck.rows[0].email_activo).toBe(false);
      expect(dbCheck.rows[0].email_revocado_at).not.toBeNull();
      expect(dbCheck.rows[0].token_version).toBeGreaterThanOrEqual(2);

      // 2. Verificar registro de respaldo de auditoría en la tabla bitacora_revocaciones_email
      const auditCheck = await pool.query(
        'SELECT * FROM bitacora_revocaciones_email WHERE user_id = $1',
        [testTeacherId1]
      );
      expect(auditCheck.rows.length).toBe(1);
      expect(auditCheck.rows[0].email_anterior).toBe('docente.uno.rev@pavilion.com');
      expect(auditCheck.rows[0].tenant_id).toBe(tenantId);
      expect(auditCheck.rows[0].revocado_por).toBe('usr-coord-rev-test');
      expect(auditCheck.rows[0].motivo).toContain('Baja administrativa');
    });

    it('invalida tokens de sesión activos previos del usuario revocado (HTTP 403 en endpoints protegidos)', async () => {
      // El token del docente 1 fue emitido antes de la revocación
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${teacher1ActiveSessionToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('Token inválido o expirado');
    });

    it('mantiene intacto el registro del usuario en schedules (preserva llaves foráneas)', async () => {
      const scheduleRes = await pool.query(
        'SELECT s.id, s.teacher_id, u.email, u.email_activo FROM schedules s JOIN users u ON s.teacher_id = u.id WHERE s.id = $1',
        ['sch-rev-t1']
      );

      expect(scheduleRes.rows.length).toBe(1);
      expect(scheduleRes.rows[0].teacher_id).toBe(testTeacherId1);
      expect(scheduleRes.rows[0].email).toBeNull();
      expect(scheduleRes.rows[0].email_activo).toBe(false);
    });
  });

  describe('Criterio 4: Idempotencia en Múltiples Invocaciones', () => {
    it('responde 200 OK de forma idempotente sin duplicar registros en bitácora ni lanzar errores', async () => {
      // Invocación repetida sobre el mismo docente ya revocado
      const res = await request(app)
        .put(`/api/teachers/${testTeacherId1}/revoke-email`)
        .set('Authorization', `Bearer ${coordToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testTeacherId1);
      expect(res.body.email).toBeNull();
      expect(res.body.email_activo).toBe(false);

      // La bitácora debe seguir conteniendo exactamente 1 solo registro de revocación
      const auditCount = await pool.query(
        'SELECT COUNT(*)::int AS total FROM bitacora_revocaciones_email WHERE user_id = $1',
        [testTeacherId1]
      );
      expect(auditCount.rows[0].total).toBe(1);
    });
  });

  describe('Criterio 5: Ruta Alternativa POST /api/teachers/:id/deactivate-email', () => {
    it('permite revocar el correo exitosamente mediante la ruta POST alternativa con rol Administrador', async () => {
      const res = await request(app)
        .post(`/api/teachers/${testTeacherId2}/deactivate-email`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ motivo: 'Desactivación por solicitud voluntaria' });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testTeacherId2);
      expect(res.body.email).toBeNull();
      expect(res.body.email_activo).toBe(false);

      const auditCheck = await pool.query(
        'SELECT * FROM bitacora_revocaciones_email WHERE user_id = $1',
        [testTeacherId2]
      );
      expect(auditCheck.rows.length).toBe(1);
      expect(auditCheck.rows[0].email_anterior).toBe('docente.dos.rev@pavilion.com');
      expect(auditCheck.rows[0].revocado_por).toBe('usr-admin-rev-test');
    });
  });
});
