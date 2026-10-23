const { query, pool } = require('../db');
const xlsx = require('xlsx');

// Helper to convert 'HH:MM' string to minutes from 00:00 for easy comparison
function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// -------------------------------------------------------------
// COORDINADOR: CREACIÓN Y GESTIÓN DE HORARIOS CON DETECCIÓN DE EMPALMES
// -------------------------------------------------------------

async function createSchedule(req, res) {
  try {
    const {
      subject_id,
      teacher_id,
      classroom_id,
      day_of_week,
      start_time,
      end_time,
      max_students,
      group_code
    } = req.body;

    if (!subject_id || !teacher_id || !classroom_id || !day_of_week || !start_time || !end_time) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios para armar el horario.' });
    }

    if (start_time >= end_time) {
      return res.status(400).json({ error: 'La hora de inicio debe ser anterior a la hora de fin.' });
    }

    // 1. Validar existencia de entidades dentro del mismo tenant (Aislamiento de Tenant)
    const subject = await query.get('SELECT id, name, code FROM subjects WHERE id = ? AND tenant_id = ?', [subject_id, req.tenant_id]);
    if (!subject) return res.status(404).json({ error: 'Materia no encontrada en esta institución' });

    const teacher = await query.get(
      `SELECT u.id, u.name FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = ? AND u.tenant_id = ? AND r.name = 'Profesor'`,
      [teacher_id, req.tenant_id]
    );
    if (!teacher) return res.status(404).json({ error: 'Docente no encontrado o no tiene rol de Profesor' });

    const classroom = await query.get('SELECT id, name, capacity FROM classrooms WHERE id = ? AND tenant_id = ?', [classroom_id, req.tenant_id]);
    if (!classroom) return res.status(404).json({ error: 'Aula no encontrada en esta institución' });

    // Validación preventiva de aforo contra capacidad física del aula (Criterios 1 y 2)
    let assignedStudents = classroom.capacity;
    if (max_students !== undefined && max_students !== null && max_students !== '') {
      const parsedMaxStudents = parseInt(max_students, 10);
      if (isNaN(parsedMaxStudents) || parsedMaxStudents <= 0) {
        return res.status(400).json({ error: 'El cupo de alumnos debe ser un número entero positivo mayor a cero.' });
      }
      if (parsedMaxStudents > classroom.capacity) {
        return res.status(400).json({
          error: `Discrepancia de aforo: El cupo solicitado (${parsedMaxStudents} alumnos) excede la capacidad máxima del aula "${classroom.name}" (${classroom.capacity} alumnos).`,
          max_students: parsedMaxStudents,
          classroom_capacity: classroom.capacity
        });
      }
      assignedStudents = parsedMaxStudents;
    }

    // 2. MOTOR ANTI-EMPALME: Comprobar colisión de horario del Docente
    // Regla de empalme: (start_time < new_end) AND (end_time > new_start)
    const teacherConflict = await query.get(
      `SELECT s.*, sub.name as subject_name, cr.name as classroom_name
       FROM schedules s
       JOIN subjects sub ON s.subject_id = sub.id
       JOIN classrooms cr ON s.classroom_id = cr.id
       WHERE s.tenant_id = ?
         AND s.teacher_id = ?
         AND s.day_of_week = ?
         AND (s.start_time < ? AND s.end_time > ?)`,
      [req.tenant_id, teacher_id, day_of_week, end_time, start_time]
    );

    if (teacherConflict) {
      return res.status(409).json({
        conflictType: 'TEACHER_CONFLICT',
        error: `¡Empalme de Profesor detectado! El docente ${teacher.name} ya tiene asignada la materia "${teacherConflict.subject_name}" el día ${day_of_week} de ${teacherConflict.start_time} a ${teacherConflict.end_time} en el aula ${teacherConflict.classroom_name}.`
      });
    }

    // 3. MOTOR ANTI-EMPALME: Comprobar colisión de Aula Física
    const classroomConflict = await query.get(
      `SELECT s.*, sub.name as subject_name, u.name as teacher_name
       FROM schedules s
       JOIN subjects sub ON s.subject_id = sub.id
       JOIN users u ON s.teacher_id = u.id
       WHERE s.tenant_id = ?
         AND s.classroom_id = ?
         AND s.day_of_week = ?
         AND (s.start_time < ? AND s.end_time > ?)`,
      [req.tenant_id, classroom_id, day_of_week, end_time, start_time]
    );

    if (classroomConflict) {
      return res.status(409).json({
        conflictType: 'CLASSROOM_CONFLICT',
        error: `¡Empalme de Aula detectado! El aula "${classroom.name}" ya está reservada para "${classroomConflict.subject_name}" (Docente: ${classroomConflict.teacher_name}) el día ${day_of_week} de ${classroomConflict.start_time} a ${classroomConflict.end_time}.`
      });
    }

    // 4. MOTOR ANTI-EMPALME: Comprobar colisión de Grupo de Alumnos
    const group = group_code && String(group_code).trim() ? String(group_code).trim() : 'G1';
    const groupConflict = await query.get(
      `SELECT s.*, sub.name as subject_name, cr.name as classroom_name
       FROM schedules s
       JOIN subjects sub ON s.subject_id = sub.id
       JOIN classrooms cr ON s.classroom_id = cr.id
       WHERE s.tenant_id = ?
         AND s.group_code = ?
         AND s.day_of_week = ?
         AND (s.start_time < ? AND s.end_time > ?)`,
      [req.tenant_id, group, day_of_week, end_time, start_time]
    );

    if (groupConflict) {
      const classroomStr = /^aula\b/i.test(groupConflict.classroom_name)
        ? groupConflict.classroom_name
        : (/^lab/i.test(groupConflict.classroom_name) ? groupConflict.classroom_name : `Aula ${groupConflict.classroom_name}`);
      return res.status(409).json({
        conflictType: 'GROUP_CONFLICT',
        error: `¡Empalme de Grupo detectado! El Grupo '${group}' ya tiene clase de '${groupConflict.subject_name}' el ${groupConflict.day_of_week} de ${groupConflict.start_time} a ${groupConflict.end_time} en el ${classroomStr}`
      });
    }

    // 5. Inserción del nuevo horario aislado por tenant_id
    const scheduleId = 'sch-' + Date.now();
    const capacity = assignedStudents;

    await query.run(
      `INSERT INTO schedules (id, tenant_id, subject_id, teacher_id, classroom_id, day_of_week, start_time, end_time, max_students, group_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [scheduleId, req.tenant_id, subject_id, teacher_id, classroom_id, day_of_week, start_time, end_time, capacity, group]
    );

    res.status(201).json({
      message: 'Horario creado exitosamente sin conflictos',
      schedule: {
        id: scheduleId,
        subject_id,
        subject_name: subject.name,
        teacher_id,
        teacher_name: teacher.name,
        classroom_id,
        classroom_name: classroom.name,
        day_of_week,
        start_time,
        end_time,
        max_students: capacity,
        group_code: group
      }
    });
  } catch (err) {
    console.error('Error al crear horario:', err);
    res.status(500).json({ error: 'Error interno al registrar horario', details: err.message });
  }
}

// List all schedules for the Coordinator's institution
async function getCoordinatorSchedules(req, res) {
  try {
    const schedules = await query.all(
      `SELECT
         s.id,
         s.day_of_week,
         s.start_time,
         s.end_time,
         s.max_students,
         s.group_code,
         s.created_at,
         sub.id as subject_id,
         sub.code as subject_code,
         sub.name as subject_name,
         sub.credits as subject_credits,
         t.id as teacher_id,
         t.name as teacher_name,
         t.email as teacher_email,
         cr.id as classroom_id,
         cr.name as classroom_name,
         cr.building as classroom_building
       FROM schedules s
       JOIN subjects sub ON s.subject_id = sub.id
       JOIN users t ON s.teacher_id = t.id
       JOIN classrooms cr ON s.classroom_id = cr.id
       WHERE s.tenant_id = ?
       ORDER BY
         CASE s.day_of_week
           WHEN 'Lunes' THEN 1
           WHEN 'Martes' THEN 2
           WHEN 'Miércoles' THEN 3
           WHEN 'Jueves' THEN 4
           WHEN 'Viernes' THEN 5
           WHEN 'Sábado' THEN 6
           ELSE 7
         END,
         s.start_time ASC`,
      [req.tenant_id]
    );

    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar horarios', details: err.message });
  }
}

// Delete a schedule (Coordinador)
async function deleteSchedule(req, res) {
  try {
    const { id } = req.params;
    const schedule = await query.get('SELECT id FROM schedules WHERE id = ? AND tenant_id = ?', [id, req.tenant_id]);
    if (!schedule) {
      return res.status(404).json({ error: 'Horario no encontrado' });
    }

    await query.run('DELETE FROM schedules WHERE id = ? AND tenant_id = ?', [id, req.tenant_id]);
    res.json({ message: 'Horario eliminado correctamente' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar horario', details: err.message });
  }
}

// -------------------------------------------------------------
// PROFESOR: CONSULTA DE HORARIOS ASIGNADOS
// -------------------------------------------------------------

async function getTeacherSchedules(req, res) {
  try {
    const schedules = await query.all(
      `SELECT
         s.id,
         s.day_of_week,
         s.start_time,
         s.end_time,
         s.max_students,
         s.group_code,
         sub.code as subject_code,
         sub.name as subject_name,
         sub.credits as subject_credits,
         cr.name as classroom_name,
         cr.building as classroom_building
       FROM schedules s
       JOIN subjects sub ON s.subject_id = sub.id
       JOIN classrooms cr ON s.classroom_id = cr.id
       WHERE s.tenant_id = ? AND s.teacher_id = ?
       ORDER BY
         CASE s.day_of_week
           WHEN 'Lunes' THEN 1
           WHEN 'Martes' THEN 2
           WHEN 'Miércoles' THEN 3
           WHEN 'Jueves' THEN 4
           WHEN 'Viernes' THEN 5
           WHEN 'Sábado' THEN 6
           ELSE 7
         END,
         s.start_time ASC`,
      [req.tenant_id, req.user.id]
    );

    res.json(schedules);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar horarios del profesor', details: err.message });
  }
}


// -------------------------------------------------------------
// CARGA MASIVA DE HORARIOS (.XLSX) - STUB / HANDOFF
// -------------------------------------------------------------

const multer = require('multer');

// Almacenamiento en memoria para entregar el buffer al parser de Excel (Subtareas 2 y 3)
const storage = multer.memoryStorage();

const excelFilter = (req, file, cb) => {
  const isXlsx = file.originalname && file.originalname.toLowerCase().endsWith('.xlsx');
  if (isXlsx) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos en formato .xlsx'), false);
  }
};

const upload = multer({
  storage,
  fileFilter: excelFilter,
  limits: { fileSize: 10 * 1024 * 1024 }
});

const uploadExcelMiddleware = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  });
};

// -------------------------------------------------------------
// CARGA MASIVA DE HORARIOS (.XLSX) - PARSER E INSERCIÓN TRANSACCIONAL
// -------------------------------------------------------------

const XLSX = require('xlsx');
const crypto = require('crypto');
const {
  MAX_EXCEL_ROWS,
  normalizeKey,
  HEADER_ALIASES,
  REQUIRED_FIELDS,
  DAY_NAMES,
  parseExcelTime,
  mapExcelRows,
  parseExcelBuffer
} = require('../utils/excelParser');
const { hasOverlap } = require('../utils/overlapValidator');

// Detecta empalmes de profesor y de aula entre las filas nuevas del Excel y los horarios existentes
// en BD (origen 'BD'), y entre las propias filas del Excel (origen 'EXCEL').
// Devuelve una lista detallada de quién choca con quién.
function detectOverlaps(pending, existing) {
  const conflicts = [];

  const nuevoInfo = (p) => ({
    fila: p.fila,
    materia: p.subject.code,
    profesor: p.teacher.name,
    aula: p.classroom.name,
    dia: p.day,
    hora_inicio: p.startTime,
    hora_fin: p.endTime,
    grupo: p.groupCode || 'G1'
  });
  const existenteInfo = (e) => ({
    id: e.id,
    materia: e.subject_name,
    profesor: e.teacher_name,
    aula: e.classroom_name,
    dia: e.day_of_week,
    hora_inicio: e.start_time,
    hora_fin: e.end_time,
    grupo: e.group_code || 'G1'
  });
  const range = (p) => ({ day_of_week: p.day, start_time: p.startTime, end_time: p.endTime });

  // Agrupa por día para evitar comparar todo contra todo
  const existingByDay = new Map();
  for (const e of existing) {
    if (!existingByDay.has(e.day_of_week)) existingByDay.set(e.day_of_week, []);
    existingByDay.get(e.day_of_week).push(e);
  }
  const pendingByDay = new Map();
  for (const p of pending) {
    if (!pendingByDay.has(p.day)) pendingByDay.set(p.day, []);
    pendingByDay.get(p.day).push(p);
  }

  for (const [day, news] of pendingByDay) {
    // Excel vs. BD
    for (const p of news) {
      for (const e of existingByDay.get(day) || []) {
        const sameTeacher = e.teacher_id === p.teacher.id;
        const sameClassroom = e.classroom_id === p.classroom.id;
        const sameGroup = Boolean(e.group_code && p.groupCode && String(e.group_code).trim().toLowerCase() === String(p.groupCode).trim().toLowerCase());
        if (!sameTeacher && !sameClassroom && !sameGroup) continue;
        if (!hasOverlap(range(p), { day_of_week: e.day_of_week, start_time: e.start_time, end_time: e.end_time })) continue;

        if (sameTeacher) {
          conflicts.push({
            tipo: 'PROFESOR',
            origen: 'BD',
            mensaje: `Fila ${p.fila}: el profesor ${p.teacher.name} ya tiene "${e.subject_name}" el ${day} de ${e.start_time} a ${e.end_time}`,
            nuevo: nuevoInfo(p),
            existente: existenteInfo(e)
          });
        }
        if (sameClassroom) {
          conflicts.push({
            tipo: 'AULA',
            origen: 'BD',
            mensaje: `Fila ${p.fila}: el aula "${p.classroom.name}" ya está reservada para "${e.subject_name}" el ${day} de ${e.start_time} a ${e.end_time}`,
            nuevo: nuevoInfo(p),
            existente: existenteInfo(e)
          });
        }
        if (sameGroup) {
          conflicts.push({
            tipo: 'GRUPO',
            origen: 'BD',
            mensaje: `Fila ${p.fila}: el grupo "${p.groupCode}" ya tiene "${e.subject_name}" el ${day} de ${e.start_time} a ${e.end_time}`,
            nuevo: nuevoInfo(p),
            existente: existenteInfo(e)
          });
        }
      }
    }

    // Excel vs. Excel (cada par se reporta una sola vez)
    for (let i = 0; i < news.length; i++) {
      for (let j = i + 1; j < news.length; j++) {
        const a = news[i];
        const b = news[j];
        const sameTeacher = a.teacher.id === b.teacher.id;
        const sameClassroom = a.classroom.id === b.classroom.id;
        const sameGroup = Boolean(a.groupCode && b.groupCode && String(a.groupCode).trim().toLowerCase() === String(b.groupCode).trim().toLowerCase());
        if (!sameTeacher && !sameClassroom && !sameGroup) continue;
        if (!hasOverlap(range(a), range(b))) continue;

        if (sameTeacher) {
          conflicts.push({
            tipo: 'PROFESOR',
            origen: 'EXCEL',
            mensaje: `Filas ${a.fila} y ${b.fila}: el profesor ${a.teacher.name} tiene dos clases empalmadas el ${day}`,
            nuevo: nuevoInfo(a),
            existente: nuevoInfo(b)
          });
        }
        if (sameClassroom) {
          conflicts.push({
            tipo: 'AULA',
            origen: 'EXCEL',
            mensaje: `Filas ${a.fila} y ${b.fila}: el aula "${a.classroom.name}" está asignada dos veces empalmada el ${day}`,
            nuevo: nuevoInfo(a),
            existente: nuevoInfo(b)
          });
        }
        if (sameGroup) {
          conflicts.push({
            tipo: 'GRUPO',
            origen: 'EXCEL',
            mensaje: `Filas ${a.fila} y ${b.fila}: el grupo "${a.groupCode}" tiene dos clases empalmadas el ${day}`,
            nuevo: nuevoInfo(a),
            existente: nuevoInfo(b)
          });
        }
      }
    }
  }

  return conflicts;
}

async function uploadExcelSchedule(req, res) {
  let client;
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Debe adjuntar un archivo en formato .xlsx'
      });
    }

    // Seguridad multi-tenant: sin tenant no se inserta nada
    const tenantId = req.tenant_id;
    if (!tenantId) {
      return res.status(403).json({
        success: false,
        error: 'No se pudo determinar la institución (tenant) del usuario'
      });
    }

    // Confirmación explícita para sobrescribir empalmes. multer expone los campos de texto del
    // multipart en req.body; se acepta también ?force=true como respaldo.
    const forceRaw = req.body?.force ?? req.query?.force;
    const force = forceRaw === true || String(forceRaw ?? '').trim().toLowerCase() === 'true';

    // 1. Parseo del buffer en memoria
    let rawRows;
    try {
      const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error('hoja vacía');
      rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
    } catch (parseErr) {
      return res.status(400).json({
        success: false,
        error: 'No se pudo leer el archivo Excel. Verifique que sea un .xlsx válido.',
        details: parseErr.message
      });
    }

    if (rawRows.length === 0) {
      return res.status(400).json({ success: false, error: 'El archivo Excel no contiene filas de datos.' });
    }
    if (rawRows.length > MAX_EXCEL_ROWS) {
      return res.status(400).json({
        success: false,
        error: `El archivo excede el máximo de ${MAX_EXCEL_ROWS} filas por carga.`
      });
    }

    // 2. Mapeo de encabezados -> columnas de la tabla schedules
    const presentFields = new Set();
    Object.keys(rawRows[0]).forEach((h) => {
      const f = HEADER_ALIASES[normalizeKey(h)];
      if (f) presentFields.add(f);
    });
    const missing = Object.keys(REQUIRED_FIELDS).filter((f) => !presentFields.has(f));
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Faltan columnas obligatorias en el Excel: ${missing.map((f) => REQUIRED_FIELDS[f]).join(', ')}`
      });
    }
    const rows = mapExcelRows(rawRows);

    // 3. Transacción SQL: todo o nada
    client = await pool.connect();
    await client.query('BEGIN');

    // Catálogos del tenant (aislamiento multi-tenant en cada consulta)
    const subjectsRes = await client.query('SELECT id, code FROM subjects WHERE tenant_id = $1', [tenantId]);
    const teachersRes = await client.query(
      `SELECT u.id, u.email, u.name FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.tenant_id = $1 AND r.name = 'Profesor'`,
      [tenantId]
    );
    const classroomsRes = await client.query('SELECT id, name, capacity FROM classrooms WHERE tenant_id = $1', [tenantId]);

    const subjectsByCode = new Map(subjectsRes.rows.map((s) => [normalizeKey(s.code), s]));
    const teachersByEmail = new Map(teachersRes.rows.map((t) => [String(t.email).trim().toLowerCase(), t]));
    const classroomsByName = new Map(classroomsRes.rows.map((c) => [normalizeKey(c.name), c]));

    const errors = [];
    const pending = []; // filas válidas del Excel, pendientes de insertar
    let replaced = 0;   // horarios de BD sobrescritos con force=true

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const fila = i + 2; // +1 por base 1, +1 por la fila de encabezados
      const rowErrors = [];

      const subject = subjectsByCode.get(normalizeKey(row.subject_code));
      if (!subject) rowErrors.push(`Materia con código "${row.subject_code}" no existe en esta institución`);

      const teacher = teachersByEmail.get(String(row.teacher_email ?? '').trim().toLowerCase());
      if (!teacher) rowErrors.push(`Profesor con correo "${row.teacher_email}" no existe en esta institución o no tiene rol de Profesor`);

      const classroom = classroomsByName.get(normalizeKey(row.classroom_name));
      if (!classroom) rowErrors.push(`Aula "${row.classroom_name}" no existe en esta institución`);

      const day = DAY_NAMES[normalizeKey(row.day_of_week)];
      if (!day) rowErrors.push(`Día "${row.day_of_week}" no es válido (use Lunes a Sábado)`);

      const startTime = parseExcelTime(row.start_time);
      const endTime = parseExcelTime(row.end_time);
      if (!startTime) rowErrors.push(`Hora de inicio "${row.start_time}" no es válida (use HH:MM)`);
      if (!endTime) rowErrors.push(`Hora de fin "${row.end_time}" no es válida (use HH:MM)`);
      if (startTime && endTime && startTime >= endTime) {
        rowErrors.push('La hora de inicio debe ser anterior a la hora de fin');
      }

      let maxStudents = classroom ? classroom.capacity : 30;
      if (row.max_students !== undefined && row.max_students !== '') {
        const requested = Number(row.max_students);
        if (!Number.isInteger(requested) || requested <= 0) {
          rowErrors.push(`Cupo "${row.max_students}" no es válido (entero mayor a 0)`);
        } else if (classroom) {
          if (requested > classroom.capacity) {
            rowErrors.push(
              `Discrepancia de aforo: El cupo especificado (${requested} alumnos) supera la capacidad máxima del aula "${classroom.name}" (${classroom.capacity} alumnos)`
            );
          } else {
            maxStudents = requested;
          }
        }
      }

      if (rowErrors.length > 0) {
        rowErrors.forEach((error) => errors.push({ fila, error }));
        continue;
      }

      const groupCode = (row.group_code && String(row.group_code).trim()) ? String(row.group_code).trim() : null;

      // Fila válida: se acumula; empalmes e inserción se resuelven después, sobre el conjunto completo
      pending.push({ fila, subject, teacher, classroom, day, startTime, endTime, maxStudents, groupCode });
    }

    // Si cualquier fila falló la validación, no se guarda ninguna
    if (errors.length > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'El archivo contiene errores. No se guardó ningún registro.',
        errors
      });
    }

    // 4. Detección de empalmes (contra la BD del tenant y entre filas del mismo Excel)
    const existingRes = await client.query(
      `SELECT s.id, s.teacher_id, s.classroom_id, s.day_of_week, s.start_time, s.end_time, s.group_code,
              sub.name AS subject_name, u.name AS teacher_name, cr.name AS classroom_name
       FROM schedules s
       JOIN subjects sub ON s.subject_id = sub.id
       JOIN users u ON s.teacher_id = u.id
       JOIN classrooms cr ON s.classroom_id = cr.id
       WHERE s.tenant_id = $1`,
      [tenantId]
    );
    const conflicts = detectOverlaps(pending, existingRes.rows);

    if (conflicts.length > 0) {
      const dbConflicts = conflicts.filter((c) => c.origen === 'BD');
      const excelConflicts = conflicts.filter((c) => c.origen === 'EXCEL');

      // Sin confirmación explícita: se aborta y se informa quién choca con quién
      if (!force) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          conflictType: 'SCHEDULE_OVERLAP',
          error: 'Se detectaron empalmes. No se guardó ningún registro. Reenvíe con force=true para sobrescribir los horarios existentes en la base de datos.',
          requiresForce: dbConflicts.length > 0 && excelConflicts.length === 0,
          conflicts
        });
      }

      // Con force solo se pueden sobrescribir registros de la BD; un empalme dentro del propio Excel no tiene solución automática
      if (excelConflicts.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          conflictType: 'SCHEDULE_OVERLAP_IN_FILE',
          error: 'El archivo tiene empalmes entre sus propias filas; corríjalos antes de importar. No se guardó ningún registro.',
          requiresForce: false,
          conflicts: excelConflicts
        });
      }

      // Sobrescritura: elimina (acotado al tenant) los registros de BD que chocan
      const idsToDelete = [...new Set(dbConflicts.map((c) => c.existente.id))];
      const deleted = await client.query(
        'DELETE FROM schedules WHERE tenant_id = $1 AND id = ANY($2::varchar[])',
        [tenantId, idsToDelete]
      );
      replaced = deleted.rowCount;
    }

    // 5. Inserción de los horarios del Excel
    for (const p of pending) {
      await client.query(
        `INSERT INTO schedules (id, tenant_id, subject_id, teacher_id, classroom_id, day_of_week, start_time, end_time, max_students, group_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        ['sch-' + crypto.randomUUID(), tenantId, p.subject.id, p.teacher.id, p.classroom.id, p.day, p.startTime, p.endTime, p.maxStudents, p.groupCode || 'G1']
      );
    }

    await client.query('COMMIT');
    return res.status(201).json({
      success: true,
      message: replaced > 0
        ? `Horarios importados correctamente (${replaced} horario(s) existente(s) sobrescrito(s))`
        : 'Horarios importados correctamente',
      filename: req.file.originalname,
      inserted: pending.length,
      replaced
    });
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch (_) { /* conexión ya cerrada */ }
    }
    return res.status(500).json({
      success: false,
      error: 'Error al procesar la carga del archivo Excel',
      details: err.message
    });
  } finally {
    if (client) client.release();
  }
}

// -------------------------------------------------------------
// EXPORTACIÓN DE HORARIOS (.XLSX)
// -------------------------------------------------------------

async function exportSchedules(req, res) {
  try {
    const tenant_id = req.user?.tenant_id || req.tenant_id;

    if (!tenant_id) {
      return res.status(400).json({ error: 'Tenant no identificado' });
    }

    // Consultar los horarios del tenant/usuario
    const result = await pool.query(
      'SELECT materia, profesor, dia, hora_inicio, hora_fin FROM horarios WHERE tenant_id = $1',
      [tenant_id]
    );

    let data = result?.rows || [];

    // Si no hay registros en la tabla horarios, intentar consultar la tabla schedules
    if (data.length === 0) {
      const schedulesResult = await pool.query(
        `SELECT sub.name AS materia, COALESCE(u.name, s.teacher_id) AS profesor,
                s.day_of_week AS dia, s.start_time AS hora_inicio, s.end_time AS hora_fin
         FROM schedules s
         LEFT JOIN subjects sub ON s.subject_id = sub.id
         LEFT JOIN users u ON s.teacher_id = u.id
         WHERE s.tenant_id = $1`,
        [tenant_id]
      );
      if (schedulesResult?.rows && schedulesResult.rows.length > 0) {
        data = schedulesResult.rows;
      }
    }

    // Crear hoja de cálculo
    const worksheet = xlsx.utils.json_to_sheet(data);

    // Criterio 2: Si no hay registros, asegurar que al menos vayan los encabezados
    if (data.length === 0) {
      xlsx.utils.sheet_add_aoa(worksheet, [['materia', 'profesor', 'dia', 'hora_inicio', 'hora_fin']], { origin: 'A1' });
    }

    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Horarios');

    // Generar buffer binario
    const buffer = xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Enviar respuesta al cliente como archivo descargable
    res.setHeader('Content-Disposition', 'attachment; filename="horarios_exportados.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return res.status(200).send(buffer);
  } catch (error) {
    console.error('Error al exportar los horarios:', error);
    return res.status(500).json({ error: 'Error al exportar los horarios' });
  }
}

module.exports = {
  createSchedule,
  getCoordinatorSchedules,
  deleteSchedule,
  getTeacherSchedules,
  uploadExcelMiddleware,
  uploadExcelSchedule,
  exportSchedules,
  parseExcelBuffer,
  mapExcelRows,
  parseExcelTime,
  normalizeKey
};

module.exports.exportSchedules = exportSchedules;
