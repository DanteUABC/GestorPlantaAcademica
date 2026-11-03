import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const app = require('../../src/server');
const db = require('../../src/db');
const { JWT_SECRET } = require('../../src/middleware/auth');

describe('Integración: Endpoints de Mantenimiento de Aulas (Tarea 3779)', () => {
  // Tokens de prueba
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

  let classrooms;
  let schedules;

  beforeEach(() => {
    vi.restoreAllMocks();

    classrooms = [
      { id: 'cr-101', tenant_id: 'tenant-itc', name: 'Aula A-101', building: 'Edificio A', capacity: 30, type: 'Aula Teórica' },
      { id: 'cr-102', tenant_id: 'tenant-itc', name: 'Aula A-102', building: 'Edificio A', capacity: 35, type: 'Aula Teórica' },
      { id: 'cr-lab-1', tenant_id: 'tenant-itc', name: 'Laboratorio de Redes', building: 'Edificio B', capacity: 25, type: 'Laboratorio de Cómputo' },
      // Aula perteneciente a otro tenant (tenant-upn)
      { id: 'cr-upn-901', tenant_id: 'tenant-upn', name: 'Aula Magna UPN', building: 'Edificio Central', capacity: 100, type: 'Auditorio' }
    ];

    schedules = [
      // cr-101 tiene reservas activas
      { id: 'sch-1', tenant_id: 'tenant-itc', classroom_id: 'cr-101' }
      // cr-102 NO tiene reservas activas
    ];

    // Mock db.query.get
    vi.spyOn(db.query, 'get').mockImplementation(async (sql, params = []) => {
      // 1. SELECT aula por id y tenant_id
      if (sql.includes('FROM classrooms WHERE id = ? AND tenant_id = ?')) {
        const [id, tenantId] = params;
        return classrooms.find(c => c.id === id && c.tenant_id === tenantId) || null;
      }

      // 2. SELECT colisión de nombre dentro del mismo tenant (excluyendo id actual)
      if (sql.includes('FROM classrooms WHERE tenant_id = ?') && (sql.includes('LOWER(TRIM(name))') || sql.includes('LOWER(name)')) && sql.includes('id != ?')) {
        const [tenantId, name, id] = params;
        const normalizedTarget = String(name).trim().toLowerCase();
        return classrooms.find(
          c => c.tenant_id === tenantId && c.name.trim().toLowerCase() === normalizedTarget && c.id !== id
        ) || null;
      }

      // 3. SELECT verificación de horarios asociados en schedules
      if (sql.includes('FROM schedules WHERE classroom_id = ? AND tenant_id = ?')) {
        const [classroomId, tenantId] = params;
        const count = schedules.filter(s => s.classroom_id === classroomId && s.tenant_id === tenantId).length;
        return { count };
      }

      return null;
    });

    // Mock db.query.all
    vi.spyOn(db.query, 'all').mockImplementation(async (sql, params = []) => {
      if (sql.includes('FROM classrooms WHERE tenant_id = ?')) {
        const [tenantId] = params;
        return classrooms.filter(c => c.tenant_id === tenantId);
      }
      return [];
    });

    // Mock db.query.run
    vi.spyOn(db.query, 'run').mockImplementation(async (sql, params = []) => {
      if (sql.includes('UPDATE classrooms SET name = ?, building = ?, capacity = ?, type = ? WHERE id = ? AND tenant_id = ?')) {
        const [name, building, capacity, type, id, tenantId] = params;
        const item = classrooms.find(c => c.id === id && c.tenant_id === tenantId);
        if (item) {
          item.name = name;
          item.building = building;
          item.capacity = capacity;
          item.type = type;
        }
        return { rowCount: item ? 1 : 0 };
      }

      if (sql.includes('DELETE FROM classrooms WHERE id = ? AND tenant_id = ?')) {
        const [id, tenantId] = params;
        const idx = classrooms.findIndex(c => c.id === id && c.tenant_id === tenantId);
        if (idx !== -1) {
          classrooms.splice(idx, 1);
          return { rowCount: 1 };
        }
        return { rowCount: 0 };
      }

      return { rowCount: 1 };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // CRITERIO 1: ACTUALIZACIÓN EXITOSA (PUT /api/classrooms/:id)
  // =========================================================================
  describe('Criterio 1: PUT /api/classrooms/:id - Actualización de Aula', () => {
    it('actualiza exitosamente nombre, edificio, capacidad y tipo', async () => {
      const res = await request(app)
        .put('/api/classrooms/cr-102')
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({
          name: 'Aula A-102 Renovada',
          building: 'Edificio Norte',
          capacity: 40,
          type: 'Taller'
        });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('cr-102');
      expect(res.body.tenant_id).toBe('tenant-itc');
      expect(res.body.name).toBe('Aula A-102 Renovada');
      expect(res.body.building).toBe('Edificio Norte');
      expect(res.body.capacity).toBe(40);
      expect(res.body.type).toBe('Taller');

      const inMemory = classrooms.find(c => c.id === 'cr-102');
      expect(inMemory.name).toBe('Aula A-102 Renovada');
      expect(inMemory.building).toBe('Edificio Norte');
      expect(inMemory.capacity).toBe(40);
      expect(inMemory.type).toBe('Taller');
    });

    it('soporta alias en español (nombre, edificio, capacidad, tipo)', async () => {
      const res = await request(app)
        .put('/api/classrooms/cr-102')
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({
          nombre: 'Aula B-102 Alias',
          edificio: 'Edificio Sur',
          capacidad: 38,
          tipo: 'Aula Teórica'
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Aula B-102 Alias');
      expect(res.body.building).toBe('Edificio Sur');
      expect(res.body.capacity).toBe(38);
      expect(res.body.type).toBe('Aula Teórica');
    });
  });

  // =========================================================================
  // CRITERIO 2: DETECCIÓN DE COLISIÓN DE NOMBRE (HTTP 409)
  // =========================================================================
  describe('Criterio 2: Detección preventiva de colisión de nombre', () => {
    it('rechaza con HTTP 409 si el nombre colisiona con otra aula del mismo tenant', async () => {
      const res = await request(app)
        .put('/api/classrooms/cr-102')
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({
          name: 'Aula A-101' // Ya existe en cr-101
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Ya existe un aula con ese nombre en esta institución');
    });

    it('rechaza con HTTP 409 si la colisión difiere solo en mayúsculas/minúsculas o espacios', async () => {
      const res = await request(app)
        .put('/api/classrooms/cr-102')
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({
          name: '   aula a-101   '
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Ya existe un aula con ese nombre en esta institución');
    });
  });

  // =========================================================================
  // CRITERIO 3: CONSERVAR MISMO NOMBRE SIN FALSO CONFLICTO
  // =========================================================================
  describe('Criterio 3: Edición de la misma aula conservando su nombre', () => {
    it('permite conservar el mismo nombre en la misma aula sin conflicto', async () => {
      const res = await request(app)
        .put('/api/classrooms/cr-101')
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({
          name: 'Aula A-101',
          capacity: 45
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Aula A-101');
      expect(res.body.capacity).toBe(45);
    });
  });

  // =========================================================================
  // CRITERIO 4: BAJA SEGURA CON PROTECCIÓN DE HORARIOS (DELETE /api/classrooms/:id)
  // =========================================================================
  describe('Criterio 4: DELETE /api/classrooms/:id - Baja Segura', () => {
    it('rechaza con HTTP 409 y mensaje exacto si tiene horarios asignados en "schedules"', async () => {
      const res = await request(app)
        .delete('/api/classrooms/cr-101')
        .set('Authorization', `Bearer ${coordTenant1Token}`);

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('El aula no puede eliminarse porque está reservada en horarios vigentes');

      // Comprobar que cr-101 sigue existiendo
      const exists = classrooms.some(c => c.id === 'cr-101');
      expect(exists).toBe(true);
    });

    it('elimina con HTTP 200 si el aula no tiene horarios asociados', async () => {
      const res = await request(app)
        .delete('/api/classrooms/cr-102')
        .set('Authorization', `Bearer ${coordTenant1Token}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('Aula eliminada exitosamente');
      expect(res.body.id).toBe('cr-102');

      // Comprobar que cr-102 fue eliminada físicamente
      const exists = classrooms.some(c => c.id === 'cr-102');
      expect(exists).toBe(false);
    });
  });

  // =========================================================================
  // CRITERIO 5: AISLAMIENTO MULTI-TENANT
  // =========================================================================
  describe('Criterio 5: Aislamiento Multi-Tenant', () => {
    it('retorna HTTP 404 al intentar actualizar un aula perteneciente a otro tenant', async () => {
      const res = await request(app)
        .put('/api/classrooms/cr-upn-901')
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({
          name: 'Intento Hack Tenant'
        });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Aula no encontrada o no pertenece a esta institución');
    });

    it('retorna HTTP 404 al intentar eliminar un aula perteneciente a otro tenant', async () => {
      const res = await request(app)
        .delete('/api/classrooms/cr-upn-901')
        .set('Authorization', `Bearer ${coordTenant1Token}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Aula no encontrada o no pertenece a esta institución');
    });
  });

  // =========================================================================
  // CRITERIO 6: CONTROL DE ACCESO RBAC
  // =========================================================================
  describe('Criterio 6: Control de Acceso RBAC', () => {
    it('deniega con HTTP 403 mutaciones (PUT/DELETE) a usuarios con rol Profesor', async () => {
      const putRes = await request(app)
        .put('/api/classrooms/cr-102')
        .set('Authorization', `Bearer ${teacherTenant1Token}`)
        .send({ name: 'Aula Prohibida' });

      expect(putRes.status).toBe(403);
      expect(putRes.body.error).toContain('Acceso denegado');

      const delRes = await request(app)
        .delete('/api/classrooms/cr-102')
        .set('Authorization', `Bearer ${teacherTenant1Token}`);

      expect(delRes.status).toBe(403);
      expect(delRes.body.error).toContain('Acceso denegado');
    });

    it('permite acceso a Administrador para operaciones de actualización y eliminación', async () => {
      const putRes = await request(app)
        .put('/api/classrooms/cr-lab-1')
        .set('Authorization', `Bearer ${adminTenant1Token}`)
        .send({ capacity: 50 });

      expect(putRes.status).toBe(200);
      expect(putRes.body.capacity).toBe(50);

      const delRes = await request(app)
        .delete('/api/classrooms/cr-lab-1')
        .set('Authorization', `Bearer ${adminTenant1Token}`);

      expect(delRes.status).toBe(200);
    });
  });
});
