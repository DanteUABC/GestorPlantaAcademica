const XLSX = require('xlsx');

const MAX_EXCEL_ROWS = 2000;

// Normaliza texto: minúsculas, sin acentos ni símbolos (para encabezados, días y búsquedas)
const normalizeKey = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

// Encabezado normalizado -> campo interno
const HEADER_ALIASES = {
  codigomateria: 'subject_code',
  codigo: 'subject_code',
  correoprofesor: 'teacher_email',
  correodocente: 'teacher_email',
  correomaestro: 'teacher_email',
  aula: 'classroom_name',
  salon: 'classroom_name',
  dia: 'day_of_week',
  horainicio: 'start_time',
  inicio: 'start_time',
  horafin: 'end_time',
  fin: 'end_time',
  cupo: 'max_students',
  maxalumnos: 'max_students',
  grupo: 'group_code',
  group: 'group_code',
  codigogrupo: 'group_code',
  groupcode: 'group_code'
};

const REQUIRED_FIELDS = {
  subject_code: 'Código Materia',
  teacher_email: 'Correo Profesor',
  classroom_name: 'Aula',
  day_of_week: 'Día',
  start_time: 'Hora Inicio',
  end_time: 'Hora Fin'
};

const DAY_NAMES = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado'
};

// Acepta 'H:MM', 'HH:MM', 'HH:MM:SS' o la fracción de día que guarda Excel para celdas de hora
function parseExcelTime(value) {
  let minutes;
  if (typeof value === 'number') {
    if (value < 0 || value >= 1) return null;
    minutes = Math.round(value * 24 * 60);
  } else {
    const m = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!m) return null;
    minutes = Number(m[1]) * 60 + Number(m[2]);
  }
  if (minutes >= 24 * 60) return null;
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

// Convierte las filas crudas de la hoja a objetos con los campos internos
function mapExcelRows(rawRows) {
  return rawRows.map((raw) => {
    const mapped = {};
    for (const [header, value] of Object.entries(raw)) {
      const field = HEADER_ALIASES[normalizeKey(header)];
      if (field && mapped[field] === undefined) mapped[field] = value;
    }
    return mapped;
  });
}

/**
 * Extrae, mapea y valida en memoria las filas de un archivo Excel (.xlsx) a partir de su Buffer.
 * Omite filas vacías o inválidas y reporta una lista estructurada de errores de lectura sin tocar BD ni disco.
 *
 * @param {Buffer} buffer - Buffer en memoria del archivo .xlsx
 * @returns {{ rows: Array<Object>, errors: Array<{ fila: number, error: string }>, missingColumns: Array<string> }}
 */
function parseExcelBuffer(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return {
      rows: [],
      errors: [{ fila: 0, error: 'El buffer del archivo Excel está vacío o es inválido.' }],
      missingColumns: []
    };
  }

  let rawRows;
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames?.[0];
    const sheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;
    if (!sheet) {
      return {
        rows: [],
        errors: [{ fila: 0, error: 'El archivo Excel no contiene hojas válidas.' }],
        missingColumns: []
      };
    }
    rawRows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
  } catch (err) {
    return {
      rows: [],
      errors: [{ fila: 0, error: `No se pudo leer el archivo Excel: ${err.message}` }],
      missingColumns: []
    };
  }

  if (!rawRows || rawRows.length === 0) {
    return {
      rows: [],
      errors: [{ fila: 1, error: 'El archivo Excel no contiene filas de datos.' }],
      missingColumns: []
    };
  }

  // Verificar columnas obligatorias presentes en el encabezado
  const presentFields = new Set();
  Object.keys(rawRows[0]).forEach((h) => {
    const f = HEADER_ALIASES[normalizeKey(h)];
    if (f) presentFields.add(f);
  });

  const missingKeys = Object.keys(REQUIRED_FIELDS).filter((f) => !presentFields.has(f));
  if (missingKeys.length > 0) {
    const missingColumns = missingKeys.map((f) => REQUIRED_FIELDS[f]);
    return {
      rows: [],
      errors: [
        {
          fila: 1,
          error: `Faltan columnas obligatorias en el Excel: ${missingColumns.join(', ')}`
        }
      ],
      missingColumns
    };
  }

  const mappedRows = mapExcelRows(rawRows);
  const validRows = [];
  const errors = [];

  for (let i = 0; i < mappedRows.length; i++) {
    const row = mappedRows[i];
    const fila = i + 2; // +1 base 1, +1 por encabezado

    // Detectar si toda la fila está vacía
    const isRowEmpty = Object.values(row).every(
      (val) => val === undefined || val === null || String(val).trim() === ''
    );
    if (isRowEmpty) {
      errors.push({ fila, error: 'Fila vacía omitida' });
      continue;
    }

    const rowErrors = [];

    const subjectCode = String(row.subject_code ?? '').trim();
    if (!subjectCode) {
      rowErrors.push('El campo "Código Materia" es obligatorio');
    }

    const teacherEmail = String(row.teacher_email ?? '').trim().toLowerCase();
    if (!teacherEmail) {
      rowErrors.push('El campo "Correo Profesor" es obligatorio');
    }

    const classroomName = String(row.classroom_name ?? '').trim();
    if (!classroomName) {
      rowErrors.push('El campo "Aula" es obligatorio');
    }

    const day = DAY_NAMES[normalizeKey(row.day_of_week)];
    if (!day) {
      rowErrors.push(`Día "${row.day_of_week ?? ''}" no es válido (use Lunes a Sábado)`);
    }

    const startTime = parseExcelTime(row.start_time);
    const endTime = parseExcelTime(row.end_time);
    if (!startTime) {
      rowErrors.push(`Hora de inicio "${row.start_time ?? ''}" no es válida (use HH:MM)`);
    }
    if (!endTime) {
      rowErrors.push(`Hora de fin "${row.end_time ?? ''}" no es válida (use HH:MM)`);
    }
    if (startTime && endTime && startTime >= endTime) {
      rowErrors.push('La hora de inicio debe ser anterior a la hora de fin');
    }

    let maxStudents = null;
    if (row.max_students !== undefined && row.max_students !== '') {
      const requested = Number(row.max_students);
      if (!Number.isInteger(requested) || requested <= 0) {
        rowErrors.push(`Cupo "${row.max_students}" no es válido (entero mayor a 0)`);
      } else {
        maxStudents = requested;
      }
    }

    if (rowErrors.length > 0) {
      rowErrors.forEach((error) => errors.push({ fila, error }));
      continue;
    }

    let groupCode = null;
    if (row.group_code !== undefined && row.group_code !== null && String(row.group_code).trim() !== '') {
      groupCode = String(row.group_code).trim();
    }

    validRows.push({
      fila,
      subject_code: subjectCode,
      teacher_email: teacherEmail,
      classroom_name: classroomName,
      day_of_week: day,
      start_time: startTime,
      end_time: endTime,
      ...(maxStudents !== null ? { max_students: maxStudents } : {}),
      ...(groupCode !== null ? { group_code: groupCode } : {})
    });
  }

  return {
    rows: validRows,
    errors,
    missingColumns: []
  };
}

module.exports = {
  MAX_EXCEL_ROWS,
  normalizeKey,
  HEADER_ALIASES,
  REQUIRED_FIELDS,
  DAY_NAMES,
  parseExcelTime,
  mapExcelRows,
  parseExcelBuffer
};
