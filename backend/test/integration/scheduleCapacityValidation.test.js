import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import * as XLSX from 'xlsx';
import app from '../../src/server';
import { pool, initDatabase } from '../../src/db';
import { JWT_SECRET } from '../../src/middleware/auth';

describe('Integración: Motor de Validación de Aforo de Horarios vs Capacidad Física del Aula', () => {
  const coordToken = jwt.sign(
    { id: 'usr-coord-1', role_name: 'Coordinador', tenant_id: 'tenant-itc', email: 'coord@itc.edu' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  beforeAll(async () => {
    await initDatabase();
  });

  describe('Criterio 1: POST /api/schedules con max_students que excede aforo del aula', () => {
    it('Responde con HTTP 400 Bad Request indicando la discrepancia de aforo cuando max_students > classroom.capacity', async () => {
      // cr-a101 tiene capacidad de 35 alumnos
      const classroom = await pool.query("SELECT capacity, name FROM classrooms WHERE id = 'cr-a101'");
      const aulaCap = classroom.rows[0].capacity; // 35

      const res = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          subject_id: 'sub-prog',
          teacher_id: 'usr-prof-1',
          classroom_id: 'cr-a101',
          day_of_week: 'Sábado',
          start_time: '14:00',
          end_time: '16:00',
          max_students: aulaCap + 15 // 50 alumnos > 35 alumnos
        });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toContain('Discrepancia de aforo');
      expect(res.body.error).toContain('excede la capacidad máxima');
      expect(res.body.classroom_capacity).toBe(aulaCap);
      expect(res.body.max_students).toBe(aulaCap + 15);

      // Verificar que NO se insertó ningún horario en la base de datos
      const check = await pool.query(
        "SELECT id FROM schedules WHERE day_of_week = 'Sábado' AND start_time = '14:00' AND classroom_id = 'cr-a101'"
      );
      expect(check.rows.length).toBe(0);
    });

    it('Responde con HTTP 400 si max_students no es un número entero positivo', async () => {
      const res = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          subject_id: 'sub-prog',
          teacher_id: 'usr-prof-1',
          classroom_id: 'cr-a101',
          day_of_week: 'Sábado',
          start_time: '14:00',
          end_time: '16:00',
          max_students: -10
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('positivo');
    });
  });

  describe('Criterio 2: POST /api/schedules sin max_students asigna aforo total del aula', () => {
    let createdScheduleId = null;

    afterAll(async () => {
      if (createdScheduleId) {
        await pool.query('DELETE FROM schedules WHERE id = $1', [createdScheduleId]);
      }
    });

    it('Asigna por defecto el aforo total del aula seleccionada si max_students no se envía', async () => {
      // cr-lab1 tiene capacidad de 25 alumnos
      const classroom = await pool.query("SELECT capacity, name FROM classrooms WHERE id = 'cr-lab1'");
      const aulaCap = classroom.rows[0].capacity; // 25

      const res = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          subject_id: 'sub-bd',
          teacher_id: 'usr-prof-2',
          classroom_id: 'cr-lab1',
          day_of_week: 'Viernes',
          start_time: '16:00',
          end_time: '18:00'
          // max_students omitido intencionalmente
        });

      expect(res.status).toBe(201);
      expect(res.body.schedule).toBeDefined();
      expect(res.body.schedule.max_students).toBe(aulaCap);
      createdScheduleId = res.body.schedule.id;

      // Verificar en la BD que se persistió exactamente el aforo del aula
      const dbCheck = await pool.query('SELECT max_students FROM schedules WHERE id = $1', [createdScheduleId]);
      expect(dbCheck.rows[0].max_students).toBe(aulaCap);
    });

    it('Permite asignar un cupo menor o igual al aforo máximo sin errores', async () => {
      const res = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          subject_id: 'sub-bd',
          teacher_id: 'usr-prof-2',
          classroom_id: 'cr-b202', // capacidad 40
          day_of_week: 'Sábado',
          start_time: '16:00',
          end_time: '18:00',
          max_students: 20 // 20 <= 40
        });

      expect(res.status).toBe(201);
      expect(res.body.schedule.max_students).toBe(20);

      // Limpieza
      await pool.query('DELETE FROM schedules WHERE id = $1', [res.body.schedule.id]);
    });
  });

  describe('Criterio 3: POST /api/schedules/upload-excel rechaza cupo superior al aforo con ROLLBACK', () => {
    function createExcelBuffer(rows) {
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Horarios');
      return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    }

    it('Rechaza el archivo y hace ROLLBACK si alguna fila supera la capacidad del aula', async () => {
      // cr-a101 tiene capacidad 35. Fila 1 tiene cupo 20 (válido), Fila 2 tiene cupo 60 (supera 35)
      const excelRows = [
        {
          'Código Materia': 'MAT-101',
          'Correo Profesor': 'elena.salgado@pavilion.com',
          'Aula': 'Aula A-101',
          'Día': 'Sábado',
          'Hora Inicio': '08:00',
          'Hora Fin': '10:00',
          'Cupo': 20
        },
        {
          'Código Materia': 'INF-201',
          'Correo Profesor': 'marcos.ramirez@pavilion.com',
          'Aula': 'Aula A-101',
          'Día': 'Sábado',
          'Hora Inicio': '10:00',
          'Hora Fin': '12:00',
          'Cupo': 60 // 60 > 35 (Capacidad de Aula A-101)
        }
      ];

      const buffer = createExcelBuffer(excelRows);

      const res = await request(app)
        .post('/api/schedules/upload-excel')
        .set('Authorization', `Bearer ${coordToken}`)
        .attach('file', buffer, 'horarios_exceso.xlsx');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors.length).toBeGreaterThanOrEqual(1);

      const capacityError = res.body.errors.find(e => e.error.includes('Discrepancia de aforo') || e.error.includes('supera la capacidad máxima'));
      expect(capacityError).toBeDefined();
      expect(capacityError.fila).toBe(3); // Segunda fila de datos (encabezado es 1)

      // Verificación de ROLLBACK transaccional:
      // NI SIQUIERA la fila 1 (que era válida) debe haber sido guardada en la base de datos
      const row1Check = await pool.query(
        "SELECT id FROM schedules WHERE day_of_week = 'Sábado' AND start_time = '08:00' AND classroom_id = 'cr-a101'"
      );
      expect(row1Check.rows.length).toBe(0);

      const row2Check = await pool.query(
        "SELECT id FROM schedules WHERE day_of_week = 'Sábado' AND start_time = '10:00' AND classroom_id = 'cr-a101'"
      );
      expect(row2Check.rows.length).toBe(0);
    });

    it('Acepta e inserta correctamente cuando el cupo está dentro del aforo del aula', async () => {
      const excelRows = [
        {
          'Código Materia': 'MAT-101',
          'Correo Profesor': 'elena.salgado@pavilion.com',
          'Aula': 'Aula B-202', // Capacidad 40
          'Día': 'Sábado',
          'Hora Inicio': '08:00',
          'Hora Fin': '10:00',
          'Cupo': 30 // 30 <= 40
        }
      ];

      const buffer = createExcelBuffer(excelRows);

      const res = await request(app)
        .post('/api/schedules/upload-excel')
        .set('Authorization', `Bearer ${coordToken}`)
        .attach('file', buffer, 'horarios_validos.xlsx');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      // Limpieza
      await pool.query(
        "DELETE FROM schedules WHERE day_of_week = 'Sábado' AND start_time = '08:00' AND classroom_id = 'cr-b202'"
      );
    });
  });
});
