import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/server';
import { pool, initDatabase } from '../../src/db';
import { JWT_SECRET } from '../../src/middleware/auth';

describe('Integración: Endpoints CRUD de Restricciones Horarias (teacher_restrictions) con RBAC, Validación de Tiempo, Empalmes y Multi-Tenant', () => {
  const tenantA = 'tenant-itc';
  const tenantB = 'tenant-upn';

  const teacher1Id = 'usr-prof-restr-1';
  const teacher2Id = 'usr-prof-restr-2';
  const teacherTenantBId = 'usr-prof-restr-upn';

  const coordTokenA = jwt.sign(
    { id: 'usr-coord-restr-a', role_name: 'Coordinador', tenant_id: tenantA, email: 'coord.restr.a@pavilion.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const coordTokenB = jwt.sign(
    { id: 'usr-coord-restr-b', role_name: 'Coordinador', tenant_id: tenantB, email: 'coord.restr.b@pavilion.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const teacher1Token = jwt.sign(
    { id: teacher1Id, role_name: 'Profesor', tenant_id: tenantA, email: 'prof1.restr@pavilion.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const teacher2Token = jwt.sign(
    { id: teacher2Id, role_name: 'Profesor', tenant_id: tenantA, email: 'prof2.restr@pavilion.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  let createdRestrictionId = null;

  beforeAll(async () => {
    await initDatabase();

    // Limpieza previa
    await pool.query(
      'DELETE FROM teacher_restrictions WHERE teacher_id IN ($1, $2, $3)',
      [teacher1Id, teacher2Id, teacherTenantBId]
    );
    await pool.query(
      'DELETE FROM users WHERE id IN ($1, $2, $3)',
      [teacher1Id, teacher2Id, teacherTenantBId]
    );

    // Sembrar docentes de prueba en tenantA y tenantB
    await pool.query(
      `INSERT INTO users (id, tenant_id, nombre, apellidos, email, role_id, identificador, horas_contratadas, estatus, email_activo)
       VALUES ($1, $2, 'Elena', 'Restricciones Uno', 'prof1.restr@pavilion.com', 'role-teacher', 'DOC-R01', 25, 'activo', TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [teacher1Id, tenantA]
    );

    await pool.query(
      `INSERT INTO users (id, tenant_id, nombre, apellidos, email, role_id, identificador, horas_contratadas, estatus, email_activo)
       VALUES ($1, $2, 'Carlos', 'Restricciones Dos', 'prof2.restr@pavilion.com', 'role-teacher', 'DOC-R02', 25, 'activo', TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [teacher2Id, tenantA]
    );

    await pool.query(
      `INSERT INTO users (id, tenant_id, nombre, apellidos, email, role_id, identificador, horas_contratadas, estatus, email_activo)
       VALUES ($1, $2, 'Laura', 'Restricciones UPN', 'prof.upn.restr@pavilion.com', 'role-teacher', 'DOC-R03', 25, 'activo', TRUE)
       ON CONFLICT (id) DO NOTHING`,
      [teacherTenantBId, tenantB]
    );
  });

  afterAll(async () => {
    await pool.query(
      'DELETE FROM teacher_restrictions WHERE teacher_id IN ($1, $2, $3)',
      [teacher1Id, teacher2Id, teacherTenantBId]
    );
    await pool.query(
      'DELETE FROM users WHERE id IN ($1, $2, $3)',
      [teacher1Id, teacher2Id, teacherTenantBId]
    );
  });

  describe('1. Seguridad JWT y Control de Acceso Basado en Roles (RBAC)', () => {
    it('Rechaza con HTTP 401 peticiones sin token JWT en GET, POST y DELETE', async () => {
      const getRes = await request(app).get(`/api/teachers/${teacher1Id}/restrictions`);
      expect(getRes.status).toBe(401);

      const postRes = await request(app)
        .post(`/api/teachers/${teacher1Id}/restrictions`)
        .send({ day_of_week: 'Lunes', start_time: '08:00', end_time: '10:00' });
      expect(postRes.status).toBe(401);

      const delRes = await request(app).delete('/api/teachers/restrictions/tr-nonexistent');
      expect(delRes.status).toBe(401);
    });

    it('Retorna HTTP 403 Forbidden si un Profesor intenta consultar o crear restricciones de otro Profesor', async () => {
      const getOtherRes = await request(app)
        .get(`/api/teachers/${teacher2Id}/restrictions`)
        .set('Authorization', `Bearer ${teacher1Token}`);
      expect(getOtherRes.status).toBe(403);

      const postOtherRes = await request(app)
        .post(`/api/teachers/${teacher2Id}/restrictions`)
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          day_of_week: 'Lunes',
          start_time: '08:00',
          end_time: '10:00',
          reason: 'Intento no autorizado'
        });
      expect(postOtherRes.status).toBe(403);
    });

    it('Permite a un Profesor crear y consultar sus propias restricciones usando su propio ID o el alias "me"', async () => {
      const postMeRes = await request(app)
        .post('/api/teachers/me/restrictions')
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          day_of_week: 'Miércoles',
          start_time: '10:00',
          end_time: '12:00',
          reason: 'Consulta médica'
        });

      expect(postMeRes.status).toBe(201);
      expect(postMeRes.body).toMatchObject({
        tenant_id: tenantA,
        teacher_id: teacher1Id,
        day_of_week: 'Miércoles',
        start_time: '10:00',
        end_time: '12:00',
        reason: 'Consulta médica'
      });
      createdRestrictionId = postMeRes.body.id;

      const getOwnRes = await request(app)
        .get(`/api/teachers/${teacher1Id}/restrictions`)
        .set('Authorization', `Bearer ${teacher1Token}`);
      expect(getOwnRes.status).toBe(200);
      expect(getOwnRes.body.length).toBe(1);
      expect(getOwnRes.body[0].id).toBe(createdRestrictionId);

      const getMeRes = await request(app)
        .get('/api/teachers/me/restrictions')
        .set('Authorization', `Bearer ${teacher1Token}`);
      expect(getMeRes.status).toBe(200);
      expect(getMeRes.body.length).toBe(1);
    });

    it('Permite al Coordinador crear y consultar restricciones de cualquier profesor de su tenant', async () => {
      const postCoordRes = await request(app)
        .post(`/api/teachers/${teacher1Id}/restrictions`)
        .set('Authorization', `Bearer ${coordTokenA}`)
        .send({
          day_of_week: 'Lunes',
          start_time: '14:00',
          end_time: '16:00',
          reason: 'Junta de academia'
        });

      expect(postCoordRes.status).toBe(201);
      expect(postCoordRes.body.teacher_id).toBe(teacher1Id);

      const getCoordRes = await request(app)
        .get(`/api/teachers/${teacher1Id}/restrictions`)
        .set('Authorization', `Bearer ${coordTokenA}`);
      expect(getCoordRes.status).toBe(200);
      expect(getCoordRes.body.length).toBe(2);
    });
  });

  describe('2. Validaciones de Rango de Tiempo (HTTP 400) y Prevención de Empalmes (HTTP 409)', () => {
    it('Rechaza con HTTP 400 (Fail-Fast) cuando start_time >= end_time (rango invertido o igual)', async () => {
      // Rango invertido: 12:00 a 10:00
      const invertedRes = await request(app)
        .post(`/api/teachers/${teacher1Id}/restrictions`)
        .set('Authorization', `Bearer ${coordTokenA}`)
        .send({
          day_of_week: 'Martes',
          start_time: '12:00',
          end_time: '10:00',
          reason: 'Invertido'
        });
      expect(invertedRes.status).toBe(400);
      expect(invertedRes.body.error).toMatch(/hora de inicio|start_time < end_time|inválido/i);

      // Rango de duración cero: 10:00 a 10:00
      const equalRes = await request(app)
        .post(`/api/teachers/${teacher1Id}/restrictions`)
        .set('Authorization', `Bearer ${coordTokenA}`)
        .send({
          day_of_week: 'Martes',
          start_time: '10:00',
          end_time: '10:00',
          reason: 'Igual'
        });
      expect(equalRes.status).toBe(400);
    });

    it('Rechaza con HTTP 400 formatos de hora inválidos o días fuera del catálogo', async () => {
      const badFormatRes = await request(app)
        .post(`/api/teachers/${teacher1Id}/restrictions`)
        .set('Authorization', `Bearer ${coordTokenA}`)
        .send({
          day_of_week: 'Martes',
          start_time: '25:00',
          end_time: '26:00'
        });
      expect(badFormatRes.status).toBe(400);

      const badDayRes = await request(app)
        .post(`/api/teachers/${teacher1Id}/restrictions`)
        .set('Authorization', `Bearer ${coordTokenA}`)
        .send({
          day_of_week: 'Monday',
          start_time: '08:00',
          end_time: '10:00'
        });
      expect(badDayRes.status).toBe(400);
    });

    it('Rechaza con HTTP 409 Conflict si la nueva restricción se empalma parcial o totalmente con una existente en el mismo día', async () => {
      // Teacher1 ya tiene: Lunes 14:00 - 16:00 y Miércoles 10:00 - 12:00
      // 1. Empalme parcial por el inicio (13:00 - 15:00 en Lunes)
      const overlapStartRes = await request(app)
        .post(`/api/teachers/${teacher1Id}/restrictions`)
        .set('Authorization', `Bearer ${coordTokenA}`)
        .send({
          day_of_week: 'Lunes',
          start_time: '13:00',
          end_time: '15:00',
          reason: 'Empalme parcial inicio'
        });
      expect(overlapStartRes.status).toBe(409);

      // 2. Empalme parcial por el final (15:00 - 17:00 en Lunes)
      const overlapEndRes = await request(app)
        .post(`/api/teachers/${teacher1Id}/restrictions`)
        .set('Authorization', `Bearer ${coordTokenA}`)
        .send({
          day_of_week: 'Lunes',
          start_time: '15:00',
          end_time: '17:00',
          reason: 'Empalme parcial fin'
        });
      expect(overlapEndRes.status).toBe(409);

      // 3. Empalme contenido dentro de uno existente (10:30 - 11:30 en Miércoles)
      const containedRes = await request(app)
        .post(`/api/teachers/${teacher1Id}/restrictions`)
        .set('Authorization', `Bearer ${teacher1Token}`)
        .send({
          day_of_week: 'Miércoles',
          start_time: '10:30',
          end_time: '11:30',
          reason: 'Contenido'
        });
      expect(containedRes.status).toBe(409);
    });

    it('Permite registrar bloques contiguos sin empalme (ej. 08:00-10:00 cuando existe 10:00-12:00) y los ordena por día y start_time', async () => {
      const contiguousRes = await request(app)
        .post(`/api/teachers/${teacher1Id}/restrictions`)
        .set('Authorization', `Bearer ${coordTokenA}`)
        .send({
          day_of_week: 'Miércoles',
          start_time: '08:00',
          end_time: '10:00',
          reason: 'Bloque contiguo previo'
        });
      expect(contiguousRes.status).toBe(201);

      const listRes = await request(app)
        .get(`/api/teachers/${teacher1Id}/restrictions`)
        .set('Authorization', `Bearer ${coordTokenA}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.length).toBe(3);

      // Primero Lunes (14:00), luego Miércoles ordenado por start_time (08:00 y después 10:00)
      expect(listRes.body[0]).toMatchObject({ day_of_week: 'Lunes', start_time: '14:00' });
      expect(listRes.body[1]).toMatchObject({ day_of_week: 'Miércoles', start_time: '08:00' });
      expect(listRes.body[2]).toMatchObject({ day_of_week: 'Miércoles', start_time: '10:00' });
    });
  });

  describe('3. Aislamiento Multi-Tenant y Eliminación Segura (DELETE)', () => {
    it('Aislamiento por tenant_id: Un coordinador de otro tenant no ve ni puede registrar restricciones en profesores ajenos', async () => {
      // GET desde tenantB sobre teacher1Id (que pertenece a tenantA) debe devolver []
      const crossTenantGet = await request(app)
        .get(`/api/teachers/${teacher1Id}/restrictions`)
        .set('Authorization', `Bearer ${coordTokenB}`);
      expect(crossTenantGet.status).toBe(200);
      expect(crossTenantGet.body).toEqual([]);

      // POST desde tenantB sobre teacher1Id debe devolver 404 (no existe en tenantB)
      const crossTenantPost = await request(app)
        .post(`/api/teachers/${teacher1Id}/restrictions`)
        .set('Authorization', `Bearer ${coordTokenB}`)
        .send({
          day_of_week: 'Viernes',
          start_time: '08:00',
          end_time: '10:00'
        });
      expect(crossTenantPost.status).toBe(404);
    });

    it('DELETE /api/teachers/restrictions/:restrictionId: Rechaza con 403 si un profesor intenta borrar la restricción de otro profesor', async () => {
      const delOtherTeacher = await request(app)
        .delete(`/api/teachers/restrictions/${createdRestrictionId}`)
        .set('Authorization', `Bearer ${teacher2Token}`);
      expect(delOtherTeacher.status).toBe(403);
    });

    it('DELETE /api/teachers/restrictions/:restrictionId: Rechaza con 404 si otro tenant intenta borrar la restricción (WHERE tenant_id = $1)', async () => {
      const delOtherTenant = await request(app)
        .delete(`/api/teachers/restrictions/${createdRestrictionId}`)
        .set('Authorization', `Bearer ${coordTokenB}`);
      expect(delOtherTenant.status).toBe(404);
    });

    it('DELETE /api/teachers/restrictions/:restrictionId: Permite al propio profesor o al coordinador eliminar la restricción', async () => {
      const delOwn = await request(app)
        .delete(`/api/teachers/restrictions/${createdRestrictionId}`)
        .set('Authorization', `Bearer ${teacher1Token}`);
      expect(delOwn.status).toBe(200);
      expect(delOwn.body.id).toBe(createdRestrictionId);

      // Verificar que ya no aparece en GET
      const afterDelGet = await request(app)
        .get(`/api/teachers/${teacher1Id}/restrictions`)
        .set('Authorization', `Bearer ${coordTokenA}`);
      expect(afterDelGet.status).toBe(200);
      expect(afterDelGet.body.some((r) => r.id === createdRestrictionId)).toBe(false);
    });
  });
});
