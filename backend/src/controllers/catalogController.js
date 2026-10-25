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
    if (err.code === '23505' || (err.message && err.message.includes('UNIQUE'))) {
      return res.status(409).json({ error: 'Ya existe una materia con ese código en esta institución' });
    }
    res.status(500).json({ error: 'Error al registrar materia', details: err.message });
  }
}

// List classrooms in the tenant
async function getClassrooms(req, res) {
  try {
    const sortField = req.query?.sort === 'type' ? 'type ASC, name ASC' : 'name ASC';
    const classrooms = await query.all(
      `SELECT id, name, building, capacity, type FROM classrooms WHERE tenant_id = ? ORDER BY ${sortField}`,
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
    const { name, building, capacity, type } = req.body;
    
    // Criterio 1: Permite registrar un aula requiriendo name, capacity, building y type
    if (
      !name || !name.trim() ||
      !building || !building.trim() ||
      !type || !type.trim() ||
      capacity === undefined || capacity === null || capacity === ''
    ) {
      return res.status(400).json({
        error: 'Los campos name, capacity, building y type son obligatorios'
      });
    }

    const parsedCapacity = parseInt(capacity, 10);
    if (isNaN(parsedCapacity) || parsedCapacity <= 0) {
      return res.status(400).json({
        error: 'La capacidad debe ser un número entero positivo mayor a cero'
      });
    }

    const classroomName = name.trim();
    const classroomBuilding = building.trim();
    const classroomType = type.trim();
    const id = 'cr-' + Date.now();

    await query.run(
      'INSERT INTO classrooms (id, tenant_id, name, building, capacity, type) VALUES (?, ?, ?, ?, ?, ?)',
      [id, req.tenant_id, classroomName, classroomBuilding, parsedCapacity, classroomType]
    );

    res.status(201).json({
      id,
      tenant_id: req.tenant_id,
      name: classroomName,
      building: classroomBuilding,
      capacity: parsedCapacity,
      type: classroomType
    });
  } catch (err) {
    if (err.code === '23505' || (err.message && (err.message.includes('UNIQUE') || err.message.includes('unique')))) {
      return res.status(409).json({ error: 'Ya existe un aula con ese nombre en esta institución' });
    }
    res.status(500).json({ error: 'Error al registrar aula', details: err.message });
  }
}

// Update a classroom
async function updateClassroom(req, res) {
  try {
    const { id } = req.params;
    const { name, building, capacity, type } = req.body;

    // Criterio 2: Permite actualizar los atributos del aula únicamente si pertenece al tenant_id del token JWT
    const existing = await query.get(
      'SELECT id, tenant_id, name, building, capacity, type FROM classrooms WHERE id = ? AND tenant_id = ?',
      [id, req.tenant_id]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Aula no encontrada o no pertenece a esta institución' });
    }

    if (name !== undefined && (!name || !name.trim())) {
      return res.status(400).json({ error: 'El nombre del aula no puede estar vacío' });
    }
    if (building !== undefined && (!building || !building.trim())) {
      return res.status(400).json({ error: 'El edificio no puede estar vacío' });
    }
    if (type !== undefined && (!type || !type.trim())) {
      return res.status(400).json({ error: 'El tipo de instalación no puede estar vacío' });
    }

    let parsedCapacity = existing.capacity;
    if (capacity !== undefined) {
      parsedCapacity = parseInt(capacity, 10);
      if (isNaN(parsedCapacity) || parsedCapacity <= 0) {
        return res.status(400).json({ error: 'La capacidad debe ser un número entero positivo mayor a cero' });
      }
    }

    const updatedName = name !== undefined ? name.trim() : existing.name;
    const updatedBuilding = building !== undefined ? building.trim() : existing.building;
    const updatedType = type !== undefined ? type.trim() : existing.type;

    await query.run(
      'UPDATE classrooms SET name = ?, building = ?, capacity = ?, type = ? WHERE id = ? AND tenant_id = ?',
      [updatedName, updatedBuilding, parsedCapacity, updatedType, id, req.tenant_id]
    );

    res.json({
      id: existing.id,
      tenant_id: req.tenant_id,
      name: updatedName,
      building: updatedBuilding,
      capacity: parsedCapacity,
      type: updatedType
    });
  } catch (err) {
    if (err.code === '23505' || (err.message && (err.message.includes('UNIQUE') || err.message.includes('unique')))) {
      return res.status(409).json({ error: 'Ya existe un aula con ese nombre en esta institución' });
    }
    res.status(500).json({ error: 'Error al actualizar aula', details: err.message });
  }
}

// Delete a classroom
async function deleteClassroom(req, res) {
  try {
    const { id } = req.params;

    // Verificar existencia y pertenencia al tenant
    const existing = await query.get(
      'SELECT id, tenant_id FROM classrooms WHERE id = ? AND tenant_id = ?',
      [id, req.tenant_id]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Aula no encontrada o no pertenece a esta institución' });
    }

    // Criterio 3: Impide eliminar un aula si tiene horarios activos asignados (HTTP 409 Conflict)
    const schedulesCheck = await query.get(
      'SELECT COUNT(*)::int AS count FROM schedules WHERE classroom_id = ? AND tenant_id = ?',
      [id, req.tenant_id]
    );

    const activeCount = schedulesCheck ? parseInt(schedulesCheck.count, 10) : 0;
    if (activeCount > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar el aula porque tiene horarios activos asignados'
      });
    }

    // Si no hay dependencias, se elimina
    await query.run(
      'DELETE FROM classrooms WHERE id = ? AND tenant_id = ?',
      [id, req.tenant_id]
    );

    res.json({ message: 'Aula eliminada exitosamente', id });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar aula', details: err.message });
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
  updateClassroom,
  deleteClassroom,
  getTeachers
};

// Exportar getTenants para compatibilidad con catalogController
const authController = require('./authController');
exports.getTenants = authController.getTenants;
