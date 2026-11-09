/**
 * Validador de empalmes de horario y restricciones horarias de docentes.
 *
 * Dos bloques se empalman cuando comparten tiempo dentro del mismo día:
 *   inicioA < finB  Y  finA > inicioB
 * Los bloques continuos (08:00-09:00 y 09:00-10:00) NO se empalman.
 */

class OverlapValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OverlapValidationError';
  }
}

class TeacherRestrictionConflictError extends Error {
  constructor(message, restriction) {
    super(message);
    this.name = 'TeacherRestrictionConflictError';
    this.conflictType = 'TEACHER_RESTRICTION';
    this.status = 409;
    this.statusCode = 409;
    this.error = message;
    this.restriction = restriction;
  }

  toJSON() {
    return {
      conflictType: this.conflictType,
      error: this.message,
      message: this.message,
      restriction: this.restriction
    };
  }
}

const TIME_REGEX = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/**
 * Convierte 'H:MM' o 'HH:MM' a minutos desde las 00:00.
 * @throws {OverlapValidationError} si el valor está vacío o no tiene formato HH:MM.
 */
function timeToMinutes(value) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new OverlapValidationError('La hora es obligatoria y debe tener formato HH:MM');
  }
  const match = value.trim().match(TIME_REGEX);
  if (!match) {
    throw new OverlapValidationError(`Formato de hora inválido: "${value}" (use HH:MM)`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

function parseRange(schedule, label) {
  if (!schedule || typeof schedule !== 'object') {
    throw new OverlapValidationError(`El horario ${label} es obligatorio`);
  }
  const start = timeToMinutes(schedule.start_time);
  const end = timeToMinutes(schedule.end_time);
  if (start >= end) {
    throw new OverlapValidationError(
      `El horario ${label} es inválido: la hora de inicio debe ser anterior a la de fin`
    );
  }
  return { start, end };
}

/**
 * Indica si dos asignaciones se empalman.
 * Cada una es { start_time: 'HH:MM', end_time: 'HH:MM', day_of_week?: string }.
 * Si ambas traen day_of_week y son distintos, no hay empalme.
 *
 * @returns {boolean}
 * @throws {OverlapValidationError} ante datos vacíos o con formato inválido.
 */
function hasOverlap(scheduleA, scheduleB) {
  const a = parseRange(scheduleA, 'A');
  const b = parseRange(scheduleB, 'B');

  if (scheduleA.day_of_week && scheduleB.day_of_week && scheduleA.day_of_week !== scheduleB.day_of_week) {
    return false;
  }

  return a.start < b.end && a.end > b.start;
}

/**
 * Consulta la tabla teacher_restrictions antes de verificar cruces de materias.
 * Soporta invocación como validateTeacherRestrictions(params, dbClient) o validateTeacherRestrictions(dbClient, params).
 *
 * @throws {TeacherRestrictionConflictError} con conflictType: "TEACHER_RESTRICTION" y objeto restriction si existe intersección.
 */
async function validateTeacherRestrictions(arg1, arg2) {
  let params;
  let dbClient;

  if (arg1 && (typeof arg1.query === 'function' || typeof arg1.get === 'function')) {
    dbClient = arg1;
    params = arg2;
  } else {
    params = arg1;
    dbClient = arg2;
  }

  if (!params || typeof params !== 'object') {
    return null;
  }

  const { tenant_id, teacher_id, day_of_week, start_time, end_time } = params;
  if (!tenant_id || !teacher_id || !day_of_week || !start_time || !end_time) {
    return null;
  }

  if (!dbClient) {
    const dbModule = require('../db');
    dbClient = dbModule.pool || dbModule;
  }

  const sql = `
    SELECT tr.*,
           u.nombre as teacher_name,
           u.apellidos as teacher_lastname
    FROM teacher_restrictions tr
    JOIN users u ON tr.teacher_id = u.id
    WHERE tr.tenant_id = $1
      AND tr.teacher_id = $2
      AND tr.day_of_week = $3
      AND tr.start_time < $5
      AND tr.end_time > $4
  `;
  const queryParams = [tenant_id, teacher_id, day_of_week, start_time, end_time];

  let rows = [];
  if (typeof dbClient.query === 'function') {
    const res = await dbClient.query(sql, queryParams);
    rows = (res && res.rows) ? res.rows : [];
  } else if (typeof dbClient.all === 'function') {
    rows = await dbClient.all(
      `SELECT tr.*, u.nombre as teacher_name, u.apellidos as teacher_lastname
       FROM teacher_restrictions tr
       JOIN users u ON tr.teacher_id = u.id
       WHERE tr.tenant_id = ? AND tr.teacher_id = ? AND tr.day_of_week = ? AND tr.start_time < ? AND tr.end_time > ?`,
      [tenant_id, teacher_id, day_of_week, end_time, start_time]
    );
  }

  if (rows && rows.length > 0) {
    const row = rows[0];
    const firstName = row.teacher_name ? String(row.teacher_name).trim() : '';
    const lastName = row.teacher_lastname ? String(row.teacher_lastname).trim() : '';
    const teacherFullName =
      firstName && lastName && !firstName.includes(lastName)
        ? `${firstName} ${lastName}`.trim()
        : (firstName || lastName || 'Docente');

    const reasonText =
      row.reason !== undefined && row.reason !== null && String(row.reason).trim() !== ''
        ? String(row.reason).trim()
        : 'No especificado';

    const restriction = {
      id: row.id,
      tenant_id: row.tenant_id,
      teacher_id: row.teacher_id,
      day_of_week: row.day_of_week,
      start_time: row.start_time,
      end_time: row.end_time,
      reason: reasonText
    };

    const message = `¡Restricción Horaria Docente detectada! El docente ${teacherFullName} no está disponible el día ${row.day_of_week} de ${row.start_time} a ${row.end_time} (Motivo: ${reasonText}).`;

    throw new TeacherRestrictionConflictError(message, restriction);
  }

  return null;
}

module.exports = {
  hasOverlap,
  timeToMinutes,
  OverlapValidationError,
  TeacherRestrictionConflictError,
  validateTeacherRestrictions
};
