import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/server';
import { pool, initDatabase } from '../../src/db';
import { JWT_SECRET } from '../../src/middleware/auth';
import { migrateScheduleSubstitutions } from '../../src/utils/scheduleSubstitutionsMigration';

describe('Integración: Suplencias Temporales por Rango de Fechas (start_date / end_date) y Reversión Manual', () => {
  const coordToken = jwt.sign(
    { id: 'usr-coord-temp', role_name: 'Coordinador', tenant_id: 'tenant-temp-test', email: 'coord.temp@test.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const teacherTitularToken = jwt.sign(
    { id: 'usr-prof-titular', role_name: 'Profesor', tenant_id: 'tenant-temp-test', email: 'titular.temp@test.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const teacherSuplenteToken = jwt.sign(
    { id: 'usr-prof-suplente', role_name: 'Profesor', tenant_id: 'tenant-temp-test', email: 'suplente.temp@test.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const otherTenantToken = jwt.sign(
    { id: 'usr-coord-other-temp', role_name: 'Coordinador', tenant_id: 'tenant-other-temp', email: 'other.temp@test.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  let tempScheduleId = 'sch-temp-1';
  let createdSubstId = null;

  beforeAll(async () => {
    await initDatabase();

    // Limpieza preventiva
    await pool.query("DELETE FROM schedule_substitutions WHERE tenant_id IN ('tenant-temp-test', 'tenant-other-temp')");
    await pool.query("DELETE FROM schedules WHERE tenant_id IN ('tenant-temp-test', 'tenant-other-temp')");
    await pool.query("DELETE FROM users WHERE tenant_id IN ('tenant-temp-test', 'tenant-other-temp')");
    await pool.query("DELETE FROM subjects WHERE tenant_id IN ('tenant-temp-test', 'tenant-other-temp')");
    await pool.query("DELETE FROM classrooms WHERE tenant_id IN ('tenant-temp-test', 'tenant-other-temp')");
    await pool.query("DELETE FROM tenants WHERE id IN ('tenant-temp-test', 'tenant-other-temp')");

    // 1. Tenants
    await pool.query(`
      INSERT INTO tenants (id, name, slug) VALUES 
      ('tenant-temp-test', 'Instituto Suplencias Temporales', 'tenant-temp-test'),
      ('tenant-other-temp', 'Universidad Temporal Ajena', 'tenant-other-temp')
      ON CONFLICT (id) DO NOTHING
    `);

    // 2. Usuarios
    await pool.query(`
      INSERT INTO users (id, tenant_id, nombre, apellidos, email, role_id, identificador, estatus, horas_contratadas)
      VALUES 
      ('usr-coord-temp', 'tenant-temp-test', 'Coordinador', 'Temporal', 'coord.temp@test.com', 'role-coord', 'NOM-C-01', 'activo', 30),
      ('usr-prof-titular', 'tenant-temp-test', 'Docente', 'Titular', 'titular.temp@test.com', 'role-teacher', 'NOM-T-01', 'activo', 20),
      ('usr-prof-suplente', 'tenant-temp-test', 'Docente', 'Suplente', 'suplente.temp@test.com', 'role-teacher', 'NOM-S-01', 'activo', 20),
      ('usr-prof-busy-temp', 'tenant-temp-test', 'Docente', 'Ocupado', 'busy.temp@test.com', 'role-teacher', 'NOM-B-01', 'activo', 20),
      ('usr-coord-other-temp', 'tenant-other-temp', 'Coord', 'Ajeno', 'other.temp@test.com', 'role-coord', 'NOM-O-01', 'activo', 30)
      ON CONFLICT (id) DO UPDATE SET 
        tenant_id = EXCLUDED.tenant_id,
        nombre = EXCLUDED.nombre,
        apellidos = EXCLUDED.apellidos,
        email = EXCLUDED.email,
        identificador = EXCLUDED.identificador,
        role_id = EXCLUDED.role_id,
        estatus = EXCLUDED.estatus,
        horas_contratadas = EXCLUDED.horas_contratadas
    `);

    // 3. Materias
    await pool.query(`
      INSERT INTO subjects (id, tenant_id, code, name, credits)
      VALUES 
      ('sub-temp-1', 'tenant-temp-test', 'TEMP-101', 'Física Cuántica', 5),
      ('sub-temp-2', 'tenant-temp-test', 'TEMP-102', 'Química Orgánica', 5)
      ON CONFLICT (id) DO NOTHING
    `);

    // 4. Aulas
    await pool.query(`
      INSERT INTO classrooms (id, tenant_id, name, building, capacity, type)
      VALUES 
      ('cr-temp-1', 'tenant-temp-test', 'Aula 101', 'Edificio Central', 35, 'Aula Teórica')
      ON CONFLICT (id) DO NOTHING
    `);

    // 5. Horario base asignado al titular
    await pool.query(`
      INSERT INTO schedules (id, tenant_id, subject_id, teacher_id, classroom_id, day_of_week, start_time, end_time, group_code, session_type)
      VALUES 
      ('sch-temp-1', 'tenant-temp-test', 'sub-temp-1', 'usr-prof-titular', 'cr-temp-1', 'Martes', '10:00', '12:00', 'G1', 'Clase Teórica'),
      ('sch-temp-clash', 'tenant-temp-test', 'sub-temp-2', 'usr-prof-busy-temp', 'cr-temp-1', 'Martes', '10:00', '12:00', 'G2', 'Clase Teórica')
      ON CONFLICT (id) DO NOTHING
    `);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM schedule_substitutions WHERE tenant_id IN ('tenant-temp-test', 'tenant-other-temp')");
    await pool.query("DELETE FROM schedules WHERE tenant_id IN ('tenant-temp-test', 'tenant-other-temp')");
    await pool.query("DELETE FROM users WHERE tenant_id IN ('tenant-temp-test', 'tenant-other-temp')");
    await pool.query("DELETE FROM subjects WHERE tenant_id IN ('tenant-temp-test', 'tenant-other-temp')");
    await pool.query("DELETE FROM classrooms WHERE tenant_id IN ('tenant-temp-test', 'tenant-other-temp')");
    await pool.query("DELETE FROM tenants WHERE id IN ('tenant-temp-test', 'tenant-other-temp')");
  });

  it('1. Migración DDL: ejecuta de forma idempotente y agrega substitution_type, end_date y status con constraints CHECK', async () => {
    // Ejecutar migración repetidamente para validar idempotencia
    await migrateScheduleSubstitutions(pool);
    await migrateScheduleSubstitutions(pool);

    const colsRes = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'schedule_substitutions'
    `);
    const cols = colsRes.rows.map(r => r.column_name);

    expect(cols).toContain('substitution_type');
    expect(cols).toContain('end_date');
    expect(cols).toContain('status');

    // Validar CHECK constraints
    const chkRes = await pool.query(`
      SELECT conname FROM pg_constraint 
      WHERE conrelid = 'schedule_substitutions'::regclass
    `);
    const constraintNames = chkRes.rows.map(r => r.conname);
    expect(constraintNames).toContain('chk_substitutions_type');
    expect(constraintNames).toContain('chk_substitutions_status');
  });

  it('2. Validación temporal: rechaza con HTTP 400 si falta end_date o si end_date < effective_date', async () => {
    // Sin end_date
    const resNoEndDate = await request(app)
      .post(`/api/schedules/${tempScheduleId}/transfer`)
      .set('Authorization', `Bearer ${coordToken}`)
      .send({
        substitute_teacher_id: 'usr-prof-suplente',
        substitution_type: 'temporal',
        effective_date: '2026-11-20',
        reason: 'Licencia temporal'
      });

    expect(resNoEndDate.status).toBe(400);
    expect(resNoEndDate.body.error).toContain('end_date');

    // Con end_date anterior a effective_date
    const resInvalidEndDate = await request(app)
      .post(`/api/schedules/${tempScheduleId}/transfer`)
      .set('Authorization', `Bearer ${coordToken}`)
      .send({
        substitute_teacher_id: 'usr-prof-suplente',
        substitution_type: 'temporal',
        effective_date: '2026-11-20',
        end_date: '2026-11-15',
        reason: 'Fechas inconsistentes'
      });

    expect(resInvalidEndDate.status).toBe(400);
    expect(resInvalidEndDate.body.error).toContain('igual o posterior');
  });

  it('3. Empalme horario: rechaza con HTTP 409 ante empalme de horario del docente suplente en modalidad temporal', async () => {
    // Intentar transferir a 'usr-prof-busy-temp' que ya tiene clase Martes 10:00 - 12:00
    const resClash = await request(app)
      .post(`/api/schedules/${tempScheduleId}/transfer`)
      .set('Authorization', `Bearer ${coordToken}`)
      .send({
        substitute_teacher_id: 'usr-prof-busy-temp',
        substitution_type: 'temporal',
        effective_date: '2026-11-01',
        end_date: '2026-12-31',
        reason: 'Intento de suplencia con empalme'
      });

    expect(resClash.status).toBe(409);
    expect(resClash.body.error).toContain('Empalme de horario');
  });

  it('4. Registro exitoso de suplencia temporal: status = activa, end_date registrado y titular en schedules intacto', async () => {
    const today = new Date().toISOString().split('T')[0];
    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const resSuccess = await request(app)
      .post(`/api/schedules/${tempScheduleId}/transfer`)
      .set('Authorization', `Bearer ${coordToken}`)
      .send({
        substitute_teacher_id: 'usr-prof-suplente',
        substitution_type: 'temporal',
        effective_date: today,
        end_date: nextMonth,
        reason: 'Incapacidad médica temporal'
      });

    expect(resSuccess.status).toBe(200);
    expect(resSuccess.body.substitution_type).toBe('temporal');
    expect(resSuccess.body.status).toBe('activa');
    expect(resSuccess.body.end_date).toBe(nextMonth);
    createdSubstId = resSuccess.body.substitution_id;

    // Verificar en BD que schedules.teacher_id NO fue modificado (titular original preservado)
    const schedDb = await pool.query('SELECT teacher_id FROM schedules WHERE id = $1', [tempScheduleId]);
    expect(schedDb.rows[0].teacher_id).toBe('usr-prof-titular');

    // Verificar en schedule_substitutions
    const subDb = await pool.query('SELECT * FROM schedule_substitutions WHERE id = $1', [createdSubstId]);
    expect(subDb.rows[0].substitution_type).toBe('temporal');
    expect(subDb.rows[0].status).toBe('activa');
    expect(subDb.rows[0].original_teacher_id).toBe('usr-prof-titular');
    expect(subDb.rows[0].substitute_teacher_id).toBe('usr-prof-suplente');
  });

  it('5. Consultas enriquecidas: Coordinador y Profesor reciben active_substitution cuando la fecha actual cae en el rango', async () => {
    // Coordinador
    const resCoord = await request(app)
      .get('/api/schedules/coordinator')
      .set('Authorization', `Bearer ${coordToken}`);

    expect(resCoord.status).toBe(200);
    const coordSchedule = resCoord.body.find(s => s.id === tempScheduleId);
    expect(coordSchedule).toBeDefined();
    expect(coordSchedule.active_substitution).toBeDefined();
    expect(coordSchedule.active_substitution.substitute_teacher_id).toBe('usr-prof-suplente');
    expect(coordSchedule.active_substitution.substitute_teacher_name).toContain('Suplente');
    expect(coordSchedule.active_substitution.status).toBe('activa');

    // Profesor Titular
    const resTitular = await request(app)
      .get('/api/schedules/teacher')
      .set('Authorization', `Bearer ${teacherTitularToken}`);

    expect(resTitular.status).toBe(200);
    const titularSchedule = resTitular.body.find(s => s.id === tempScheduleId);
    expect(titularSchedule).toBeDefined();
    expect(titularSchedule.active_substitution).toBeDefined();
    expect(titularSchedule.active_substitution.substitute_teacher_id).toBe('usr-prof-suplente');

    // Profesor Suplente (debe ver la clase asignada temporalmente)
    const resSuplente = await request(app)
      .get('/api/schedules/teacher')
      .set('Authorization', `Bearer ${teacherSuplenteToken}`);

    expect(resSuplente.status).toBe(200);
    const suplenteSchedule = resSuplente.body.find(s => s.id === tempScheduleId);
    expect(suplenteSchedule).toBeDefined();
    expect(suplenteSchedule.active_substitution).toBeDefined();
    expect(suplenteSchedule.active_substitution.substitute_teacher_id).toBe('usr-prof-suplente');
  });

  it('6. Reversión Manual (POST /api/schedules/substitutions/:substId/revert): finaliza la suplencia temporal y valida RBAC', async () => {
    // 6.1. Rechazo sin permisos de Coordinador
    const resUnauthorized = await request(app)
      .post(`/api/schedules/substitutions/${createdSubstId}/revert`)
      .set('Authorization', `Bearer ${teacherTitularToken}`);
    expect(resUnauthorized.status).toBe(403);

    // 6.2. Rechazo para otro tenant
    const resOtherTenant = await request(app)
      .post(`/api/schedules/substitutions/${createdSubstId}/revert`)
      .set('Authorization', `Bearer ${otherTenantToken}`);
    expect(resOtherTenant.status).toBe(404);

    // 6.3. Reversión exitosa como Coordinador
    const resRevert = await request(app)
      .post(`/api/schedules/substitutions/${createdSubstId}/revert`)
      .set('Authorization', `Bearer ${coordToken}`);

    expect(resRevert.status).toBe(200);
    expect(resRevert.body.message).toContain('finalizada exitosamente');
    expect(resRevert.body.substitution.status).toBe('finalizada');

    // Verificar en BD que status cambió a 'finalizada'
    const subDb = await pool.query('SELECT status FROM schedule_substitutions WHERE id = $1', [createdSubstId]);
    expect(subDb.rows[0].status).toBe('finalizada');

    // 6.4. Al intentar revertir de nuevo, rechaza con HTTP 400 (ya no está activa)
    const resRevertAgain = await request(app)
      .post(`/api/schedules/substitutions/${createdSubstId}/revert`)
      .set('Authorization', `Bearer ${coordToken}`);
    expect(resRevertAgain.status).toBe(400);

    // 6.5. Tras finalizar, la consulta de horarios ya no devuelve active_substitution activa
    const resCoordAfter = await request(app)
      .get('/api/schedules/coordinator')
      .set('Authorization', `Bearer ${coordToken}`);
    const schedAfter = resCoordAfter.body.find(s => s.id === tempScheduleId);
    expect(schedAfter.active_substitution).toBeNull();
  });
});
