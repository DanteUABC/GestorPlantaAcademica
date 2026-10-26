import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const db = require('../../src/db');
const { getTeachers } = require('../../src/controllers/catalogController');
const { createSchedule } = require('../../src/controllers/scheduleController');

const query = db.query;

describe('Unidad: Servicio de Balanceo y Límite Contractual Docente', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Endpoint GET /api/teachers (Enriquecimiento con horas contractuales y asignadas)', () => {
    it('Criterio 1: Retorna min_weekly_hours, max_weekly_hours y assigned_hours calculadas en base a la duración', async () => {
      // Mock de la consulta SQL enriquecida de profesores
      const mockTeachers = [
        {
          id: 'usr-prof-1',
          nombre: 'Elena',
          apellidos: 'Salgado',
          name: 'Elena Salgado',
          email: 'elena.salgado@pavilion.com',
          identificador: 'DOC-001',
          identifier: 'DOC-001',
          min_weekly_hours: 10,
          max_weekly_hours: 30,
          max_hours: 30,
          assigned_hours: 6.5
        },
        {
          id: 'usr-prof-2',
          nombre: 'Carlos',
          apellidos: 'Vega',
          name: 'Carlos Vega',
          email: 'carlos.vega@pavilion.com',
          identificador: 'DOC-002',
          identifier: 'DOC-002',
          min_weekly_hours: 0,
          max_weekly_hours: 40,
          max_hours: 40,
          assigned_hours: 0
        }
      ];

      vi.spyOn(query, 'all').mockResolvedValue(mockTeachers);

      const req = { tenant_id: 'tenant-itc' };
      let responseBody = null;
      let statusCode = 200;

      const res = {
        status: vi.fn((code) => {
          statusCode = code;
          return res;
        }),
        json: vi.fn((data) => {
          responseBody = data;
          return res;
        })
      };

      await getTeachers(req, res);

      expect(res.json).toHaveBeenCalled();
      expect(Array.isArray(responseBody)).toBe(true);
      expect(responseBody.length).toBe(2);

      const prof1 = responseBody.find((t) => t.id === 'usr-prof-1');
      expect(prof1).toBeDefined();
      expect(prof1.min_weekly_hours).toBe(10);
      expect(prof1.max_weekly_hours).toBe(30);
      expect(prof1.assigned_hours).toBe(6.5);

      const prof2 = responseBody.find((t) => t.id === 'usr-prof-2');
      expect(prof2).toBeDefined();
      expect(prof2.min_weekly_hours).toBe(0);
      expect(prof2.max_weekly_hours).toBe(40);
      expect(prof2.assigned_hours).toBe(0);
    });

    it('Criterio 2: Retorna assigned_hours = 0 si un docente no tiene horarios asignados', async () => {
      const mockTeachersWithoutSchedules = [
        {
          id: 'usr-prof-new',
          nombre: 'Nuevo',
          apellidos: 'Profesor',
          name: 'Nuevo Profesor',
          email: 'nuevo@pavilion.com',
          identificador: 'DOC-003',
          identifier: 'DOC-003',
          min_weekly_hours: 0,
          max_weekly_hours: 40,
          assigned_hours: null // NULL en la BD por LEFT JOIN sin coincidencias
        }
      ];

      vi.spyOn(query, 'all').mockResolvedValue(mockTeachersWithoutSchedules);

      const req = { tenant_id: 'tenant-itc' };
      let responseBody = null;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn((data) => { responseBody = data; })
      };

      await getTeachers(req, res);

      expect(responseBody[0].assigned_hours).toBe(0);
      expect(typeof responseBody[0].assigned_hours).toBe('number');
    });
  });

  describe('Endpoint POST /api/schedules (Validación de límite contractual)', () => {
    it('Criterio 3: Rechaza con HTTP 409 si (assigned_hours + duracion_nueva) > max_weekly_hours', async () => {
      // Mock de existencia de materia, profesor y aula
      vi.spyOn(query, 'get').mockImplementation(async (sql, params) => {
        if (sql.includes('FROM subjects')) {
          return { id: 'sub-calc', name: 'Cálculo', code: 'MAT-101' };
        }
        if (sql.includes('FROM users')) {
          return {
            id: 'usr-prof-1',
            name: 'Dr. Roberto Mendoza',
            min_weekly_hours: 5,
            max_weekly_hours: 20 // Límite de 20 horas
          };
        }
        if (sql.includes('FROM classrooms')) {
          return { id: 'cr-a101', name: 'Aula A-101', capacity: 35, type: 'Aula Teórica' };
        }
        if (sql.includes('SELECT COALESCE(SUM(EXTRACT(EPOCH')) {
          return { assigned_hours: 18 }; // Ya tiene 18 horas asignadas
        }
        return null; // Sin colisiones de aula, profesor ni grupo
      });

      // Intenta asignar una clase de 3 horas (08:00 a 11:00)
      // 18 + 3 = 21 hrs > 20 hrs max_weekly_hours
      const req = {
        tenant_id: 'tenant-itc',
        body: {
          subject_id: 'sub-calc',
          teacher_id: 'usr-prof-1',
          classroom_id: 'cr-a101',
          day_of_week: 'Viernes',
          start_time: '08:00',
          end_time: '11:00',
          max_students: 30,
          group_code: 'G1',
          session_type: 'Clase Teórica'
        }
      };

      let statusCode = 200;
      let responseBody = null;

      const res = {
        status: vi.fn((code) => {
          statusCode = code;
          return res;
        }),
        json: vi.fn((data) => {
          responseBody = data;
          return res;
        })
      };

      await createSchedule(req, res);

      expect(statusCode).toBe(409);
      expect(responseBody).toEqual({
        error: 'Límite contractual excedido',
        message: 'El profesor Dr. Roberto Mendoza excedería su límite contractual de 20 horas semanales (actual: 18 hrs, intentando asignar: 3 hrs)'
      });
    });

    it('Criterio 4: Permite guardar exitosamente (HTTP 201) si no excede el límite contractual', async () => {
      vi.spyOn(query, 'get').mockImplementation(async (sql, params) => {
        if (sql.includes('FROM subjects')) {
          return { id: 'sub-prog', name: 'Programación', code: 'INF-201' };
        }
        if (sql.includes('FROM users')) {
          return {
            id: 'usr-prof-2',
            name: 'Mtra. Elena Salgado',
            min_weekly_hours: 0,
            max_weekly_hours: 25 // Límite de 25 horas
          };
        }
        if (sql.includes('FROM classrooms')) {
          return { id: 'cr-lab1', name: 'Laboratorio de Cómputo 1', capacity: 25, type: 'Laboratorio' };
        }
        if (sql.includes('SELECT COALESCE(SUM(EXTRACT(EPOCH')) {
          return { assigned_hours: 10 }; // Tiene 10 horas asignadas
        }
        return null; // Sin colisiones
      });

      vi.spyOn(query, 'run').mockResolvedValue({ rowCount: 1 });

      // Intenta asignar una clase de 2 horas (10:00 a 12:00)
      // 10 + 2 = 12 hrs <= 25 hrs max_weekly_hours
      const req = {
        tenant_id: 'tenant-itc',
        body: {
          subject_id: 'sub-prog',
          teacher_id: 'usr-prof-2',
          classroom_id: 'cr-lab1',
          day_of_week: 'Jueves',
          start_time: '10:00',
          end_time: '12:00',
          max_students: 20,
          group_code: 'G2',
          session_type: 'Laboratorio'
        }
      };

      let statusCode = 200;
      let responseBody = null;

      const res = {
        status: vi.fn((code) => {
          statusCode = code;
          return res;
        }),
        json: vi.fn((data) => {
          responseBody = data;
          return res;
        })
      };

      await createSchedule(req, res);

      expect(statusCode).toBe(201);
      expect(responseBody).toHaveProperty('message');
      expect(responseBody.message).toBe('Horario creado exitosamente sin conflictos');
      expect(responseBody.schedule.teacher_name).toBe('Mtra. Elena Salgado');
      expect(responseBody.schedule.start_time).toBe('10:00');
      expect(responseBody.schedule.end_time).toBe('12:00');
    });

    it('Criterio 4.1: Permite guardar cuando la asignación alcanza exactamente el límite contractual (assigned_hours + duracion === max_weekly_hours)', async () => {
      vi.spyOn(query, 'get').mockImplementation(async (sql) => {
        if (sql.includes('FROM subjects')) return { id: 'sub-exact', name: 'Física', code: 'FIS-101' };
        if (sql.includes('FROM users')) {
          return { id: 'usr-prof-exact', name: 'Profesor Límite', min_weekly_hours: 0, max_weekly_hours: 20 };
        }
        if (sql.includes('FROM classrooms')) return { id: 'cr-exact', name: 'Aula 201', capacity: 30, type: 'Aula Teórica' };
        if (sql.includes('SELECT COALESCE(SUM(EXTRACT(EPOCH')) return { assigned_hours: 18 };
        return null;
      });

      vi.spyOn(query, 'run').mockResolvedValue({ rowCount: 1 });

      // Intenta asignar exactamente 2 horas (18 + 2 = 20 <= 20)
      const req = {
        tenant_id: 'tenant-itc',
        body: {
          subject_id: 'sub-exact',
          teacher_id: 'usr-prof-exact',
          classroom_id: 'cr-exact',
          day_of_week: 'Miércoles',
          start_time: '14:00',
          end_time: '16:00',
          group_code: 'G1',
          session_type: 'Clase Teórica'
        }
      };

      let statusCode = 200;
      let responseBody = null;
      const res = {
        status: vi.fn((code) => { statusCode = code; return res; }),
        json: vi.fn((data) => { responseBody = data; return res; })
      };

      await createSchedule(req, res);

      expect(statusCode).toBe(201);
      expect(responseBody.message).toBe('Horario creado exitosamente sin conflictos');
    });

    it('Criterio 4.2: Maneja fracciones decimales de hora (ej: clase de 1.5 hrs) y rechaza si excede', async () => {
      vi.spyOn(query, 'get').mockImplementation(async (sql) => {
        if (sql.includes('FROM subjects')) return { id: 'sub-dec', name: 'Química', code: 'QUI-101' };
        if (sql.includes('FROM users')) {
          return { id: 'usr-prof-dec', name: 'Dra. Ana López', min_weekly_hours: 0, max_weekly_hours: 15 };
        }
        if (sql.includes('FROM classrooms')) return { id: 'cr-dec', name: 'Lab 1', capacity: 20, type: 'Laboratorio' };
        if (sql.includes('SELECT COALESCE(SUM(EXTRACT(EPOCH')) return { assigned_hours: 14 }; // 14 + 1.5 = 15.5 > 15
        return null;
      });

      const req = {
        tenant_id: 'tenant-itc',
        body: {
          subject_id: 'sub-dec',
          teacher_id: 'usr-prof-dec',
          classroom_id: 'cr-dec',
          day_of_week: 'Martes',
          start_time: '08:00',
          end_time: '09:30', // 1.5 horas
          group_code: 'G1',
          session_type: 'Laboratorio'
        }
      };

      let statusCode = 200;
      let responseBody = null;
      const res = {
        status: vi.fn((code) => { statusCode = code; return res; }),
        json: vi.fn((data) => { responseBody = data; return res; })
      };

      await createSchedule(req, res);

      expect(statusCode).toBe(409);
      expect(responseBody.error).toBe('Límite contractual excedido');
      expect(responseBody.message).toContain('excedería su límite contractual de 15 horas semanales (actual: 14 hrs, intentando asignar: 1.5 hrs)');
    });
  });
});
