import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export const DEFAULT_DAYS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado'
];

export const DEFAULT_TIME_SLOTS = [
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00'
];

const DEFAULT_INSTITUTION = 'Institución Académica';
const DEFAULT_PERIOD = '2026-2';
const STOP_WORDS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'e', 'en', 'para', 'por']);

/**
 * Normaliza un texto eliminando acentos y espacios sobrantes para comparaciones.
 */
function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Convierte una hora en formato HH:MM a minutos totales desde medianoche.
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== 'string' || !timeStr.includes(':')) {
    return NaN;
  }
  const [hStr, mStr] = timeStr.trim().split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return NaN;
  }
  return h * 60 + m;
}

/**
 * Sanitiza un segmento de texto para construir nombres de archivo seguros.
 */
export function sanitizeFilenameSegment(text, fallback = 'General') {
  const clean = String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return clean || fallback;
}

/**
 * Construye el nombre estandarizado del PDF: Horario_[Docente_o_Grupo]_[Periodo].pdf
 */
export function buildSchedulePdfFilename({
  teacherName = '',
  groupCode = '',
  period = DEFAULT_PERIOD
} = {}) {
  let targetRaw = 'Planta_Academica_General';
  if (teacherName && String(teacherName).trim()) {
    targetRaw = String(teacherName).trim();
  } else if (groupCode && String(groupCode).trim()) {
    targetRaw = `Grupo_${String(groupCode).trim()}`;
  }

  const targetSegment = sanitizeFilenameSegment(targetRaw, 'Planta_Academica_General');
  const periodSegment = sanitizeFilenameSegment(period, DEFAULT_PERIOD);

  return `Horario_${targetSegment}_${periodSegment}.pdf`;
}

/**
 * Extrae siglas institucionales a partir del nombre de la institución.
 */
export function getInstitutionAcronym(tenantName) {
  const raw = String(tenantName ?? '').trim();
  if (!raw) return 'GPA';

  const words = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/\s+/)
    .filter(Boolean);

  const significant = words.filter(w => !STOP_WORDS.has(w.toLowerCase()));
  const source = significant.length > 0 ? significant : words;

  if (source.length === 1) {
    return source[0].substring(0, 4).toUpperCase();
  }

  return source
    .slice(0, 5)
    .map(w => w[0].toUpperCase())
    .join('');
}

/**
 * Genera un folio único de control documental.
 */
export function generateControlFolio(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `GPA-${yyyy}${mm}${dd}-${suffix}`;
}

/**
 * Da formato limpio al contenido de una celda ocupada (materia, clave, grupo y aula).
 */
function formatScheduleCellEntry(item, { includeTeacher = true } = {}) {
  const code = String(item.subject_code || item.code || '').trim();
  const subject = String(item.subject_name || item.subject || 'Materia').trim();
  const group = String(item.group_code || 'G1').trim();
  const classroom = String(item.classroom_name || item.classroom || 'Sin aula').trim();
  const teacher = String(item.teacher_name || '').trim();

  const headerLine = code ? `[${code}] ${subject}` : subject;
  const detailLine = `Grupo: ${group} | Aula: ${classroom}`;

  if (includeTeacher && teacher) {
    return `${headerLine}\n${detailLine}\nDocente: ${teacher}`;
  }

  return `${headerLine}\n${detailLine}`;
}

/**
 * Construye los encabezados y filas de la matriz horaria (07:00 a 20:00 hrs, Lunes a Sábado).
 */
export function buildScheduleMatrix(
  schedules = [],
  {
    timeSlots = DEFAULT_TIME_SLOTS,
    days = DEFAULT_DAYS,
    includeTeacher = true
  } = {}
) {
  const head = [['Hora', ...days]];
  const safeSchedules = Array.isArray(schedules) ? schedules : [];

  const body = timeSlots.map((slot) => {
    const slotStartMin = parseTimeToMinutes(slot);
    const slotEndMin = slotStartMin + 60;

    const rowCells = days.map((day) => {
      const normalizedDay = normalizeText(day);
      const matchingItems = safeSchedules.filter((item) => {
        if (!item) return false;
        if (normalizeText(item.day_of_week) !== normalizedDay) return false;

        const startMin = parseTimeToMinutes(item.start_time);
        const endMin = parseTimeToMinutes(item.end_time);
        if (Number.isNaN(startMin) || Number.isNaN(endMin)) return false;

        return startMin < slotEndMin && endMin > slotStartMin;
      });

      if (matchingItems.length === 0) {
        return '';
      }

      return matchingItems
        .map((item) => formatScheduleCellEntry(item, { includeTeacher }))
        .join('\n\n');
    });

    return [`${slot} hrs`, ...rowCells];
  });

  return { head, body };
}

/**
 * Formatea fecha y hora de expedición legible para el pie de página.
 */
function formatIssuedTimestamp(date) {
  try {
    return date.toLocaleString('es-MX', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (_) {
    return date.toISOString();
  }
}

/**
 * Genera y descarga el PDF oficial de programación horaria en formato horizontal (landscape)
 * con membrete institucional, matriz horaria Lunes-Sábado y bloques de firma.
 */
export function generateOfficialSchedulePdf({
  schedules = [],
  tenantName = '',
  teacherName = '',
  groupCode = '',
  period = DEFAULT_PERIOD,
  cycleTitle = '',
  folio = '',
  issuedAt = new Date()
} = {}) {
  const institutionName = String(tenantName || '').trim() || DEFAULT_INSTITUTION;
  const acronym = getInstitutionAcronym(institutionName);
  const controlFolio = String(folio || '').trim() || generateControlFolio(issuedAt);
  const effectivePeriod = String(period || '').trim() || DEFAULT_PERIOD;
  const effectiveCycleTitle =
    String(cycleTitle || '').trim() ||
    `PROGRAMACIÓN ACADÉMICA OFICIAL • CICLO ${effectivePeriod}`;

  let scopeLabel = 'Planta Académica General';
  if (teacherName && String(teacherName).trim() && groupCode && String(groupCode).trim()) {
    scopeLabel = `Docente: ${String(teacherName).trim()} | Grupo: ${String(groupCode).trim()}`;
  } else if (teacherName && String(teacherName).trim()) {
    scopeLabel = `Docente: ${String(teacherName).trim()}`;
  } else if (groupCode && String(groupCode).trim()) {
    scopeLabel = `Grupo: ${String(groupCode).trim()}`;
  }

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 14;

  // --- MEMBRETE INSTITUCIONAL ---
  // Emblema institucional (recuadro con siglas)
  doc.setFillColor(25, 118, 210);
  doc.roundedRect(marginX, 10, 22, 18, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(acronym, marginX + 11, 20.5, { align: 'center' });

  // Nombre de institución y título del ciclo
  doc.setTextColor(25, 42, 86);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(institutionName.toUpperCase(), marginX + 27, 15.5);

  doc.setTextColor(66, 66, 66);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(effectiveCycleTitle, marginX + 27, 21.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Alcance: ${scopeLabel}`, marginX + 27, 27);

  // Bloque derecho del membrete: Folio de control único
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(25, 118, 210);
  doc.text(`Folio de Control: ${controlFolio}`, pageWidth - marginX, 15.5, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(97, 97, 97);
  doc.text(`Total de sesiones: ${Array.isArray(schedules) ? schedules.length : 0}`, pageWidth - marginX, 21.5, {
    align: 'right'
  });

  // Línea separadora bajo el membrete
  doc.setDrawColor(25, 118, 210);
  doc.setLineWidth(0.6);
  doc.line(marginX, 31, pageWidth - marginX, 31);

  // --- MATRIZ ESTRUCTURADA DE HORARIOS ---
  const { head, body } = buildScheduleMatrix(schedules, {
    includeTeacher: !(teacherName && String(teacherName).trim())
  });

  autoTable(doc, {
    head,
    body,
    startY: 35,
    margin: { left: marginX, right: marginX, bottom: 34 },
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.2,
      cellPadding: 2,
      valign: 'middle',
      overflow: 'linebreak',
      lineColor: [207, 216, 220],
      lineWidth: 0.2,
      textColor: [38, 50, 56]
    },
    headStyles: {
      fillColor: [25, 118, 210],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 8.5
    },
    columnStyles: {
      0: {
        cellWidth: 22,
        halign: 'center',
        fontStyle: 'bold',
        fillColor: [241, 245, 249]
      }
    }
  });

  // --- PIE DE PÁGINA Y BLOQUES DE FIRMA ---
  const lastTableY = doc.lastAutoTable?.finalY ?? 150;
  let signatureY = lastTableY + 14;

  if (signatureY > pageHeight - 24) {
    doc.addPage();
    signatureY = 36;
  } else {
    signatureY = Math.max(signatureY, pageHeight - 28);
  }

  const leftLineStart = marginX + 18;
  const leftLineEnd = marginX + 98;
  const rightLineStart = pageWidth - marginX - 98;
  const rightLineEnd = pageWidth - marginX - 18;

  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.4);
  doc.line(leftLineStart, signatureY, leftLineEnd, signatureY);
  doc.line(rightLineStart, signatureY, rightLineEnd, signatureY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(55, 71, 79);
  doc.text('Dirección Académica', (leftLineStart + leftLineEnd) / 2, signatureY + 4.5, { align: 'center' });
  doc.text('Docente', (rightLineStart + rightLineEnd) / 2, signatureY + 4.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text('Sello y Firma Autorizada', (leftLineStart + leftLineEnd) / 2, signatureY + 8.5, { align: 'center' });
  doc.text(
    teacherName && String(teacherName).trim() ? String(teacherName).trim() : 'Firma de Conformidad',
    (rightLineStart + rightLineEnd) / 2,
    signatureY + 8.5,
    { align: 'center' }
  );

  const issuedText = formatIssuedTimestamp(issuedAt);
  const footerY = pageHeight - 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(110, 110, 110);
  doc.text(`Expedición: ${issuedText}`, marginX, footerY);
  doc.text(`Folio: ${controlFolio}`, pageWidth - marginX, footerY, { align: 'right' });

  const filename = buildSchedulePdfFilename({
    teacherName,
    groupCode,
    period: effectivePeriod
  });

  doc.save(filename);

  return {
    doc,
    filename,
    folio: controlFolio,
    head,
    body
  };
}
