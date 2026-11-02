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
    const subjects = await query.all(
      'SELECT id, code, name, credits FROM subjects WHERE tenant_id = ? ORDER BY code ASC',
      [req.tenant_id]
    );
    res.json(subjects);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar materias', details: err.message });
  }
}

// Create a subject
async function createSubject(req, res) {
  try {
    const { code, name, credits } = req.body;
    if (!code || !name) {
      return res.status(400).json({ error: 'Código y nombre de materia requeridos' });
    }

    const id = 'sub-' + Date.now();
    await query.run(
      'INSERT INTO subjects (id, tenant_id, code, name, credits) VALUES (?, ?, ?, ?, ?)',
      [id, req.tenant_id, code.trim().toUpperCase(), name.trim(), credits || 4]
    );

    res.status(201).json({ id, code: code.trim().toUpperCase(), name: name.trim(), credits: credits || 4 });
  } catch (err) {
    if (err.code === '23505' || (err.message && err.message.includes('UNIQUE'))) {
      return res.status(409).json({ error: 'Ya existe una materia con ese código en esta institución' });
    }
    res.status(500).json({ error: 'Error al registrar materia', details: err.message });
  }
}

// List teachers in the tenant (users with role 'Profesor')
async function getTeachers(req, res) {
  try {
    const teachers = await query.all(
      `SELECT u.id, u.nombre, u.apellidos,
              TRIM(CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellidos, ''))) AS name,
              u.email, u.identificador, u.identificador AS identifier
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.tenant_id = ? AND (r.name = 'Profesor' OR r.nombre = 'Profesor')
       ORDER BY name ASC`,
      [req.tenant_id]
    );
    res.json(teachers);
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
