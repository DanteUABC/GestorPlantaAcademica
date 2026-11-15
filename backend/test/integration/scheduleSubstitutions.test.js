import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/server';
import { pool, initDatabase } from '../../src/db';
import { JWT_SECRET } from '../../src/middleware/auth';

describe('Épica 3: Mantenimiento Operativo y Trazabilidad (Tasks 3.1, 3.2 y 3.3)', () => {
  const coordToken = jwt.sign(
    { id: 'usr-coord-subst', role_name: 'Coordinador', tenant_id: 'tenant-itc', email: 'coord.subst@pavilion.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const teacherToken = jwt.sign(
    { id: 'usr-prof-subst-1', role_name: 'Profesor', tenant_id: 'tenant-itc', email: 'prof1.subst@pavilion.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const testSubject = {
    id: 'sub-test-subst',
    tenant_id: 'tenant-itc',
    code: 'SUBST-101',
    name: 'Sistemas Operativos',
    credits: 5
  };

  const testClassroom = {
    id: 'cr-test-subst',
    tenant_id: 'tenant-itc',
    name: 'Aula Subst 101',
    building: 'Edificio Sistemas',
    capacity: 35,
    type: 'Aula Teórica'
  };

  const teacherOriginal = {
    id: 'usr-prof-orig',
    tenant_id: 'tenant-itc',
    name: 'Profesor Original',
    nombre: 'Profesor',
    apellidos: 'Original',
    email: 'original@pavilion.com',
    role_id: 'role-teacher',
    identificador: 'DOC-901'
  };

  const teacherAvailable = {
    id: 'usr-prof-avail',
    tenant_id: 'tenant-itc',
    name: 'Profesor Disponible',
    nombre: 'Profesor',
    apellidos: 'Disponible',
    email: 'disponible@pavilion.com',
    role_id: 'role-teacher',
    identificador: 'DOC-902'
  };

  const teacherBusy = {
    id: 'usr-prof-busy',
    tenant_id: 'tenant-itc',
    name: 'Profesor Ocupado',
    nombre: 'Profesor',
    apellidos: 'Ocupado',
    email: 'ocupado@pavilion.com',
    role_id: 'role-teacher',
    identificador: 'DOC-903'
  };

  const otherTenantTeacher = {
    id: 'usr-prof-other-tenant',
    tenant_id: 'tenant-upn',
    name: 'Profesor Otro Tenant',
    nombre: 'Profesor',
    apellidos: 'Otro Tenant',
    email: 'otro@pavilion.com',
    role_id: 'role-teacher',
    identificador: 'DOC-904'
  };

  const teacherRestricted = {
    id: 'usr-prof-restricted',
    tenant_id: 'tenant-itc',
    name: 'Profesor Restringido',
    nombre: 'Profesor',
    apellidos: 'Restringido',
    email: 'restringido@pavilion.com',
    role_id: 'role-teacher',
    identificador: 'DOC-905'
  };

  let targetScheduleId = 'sch-target-subst';
  let busyScheduleId = 'sch-busy-subst';

  beforeAll(async () => {
    await initDatabase();

    // Limpieza preventiva
    await pool.query("DELETE FROM teacher_restrictions WHERE teacher_id = 'usr-prof-restricted'");
    await pool.query("DELETE FROM schedule_substitutions WHERE tenant_id IN ('tenant-itc', 'tenant-upn')");
    await pool.query("DELETE FROM schedules WHERE id IN ('sch-target-subst', 'sch-busy-subst')");
    await pool.query("DELETE FROM users WHERE id IN ('usr-prof-orig', 'usr-prof-avail', 'usr-prof-busy', 'usr-prof-other-tenant', 'usr-prof-restricted', 'usr-coord-subst')");
    await pool.query("DELETE FROM subjects WHERE id = 'sub-test-subst'");
    await pool.query("DELETE FROM classrooms WHERE id = 'cr-test-subst'");

    // 1. Insertar coordinador y profesores de prueba
    await pool.query(
      `INSERT INTO users (id, tenant_id, nombre, apellidos, email, role_id, identificador)
       VALUES 
       ('usr-coord-subst', 'tenant-itc', 'Coordinador', 'Subst', 'coord.subst@pavilion.com', 'role-coord', 'EMP-900'),
       ($1, $2, $3, $4, $5, $6, $7),
       ($8, $9, $10, $11, $12, $13, $14),
       ($15, $16, $17, $18, $19, $20, $21),
       ($22, $23, $24, $25, $26, $27, $28),
       ($29, $30, $31, $32, $33, $34, $35)`,
      [
        teacherOriginal.id, teacherOriginal.tenant_id, teacherOriginal.nombre, teacherOriginal.apellidos, teacherOriginal.email, teacherOriginal.role_id, teacherOriginal.identificador,
        teacherAvailable.id, teacherAvailable.tenant_id, teacherAvailable.nombre, teacherAvailable.apellidos, teacherAvailable.email, teacherAvailable.role_id, teacherAvailable.identificador,
        teacherBusy.id, teacherBusy.tenant_id, teacherBusy.nombre, teacherBusy.apellidos, teacherBusy.email, teacherBusy.role_id, teacherBusy.identificador,
        otherTenantTeacher.id, otherTenantTeacher.tenant_id, otherTenantTeacher.nombre, otherTenantTeacher.apellidos, otherTenantTeacher.email, otherTenantTeacher.role_id, otherTenantTeacher.identificador,
        teacherRestricted.id, teacherRestricted.tenant_id, teacherRestricted.nombre, teacherRestricted.apellidos, teacherRestricted.email, teacherRestricted.role_id, teacherRestricted.identificador
      ]
    );

    // 1.5. Registrar restricción horaria para teacherRestricted en Martes 08:30 - 09:30 (cruza con 08:00 - 10:00)
    await pool.query(
      `INSERT INTO teacher_restrictions (id, tenant_id, teacher_id, day_of_week, start_time, end_time, reason)
       VALUES ('tr-subst-test-1', 'tenant-itc', $1, 'Martes', '08:30', '09:30', 'Comisión institucional')`,
      [teacherRestricted.id]
    );

    // 2. Insertar materia y aula
    await pool.query(
      `INSERT INTO subjects (id, tenant_id, code, name, credits) VALUES ($1, $2, $3, $4, $5)`,
      [testSubject.id, testSubject.tenant_id, testSubject.code, testSubject.name, testSubject.credits]
    );

    await pool.query(
      `INSERT INTO classrooms (id, tenant_id, name, building, capacity, type) VALUES ($1, $2, $3, $4, $5, $6)`,
      [testClassroom.id, testClassroom.tenant_id, testClassroom.name, testClassroom.building, testClassroom.capacity, testClassroom.type]
    );

    // 3. Crear horario objetivo (Martes 08:00 - 10:00 asignado a teacherOriginal)
    await pool.query(
      `INSERT INTO schedules (id, tenant_id, subject_id, teacher_id, classroom_id, day_of_week, start_time, end_time, max_students, group_code, session_type)
       VALUES ($1, $2, $3, $4, $5, 'Martes', '08:00', '10:00', 30, 'G1', 'Clase Teórica')`,
      [targetScheduleId, 'tenant-itc', testSubject.id, teacherOriginal.id, testClassroom.id]
    );

    // 4. Crear horario empalmado para teacherBusy (Martes 09:00 - 11:00)
    await pool.query(
      `INSERT INTO schedules (id, tenant_id, subject_id, teacher_id, classroom_id, day_of_week, start_time, end_time, max_students, group_code, session_type)
       VALUES ($1, $2, $3, $4, $5, 'Martes', '09:00', '11:00', 30, 'G2', 'Clase Teórica')`,
      [busyScheduleId, 'tenant-itc', testSubject.id, teacherBusy.id, testClassroom.id]
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM teacher_restrictions WHERE teacher_id = 'usr-prof-restricted'");
    await pool.query("DELETE FROM schedule_substitutions WHERE tenant_id IN ('tenant-itc', 'tenant-upn')");
    await pool.query("DELETE FROM schedules WHERE id IN ('sch-target-subst', 'sch-busy-subst')");
    await pool.query("DELETE FROM users WHERE id IN ('usr-prof-orig', 'usr-prof-avail', 'usr-prof-busy', 'usr-prof-other-tenant', 'usr-prof-restricted', 'usr-coord-subst')");
    await pool.query("DELETE FROM subjects WHERE id = 'sub-test-subst'");
    await pool.query("DELETE FROM classrooms WHERE id = 'cr-test-subst'");
  });

  describe('Tarea 3.1: DDL e Índices de schedule_substitutions', () => {
    it('debe existir la tabla schedule_substitutions con sus columnas e índices compuestos', async () => {
      const resCols = await pool.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'schedule_substitutions'
      `);
      const cols = resCols.rows.map(r => r.column_name);

      expect(cols).toContain('id');
      expect(cols).toContain('tenant_id');
      expect(cols).toContain('schedule_id');
      expect(cols).toContain('original_teacher_id');
      expect(cols).toContain('substitute_teacher_id');
      expect(cols).toContain('reason');
      expect(cols).toContain('effective_date');
      expect(cols).toContain('created_at');

      const resIdx = await pool.query(`
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'schedule_substitutions'
      `);
      const indexNames = resIdx.rows.map(r => r.indexname);

      expect(indexNames).toContain('idx_substitutions_tenant_schedule');
      expect(indexNames).toContain('idx_substitutions_tenant_substitute');
    });
  });

  describe('Tarea 3.2: Búsqueda de Suplentes Disponibles (GET /api/schedules/:id/available-substitutes)', () => {
    it('debe retornar 404 si el horario no existe', async () => {
      const res = await request(app)
        .get('/api/schedules/sch-inexistente/available-substitutes')
        .set('Authorization', `Bearer ${coordToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Horario no encontrado');
    });

    it('debe listar solo docentes disponibles del mismo tenant, excluyendo al titular y a los que tienen empalme', async () => {
      const res = await request(app)
        .get(`/api/schedules/${targetScheduleId}/available-substitutes`)
        .set('Authorization', `Bearer ${coordToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);

      const substituteIds = res.body.map(s => s.id);

      // 1. Debe incluir al profesor disponible
      expect(substituteIds).toContain(teacherAvailable.id);

      // 2. Debe excluir al profesor titular del horario
      expect(substituteIds).not.toContain(teacherOriginal.id);

      // 3. Debe excluir al profesor ocupado con horario empalmado
      expect(substituteIds).not.toContain(teacherBusy.id);

      // 4. Debe excluir profesores de otro tenant
      expect(substituteIds).not.toContain(otherTenantTeacher.id);

      // 5. Debe excluir profesores con restricciones horarias en teacher_restrictions que crucen con la clase
      expect(substituteIds).not.toContain(teacherRestricted.id);

      // 6. Verificar estructura de campos solicitada: id, name, email, identifier
      const availObj = res.body.find(s => s.id === teacherAvailable.id);
      expect(availObj).toBeDefined();
      expect(availObj.id).toBe(teacherAvailable.id);
      expect(availObj.name).toContain('Disponible');
      expect(availObj.email).toBe(teacherAvailable.email);
      expect(availObj.identifier).toBe(teacherAvailable.identificador);
    });

    it('debe rechazar acceso si el usuario no tiene rol Coordinador o Administrador', async () => {
      const res = await request(app)
        .get(`/api/schedules/${targetScheduleId}/available-substitutes`)
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Tarea 3.3: Reasignación y Transacción Atómica (POST /api/schedules/:id/transfer)', () => {
    it('debe rechazar si falta substitute_teacher_id con HTTP 400', async () => {
      const res = await request(app)
        .post(`/api/schedules/${targetScheduleId}/transfer`)
        .set('Authorization', `Bearer ${coordToken}`)
        .send({ reason: 'Falta suplente' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('substitute_teacher_id');
    });

    it('debe rechazar si se intenta transferir al mismo docente ya asignado con HTTP 400', async () => {
      const res = await request(app)
        .post(`/api/schedules/${targetScheduleId}/transfer`)
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          substitute_teacher_id: teacherOriginal.id,
          reason: 'Mismo docente'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('mismo docente');
    });

    it('debe rechazar si el docente suplente tiene empalme de horario con HTTP 400 y hacer rollback', async () => {
      const res = await request(app)
        .post(`/api/schedules/${targetScheduleId}/transfer`)
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          substitute_teacher_id: teacherBusy.id,
          reason: 'Tiene empalme Martes 09:00-11:00',
          effective_date: '2026-11-05'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Empalme de horario');

      // Verificar que el horario original no cambió (sigue siendo teacherOriginal)
      const schedCheck = await pool.query('SELECT teacher_id FROM schedules WHERE id = $1', [targetScheduleId]);
      expect(schedCheck.rows[0].teacher_id).toBe(teacherOriginal.id);

      // Verificar que no se insertó ninguna sustitución
      const substCheck = await pool.query('SELECT * FROM schedule_substitutions WHERE schedule_id = $1', [targetScheduleId]);
      expect(substCheck.rows.length).toBe(0);
    });

    it('debe rechazar con HTTP 409 y conflictType TEACHER_RESTRICTION si el docente suplente tiene restricción horaria en esa franja', async () => {
      const res = await request(app)
        .post(`/api/schedules/${targetScheduleId}/transfer`)
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          substitute_teacher_id: teacherRestricted.id,
          reason: 'Intento de suplencia en horario restringido'
        });

      expect(res.status).toBe(409);
      expect(res.body.conflictType).toBe('TEACHER_RESTRICTION');
      expect(res.body.error).toContain('Profesor Restringido');
      expect(res.body.restriction).toMatchObject({
        day_of_week: 'Martes',
        start_time: '08:30',
        end_time: '09:30',
        reason: 'Comisión institucional'
      });

      // Verificar que el horario original sigue intacto tras el rollback
      const schedCheck = await pool.query('SELECT teacher_id FROM schedules WHERE id = $1', [targetScheduleId]);
      expect(schedCheck.rows[0].teacher_id).toBe(teacherOriginal.id);
    });

    it('debe ejecutar la reasignación exitosamente, registrar en schedule_substitutions y actualizar schedules (HTTP 200)', async () => {
      const res = await request(app)
        .post(`/api/schedules/${targetScheduleId}/transfer`)
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          substitute_teacher_id: teacherAvailable.id,
          reason: 'Incapacidad médica del profesor titular',
          effective_date: '2026-11-10'
        });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('exitosamente');
      expect(res.body.schedule_id).toBe(targetScheduleId);
      expect(res.body.original_teacher_id).toBe(teacherOriginal.id);
      expect(res.body.substitute_teacher_id).toBe(teacherAvailable.id);
      expect(res.body.reason).toBe('Incapacidad médica del profesor titular');

      // 1. Verificar actualización en tabla schedules
      const schedUpdated = await pool.query('SELECT teacher_id FROM schedules WHERE id = $1', [targetScheduleId]);
      expect(schedUpdated.rows[0].teacher_id).toBe(teacherAvailable.id);

      // 2. Verificar inserción en schedule_substitutions
      const substRecord = await pool.query(
        'SELECT * FROM schedule_substitutions WHERE schedule_id = $1 AND substitute_teacher_id = $2',
        [targetScheduleId, teacherAvailable.id]
      );
      expect(substRecord.rows.length).toBe(1);
      const row = substRecord.rows[0];
      expect(row.tenant_id).toBe('tenant-itc');
      expect(row.original_teacher_id).toBe(teacherOriginal.id);
      expect(row.substitute_teacher_id).toBe(teacherAvailable.id);
      expect(row.reason).toBe('Incapacidad médica del profesor titular');
    });

    it('debe rechazar transferencias de usuarios no autorizados (HTTP 403)', async () => {
      const res = await request(app)
        .post(`/api/schedules/${targetScheduleId}/transfer`)
        .set('Authorization', `Bearer ${teacherToken}`)
        .send({
          substitute_teacher_id: teacherAvailable.id,
          reason: 'Intento no autorizado'
        });

      expect(res.status).toBe(403);
    });
  });

  describe('Tarea 3.4: Historial de Sustituciones (GET /api/schedules/substitutions)', () => {
    const studentToken = jwt.sign(
      { id: 'usr-student-subst', role_name: 'Alumno', tenant_id: 'tenant-itc', email: 'student.subst@pavilion.com' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    const otherTenantCoordToken = jwt.sign(
      { id: 'usr-coord-other', role_name: 'Coordinador', tenant_id: 'tenant-upn', email: 'coord.upn@pavilion.com' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    beforeAll(async () => {
      // Insertar una segunda sustitución en otra fecha para probar filtros por rango de fechas, búsqueda y paginación
      await pool.query("DELETE FROM schedule_substitutions WHERE id = 'subst-hist-extra-1'");
      await pool.query(
        `INSERT INTO schedule_substitutions (
           id, tenant_id, schedule_id, original_teacher_id, substitute_teacher_id, reason, effective_date, created_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP + INTERVAL '1 second')`,
        [
          'subst-hist-extra-1',
          'tenant-itc',
          busyScheduleId,
          teacherBusy.id,
          teacherOriginal.id,
          'Congreso internacional de robótica',
          '2026-12-01'
        ]
      );
    });

    afterAll(async () => {
      await pool.query("DELETE FROM schedule_substitutions WHERE id = 'subst-hist-extra-1'");
    });

    it('debe rechazar con HTTP 403 Forbidden si un usuario con rol Profesor o Alumno intenta consultar el historial', async () => {
      const resTeacher = await request(app)
        .get('/api/schedules/substitutions')
        .set('Authorization', `Bearer ${teacherToken}`);
      expect(resTeacher.status).toBe(403);

      const resStudent = await request(app)
        .get('/api/schedules/substitutions')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(resStudent.status).toBe(403);
    });

    it('debe aislar estrictamente por tenant_id (retornando vacío para otro tenant) y devolver joins completos para el tenant activo en < 200ms', async () => {
      // 1. Consulta desde otro tenant (tenant-upn) -> no debe ver registros de tenant-itc
      const resOther = await request(app)
        .get('/api/schedules/substitutions')
        .set('Authorization', `Bearer ${otherTenantCoordToken}`);

      expect(resOther.status).toBe(200);
      expect(resOther.body.data).toEqual([]);
      expect(resOther.body.total).toBe(0);

      // 2. Consulta desde tenant-itc -> debe retornar las sustituciones con los nombres de ambos docentes, materia y aula
      const startMs = Date.now();
      const resItc = await request(app)
        .get('/api/schedules/substitutions')
        .set('Authorization', `Bearer ${coordToken}`);
      const elapsedMs = Date.now() - startMs;

      expect(resItc.status).toBe(200);
      expect(elapsedMs).toBeLessThan(200);
      expect(resItc.body.total).toBeGreaterThanOrEqual(2);
      expect(Array.isArray(resItc.body.data)).toBe(true);

      const medicalSub = resItc.body.data.find(r => r.reason === 'Incapacidad médica del profesor titular');
      expect(medicalSub).toBeDefined();
      expect(medicalSub.original_teacher_name).toBe('Profesor Original');
      expect(medicalSub.substitute_teacher_name).toBe('Profesor Disponible');
      expect(medicalSub.subject_name).toBe('Sistemas Operativos');
      expect(medicalSub.classroom_name).toBe('Aula Subst 101');
      expect(medicalSub.effective_date).toBe('2026-11-10');
    });

    it('debe aplicar correctamente los filtros dinámicos (teacher_id, from_date/to_date, search y paginación)', async () => {
      // 1. Filtro por teacher_id (teacherAvailable solo participó como suplente en la 1ra sustitución)
      const resByTeacher = await request(app)
        .get('/api/schedules/substitutions')
        .query({ teacher_id: teacherAvailable.id })
        .set('Authorization', `Bearer ${coordToken}`);

      expect(resByTeacher.status).toBe(200);
      expect(resByTeacher.body.data.length).toBe(1);
      expect(resByTeacher.body.data[0].substitute_teacher_id).toBe(teacherAvailable.id);

      // 2. Filtro por rango de fechas (from_date y to_date en noviembre 2026)
      const resByDate = await request(app)
        .get('/api/schedules/substitutions')
        .query({ from_date: '2026-11-01', to_date: '2026-11-30' })
        .set('Authorization', `Bearer ${coordToken}`);

      expect(resByDate.status).toBe(200);
      expect(resByDate.body.data.every(r => r.effective_date >= '2026-11-01' && r.effective_date <= '2026-11-30')).toBe(true);
      expect(resByDate.body.data.some(r => r.effective_date === '2026-11-10')).toBe(true);
      expect(resByDate.body.data.some(r => r.effective_date === '2026-12-01')).toBe(false);

      // 3. Filtro por search (ILIKE en motivo "robótica")
      const resBySearch = await request(app)
        .get('/api/schedules/substitutions')
        .query({ search: 'robótica' })
        .set('Authorization', `Bearer ${coordToken}`);

      expect(resBySearch.status).toBe(200);
      expect(resBySearch.body.data.length).toBe(1);
      expect(resBySearch.body.data[0].id).toBe('subst-hist-extra-1');

      // 4. Paginación (limit=1, page=1)
      const resPaginated = await request(app)
        .get('/api/schedules/substitutions')
        .query({ page: 1, limit: 1 })
        .set('Authorization', `Bearer ${coordToken}`);

      expect(resPaginated.status).toBe(200);
      expect(resPaginated.body.data.length).toBe(1);
      expect(resPaginated.body.page).toBe(1);
      expect(resPaginated.body.limit).toBe(1);
      expect(resPaginated.body.total).toBeGreaterThanOrEqual(2);
      expect(resPaginated.body.totalPages).toBeGreaterThanOrEqual(2);
    });
  });
});
