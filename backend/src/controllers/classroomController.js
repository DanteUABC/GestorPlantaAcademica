const { query } = require('../db');

function extractTenantId(req) {
  return (
    req.tenant_id ||
    req.user?.tenant_id ||
    req.user?.tenantId ||
    req.headers?.['x-tenant-id'] ||
    null
  );
}

// GET /api/classrooms - Listar aulas del tenant actual
async function getClassrooms(req, res) {
  try {
    const tenantId = extractTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant no identificado en la sesión' });
    }

    const sortField = req.query?.sort === 'type' ? 'type ASC, name ASC' : 'name ASC';
    const classrooms = await query.all(
      `SELECT id, name, building, capacity, type FROM classrooms WHERE tenant_id = ? ORDER BY ${sortField}`,
      [tenantId]
    );
    res.json(classrooms);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar aulas', details: err.message });
  }
}

// POST /api/classrooms - Crear nueva aula en el tenant actual
async function createClassroom(req, res) {
  try {
    const tenantId = extractTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant no identificado en la sesión' });
    }

    const name = req.body.name !== undefined ? req.body.name : req.body.nombre;
    const building = req.body.building !== undefined ? req.body.building : req.body.edificio;
    const capacity = req.body.capacity !== undefined ? req.body.capacity : req.body.capacidad;
    const type = req.body.type !== undefined ? req.body.type : req.body.tipo;

    if (
      !name || !String(name).trim() ||
      !building || !String(building).trim() ||
      !type || !String(type).trim() ||
      capacity === undefined || capacity === null || capacity === ''
    ) {
      return res.status(400).json({
        error: 'Los campos name, capacity, building y type son obligatorios'
      });
    }

    const parsedCapacity = Number(capacity);
    if (!Number.isInteger(parsedCapacity) || isNaN(parsedCapacity) || parsedCapacity <= 0) {
      return res.status(400).json({
        error: 'La capacidad debe ser un número entero positivo mayor a cero'
      });
    }

    const classroomName = String(name).trim();
    const classroomBuilding = String(building).trim();
    const classroomType = String(type).trim();
    const id = 'cr-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);

    await query.run(
      'INSERT INTO classrooms (id, tenant_id, name, building, capacity, type) VALUES (?, ?, ?, ?, ?, ?)',
      [id, tenantId, classroomName, classroomBuilding, parsedCapacity, classroomType]
    );

    res.status(201).json({
      id,
      tenant_id: tenantId,
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

// PUT /api/classrooms/:id - Actualizar aula del tenant actual
async function updateClassroom(req, res) {
  try {
    const tenantId = extractTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant no identificado en la sesión' });
    }

    const { id } = req.params;
    const name = req.body.name !== undefined ? req.body.name : req.body.nombre;
    const building = req.body.building !== undefined ? req.body.building : req.body.edificio;
    const capacity = req.body.capacity !== undefined ? req.body.capacity : req.body.capacidad;
    const type = req.body.type !== undefined ? req.body.type : req.body.tipo;

    const existing = await query.get(
      'SELECT id, tenant_id, name, building, capacity, type FROM classrooms WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Aula no encontrada o no pertenece a esta institución' });
    }

    if (name !== undefined && (!name || !String(name).trim())) {
      return res.status(400).json({ error: 'El nombre del aula no puede estar vacío' });
    }
    if (building !== undefined && (!building || !String(building).trim())) {
      return res.status(400).json({ error: 'El edificio no puede estar vacío' });
    }
    if (type !== undefined && (!type || !String(type).trim())) {
      return res.status(400).json({ error: 'El tipo de instalación no puede estar vacío' });
    }

    let parsedCapacity = existing.capacity;
    if (capacity !== undefined) {
      parsedCapacity = Number(capacity);
      if (capacity === null || capacity === '' || !Number.isInteger(parsedCapacity) || isNaN(parsedCapacity) || parsedCapacity <= 0) {
        return res.status(400).json({ error: 'La capacidad debe ser un número entero positivo mayor a cero' });
      }
    }

    const updatedName = name !== undefined ? String(name).trim() : existing.name;
    const updatedBuilding = building !== undefined ? String(building).trim() : existing.building;
    const updatedType = type !== undefined ? String(type).trim() : existing.type;

    await query.run(
      'UPDATE classrooms SET name = ?, building = ?, capacity = ?, type = ? WHERE id = ? AND tenant_id = ?',
      [updatedName, updatedBuilding, parsedCapacity, updatedType, id, tenantId]
    );

    res.json({
      id: existing.id,
      tenant_id: tenantId,
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

// DELETE /api/classrooms/:id - Eliminar aula del tenant actual
async function deleteClassroom(req, res) {
  try {
    const tenantId = extractTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant no identificado en la sesión' });
    }

    const { id } = req.params;

    const existing = await query.get(
      'SELECT id, tenant_id FROM classrooms WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Aula no encontrada o no pertenece a esta institución' });
    }

    const schedulesCheck = await query.get(
      'SELECT COUNT(*)::int AS count FROM schedules WHERE classroom_id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    const activeCount = schedulesCheck ? parseInt(schedulesCheck.count, 10) : 0;
    if (activeCount > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar el aula porque tiene horarios activos asignados'
      });
    }

    await query.run(
      'DELETE FROM classrooms WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    res.json({ message: 'Aula eliminada exitosamente', id });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar aula', details: err.message });
  }
}

module.exports = {
  getClassrooms,
  createClassroom,
  updateClassroom,
  deleteClassroom
};
