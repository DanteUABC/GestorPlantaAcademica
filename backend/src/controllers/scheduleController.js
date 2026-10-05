const { query } = require('../db');

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
      max_students
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

    // 4. Inserción del nuevo horario aislado por tenant_id
    const scheduleId = 'sch-' + Date.now();
    const capacity = max_students ? Math.min(Number(max_students), classroom.capacity) : classroom.capacity;

    await query.run(
      `INSERT INTO schedules (id, tenant_id, subject_id, teacher_id, classroom_id, day_of_week, start_time, end_time, max_students)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [scheduleId, req.tenant_id, subject_id, teacher_id, classroom_id, day_of_week, start_time, end_time, capacity]
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
        max_students: capacity
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


module.exports = {
  createSchedule,
  getCoordinatorSchedules,
  deleteSchedule,
  getTeacherSchedules
};
