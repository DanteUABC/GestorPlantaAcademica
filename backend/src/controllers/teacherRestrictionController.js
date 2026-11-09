const db = require('../db');
const pool = db.pool || db;
const { timeToMinutes, hasOverlap } = require('../utils/overlapValidator');
const { ALLOWED_RESTRICTION_DAYS } = require('../utils/teacherRestrictionsMigration');

/**
 * Resuelve el teacherId objetivo (soportando el alias 'me') y valida RBAC:
 * - Coordinador / Administrador: acceso permitido a cualquier docente de su tenant.
 * - Profesor: acceso permitido únicamente si teacherId === req.user.id o teacherId === 'me'.
 */
function resolveTeacherAccess(req) {
  const tenantId = req.tenant_id || req.user?.tenant_id;
  const currentUserId = String(req.user?.id || req.user?.sub || '').trim();
  const rawRole = String(req.user?.role_name || req.user?.role || '').trim().toLowerCase();

  const rawParamId = String(req.params.teacherId || '').trim();
  const targetTeacherId = rawParamId.toLowerCase() === 'me' ? currentUserId : rawParamId;

  const isCoordinatorOrAdmin = rawRole === 'coordinador' || rawRole === 'administrador';
  const isTeacher = rawRole === 'profesor';

  if (!isCoordinatorOrAdmin && !isTeacher) {
    return {
      allowed: false,
      status: 403,
      error: 'Acceso denegado: Rol no autorizado para gestionar restricciones horarias'
    };
  }

  if (isTeacher && targetTeacherId !== currentUserId) {
    return {
      allowed: false,
      status: 403,
      error: 'Acceso denegado: Un profesor solo puede consultar o modificar sus propias restricciones'
    };
  }

  return {
    allowed: true,
    tenantId,
    currentUserId,
    targetTeacherId,
    isCoordinatorOrAdmin,
    isTeacher
  };
}

/**
 * GET /api/teachers/:teacherId/restrictions
 * Consulta las restricciones horarias de un profesor filtradas por tenant_id y ordenadas por día y start_time.
 */
async function getTeacherRestrictions(req, res) {
  try {
    const access = resolveTeacherAccess(req);
    if (!access.allowed) {
      return res.status(access.status).json({ error: access.error });
    }

    const { tenantId, targetTeacherId } = access;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant no identificado en la sesión' });
    }
    if (!targetTeacherId) {
      return res.status(400).json({ error: 'Identificador de profesor requerido' });
    }

    const result = await pool.query(
      `SELECT id, tenant_id, teacher_id, day_of_week, start_time, end_time, reason, created_at
       FROM teacher_restrictions
       WHERE tenant_id = $1 AND teacher_id = $2
       ORDER BY
         CASE day_of_week
           WHEN 'Lunes' THEN 1
           WHEN 'Martes' THEN 2
           WHEN 'Miércoles' THEN 3
           WHEN 'Jueves' THEN 4
           WHEN 'Viernes' THEN 5
           WHEN 'Sábado' THEN 6
           WHEN 'Domingo' THEN 7
           ELSE 8
         END ASC,
         start_time ASC`,
      [tenantId, targetTeacherId]
    );

    return res.status(200).json(result.rows || []);
  } catch (err) {
    return res.status(500).json({
      error: 'Error al consultar restricciones del profesor',
      details: err.message
    });
  }
}

/**
 * POST /api/teachers/:teacherId/restrictions
 * Registra una nueva restricción horaria validando start_time < end_time (HTTP 400)
 * y previniendo empalmes en el mismo día (HTTP 409).
 */
async function createTeacherRestriction(req, res) {
  try {
    const access = resolveTeacherAccess(req);
    if (!access.allowed) {
      return res.status(access.status).json({ error: access.error });
    }

    const { tenantId, targetTeacherId } = access;
    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant no identificado en la sesión' });
    }
    if (!targetTeacherId) {
      return res.status(400).json({ error: 'Identificador de profesor requerido' });
    }

    const rawDay = req.body?.day_of_week !== undefined ? req.body.day_of_week : req.body?.dia;
    const rawStartTime = req.body?.start_time !== undefined ? req.body.start_time : req.body?.hora_inicio;
    const rawEndTime = req.body?.end_time !== undefined ? req.body.end_time : req.body?.hora_fin;
    const rawReason = req.body?.reason !== undefined ? req.body.reason : req.body?.motivo;

    if (!rawDay || !ALLOWED_RESTRICTION_DAYS.includes(String(rawDay).trim())) {
      return res.status(400).json({
        error: `Día de la semana inválido. Valores permitidos: ${ALLOWED_RESTRICTION_DAYS.join(', ')}`
      });
    }

    const dayOfWeek = String(rawDay).trim();
    const cleanStartTime = typeof rawStartTime === 'string' ? rawStartTime.trim() : '';
    const cleanEndTime = typeof rawEndTime === 'string' ? rawEndTime.trim() : '';

    // Conversión y validación Fail-Fast con timeToMinutes (de overlapValidator.js)
    let startMinutes;
    let endMinutes;
    try {
      startMinutes = timeToMinutes(cleanStartTime);
      endMinutes = timeToMinutes(cleanEndTime);
    } catch (validationErr) {
      return res.status(400).json({ error: validationErr.message });
    }

    if (startMinutes >= endMinutes) {
      return res.status(400).json({
        error: 'Rango de horario inválido: la hora de inicio debe ser estrictamente menor a la hora de fin (start_time < end_time)'
      });
    }

    // Verificar que el docente exista y pertenezca al mismo tenant_id
    const teacherCheck = await pool.query(
      'SELECT id, tenant_id FROM users WHERE id = $1 AND tenant_id = $2',
      [targetTeacherId, tenantId]
    );
    if (!teacherCheck.rows || teacherCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Profesor no encontrado o no pertenece a esta institución'
      });
    }

    // Consultar restricciones existentes del profesor en ese day_of_week dentro del mismo tenant_id
    const existingRes = await pool.query(
      `SELECT id, tenant_id, teacher_id, day_of_week, start_time, end_time, reason
       FROM teacher_restrictions
       WHERE tenant_id = $1 AND teacher_id = $2 AND day_of_week = $3
       ORDER BY start_time ASC`,
      [tenantId, targetTeacherId, dayOfWeek]
    );

    const existingRestrictions = existingRes.rows || [];
    for (const existing of existingRestrictions) {
      const existingStart = timeToMinutes(existing.start_time);
      const existingEnd = timeToMinutes(existing.end_time);

      // Intersección de rangos: inicioA < finB && finA > inicioB
      const overlaps =
        (startMinutes < existingEnd && endMinutes > existingStart) ||
        hasOverlap(
          { day_of_week: dayOfWeek, start_time: cleanStartTime, end_time: cleanEndTime },
          { day_of_week: existing.day_of_week, start_time: existing.start_time, end_time: existing.end_time }
        );

      if (overlaps) {
        return res.status(409).json({
          error: `Empalme de restricción detectado con el bloque existente (${existing.day_of_week} ${existing.start_time} - ${existing.end_time})`,
          conflict: existing
        });
      }
    }

    const id = 'tr-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
    const cleanReason =
      rawReason !== undefined && rawReason !== null && String(rawReason).trim() !== ''
        ? String(rawReason).trim()
        : null;

    const insertRes = await pool.query(
      `INSERT INTO teacher_restrictions (id, tenant_id, teacher_id, day_of_week, start_time, end_time, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, tenant_id, teacher_id, day_of_week, start_time, end_time, reason, created_at`,
      [id, tenantId, targetTeacherId, dayOfWeek, cleanStartTime, cleanEndTime, cleanReason]
    );

    return res.status(201).json(insertRes.rows[0]);
  } catch (err) {
    return res.status(500).json({
      error: 'Error al registrar restricción del profesor',
      details: err.message
    });
  }
}

/**
 * DELETE /api/teachers/restrictions/:restrictionId
 * Elimina una restricción horaria verificando permisos RBAC y aislamiento WHERE tenant_id = $1.
 */
async function deleteTeacherRestriction(req, res) {
  try {
    const tenantId = req.tenant_id || req.user?.tenant_id;
    const currentUserId = String(req.user?.id || req.user?.sub || '').trim();
    const rawRole = String(req.user?.role_name || req.user?.role || '').trim().toLowerCase();

    const isCoordinatorOrAdmin = rawRole === 'coordinador' || rawRole === 'administrador';
    const isTeacher = rawRole === 'profesor';

    if (!isCoordinatorOrAdmin && !isTeacher) {
      return res.status(403).json({
        error: 'Acceso denegado: Rol no autorizado para eliminar restricciones horarias'
      });
    }

    if (!tenantId) {
      return res.status(400).json({ error: 'Tenant no identificado en la sesión' });
    }

    const restrictionId = String(req.params.restrictionId || '').trim();
    if (!restrictionId) {
      return res.status(400).json({ error: 'Identificador de restricción requerido' });
    }

    // Verificar existencia dentro del mismo tenant_id
    const existingRes = await pool.query(
      `SELECT id, tenant_id, teacher_id, day_of_week, start_time, end_time, reason
       FROM teacher_restrictions
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, restrictionId]
    );

    if (!existingRes.rows || existingRes.rows.length === 0) {
      return res.status(404).json({
        error: 'Restricción no encontrada o no pertenece a esta institución'
      });
    }

    const existing = existingRes.rows[0];

    // Si es profesor, verificar que la restricción le pertenezca
    if (isTeacher && String(existing.teacher_id) !== currentUserId) {
      return res.status(403).json({
        error: 'Acceso denegado: No puedes eliminar restricciones de otro profesor'
      });
    }

    // Eliminación asegurando WHERE tenant_id = $1
    await pool.query(
      `DELETE FROM teacher_restrictions WHERE tenant_id = $1 AND id = $2`,
      [tenantId, restrictionId]
    );

    return res.status(200).json({
      message: 'Restricción eliminada exitosamente',
      id: restrictionId
    });
  } catch (err) {
    return res.status(500).json({
      error: 'Error al eliminar restricción del profesor',
      details: err.message
    });
  }
}

module.exports = {
  getTeacherRestrictions,
  createTeacherRestriction,
  deleteTeacherRestriction
};
