const db = require('../db');
const query = db.query;
const pool = db.pool || db;
const { invalidateUserTokens } = require('../middleware/auth');
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

// List teachers in the tenant (users with role 'Profesor') with workload metrics calculated on the fly
async function getTeachers(req, res) {
  try {
    const tenantId = req.tenant_id || req.user?.tenant_id;
    const teachers = await query.all(
      `SELECT u.id, u.nombre, u.apellidos,
              TRIM(CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellidos, ''))) AS name,
              u.email, u.email_activo, u.identificador, u.identificador AS identifier,
              COALESCE(u.horas_contratadas, 25)::int AS horas_contratadas,
              COALESCE(u.horas_contratadas, 25)::int AS max_hours,
              COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (s.end_time::time - s.start_time::time)) / 3600.0)::numeric, 2), 0)::float AS horas_asignadas,
              COALESCE(COUNT(DISTINCT s.group_code), 0)::int AS grupos_asignados_count,
              COALESCE(u.estatus, 'activo') AS estatus
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN schedules s ON s.teacher_id = u.id AND s.tenant_id = u.tenant_id
       WHERE u.tenant_id = ? AND (r.name = 'Profesor' OR r.nombre = 'Profesor')
       GROUP BY u.id, u.nombre, u.apellidos, u.email, u.email_activo, u.identificador, u.horas_contratadas, u.estatus
       ORDER BY name ASC`,
      [tenantId]
    );

    const formatted = (teachers || []).map(t => {
      const horasContratadas = Number(t.horas_contratadas) || 25;
      const horasAsignadas = Number(t.horas_asignadas) || 0;
      const gruposCount = Number(t.grupos_asignados_count) || 0;
      return {
        id: t.id,
        name: t.name,
        nombre: t.nombre,
        apellidos: t.apellidos,
        email: t.email,
        email_activo: t.email_activo ?? true,
        identificador: t.identificador,
        identifier: t.identifier || t.identificador,
        horas_contratadas: horasContratadas,
        max_hours: horasContratadas,
        horas_asignadas: horasAsignadas,
        grupos_asignados_count: gruposCount,
        estatus: t.estatus || 'activo'
      };
    });

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar profesores', details: err.message });
  }
}


// PUT /api/teachers/:id/revoke-email o POST /api/teachers/:id/deactivate-email
// Revoca el correo institucional de un docente preservando intacto su registro (id) y llaves foráneas
async function revokeTeacherEmail(req, res) {
  try {
    const tenantId = req.tenant_id || req.user?.tenant_id;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant no identificado en la sesión' });
    }

    const { id } = req.params;
    if (!id || !String(id).trim()) {
      return res.status(400).json({ error: 'Identificador de profesor no proporcionado' });
    }

    const teacherId = String(id).trim();
    const operatorUserId = req.user?.id || req.user?.sub || 'system';
    const reason = req.body?.reason || req.body?.motivo || 'Revocación de correo institucional';

    let client = null;
    if (typeof pool.connect === 'function') {
      client = await pool.connect();
    } else {
      client = {
        query: async (sql, params) => pool.query(sql, params),
        release: () => {}
      };
    }

    try {
      await client.query('BEGIN');

      // 1. Verificar si el usuario existe y pertenece al tenant_id de la sesión activa
      const userRes = await client.query(
        `SELECT u.id, u.tenant_id, u.nombre, u.apellidos, u.email, u.email_activo, u.role_id,
                u.identificador, u.horas_contratadas, u.estatus, u.email_revocado_at
         FROM users u
         WHERE u.id = $1
         FOR UPDATE`,
        [teacherId]
      );

      if (!userRes || !userRes.rows || userRes.rows.length === 0 || userRes.rows[0].tenant_id !== tenantId) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Profesor no encontrado o no pertenece a esta institución' });
      }

      const teacher = userRes.rows[0];

      // Verificar que el usuario tenga rol de Profesor
      let isTeacher = teacher.role_id === 'role-teacher' || teacher.role_id === '2';
      if (!isTeacher && teacher.role_id) {
        const roleRes = await client.query('SELECT name, nombre FROM roles WHERE id = $1', [teacher.role_id]);
        if (roleRes.rows.length > 0) {
          isTeacher = roleRes.rows[0].name === 'Profesor' || roleRes.rows[0].nombre === 'Profesor';
        }
      }
      if (!isTeacher) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'El usuario especificado no cuenta con rol de Profesor' });
      }

      // 2. Comportamiento idempotente: si ya estaba dado de baja
      const isAlreadyRevoked = teacher.email_activo === false && (teacher.email === null || String(teacher.email).startsWith('baja_'));

      if (!isAlreadyRevoked) {
        const previousEmail = teacher.email;

        // Registrar auditoría en la bitácora
        await client.query(
          `INSERT INTO bitacora_revocaciones_email (tenant_id, user_id, email_anterior, revocado_por, motivo, revocado_at)
           VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
          [tenantId, teacherId, previousEmail, operatorUserId, reason]
        );

        // Desvincular correo institucional, marcar email_activo = false, registrar email_revocado_at e incrementar token_version
        await client.query(
          `UPDATE users
           SET email = NULL,
               email_activo = FALSE,
               email_revocado_at = CURRENT_TIMESTAMP,
               token_version = COALESCE(token_version, 1) + 1
           WHERE id = $1 AND tenant_id = $2`,
          [teacherId, tenantId]
        );
      }

      // 3. Invalidar tokens de sesión activos para dicho usuario
      if (typeof invalidateUserTokens === 'function') {
        invalidateUserTokens(teacherId);
      }

      // 4. Obtener el registro del profesor actualizado calculando métricas de carga
      const updatedRes = await client.query(
        `SELECT u.id, u.nombre, u.apellidos,
                TRIM(CONCAT(COALESCE(u.nombre, ''), ' ', COALESCE(u.apellidos, ''))) AS name,
                u.email, u.email_activo, u.identificador, u.identificador AS identifier,
                COALESCE(u.horas_contratadas, 25)::int AS horas_contratadas,
                COALESCE(u.horas_contratadas, 25)::int AS max_hours,
                COALESCE(ROUND(SUM(EXTRACT(EPOCH FROM (s.end_time::time - s.start_time::time)) / 3600.0)::numeric, 2), 0)::float AS horas_asignadas,
                COALESCE(COUNT(DISTINCT s.group_code), 0)::int AS grupos_asignados_count,
                COALESCE(u.estatus, 'activo') AS estatus,
                u.email_revocado_at
         FROM users u
         JOIN roles r ON u.role_id = r.id
         LEFT JOIN schedules s ON s.teacher_id = u.id AND s.tenant_id = u.tenant_id
         WHERE u.id = $1 AND u.tenant_id = $2
         GROUP BY u.id, u.nombre, u.apellidos, u.email, u.email_activo, u.identificador, u.horas_contratadas, u.estatus, u.email_revocado_at`,
        [teacherId, tenantId]
      );

      await client.query('COMMIT');

      const updatedTeacher = (updatedRes && updatedRes.rows && updatedRes.rows[0]) ? updatedRes.rows[0] : {
        ...teacher,
        email: null,
        email_activo: false
      };

      const horasContratadas = Number(updatedTeacher.horas_contratadas) || 25;
      const horasAsignadas = Number(updatedTeacher.horas_asignadas) || 0;
      const gruposCount = Number(updatedTeacher.grupos_asignados_count) || 0;

      const teacherData = {
        id: updatedTeacher.id,
        name: updatedTeacher.name,
        nombre: updatedTeacher.nombre,
        apellidos: updatedTeacher.apellidos,
        email: updatedTeacher.email,
        email_activo: updatedTeacher.email_activo ?? false,
        identificador: updatedTeacher.identificador,
        identifier: updatedTeacher.identifier || updatedTeacher.identificador,
        horas_contratadas: horasContratadas,
        max_hours: horasContratadas,
        horas_asignadas: horasAsignadas,
        grupos_asignados_count: gruposCount,
        estatus: updatedTeacher.estatus || 'activo',
        email_revocado_at: updatedTeacher.email_revocado_at
      };

      return res.status(200).json({
        message: isAlreadyRevoked
          ? 'El correo del docente ya se encontraba revocado previamente'
          : 'Correo institucional revocado exitosamente',
        ...teacherData,
        teacher: teacherData
      });
    } catch (txErr) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (_) {}
      }
      throw txErr;
    } finally {
      if (client && typeof client.release === 'function') {
        client.release();
      }
    }
  } catch (err) {
    return res.status(500).json({
      error: 'Error al revocar correo del docente',
      details: err.message
    });
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
  getTeachers,
  revokeTeacherEmail
};

// Exportar getTenants para compatibilidad con catalogController
const authController = require('./authController');
exports.getTenants = authController.getTenants;
