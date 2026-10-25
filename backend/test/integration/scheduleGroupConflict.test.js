import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import * as XLSX from 'xlsx';
import app from '../../src/server';
import { pool, initDatabase } from '../../src/db';
import { JWT_SECRET } from '../../src/middleware/auth';

describe('Integración: Motor Anti-Empalme de Grupo de Alumnos (POST /api/schedules & Excel Upload)', () => {
  const coordToken = jwt.sign(
    { id: 'usr-coord-1', role_name: 'Coordinador', tenant_id: 'tenant-itc', email: 'coord@itc.edu' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const testSubjectCalc = {
    id: 'sub-calc-501',
    tenant_id: 'tenant-itc',
    code: 'CALC-501',
    name: 'Cálculo',
    credits: 5
  };

  const testSubjectFis = {
    id: 'sub-fis-501',
    tenant_id: 'tenant-itc',
    code: 'FIS-501',
    name: 'Física',
    credits: 5
  };

  const testClassroom101 = {
    id: 'cr-101',
    tenant_id: 'tenant-itc',
    name: 'Aula 101',
    building: 'Edificio A',
    capacity: 40,
    type: 'Aula Teórica'
  };

  const testClassroom102 = {
    id: 'cr-102',
    tenant_id: 'tenant-itc',
    name: 'Aula 102',
    building: 'Edificio A',
    capacity: 40,
    type: 'Aula Teórica'
  };

  let baseScheduleId = null;

  beforeAll(async () => {
    await initDatabase();

    // Limpieza preventiva
    await pool.query("DELETE FROM schedules WHERE tenant_id = 'tenant-itc' AND group_code IN ('501', '502', 'test-group')");
    await pool.query("DELETE FROM classrooms WHERE id IN ('cr-101', 'cr-102')");
    await pool.query("DELETE FROM subjects WHERE id IN ('sub-calc-501', 'sub-fis-501')");
    await pool.query("DELETE FROM users WHERE id IN ('usr-prof-grp-1', 'usr-prof-grp-2')");

    // Insertar materias de prueba
    await pool.query(
      'INSERT INTO subjects (id, tenant_id, code, name, credits) VALUES ($1, $2, $3, $4, $5)',
      [testSubjectCalc.id, testSubjectCalc.tenant_id, testSubjectCalc.code, testSubjectCalc.name, testSubjectCalc.credits]
    );
    await pool.query(
      'INSERT INTO subjects (id, tenant_id, code, name, credits) VALUES ($1, $2, $3, $4, $5)',
      [testSubjectFis.id, testSubjectFis.tenant_id, testSubjectFis.code, testSubjectFis.name, testSubjectFis.credits]
    );

    // Insertar aulas de prueba ("Aula 101" y "Aula 102")
    await pool.query(
      'INSERT INTO classrooms (id, tenant_id, name, building, capacity, type) VALUES ($1, $2, $3, $4, $5, $6)',
      [testClassroom101.id, testClassroom101.tenant_id, testClassroom101.name, testClassroom101.building, testClassroom101.capacity, testClassroom101.type]
    );
    await pool.query(
      'INSERT INTO classrooms (id, tenant_id, name, building, capacity, type) VALUES ($1, $2, $3, $4, $5, $6)',
      [testClassroom102.id, testClassroom102.tenant_id, testClassroom102.name, testClassroom102.building, testClassroom102.capacity, testClassroom102.type]
    );

    // Insertar profesores de prueba sin horarios preasignados
    await pool.query(
      `INSERT INTO users (id, tenant_id, nombre, apellidos, email, role_id, identificador)\n       VALUES \n         (\'usr-prof-grp-1\', \'tenant-itc\', \'Roberto\', \'Sánchez\', \'roberto.sanchez@pavilion.com\', \'role-teacher\', \'GRP01\'),\n         (\'usr-prof-grp-2\', \'tenant-itc\', \'Diana\', \'Morales\', \'diana.morales@pavilion.com\', \'role-teacher\', \'GRP02\')`
    );
  });

  afterAll(async () => {
    await pool.query("DELETE FROM schedules WHERE tenant_id = 'tenant-itc' AND group_code IN ('501', '502', 'test-group')");
    await pool.query("DELETE FROM classrooms WHERE id IN ('cr-101', 'cr-102')");
    await pool.query("DELETE FROM subjects WHERE id IN ('sub-calc-501', 'sub-fis-501')");
    await pool.query("DELETE FROM users WHERE id IN ('usr-prof-grp-1', 'usr-prof-grp-2')");
  });

  function buildExcelBuffer(rows) {
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Horarios');
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  }

  describe('Criterio 1 y 2: Detección de colisión de Grupo en POST /api/schedules', () => {
    it('Permite crear el horario base para el Grupo "501" de 08:00 a 10:00 en Aula 101', async () => {
      const res = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          subject_id: testSubjectCalc.id,
          teacher_id: 'usr-prof-grp-1',
          classroom_id: testClassroom101.id,
          day_of_week: 'Lunes',
          start_time: '08:00',
          end_time: '10:00',
          group_code: '501',
          max_students: 30
        });

      expect(res.status).toBe(201);
      expect(res.body.schedule).toBeDefined();
      expect(res.body.schedule.group_code).toBe('501');
      baseScheduleId = res.body.schedule.id;
    });

    it('Responde con HTTP 409 Conflict y conflictType: "GROUP_CONFLICT" cuando el mismo grupo tiene empalme', async () => {
      // Intentar asignar clase al mismo grupo "501" con otro profesor (usr-prof-grp-2) y otra aula (cr-102) de 09:00 a 11:00
      const res = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          subject_id: testSubjectFis.id,
          teacher_id: 'usr-prof-grp-2',
          classroom_id: testClassroom102.id,
          day_of_week: 'Lunes',
          start_time: '09:00',
          end_time: '11:00',
          group_code: '501',
          max_students: 30
        });

      expect(res.status).toBe(409);
      expect(res.body.conflictType).toBe('GROUP_CONFLICT');
      expect(res.body.error).toBe(
        "¡Empalme de Grupo detectado! El Grupo '501' ya tiene clase de 'Cálculo' el Lunes de 08:00 a 10:00 en el Aula 101"
      );

      // Verificar que el horario conflictivo no se haya guardado
      const dbCheck = await pool.query(
        "SELECT id FROM schedules WHERE group_code = '501' AND start_time = '09:00' AND subject_id = $1",
        [testSubjectFis.id]
      );
      expect(dbCheck.rows.length).toBe(0);
    });

    it('Permite asignar clase para un Grupo DIFERENTE ("502") en el mismo día y bloque horario', async () => {
      const res = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          subject_id: testSubjectFis.id,
          teacher_id: 'usr-prof-grp-2',
          classroom_id: testClassroom102.id,
          day_of_week: 'Lunes',
          start_time: '08:00',
          end_time: '10:00',
          group_code: '502',
          max_students: 30
        });

      expect(res.status).toBe(201);
      expect(res.body.schedule.group_code).toBe('502');

      // Limpieza de este horario
      await pool.query('DELETE FROM schedules WHERE id = $1', [res.body.schedule.id]);
    });

    it('Permite asignar clase al Grupo "501" de forma contigua sin empalme (10:00 a 12:00)', async () => {
      const res = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          subject_id: testSubjectFis.id,
          teacher_id: 'usr-prof-grp-2',
          classroom_id: testClassroom102.id,
          day_of_week: 'Lunes',
          start_time: '10:00',
          end_time: '12:00',
          group_code: '501',
          max_students: 30
        });

      expect(res.status).toBe(201);

      // Limpieza de este horario
      await pool.query('DELETE FROM schedules WHERE id = $1', [res.body.schedule.id]);
    });

    it('Asigna por defecto group_code "G1" si no se envía en la petición', async () => {
      const res = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${coordToken}`)
        .send({
          subject_id: testSubjectFis.id,
          teacher_id: 'usr-prof-grp-2',
          classroom_id: testClassroom102.id,
          day_of_week: 'Martes',
          start_time: '08:00',
          end_time: '10:00',
          // group_code omitido
          max_students: 30
        });

      expect(res.status).toBe(201);
      expect(res.body.schedule.group_code).toBe('G1');

      // Limpieza de este horario
      await pool.query('DELETE FROM schedules WHERE id = $1', [res.body.schedule.id]);
    });

    it('Aislamiento Multi-Tenant: El Grupo "501" en otro tenant no genera colisión', async () => {
      const otherTenantToken = jwt.sign(
        { id: 'usr-coord-upn', role_name: 'Coordinador', tenant_id: 'tenant-upn', email: 'coord@upn.edu' },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      // Crear materia, aula y docente en tenant-upn
      await pool.query("INSERT INTO subjects (id, tenant_id, code, name, credits) VALUES ('sub-upn-1', 'tenant-upn', 'UPN-101', 'Física UPN', 5) ON CONFLICT DO NOTHING");
      await pool.query("INSERT INTO classrooms (id, tenant_id, name, building, capacity, type) VALUES ('cr-upn-1', 'tenant-upn', 'Aula 101', 'Edificio UPN', 40, 'Aula Teórica') ON CONFLICT DO NOTHING");
      await pool.query("INSERT INTO users (id, tenant_id, nombre, apellidos, email, role_id, identificador) VALUES ('usr-prof-upn', 'tenant-upn', 'Prof', 'UPN', 'prof.upn@pavilion.com', 'role-teacher', 'PUPN1') ON CONFLICT DO NOTHING");

      const res = await request(app)
        .post('/api/schedules')
        .set('Authorization', `Bearer ${otherTenantToken}`)
        .send({
          subject_id: 'sub-upn-1',
          teacher_id: 'usr-prof-upn',
          classroom_id: 'cr-upn-1',
          day_of_week: 'Lunes',
          start_time: '08:00',
          end_time: '10:00',
          group_code: '501',
          max_students: 30
        });

      expect(res.status).toBe(201);
      expect(res.body.schedule.group_code).toBe('501');

      // Limpieza en tenant-upn
      await pool.query('DELETE FROM schedules WHERE id = $1', [res.body.schedule.id]);
      await pool.query("DELETE FROM subjects WHERE id = 'sub-upn-1'");
      await pool.query("DELETE FROM classrooms WHERE id = 'cr-upn-1'");
      await pool.query("DELETE FROM users WHERE id = 'usr-prof-upn'");
    });
  });

  describe('Criterio 3: Rechazo por empalme de Grupo en importador transaccional de Excel', () => {
    it('Rechaza y hace ROLLBACK si dos filas del mismo archivo Excel empalman para el mismo grupo', async () => {
      const rows = [
        {
          'Código Materia': 'CALC-501',
          'Correo Profesor': 'roberto.sanchez@pavilion.com',
          'Aula': 'Aula 101',
          'Día': 'Martes',
          'Hora Inicio': '14:00',
          'Hora Fin': '16:00',
          'Cupo': 25,
          'Grupo': '501'
        },
        {
          'Código Materia': 'FIS-501',
          'Correo Profesor': 'diana.morales@pavilion.com',
          'Aula': 'Aula 102',
          'Día': 'Martes',
          'Hora Inicio': '15:00',
          'Hora Fin': '17:00', // Empalma con 14:00-16:00 para Grupo 501
          'Cupo': 25,
          'Grupo': '501'
        }
      ];

      const buffer = buildExcelBuffer(rows);

      const res = await request(app)
        .post('/api/schedules/upload-excel')
        .set('Authorization', `Bearer ${coordToken}`)
        .attach('file', buffer, 'empalme_grupo_interno.xlsx');

      expect(res.status).toBe(409);
      expect(res.body.conflicts.some(c => c.tipo === 'GRUPO')).toBe(true);

      // Verificar ROLLBACK: ninguna fila se persistió
      const checkFila1 = await pool.query(
        "SELECT id FROM schedules WHERE day_of_week = 'Martes' AND start_time = '14:00' AND group_code = '501'"
      );
      expect(checkFila1.rows.length).toBe(0);

      const checkFila2 = await pool.query(
        "SELECT id FROM schedules WHERE day_of_week = 'Martes' AND start_time = '15:00' AND group_code = '501'"
      );
      expect(checkFila2.rows.length).toBe(0);
    });

    it('Rechaza y hace ROLLBACK si una fila del Excel empalma contra un horario existente en BD del mismo grupo', async () => {
      // En BD ya existe Grupo 501 el Lunes de 08:00 a 10:00 (baseScheduleId)
      const rows = [
        {
          'Código Materia': 'FIS-501',
          'Correo Profesor': 'diana.morales@pavilion.com',
          'Aula': 'Aula 102',
          'Día': 'Lunes',
          'Hora Inicio': '09:00',
          'Hora Fin': '11:00', // Empalma con la clase de Cálculo del Grupo 501 en BD
          'Cupo': 25,
          'Grupo': '501'
        }
      ];

      const buffer = buildExcelBuffer(rows);

      const res = await request(app)
        .post('/api/schedules/upload-excel')
        .set('Authorization', `Bearer ${coordToken}`)
        .attach('file', buffer, 'empalme_grupo_bd.xlsx');

      expect(res.status).toBe(409);
      expect(res.body.conflictType).toBe('SCHEDULE_OVERLAP');
      expect(res.body.conflicts.some(c => c.tipo === 'GRUPO')).toBe(true);

      // Verificar que no se insertó
      const check = await pool.query(
        "SELECT id FROM schedules WHERE day_of_week = 'Lunes' AND start_time = '09:00' AND group_code = '501'"
      );
      expect(check.rows.length).toBe(0);
    });

    it('Acepta e inserta correctamente cuando los horarios de diferentes grupos ocurren en paralelo', async () => {
      const rows = [
        {
          'Código Materia': 'CALC-501',
          'Correo Profesor': 'roberto.sanchez@pavilion.com',
          'Aula': 'Aula 101',
          'Día': 'Jueves',
          'Hora Inicio': '08:00',
          'Hora Fin': '10:00',
          'Cupo': 25,
          'Grupo': '501'
        },
        {
          'Código Materia': 'FIS-501',
          'Correo Profesor': 'diana.morales@pavilion.com',
          'Aula': 'Aula 102',
          'Día': 'Jueves',
          'Hora Inicio': '08:00',
          'Hora Fin': '10:00', // Mismo horario pero grupo 502, diferente aula y diferente profesor
          'Cupo': 25,
          'Grupo': '502'
        }
      ];

      const buffer = buildExcelBuffer(rows);

      const res = await request(app)
        .post('/api/schedules/upload-excel')
        .set('Authorization', `Bearer ${coordToken}`)
        .attach('file', buffer, 'paralelo_distintos_grupos.xlsx');

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.inserted).toBe(2);

      // Limpieza
      await pool.query("DELETE FROM schedules WHERE day_of_week = 'Jueves' AND start_time = '08:00'");
    });
  });
});
