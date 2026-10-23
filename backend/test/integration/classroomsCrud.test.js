import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/server';
import { pool, initDatabase } from '../../src/db';
import { JWT_SECRET } from '../../src/middleware/auth';

describe('Integración: Operaciones CRUD de Aulas y Aislamiento Multi-Tenant', () => {
  // Tokens para pruebas
  const coordTenant1Token = jwt.sign(
    { id: 'usr-coord-1', role_name: 'Coordinador', tenant_id: 'tenant-itc', email: 'coord@itc.edu' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const adminTenant1Token = jwt.sign(
    { id: 'usr-admin-1', role_name: 'Administrador', tenant_id: 'tenant-itc', email: 'admin@itc.edu' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const teacherTenant1Token = jwt.sign(
    { id: 'usr-prof-1', role_name: 'Profesor', tenant_id: 'tenant-itc', email: 'prof@itc.edu' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const coordTenant2Token = jwt.sign(
    { id: 'usr-coord-2', role_name: 'Coordinador', tenant_id: 'tenant-upn', email: 'coord@upn.edu' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  beforeAll(async () => {
    await initDatabase();
  });

  describe('Criterio 1: POST /api/classrooms (Creación y Requerimientos)', () => {
    it('Requiere los campos name, capacity, building y type (retorna 400 si falta alguno)', async () => {
      // Falta name
      const resMissingName = await request(app)
        .post('/api/classrooms')
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({ capacity: 30, building: 'Edificio A', type: 'Aula Teórica' });
      expect(resMissingName.status).toBe(400);
      expect(resMissingName.body.error).toContain('obligatorios');

      // Falta capacity
      const resMissingCap = await request(app)
        .post('/api/classrooms')
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({ name: 'Aula Test', building: 'Edificio A', type: 'Aula Teórica' });
      expect(resMissingCap.status).toBe(400);

      // Capacity inválida (negativa o no numérica)
      const resInvalidCap = await request(app)
        .post('/api/classrooms')
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({ name: 'Aula Test', capacity: -5, building: 'Edificio A', type: 'Aula Teórica' });
      expect(resInvalidCap.status).toBe(400);
      expect(resInvalidCap.body.error).toContain('positivo');

      // Falta building
      const resMissingBld = await request(app)
        .post('/api/classrooms')
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({ name: 'Aula Test', capacity: 30, type: 'Aula Teórica' });
      expect(resMissingBld.status).toBe(400);

      // Falta type
      const resMissingType = await request(app)
        .post('/api/classrooms')
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({ name: 'Aula Test', capacity: 30, building: 'Edificio A' });
      expect(resMissingType.status).toBe(400);
    });

    it('Permite registrar un aula exitosamente con name, capacity, building y type', async () => {
      const aulaName = 'Aula Creación Test ' + Date.now();
      const res = await request(app)
        .post('/api/classrooms')
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({
          name: aulaName,
          capacity: 45,
          building: 'Edificio Laboratorios',
          type: 'Laboratorio de Cómputo'
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe(aulaName);
      expect(res.body.capacity).toBe(45);
      expect(res.body.building).toBe('Edificio Laboratorios');
      expect(res.body.type).toBe('Laboratorio de Cómputo');
      expect(res.body.tenant_id).toBe('tenant-itc');

      // Limpieza
      await pool.query('DELETE FROM classrooms WHERE id = $1', [res.body.id]);
    });

    it('Impide duplicar nombres de aulas en el mismo tenant (HTTP 409 Conflict)', async () => {
      const res = await request(app)
        .post('/api/classrooms')
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({
          name: 'Aula A-101', // Ya existe en tenant-itc
          capacity: 35,
          building: 'Edificio de Ciencias',
          type: 'Aula Teórica'
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Ya existe un aula con ese nombre');
    });
  });

  describe('Criterio 2: PUT /api/classrooms/:id (Edición y Aislamiento de Tenant)', () => {
    let createdAulaId = null;

    beforeAll(async () => {
      // Crear un aula de prueba en tenant-itc
      const createRes = await request(app)
        .post('/api/classrooms')
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({
          name: 'Aula Para Editar ' + Date.now(),
          capacity: 25,
          building: 'Edificio B',
          type: 'Aula Teórica'
        });
      createdAulaId = createRes.body.id;
    });

    afterAll(async () => {
      if (createdAulaId) {
        await pool.query('DELETE FROM classrooms WHERE id = $1', [createdAulaId]);
      }
    });

    it('Actualiza los atributos del aula si pertenece al tenant del usuario', async () => {
      const res = await request(app)
        .put(`/api/classrooms/${createdAulaId}`)
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({
          name: 'Aula Editada Renombrada',
          capacity: 50,
          building: 'Edificio Renovado',
          type: 'Auditorio'
        });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createdAulaId);
      expect(res.body.name).toBe('Aula Editada Renombrada');
      expect(res.body.capacity).toBe(50);
      expect(res.body.building).toBe('Edificio Renovado');
      expect(res.body.type).toBe('Auditorio');
    });

    it('Impide que un usuario de otro tenant mute un aula ajena (HTTP 404 No encontrada)', async () => {
      // Intentar editar createdAulaId (que pertenece a tenant-itc) usando un token de tenant-upn
      const res = await request(app)
        .put(`/api/classrooms/${createdAulaId}`)
        .set('Authorization', `Bearer ${coordTenant2Token}`)
        .send({
          name: 'Ataque Cross-Tenant',
          capacity: 99
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('no pertenece a esta institución');

      // Verificar en la DB que NO fue modificada
      const check = await pool.query('SELECT name, capacity FROM classrooms WHERE id = $1', [createdAulaId]);
      expect(check.rows[0].name).toBe('Aula Editada Renombrada');
      expect(check.rows[0].capacity).toBe(50);
    });

    it('Retorna 400 si se envían valores inválidos en la edición', async () => {
      const res = await request(app)
        .put(`/api/classrooms/${createdAulaId}`)
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({
          capacity: -10
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('positivo');
    });
  });

  describe('Criterio 3: DELETE /api/classrooms/:id (Baja y Control de Dependencias)', () => {
    it('Impide eliminar un aula si tiene horarios activos asignados (HTTP 409 Conflict)', async () => {
      // cr-a101 tiene horarios asignados en los datos de demostración
      const res = await request(app)
        .delete('/api/classrooms/cr-a101')
        .set('Authorization', `Bearer ${coordTenant1Token}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('horarios activos asignados');

      // Verificar que el aula sigue existiendo
      const check = await pool.query('SELECT id FROM classrooms WHERE id = $1', ['cr-a101']);
      expect(check.rows.length).toBe(1);
    });

    it('Impide que un usuario de otro tenant elimine un aula ajena (HTTP 404)', async () => {
      // Intentar eliminar cr-a101 (de tenant-itc) usando token de tenant-upn
      const res = await request(app)
        .delete('/api/classrooms/cr-a101')
        .set('Authorization', `Bearer ${coordTenant2Token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('no pertenece');
    });

    it('Elimina exitosamente un aula cuando no tiene horarios asignados', async () => {
      // 1. Crear un aula limpia sin horarios
      const createRes = await request(app)
        .post('/api/classrooms')
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({
          name: 'Aula Para Eliminar ' + Date.now(),
          capacity: 30,
          building: 'Edificio Temporal',
          type: 'Aula Teórica'
        });
      const aulaId = createRes.body.id;

      // 2. Eliminarla
      const deleteRes = await request(app)
        .delete(`/api/classrooms/${aulaId}`)
        .set('Authorization', `Bearer ${coordTenant1Token}`);

      expect(deleteRes.status).toBe(200);
      expect(deleteRes.body.message).toContain('eliminada exitosamente');

      // 3. Verificar que ya no existe en la base de datos
      const check = await pool.query('SELECT id FROM classrooms WHERE id = $1', [aulaId]);
      expect(check.rows.length).toBe(0);
    });
  });

  describe('Criterio 4: GET /api/classrooms (Campo type y Orden Alfabético)', () => {
    it('Devuelve las aulas del tenant con el campo type ordenado alfabéticamente', async () => {
      const res = await request(app)
        .get('/api/classrooms')
        .set('Authorization', `Bearer ${coordTenant1Token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(3);

      // Verificar presencia del campo type en cada aula
      for (const classroom of res.body) {
        expect(classroom).toHaveProperty('type');
        expect(typeof classroom.type).toBe('string');
        expect(classroom.type.length).toBeGreaterThan(0);
      }

      // Verificar orden alfabético por nombre
      for (let i = 0; i < res.body.length - 1; i++) {
        expect(res.body[i].name.localeCompare(res.body[i + 1].name)).toBeLessThanOrEqual(0);
      }
    });

    it('Permite ordenar explícitamente por type con ?sort=type', async () => {
      const res = await request(app)
        .get('/api/classrooms?sort=type')
        .set('Authorization', `Bearer ${coordTenant1Token}`);

      expect(res.status).toBe(200);
      for (let i = 0; i < res.body.length - 1; i++) {
        expect(res.body[i].type.localeCompare(res.body[i + 1].type)).toBeLessThanOrEqual(0);
      }
    });

    it('Aislamiento Multi-Tenant: No muestra aulas pertenecientes a otros tenants', async () => {
      // Registrar un aula en tenant-upn
      const upnAulaName = 'Aula Exclusiva UPN ' + Date.now();
      const upnRes = await request(app)
        .post('/api/classrooms')
        .set('Authorization', `Bearer ${coordTenant2Token}`)
        .send({
          name: upnAulaName,
          capacity: 20,
          building: 'Campus Norte',
          type: 'Laboratorio de Física'
        });

      const upnAulaId = upnRes.body.id;

      // Consultar aulas desde tenant-itc
      const itcRes = await request(app)
        .get('/api/classrooms')
        .set('Authorization', `Bearer ${coordTenant1Token}`);

      const itcIds = itcRes.body.map(c => c.id);
      expect(itcIds).not.toContain(upnAulaId);

      // Limpieza
      await pool.query('DELETE FROM classrooms WHERE id = $1', [upnAulaId]);
    });
  });

  describe('Criterio 5: Control de Acceso por Roles (RBAC HTTP 403 / 401)', () => {
    it('Deniega acceso a endpoints mutadores con HTTP 403 a usuarios con rol Profesor', async () => {
      // POST denegado para Profesor
      const postRes = await request(app)
        .post('/api/classrooms')
        .set('Authorization', `Bearer ${teacherTenant1Token}`)
        .send({
          name: 'Intento Profesor',
          capacity: 30,
          building: 'Edificio C',
          type: 'Aula Teórica'
        });
      expect(postRes.status).toBe(403);
      expect(postRes.body.error).toContain('Acceso denegado');

      // PUT denegado para Profesor
      const putRes = await request(app)
        .put('/api/classrooms/cr-a101')
        .set('Authorization', `Bearer ${teacherTenant1Token}`)
        .send({ capacity: 40 });
      expect(putRes.status).toBe(403);
      expect(putRes.body.error).toContain('Acceso denegado');

      // DELETE denegado para Profesor
      const delRes = await request(app)
        .delete('/api/classrooms/cr-a101')
        .set('Authorization', `Bearer ${teacherTenant1Token}`);
      expect(delRes.status).toBe(403);
      expect(delRes.body.error).toContain('Acceso denegado');
    });

    it('Permite lectura GET /api/classrooms a usuarios con rol Profesor', async () => {
      const getRes = await request(app)
        .get('/api/classrooms')
        .set('Authorization', `Bearer ${teacherTenant1Token}`);
      expect(getRes.status).toBe(200);
      expect(Array.isArray(getRes.body)).toBe(true);
    });

    it('Permite acceso a endpoints mutadores a Administrador y Coordinador', async () => {
      // Administrador puede crear
      const adminName = 'Aula Creada Por Admin ' + Date.now();
      const adminRes = await request(app)
        .post('/api/classrooms')
        .set('Authorization', `Bearer ${adminTenant1Token}`)
        .send({
          name: adminName,
          capacity: 35,
          building: 'Edificio Central',
          type: 'Aula Teórica'
        });
      expect(adminRes.status).toBe(201);

      // Administrador puede eliminarla
      const delRes = await request(app)
        .delete(`/api/classrooms/${adminRes.body.id}`)
        .set('Authorization', `Bearer ${adminTenant1Token}`);
      expect(delRes.status).toBe(200);
    });

    it('Deniega acceso con HTTP 401 si no se envía Token JWT', async () => {
      const res = await request(app).get('/api/classrooms');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Token ausente');
    });
  });
});
