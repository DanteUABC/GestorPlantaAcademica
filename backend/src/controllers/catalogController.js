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
      `SELECT sub.id, sub.code, sub.name, sub.credits, sub.tenant_id,
              COALESCE(COUNT(DISTINCT s.id), 0)::int AS assigned_groups
       FROM subjects sub
       LEFT JOIN schedules s ON s.subject_id = sub.id AND s.tenant_id = sub.tenant_id
       WHERE sub.tenant_id = ?
       GROUP BY sub.id, sub.code, sub.name, sub.credits, sub.tenant_id
       ORDER BY sub.code ASC, sub.name ASC`,
      [tenantId]
    );

    const formatted = (subjects || []).map(s => {
      const assigned = parseInt(s.assigned_groups || 0, 10);
      return {
        ...s,
        assigned_groups: assigned,
        assigned_groups_count: assigned,
        codigo: s.code,
        nombre: s.name,
        creditos: s.credits
      };
    });

    res.json(formatted);
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

// Update a subject
async function updateSubject(req, res) {
  try {
    const tenantId = req.tenant_id || req.user?.tenant_id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant no identificado en la sesión' });
    }

    const { id } = req.params;
    const rawCode = req.body.code !== undefined ? req.body.code : (req.body.codigo ?? req.body.clave);
    const rawName = req.body.name !== undefined ? req.body.name : req.body.nombre;
    const rawCredits = req.body.credits !== undefined ? req.body.credits : req.body.creditos;

    const existing = await query.get(
      'SELECT id, tenant_id, code, name, credits FROM subjects WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Materia no encontrada o no pertenece a esta institución' });
    }

    let cleanCode = existing.code;
    if (rawCode !== undefined) {
      if (!rawCode || !String(rawCode).trim()) {
        return res.status(400).json({ error: 'El código de la materia no puede estar vacío' });
      }
      cleanCode = String(rawCode).trim().toUpperCase();

      // Validar colisión de código en el mismo tenant excluyendo la materia actual
      const duplicate = await query.get(
        'SELECT id, code FROM subjects WHERE tenant_id = ? AND UPPER(code) = ? AND id != ?',
        [tenantId, cleanCode, id]
      );
      if (duplicate) {
        return res.status(409).json({ error: 'Ya existe una materia con ese código en esta institución' });
      }
    }

    let cleanName = existing.name;
    if (rawName !== undefined) {
      if (!rawName || !String(rawName).trim()) {
        return res.status(400).json({ error: 'El nombre de la materia no puede estar vacío' });
      }
      cleanName = String(rawName).trim();
    }

    let cleanCredits = existing.credits;
    if (rawCredits !== undefined) {
      const parsedCredits = Number(rawCredits);
      if (rawCredits === null || rawCredits === '' || !Number.isInteger(parsedCredits) || isNaN(parsedCredits) || parsedCredits <= 0) {
        return res.status(400).json({ error: 'Los créditos deben ser un número entero positivo mayor a cero' });
      }
      cleanCredits = parsedCredits;
    }

    await query.run(
      'UPDATE subjects SET code = ?, name = ?, credits = ? WHERE id = ? AND tenant_id = ?',
      [cleanCode, cleanName, cleanCredits, id, tenantId]
    );

    res.json({
      id: existing.id,
      tenant_id: tenantId,
      code: cleanCode,
      name: cleanName,
      credits: cleanCredits
    });
  } catch (err) {
    if (err.code === '23505' || (err.message && (err.message.includes('UNIQUE') || err.message.includes('unique')))) {
      return res.status(409).json({ error: 'Ya existe una materia con ese código en esta institución' });
    }
    res.status(500).json({ error: 'Error al actualizar materia', details: err.message });
  }
}

// Delete a subject
async function deleteSubject(req, res) {
  try {
    const tenantId = req.tenant_id || req.user?.tenant_id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant no identificado en la sesión' });
    }

    const { id } = req.params;

    const existing = await query.get(
      'SELECT id, tenant_id, code, name FROM subjects WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Materia no encontrada o no pertenece a esta institución' });
    }

    // Integridad Referencial de Negocio: verificar si tiene horarios asignados en schedules
    const schedulesCheck = await query.get(
      'SELECT COUNT(*)::int AS count FROM schedules WHERE subject_id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    const activeCount = schedulesCheck ? parseInt(schedulesCheck.count, 10) : 0;
    if (activeCount > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar la materia porque tiene horarios asignados en el periodo actual'
      });
    }

    await query.run(
      'DELETE FROM subjects WHERE id = ? AND tenant_id = ?',
      [id, tenantId]
    );

    res.json({
      message: 'Materia eliminada exitosamente',
      id
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar materia', details: err.message });
  }
}

// List teachers in the tenant (users with role 'Profesor')
async function getTeachers(req, res) {
  try {
    const teachers = await query.all(
      `SELECT u.id, u.nombre, u.apellidos,
              TRIM(CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellidos, ''))) AS name,
              u.email, u.email_activo, u.identificador, u.identificador AS identifier,
              COALESCE(u.horas_contratadas, 25) AS horas_contratadas,
              COALESCE(u.horas_contratadas, 25) AS max_hours,
              COALESCE(u.estatus, 'activo') AS estatus
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
  updateSubject,
  deleteSubject,
  getClassrooms,
  createClassroom,
  updateClassroom,
  deleteClassroom,
  getTeachers
};

// Exportar getTenants para compatibilidad con catalogController
const authController = require('./authController');
exports.getTenants = authController.getTenants;
