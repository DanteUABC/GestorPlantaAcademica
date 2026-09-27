const { query } = require('../db');

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
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ya existe una materia con ese código en esta institución' });
    }
    res.status(500).json({ error: 'Error al registrar materia', details: err.message });
  }
}

// List classrooms in the tenant
async function getClassrooms(req, res) {
  try {
    const classrooms = await query.all(
      'SELECT id, name, building, capacity FROM classrooms WHERE tenant_id = ? ORDER BY name ASC',
      [req.tenant_id]
    );
    res.json(classrooms);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar aulas', details: err.message });
  }
}

// Create a classroom
async function createClassroom(req, res) {
  try {
    const { name, building, capacity } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'El nombre del aula es obligatorio' });
    }

    const id = 'cr-' + Date.now();
    await query.run(
      'INSERT INTO classrooms (id, tenant_id, name, building, capacity) VALUES (?, ?, ?, ?, ?)',
      [id, req.tenant_id, name.trim(), building || '', capacity || 30]
    );

    res.status(201).json({ id, name: name.trim(), building: building || '', capacity: capacity || 30 });
  } catch (err) {
    if (err.message && err.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Ya existe un aula con ese nombre en esta institución' });
    }
    res.status(500).json({ error: 'Error al registrar aula', details: err.message });
  }
}

// List teachers in the tenant (users with role 'Profesor')
async function getTeachers(req, res) {
  try {
    const teachers = await query.all(
      `SELECT u.id, u.name, u.email, u.identifier
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.tenant_id = ? AND r.name = 'Profesor'
       ORDER BY u.name ASC`,
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
  getTeachers
};
