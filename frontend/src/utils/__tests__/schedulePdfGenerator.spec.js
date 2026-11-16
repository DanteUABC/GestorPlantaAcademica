import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockDoc, mockJsPDF, mockAutoTable } = vi.hoisted(() => {
  const docInstance = {
    internal: {
      pageSize: {
        getWidth: vi.fn(() => 297),
        getHeight: vi.fn(() => 210)
      }
    },
    lastAutoTable: { finalY: 145 },
    setFillColor: vi.fn(),
    roundedRect: vi.fn(),
    rect: vi.fn(),
    setTextColor: vi.fn(),
    setFont: vi.fn(),
    setFontSize: vi.fn(),
    text: vi.fn(),
    setDrawColor: vi.fn(),
    setLineWidth: vi.fn(),
    line: vi.fn(),
    addPage: vi.fn(),
    save: vi.fn()
  };

  return {
    mockDoc: docInstance,
    mockJsPDF: vi.fn(function MockJsPDF() {
      return docInstance;
    }),
    mockAutoTable: vi.fn()
  };
});

vi.mock('jspdf', () => ({
  jsPDF: mockJsPDF,
  default: mockJsPDF
}));

vi.mock('jspdf-autotable', () => ({
  default: mockAutoTable,
  autoTable: mockAutoTable
}));

import {
  DEFAULT_DAYS,
  DEFAULT_TIME_SLOTS,
  buildScheduleMatrix,
  buildSchedulePdfFilename,
  getInstitutionAcronym,
  generateOfficialSchedulePdf
} from '../schedulePdfGenerator';

const sampleSchedules = [
  {
    id: 'sch-1',
    subject_code: 'MAT-101',
    subject_name: 'Cálculo Diferencial',
    group_code: 'G1',
    classroom_name: 'Aula A-101',
    teacher_name: 'Dra. Elena Salgado Núñez',
    day_of_week: 'Lunes',
    start_time: '08:00',
    end_time: '10:00'
  },
  {
    id: 'sch-2',
    subject_code: 'INF-204',
    subject_name: 'Arquitectura de Software',
    group_code: 'G2',
    classroom_name: 'Lab Cómputo 1',
    teacher_name: 'Ing. Carlos Vega',
    day_of_week: 'Miercoles',
    start_time: '14:00',
    end_time: '15:00'
  }
];

describe('schedulePdfGenerator.js - Generador PDF Oficial (Task 4.1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDoc.lastAutoTable = { finalY: 145 };
  });

  it('genera el PDF en orientación horizontal (landscape) con membrete institucional y folio de control', () => {
    const result = generateOfficialSchedulePdf({
      schedules: sampleSchedules,
      tenantName: 'Instituto Tecnológico Central',
      teacherName: 'Dra. Elena Salgado Núñez',
      period: '2026-2',
      folio: 'GPA-20261115-TEST',
      issuedAt: new Date('2026-11-15T10:30:00')
    });

    expect(mockJsPDF).toHaveBeenCalledWith({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const renderedTexts = mockDoc.text.mock.calls.map(call => String(call[0]));
    expect(renderedTexts).toContain('ITC');
    expect(renderedTexts).toContain('INSTITUTO TECNOLÓGICO CENTRAL');
    expect(renderedTexts.some(t => t.includes('CICLO 2026-2'))).toBe(true);
    expect(renderedTexts.some(t => t.includes('Docente: Dra. Elena Salgado Núñez'))).toBe(true);
    expect(renderedTexts.some(t => t.includes('Folio de Control: GPA-20261115-TEST'))).toBe(true);
    expect(result.folio).toBe('GPA-20261115-TEST');
  });

  it('usa "Planta Académica General" y respaldo institucional cuando no hay filtros ni tenantName', () => {
    generateOfficialSchedulePdf({
      schedules: sampleSchedules,
      tenantName: '',
      teacherName: '',
      groupCode: '',
      period: '2026-2'
    });

    const renderedTexts = mockDoc.text.mock.calls.map(call => String(call[0]));
    expect(renderedTexts).toContain('IA');
    expect(renderedTexts).toContain('INSTITUCIÓN ACADÉMICA');
    expect(getInstitutionAcronym('')).toBe('GPA');
    expect(renderedTexts.some(t => t.includes('Alcance: Planta Académica General'))).toBe(true);
    expect(mockDoc.save).toHaveBeenCalledWith('Horario_Planta_Academica_General_2026-2.pdf');
  });

  it('construye la matriz de horarios con autoTable de Lunes a Sábado (07:00 a 20:00 hrs) sin empalmes visuales', () => {
    generateOfficialSchedulePdf({
      schedules: sampleSchedules,
      tenantName: 'Universidad Autónoma',
      teacherName: 'Dra. Elena Salgado Núñez',
      period: '2026-2'
    });

    expect(mockAutoTable).toHaveBeenCalledTimes(1);
    const [docArg, tableOptions] = mockAutoTable.mock.calls[0];
    expect(docArg).toBe(mockDoc);
    expect(tableOptions.head).toEqual([['Hora', ...DEFAULT_DAYS]]);
    expect(tableOptions.body).toHaveLength(DEFAULT_TIME_SLOTS.length);
    expect(tableOptions.body[0][0]).toBe('07:00 hrs');
    expect(tableOptions.body[tableOptions.body.length - 1][0]).toBe('20:00 hrs');

    // Lunes 08:00 - 10:00 ocupa filas de 08:00 (idx 1) y 09:00 (idx 2), columna Lunes (idx 1)
    expect(tableOptions.body[1][1]).toContain('[MAT-101] Cálculo Diferencial');
    expect(tableOptions.body[1][1]).toContain('Grupo: G1 | Aula: Aula A-101');
    expect(tableOptions.body[2][1]).toContain('[MAT-101] Cálculo Diferencial');

    // Miércoles 14:00 - 15:00 (idx 7, columna Miércoles idx 3) incluso si viene sin acento
    expect(tableOptions.body[7][3]).toContain('[INF-204] Arquitectura de Software');
    expect(tableOptions.body[7][3]).toContain('Grupo: G2 | Aula: Lab Cómputo 1');

    // Celdas no ocupadas permanecen vacías
    expect(tableOptions.body[0][1]).toBe('');
    expect(tableOptions.body[1][2]).toBe('');
  });

  it('incluye en el pie de página fecha/hora de expedición, folio y bloques de firma para Dirección Académica y Docente', () => {
    generateOfficialSchedulePdf({
      schedules: sampleSchedules,
      tenantName: 'Instituto Tecnológico Central',
      teacherName: 'Dra. Elena Salgado Núñez',
      folio: 'GPA-20261115-SIGN',
      issuedAt: new Date('2026-11-15T14:45:00')
    });

    const renderedTexts = mockDoc.text.mock.calls.map(call => String(call[0]));
    expect(renderedTexts).toContain('Dirección Académica');
    expect(renderedTexts).toContain('Docente');
    expect(renderedTexts.some(t => t.startsWith('Expedición:'))).toBe(true);
    expect(renderedTexts).toContain('Folio: GPA-20261115-SIGN');
    expect(mockDoc.line.mock.calls.length).toBeGreaterThanOrEqual(3);

    // Si la tabla ocupa casi toda la hoja, agrega página antes de las firmas
    mockDoc.lastAutoTable = { finalY: 190 };
    generateOfficialSchedulePdf({
      schedules: sampleSchedules,
      tenantName: 'Instituto Tecnológico Central'
    });
    expect(mockDoc.addPage).toHaveBeenCalledTimes(1);
  });

  it('estandariza y sanitiza el nombre de archivo Horario_[Docente_o_Grupo]_[Periodo].pdf', () => {
    expect(
      buildSchedulePdfFilename({
        teacherName: 'Dra. Elena Salgado Núñez',
        period: '2026-2'
      })
    ).toBe('Horario_Dra_Elena_Salgado_Nunez_2026-2.pdf');

    expect(
      buildSchedulePdfFilename({
        groupCode: 'G-501',
        period: '2026-2'
      })
    ).toBe('Horario_Grupo_G-501_2026-2.pdf');

    expect(buildSchedulePdfFilename()).toBe('Horario_Planta_Academica_General_2026-2.pdf');
    expect(getInstitutionAcronym('Instituto Tecnológico Central')).toBe('ITC');

    const { body } = buildScheduleMatrix(sampleSchedules, { includeTeacher: true });
    expect(body[1][1]).toContain('Docente: Dra. Elena Salgado Núñez');
  });
});
