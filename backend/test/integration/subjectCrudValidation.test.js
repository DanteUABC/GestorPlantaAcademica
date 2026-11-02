import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const app = require('../../src/server');
const db = require('../../src/db');
const { JWT_SECRET } = require('../../src/middleware/auth');

describe('Integración: Endpoints CRUD de Materias y Aislamiento Multi-Tenant (Tarea 3777)', () => {
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

  let subjects;
  let schedules;

  beforeEach(() => {
    vi.restoreAllMocks();

    // Estado inicial en memoria
    subjects = [
      { id: 'sub-mat-101', tenant_id: 'tenant-itc', code: 'MAT-101', name: 'Cálculo Diferencial', credits: 5 },
      { id: 'sub-mat-102', tenant_id: 'tenant-itc', code: 'MAT-102', name: 'Álgebra Lineal', credits: 4 },
      { id: 'sub-inf-201', tenant_id: 'tenant-itc', code: 'INF-201', name: 'Programación Estructurada', credits: 4 },
      { id: 'sub-inf-301', tenant_id: 'tenant-itc', code: 'INF-301', name: 'Bases de Datos', credits: 5 },
      // Materia perteneciente a otro tenant (tenant-upn)
      { id: 'sub-upn-001', tenant_id: 'tenant-upn', code: 'UPN-101', name: 'Materia Foránea UPN', credits: 4 }
    ];

    schedules = [
      // sub-mat-101 tiene dependencias horarias asignadas
      { id: 'sch-1', tenant_id: 'tenant-itc', subject_id: 'sub-mat-101' }
      // sub-inf-201 NO tiene dependencias horarias
    ];

    // Interceptar consultas de base de datos
    vi.spyOn(db.query, 'all').mockImplementation(async (sql, params = []) => {
      if (sql.includes('FROM subjects')) {
        const tenantId = params[0];
        return subjects
          .filter(s => s.tenant_id === tenantId)
          .sort((a, b) => {
            const codeCmp = a.code.localeCompare(b.code);
            if (codeCmp !== 0) return codeCmp;
            return a.name.localeCompare(b.name);
          });
      }
      return [];
    });

    vi.spyOn(db.query, 'get').mockImplementation(async (sql, params = []) => {
      if (sql.includes('SELECT id, tenant_id, code, name') && sql.includes('FROM subjects WHERE id = ? AND tenant_id = ?')) {
        const [id, tenantId] = params;
        return subjects.find(s => s.id === id && s.tenant_id === tenantId) || null;
      }
      if (sql.includes('FROM subjects WHERE tenant_id = ?') && sql.includes('UPPER(code) = ?') && sql.includes('id != ?')) {
        const [tenantId, code, id] = params;
        return subjects.find(s => s.tenant_id === tenantId && s.code.toUpperCase() === String(code).toUpperCase() && s.id !== id) || null;
      }
      if (sql.includes('SELECT COUNT(*)::int AS count FROM schedules WHERE subject_id = ? AND tenant_id = ?')) {
        const [subjectId, tenantId] = params;
        const count = schedules.filter(sch => sch.subject_id === subjectId && sch.tenant_id === tenantId).length;
        return { count };
      }
      return null;
    });

    vi.spyOn(db.query, 'run').mockImplementation(async (sql, params = []) => {
      if (sql.includes('UPDATE subjects SET code = ?, name = ?, credits = ? WHERE id = ? AND tenant_id = ?')) {
        const [code, name, credits, id, tenantId] = params;
        const item = subjects.find(s => s.id === id && s.tenant_id === tenantId);
        if (item) {
          item.code = code;
          item.name = name;
          item.credits = credits;
        }
        return { rowCount: item ? 1 : 0 };
      }
      if (sql.includes('DELETE FROM subjects WHERE id = ? AND tenant_id = ?')) {
        const [id, tenantId] = params;
        const idx = subjects.findIndex(s => s.id === id && s.tenant_id === tenantId);
        if (idx !== -1) {
          subjects.splice(idx, 1);
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

  // -------------------------------------------------------------
  // CRITERIO 1: GET /api/subjects (Listado Ordenado y Scoped)
  // -------------------------------------------------------------
  describe('Criterio 1: GET /api/subjects (Listado Ordenado)', () => {
    it('GET /api/subjects retorna elementos ordenados por código y nombre', async () => {
      const res = await request(app)
        .get('/api/subjects')
        .set('Authorization', `Bearer ${coordTenant1Token}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(4);

      // Verificar orden ascendente estricto por código
      const codes = res.body.map(s => s.code);
      expect(codes).toEqual(['INF-201', 'INF-301', 'MAT-101', 'MAT-102']);

      // No incluye asignaturas de otro tenant
      const hasForeign = res.body.some(s => s.tenant_id === 'tenant-upn');
      expect(hasForeign).toBe(false);
    });
  });

  // -------------------------------------------------------------
  // CRITERIO 2: PUT /api/subjects/:id (Edición de Materia)
  // -------------------------------------------------------------
  describe('Criterio 2: PUT /api/subjects/:id (Actualización Segura)', () => {
    it('PUT /api/subjects/:id actualiza exitosamente nombre y créditos', async () => {
      const res = await request(app)
        .put('/api/subjects/sub-inf-201')
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({
          name: 'Programación Avanzada en Java',
          credits: 6
        });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe('sub-inf-201');
      expect(res.body.name).toBe('Programación Avanzada en Java');
      expect(res.body.credits).toBe(6);
      expect(res.body.code).toBe('INF-201'); // Mantiene el código original
      expect(res.body.tenant_id).toBe('tenant-itc');
    });

    it('PUT /api/subjects/:id rechaza con HTTP 409 si se intenta usar un "code" existente en otra materia del mismo tenant', async () => {
      // Intentar cambiar sub-inf-201 para que tenga el código MAT-101 (que ya pertenece a sub-mat-101)
      const res = await request(app)
        .put('/api/subjects/sub-inf-201')
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({
          code: 'MAT-101',
          name: 'Programación Duplicada'
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Ya existe una materia con ese código en esta institución');
    });

    it('PUT /api/subjects/:id permite conservar el mismo "code" al editar la misma materia sin dar falso conflicto', async () => {
      const res = await request(app)
        .put('/api/subjects/sub-mat-101')
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({
          code: 'MAT-101',
          name: 'Cálculo Diferencial e Integral',
          credits: 6
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Cálculo Diferencial e Integral');
      expect(res.body.code).toBe('MAT-101');
    });

    it('PUT /api/subjects/:id rechaza con HTTP 400 si se envían datos inválidos (código o nombre vacíos, créditos <= 0)', async () => {
      const resEmptyName = await request(app)
        .put('/api/subjects/sub-inf-201')
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({ name: '   ' });

      expect(resEmptyName.status).toBe(400);
      expect(resEmptyName.body.error).toContain('no puede estar vacío');

      const resInvalidCredits = await request(app)
        .put('/api/subjects/sub-inf-201')
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({ credits: -2 });

      expect(resInvalidCredits.status).toBe(400);
      expect(resInvalidCredits.body.error).toContain('entero positivo mayor a cero');
    });
  });

  // -------------------------------------------------------------
  // CRITERIO 3: DELETE /api/subjects/:id (Baja con Protección de Dependencias)
  // -------------------------------------------------------------
  describe('Criterio 3: DELETE /api/subjects/:id (Baja Segura)', () => {
    it('DELETE /api/subjects/:id rechaza con HTTP 409 y mensaje exacto si la materia tiene registros en "schedules"', async () => {
      // sub-mat-101 tiene horarios asignados en schedules
      const res = await request(app)
        .delete('/api/subjects/sub-mat-101')
        .set('Authorization', `Bearer ${coordTenant1Token}`);

      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: 'No se puede eliminar la materia porque tiene horarios asignados en el periodo actual'
      });
    });

    it('DELETE /api/subjects/:id elimina con HTTP 200 si la materia no tiene dependencias horarias', async () => {
      // sub-inf-201 NO tiene dependencias en schedules
      const res = await request(app)
        .delete('/api/subjects/sub-inf-201')
        .set('Authorization', `Bearer ${coordTenant1Token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('message');
      expect(res.body.message).toBe('Materia eliminada exitosamente');
      expect(res.body.id).toBe('sub-inf-201');
    });
  });

  // -------------------------------------------------------------
  // CRITERIO 4: Aislamiento Multi-Tenant y Control RBAC
  // -------------------------------------------------------------
  describe('Criterio 4: Aislamiento Multi-Tenant y RBAC', () => {
    it('Respeto estricto del aislamiento multi-tenant: rechaza con HTTP 404 al intentar editar o eliminar una materia de otro tenant', async () => {
      // Usuario de tenant-itc intenta editar materia sub-upn-001 (de tenant-upn)
      const resEditForeign = await request(app)
        .put('/api/subjects/sub-upn-001')
        .set('Authorization', `Bearer ${coordTenant1Token}`)
        .send({ name: 'Hack Intento' });

      expect(resEditForeign.status).toBe(404);
      expect(resEditForeign.body.error).toContain('Materia no encontrada o no pertenece a esta institución');

      // Usuario de tenant-itc intenta eliminar materia sub-upn-001
      const resDeleteForeign = await request(app)
        .delete('/api/subjects/sub-upn-001')
        .set('Authorization', `Bearer ${coordTenant1Token}`);

      expect(resDeleteForeign.status).toBe(404);
      expect(resDeleteForeign.body.error).toContain('Materia no encontrada o no pertenece a esta institución');
    });

    it('Control de acceso RBAC: Deniega con HTTP 403 mutaciones (PUT/DELETE) a usuarios con rol Profesor', async () => {
      const resPutTeacher = await request(app)
        .put('/api/subjects/sub-inf-201')
        .set('Authorization', `Bearer ${teacherTenant1Token}`)
        .send({ name: 'Intento Maestro' });

      expect(resPutTeacher.status).toBe(403);
      expect(resPutTeacher.body.error).toContain('Acceso denegado');

      const resDeleteTeacher = await request(app)
        .delete('/api/subjects/sub-inf-201')
        .set('Authorization', `Bearer ${teacherTenant1Token}`);

      expect(resDeleteTeacher.status).toBe(403);
      expect(resDeleteTeacher.body.error).toContain('Acceso denegado');
    });

    it('Permite acceso a Administrador para operaciones de actualización y eliminación', async () => {
      const resAdminUpdate = await request(app)
        .put('/api/subjects/sub-mat-102')
        .set('Authorization', `Bearer ${adminTenant1Token}`)
        .send({ name: 'Álgebra Lineal y Geometría' });

      expect(resAdminUpdate.status).toBe(200);
      expect(resAdminUpdate.body.name).toBe('Álgebra Lineal y Geometría');
    });
  });
});
