const ExcelJS = require('exceljs');

const SCHEDULE_EXCEL_COLUMNS = [
  { header: 'Folio Horario', key: 'id' },
  { header: 'Grupo', key: 'group_code' },
  { header: 'Clave Materia', key: 'subject_code' },
  { header: 'Nombre Materia', key: 'subject_name' },
  { header: 'Créditos', key: 'subject_credits' },
  { header: 'Profesor Titular', key: 'teacher_name' },
  { header: 'Nómina Docente', key: 'teacher_identifier' },
  { header: 'Aula', key: 'classroom_name' },
  { header: 'Edificio', key: 'classroom_building' },
  { header: 'Tipo Aula', key: 'classroom_type' },
  { header: 'Día', key: 'day_of_week' },
  { header: 'Hora Inicio', key: 'start_time' },
  { header: 'Hora Fin', key: 'end_time' }
];

/**
 * Construye un libro Excel (.xlsx) en memoria con la sábana oficial de horarios
 * usando ExcelJS, aplicando encabezado corporativo azul y ajuste automático de ancho.
 */
async function buildSchedulesExcelBuffer(rows = []) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Gestor de Planta Académica';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Sábana de Horarios');

  worksheet.columns = SCHEDULE_EXCEL_COLUMNS.map((col) => ({
    header: col.header,
    key: col.key,
    width: Math.max(12, col.header.length + 4)
  }));

  const safeRows = Array.isArray(rows) ? rows : [];
  for (const row of safeRows) {
    worksheet.addRow({
      id: row.id ?? '',
      group_code: row.group_code || 'G1',
      subject_code: row.subject_code ?? '',
      subject_name: row.subject_name ?? '',
      subject_credits: row.subject_credits ?? '',
      teacher_name: row.teacher_name ?? '',
      teacher_identifier: row.teacher_identifier ?? '',
      classroom_name: row.classroom_name ?? '',
      classroom_building: row.classroom_building ?? '',
      classroom_type: row.classroom_type ?? '',
      day_of_week: row.day_of_week ?? '',
      start_time: row.start_time ?? '',
      end_time: row.end_time ?? ''
    });
  }

  // Formato profesional de la fila de encabezados (azul corporativo, texto blanco en negrita y centrado)
  const headerRow = worksheet.getRow(1);
  headerRow.height = 24;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E3A8A' }
    };
    cell.font = {
      name: 'Calibri',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' }
    };
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle'
    };
  });

  // Autofit de ancho de columnas según el contenido máximo
  worksheet.columns.forEach((column) => {
    let maxLength = column.header ? String(column.header).length : 10;
    column.eachCell({ includeEmpty: false }, (cell) => {
      const valueStr = cell.value !== null && cell.value !== undefined ? String(cell.value) : '';
      if (valueStr.length > maxLength) {
        maxLength = valueStr.length;
      }
    });
    column.width = Math.max(12, Math.min(60, maxLength + 4));
  });

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

module.exports = {
  SCHEDULE_EXCEL_COLUMNS,
  buildSchedulesExcelBuffer
};
