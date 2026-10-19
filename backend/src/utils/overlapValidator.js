/**
 * Validador puro de empalmes de horario (sin acceso a BD ni a Express).
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

module.exports = { hasOverlap, timeToMinutes, OverlapValidationError };
