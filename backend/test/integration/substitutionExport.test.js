import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import xlsx from 'xlsx';
import app from '../../src/server';
import { pool, initDatabase } from '../../src/db';
import { JWT_SECRET } from '../../src/middleware/auth';

describe('Integración: Exportación de Reporte de Sustituciones en Excel (GET /api/schedules/substitutions/export)', () => {
  const coordToken = jwt.sign(
    { id: 'usr-coord-exp', role_name: 'Coordinador', tenant_id: 'tenant-exp-test', email: 'coord.exp@test.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const teacherToken = jwt.sign(
    { id: 'usr-prof-exp-1', role_name: 'Profesor', tenant_id: 'tenant-exp-test', email: 'prof.exp@test.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const otherTenantCoordToken = jwt.sign(
    { id: 'usr-coord-other', role_name: 'Coordinador', tenant_id: 'tenant-exp-other', email: 'other.coord@test.com' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  const EXPECTED_HEADERS = [
    'Fecha Efectiva',
    'Clave',
    'Materia',
    'Grupo',
    'Día',
    'Horario',
    'Aula',
    'Docente Original',
    'Nómina Original',
    'Docente Suplente',
    'Nómina Suplente',
    'Motivo',
    'Fecha de Registro'
  ];

  beforeAll(async () => {
    await initDatabase();

    // Limpieza preventiva
    await pool.query("DELETE FROM schedule_substitutions WHERE tenant_id IN ('tenant-exp-test', 'tenant-exp-other')");
    await pool.query("DELETE FROM schedules WHERE tenant_id IN ('tenant-exp-test', 'tenant-exp-other')");
    await pool.query("DELETE FROM users WHERE tenant_id IN ('tenant-exp-test', 'tenant-exp-other')");
    await pool.query("DELETE FROM subjects WHERE tenant_id IN ('tenant-exp-test', 'tenant-exp-other')");
    await pool.query("DELETE FROM classrooms WHERE tenant_id IN ('tenant-exp-test', 'tenant-exp-other')");
    await pool.query("DELETE FROM tenants WHERE id IN ('tenant-exp-test', 'tenant-exp-other')");

    // 1. Insertar tenants
    await pool.query(`
      INSERT INTO tenants (id, name, slug) VALUES 
      ('tenant-exp-test', 'Instituto Export Test', 'tenant-exp-test'),
      ('tenant-exp-other', 'Universidad Ajena', 'tenant-exp-other')
      ON CONFLICT (id) DO NOTHING
    `);

    // 2. Insertar usuarios
    await pool.query(`
      INSERT INTO users (id, tenant_id, nombre, apellidos, email, role_id, identificador, estatus, horas_contratadas)
      VALUES 
      ('usr-coord-exp', 'tenant-exp-test', 'Coordinador', 'Principal', 'coord.exp@test.com', 'role-coord', 'NOM-COORD-01', 'activo', 30),
      ('usr-prof-exp-1', 'tenant-exp-test', 'Roberto', 'Mendoza', 'roberto.exp@test.com', 'role-teacher', 'NOM-DOC-101', 'activo', 20),
      ('usr-prof-exp-2', 'tenant-exp-test', 'Elena', 'Gómez', 'elena.exp@test.com', 'role-teacher', 'NOM-DOC-102', 'activo', 20),
      ('usr-prof-exp-3', 'tenant-exp-test', 'Carlos', 'Slim', 'carlos.exp@test.com', 'role-teacher', 'NOM-DOC-103', 'activo', 20),
      ('usr-coord-other', 'tenant-exp-other', 'Coordinador', 'Ajeno', 'other.coord@test.com', 'role-coord', 'NOM-COORD-99', 'activo', 30)
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

    // 3. Insertar materias
    await pool.query(`
      INSERT INTO subjects (id, tenant_id, code, name, credits)
      VALUES 
      ('sub-exp-1', 'tenant-exp-test', 'MAT-101', 'Cálculo Diferencial', 5),
      ('sub-exp-2', 'tenant-exp-test', 'CS-202', 'Programación Avanzada', 6)
      ON CONFLICT (id) DO NOTHING
    `);

    // 4. Insertar aulas
    await pool.query(`
      INSERT INTO classrooms (id, tenant_id, name, building, capacity, type)
      VALUES 
      ('cr-exp-1', 'tenant-exp-test', 'Aula 201', 'Edificio A', 40, 'Aula Teórica'),
      ('cr-exp-2', 'tenant-exp-test', 'Lab Cómputo 1', 'Edificio C', 30, 'Laboratorio')
      ON CONFLICT (id) DO NOTHING
    `);

    // 5. Insertar horarios
    await pool.query(`
      INSERT INTO schedules (id, tenant_id, subject_id, teacher_id, classroom_id, day_of_week, start_time, end_time, group_code, session_type)
      VALUES 
      ('sch-exp-1', 'tenant-exp-test', 'sub-exp-1', 'usr-prof-exp-2', 'cr-exp-1', 'Lunes', '08:00', '10:00', 'G1', 'Clase Teórica'),
      ('sch-exp-2', 'tenant-exp-test', 'sub-exp-2', 'usr-prof-exp-1', 'cr-exp-2', 'Miércoles', '12:00', '14:00', 'G2', 'Laboratorio')
      ON CONFLICT (id) DO NOTHING
    `);

    // 6. Insertar sustituciones de prueba
    await pool.query(`
      INSERT INTO schedule_substitutions (id, tenant_id, schedule_id, original_teacher_id, substitute_teacher_id, reason, effective_date)
      VALUES 
      ('subst-exp-1', 'tenant-exp-test', 'sch-exp-1', 'usr-prof-exp-1', 'usr-prof-exp-2', 'Comisión académica de investigación', '2026-11-20'),
      ('subst-exp-2', 'tenant-exp-test', 'sch-exp-2', 'usr-prof-exp-3', 'usr-prof-exp-1', 'Incapacidad médica certificada', '2026-12-05')
      ON CONFLICT (id) DO NOTHING
    `);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM schedule_substitutions WHERE tenant_id IN ('tenant-exp-test', 'tenant-exp-other')");
    await pool.query("DELETE FROM schedules WHERE tenant_id IN ('tenant-exp-test', 'tenant-exp-other')");
    await pool.query("DELETE FROM users WHERE tenant_id IN ('tenant-exp-test', 'tenant-exp-other')");
    await pool.query("DELETE FROM subjects WHERE tenant_id IN ('tenant-exp-test', 'tenant-exp-other')");
    await pool.query("DELETE FROM classrooms WHERE tenant_id IN ('tenant-exp-test', 'tenant-exp-other')");
    await pool.query("DELETE FROM tenants WHERE id IN ('tenant-exp-test', 'tenant-exp-other')");
  });

  it('1. Control de Acceso: debe rechazar con HTTP 401 sin token y HTTP 403 con rol Profesor', async () => {
    // Sin autenticación
    const resNoToken = await request(app)
      .get('/api/schedules/substitutions/export')
      .responseType('blob');
    expect(resNoToken.status).toBe(401);

    // Con rol Profesor
    const resTeacher = await request(app)
      .get('/api/schedules/substitutions/export')
      .set('Authorization', `Bearer ${teacherToken}`)
      .responseType('blob');
    expect(resTeacher.status).toBe(403);
  });

  it('2. Exportación exitosa: responde HTTP 200 OK con cabeceras y 13 columnas exactas para Coordinador', async () => {
    const res = await request(app)
      .get('/api/schedules/substitutions/export')
      .set('Authorization', `Bearer ${coordToken}`)
      .responseType('blob');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['content-disposition']).toContain('attachment; filename="reporte_sustituciones.xlsx"');

    // Parsear buffer binario
    const workbook = xlsx.read(res.body, { type: 'buffer' });
    expect(workbook.SheetNames).toContain('Sustituciones');

    const sheet = workbook.Sheets['Sustituciones'];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1 });

    // Fila 0 debe contener las 13 columnas exactas
    expect(rows.length).toBeGreaterThanOrEqual(1);
    const headers = rows[0];
    expect(headers).toEqual(EXPECTED_HEADERS);

    // Debe contener los 2 registros sembrados
    const dataRows = xlsx.utils.sheet_to_json(sheet);
    expect(dataRows.length).toBe(2);

    const first = dataRows.find(r => r['Motivo'] === 'Comisión académica de investigación');
    expect(first).toBeDefined();
    expect(first['Fecha Efectiva']).toBe('2026-11-20');
    expect(first['Clave']).toBe('MAT-101');
    expect(first['Materia']).toBe('Cálculo Diferencial');
    expect(first['Grupo']).toBe('G1');
    expect(first['Día']).toBe('Lunes');
    expect(first['Horario']).toBe('08:00 - 10:00');
    expect(first['Aula']).toBe('Aula 201');
    expect(first['Docente Original']).toBe('Roberto Mendoza');
    expect(first['Nómina Original']).toBe('NOM-DOC-101');
    expect(first['Docente Suplente']).toBe('Elena Gómez');
    expect(first['Nómina Suplente']).toBe('NOM-DOC-102');
    expect(first['Fecha de Registro']).toBeDefined();
  });

  it('3. Filtros query: debe respetar teacher_id, rango de fechas y search', async () => {
    // Filtro por teacher_id (usr-prof-exp-3 solo participa en subst-exp-2)
    const resByTeacher = await request(app)
      .get('/api/schedules/substitutions/export')
      .query({ teacher_id: 'usr-prof-exp-3' })
      .set('Authorization', `Bearer ${coordToken}`)
      .responseType('blob');

    expect(resByTeacher.status).toBe(200);
    const wbTeacher = xlsx.read(resByTeacher.body, { type: 'buffer' });
    const rowsTeacher = xlsx.utils.sheet_to_json(wbTeacher.Sheets['Sustituciones']);
    expect(rowsTeacher.length).toBe(1);
    expect(rowsTeacher[0]['Docente Original']).toBe('Carlos Slim');

    // Filtro por rango de fechas (noviembre 2026 solo incluye subst-exp-1)
    const resByDate = await request(app)
      .get('/api/schedules/substitutions/export')
      .query({ from_date: '2026-11-01', to_date: '2026-11-30' })
      .set('Authorization', `Bearer ${coordToken}`)
      .responseType('blob');

    expect(resByDate.status).toBe(200);
    const wbDate = xlsx.read(resByDate.body, { type: 'buffer' });
    const rowsDate = xlsx.utils.sheet_to_json(wbDate.Sheets['Sustituciones']);
    expect(rowsDate.length).toBe(1);
    expect(rowsDate[0]['Fecha Efectiva']).toBe('2026-11-20');

    // Filtro por search ("médica")
    const resBySearch = await request(app)
      .get('/api/schedules/substitutions/export')
      .query({ search: 'médica' })
      .set('Authorization', `Bearer ${coordToken}`)
      .responseType('blob');

    expect(resBySearch.status).toBe(200);
    const wbSearch = xlsx.read(resBySearch.body, { type: 'buffer' });
    const rowsSearch = xlsx.utils.sheet_to_json(wbSearch.Sheets['Sustituciones']);
    expect(rowsSearch.length).toBe(1);
    expect(rowsSearch[0]['Motivo']).toContain('médica');
  });

  it('4. Idempotencia ante resultados vacíos: rango sin registros responde HTTP 200 OK con 13 encabezados y sin error 500', async () => {
    const resEmpty = await request(app)
      .get('/api/schedules/substitutions/export')
      .query({ from_date: '2099-01-01', to_date: '2099-01-31' })
      .set('Authorization', `Bearer ${coordToken}`)
      .responseType('blob');

    expect(resEmpty.status).toBe(200);
    expect(resEmpty.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

    const wbEmpty = xlsx.read(resEmpty.body, { type: 'buffer' });
    expect(wbEmpty.SheetNames).toContain('Sustituciones');

    const sheetEmpty = wbEmpty.Sheets['Sustituciones'];
    const rowsEmpty = xlsx.utils.sheet_to_json(sheetEmpty, { header: 1 });

    // Debe contener exactamente 1 fila con los 13 encabezados
    expect(rowsEmpty.length).toBe(1);
    expect(rowsEmpty[0]).toEqual(EXPECTED_HEADERS);

    // Cero filas de datos
    const dataEmpty = xlsx.utils.sheet_to_json(sheetEmpty);
    expect(dataEmpty.length).toBe(0);
  });

  it('5. Aislamiento multi-tenant: otro tenant no puede ver sustituciones del tenant de prueba', async () => {
    const resOther = await request(app)
      .get('/api/schedules/substitutions/export')
      .set('Authorization', `Bearer ${otherTenantCoordToken}`)
      .responseType('blob');

    expect(resOther.status).toBe(200);
    const wbOther = xlsx.read(resOther.body, { type: 'buffer' });
    const sheetOther = wbOther.Sheets['Sustituciones'];
    const dataOther = xlsx.utils.sheet_to_json(sheetOther);
    expect(dataOther.length).toBe(0);

    const rowsOther = xlsx.utils.sheet_to_json(sheetOther, { header: 1 });
    expect(rowsOther.length).toBe(1);
    expect(rowsOther[0]).toEqual(EXPECTED_HEADERS);
  });
});
