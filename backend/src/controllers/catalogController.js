const { query } = require('../db');
const {
  getClassrooms,
  createClassroom,
  updateClassroom,
  deleteClassroom
} = require('./classroomController');

// List subjects in the tenant
async function getSubjects(req, res) {
  try {
    const tenantId = req.tenant_id || req.user?.tenant_id;
    const subjects = await query.all(
      'SELECT id, tenant_id, code, name, credits FROM subjects WHERE tenant_id = ? ORDER BY code ASC',
      [tenantId]
    );
    res.json(subjects);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar materias', details: err.message });
  }
}

// Create a subject
async function createSubject(req, res) {
  try {
    const tenantId = req.tenant_id || req.user?.tenant_id;
    const rawCode = req.body.code !== undefined ? req.body.code : (req.body.codigo ?? req.body.clave);
    const rawName = req.body.name !== undefined ? req.body.name : req.body.nombre;
    const rawCredits = req.body.credits !== undefined ? req.body.credits : req.body.creditos;

    if (!rawCode || !String(rawCode).trim() || !rawName || !String(rawName).trim()) {
      return res.status(400).json({ error: 'Código y nombre de materia requeridos' });
    }

    const cleanCode = String(rawCode).trim().toUpperCase();
    const cleanName = String(rawName).trim();
    const parsedCredits = rawCredits !== undefined && rawCredits !== null && rawCredits !== ''
      ? parseInt(rawCredits, 10)
      : 4;
    const finalCredits = !isNaN(parsedCredits) && parsedCredits > 0 ? parsedCredits : 4;

    const id = 'sub-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    await query.run(
      'INSERT INTO subjects (id, tenant_id, code, name, credits) VALUES (?, ?, ?, ?, ?)',
      [id, tenantId, cleanCode, cleanName, finalCredits]
    );

    const newSubject = {
      id,
      tenant_id: tenantId,
      code: cleanCode,
      name: cleanName,
      credits: finalCredits
    };

    res.status(201).json(newSubject);
  } catch (err) {
    if (err.code === '23505' || (err.message && (err.message.includes('UNIQUE') || err.message.includes('unique')))) {
      return res.status(409).json({ error: 'Ya existe una materia con ese código en esta institución' });
    }
    res.status(500).json({ error: 'Error al registrar materia', details: err.message });
  }
}

// List teachers in the tenant (users with role 'Profesor')
async function getTeachers(req, res) {
  try {
    let teachers = [];
    try {
      teachers = await query.all(
        `SELECT u.id, u.nombre, u.apellidos,
                TRIM(CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellidos, ''))) AS name,
                u.email, u.identificador, u.identificador AS identifier,
                COALESCE(u.min_weekly_hours, 0)::int AS min_weekly_hours,
                COALESCE(u.max_weekly_hours, 40)::int AS max_weekly_hours,
                COALESCE(u.max_weekly_hours, 40)::int AS max_hours,
                COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (s.end_time::time - s.start_time::time)) / 3600)::numeric, 2), 0)::float AS assigned_hours
         FROM users u
         JOIN roles r ON u.role_id = r.id
         LEFT JOIN schedules s ON s.teacher_id = u.id AND s.tenant_id = u.tenant_id
         WHERE u.tenant_id = ? AND (r.name = 'Profesor' OR r.nombre = 'Profesor')
         GROUP BY u.id, u.nombre, u.apellidos, u.email, u.identificador, u.min_weekly_hours, u.max_weekly_hours
         ORDER BY name ASC`,
        [req.tenant_id]
      );
    } catch (_sqlErr) {
      const rawTeachers = await query.all(
        `SELECT u.id, u.nombre, u.apellidos,
                TRIM(CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellidos, ''))) AS name,
                u.email, u.identificador, u.identificador AS identifier,
                COALESCE(u.min_weekly_hours, 0) AS min_weekly_hours,
                COALESCE(u.max_weekly_hours, 40) AS max_weekly_hours,
                COALESCE(u.max_weekly_hours, 40) AS max_hours
         FROM users u
         JOIN roles r ON u.role_id = r.id
         WHERE u.tenant_id = ? AND (r.name = 'Profesor' OR r.nombre = 'Profesor')
         ORDER BY name ASC`,
        [req.tenant_id]
      );

      const allSchedules = await query.all(
        'SELECT teacher_id, start_time, end_time FROM schedules WHERE tenant_id = ?',
        [req.tenant_id]
      );

      teachers = (rawTeachers || []).map((t) => {
        const teacherSchedules = (allSchedules || []).filter((s) => s.teacher_id === t.id);
        const assigned = teacherSchedules.reduce((sum, s) => {
          const [sh, sm] = (s.start_time || '00:00').split(':').map(Number);
          const [eh, em] = (s.end_time || '00:00').split(':').map(Number);
          return sum + ((eh * 60 + em) - (sh * 60 + sm)) / 60;
        }, 0);
        return {
          ...t,
          min_weekly_hours: parseInt(t.min_weekly_hours, 10) || 0,
          max_weekly_hours: parseInt(t.max_weekly_hours, 10) || 40,
          max_hours: parseInt(t.max_hours, 10) || 40,
          assigned_hours: Number(assigned.toFixed(2))
        };
      });
    }

    const formattedTeachers = (teachers || []).map((t) => ({
      ...t,
      min_weekly_hours: parseInt(t.min_weekly_hours, 10) || 0,
      max_weekly_hours: parseInt(t.max_weekly_hours, 10) || 40,
      assigned_hours: Number(Number(t.assigned_hours || 0).toFixed(2))
    }));

    res.json(formattedTeachers);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar profesores', details: err.message });
  }
}

module.exports = {
  getSubjects,
  createSubject,
  getClassrooms,
  createClassroom,
  updateClassroom,
  deleteClassroom,
  getTeachers
};

// Exportar getTenants para compatibilidad con catalogController
const authController = require('./authController');
exports.getTenants = authController.getTenants;
