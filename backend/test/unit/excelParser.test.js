import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRequire } from 'module';
import XLSX from 'xlsx';

const require = createRequire(import.meta.url);
const fs = require('fs');
const { pool } = require('../../src/db');
const {
  parseExcelBuffer,
  mapExcelRows,
  parseExcelTime,
  normalizeKey
} = require('../../src/utils/excelParser');

/**
 * Construye un Buffer .xlsx completamente en memoria a partir de un arreglo de objetos o matriz AOA.
 */
function buildMockExcelBuffer(rows, { asAoa = false } = {}) {
  const worksheet = asAoa
    ? XLSX.utils.aoa_to_sheet(rows)
    : XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Horarios');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

describe('Unitarias: Extracción y parsing en memoria de archivos Excel (excelParser)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // CRITERIO 1: Excel bien estructurado -> extracción y mapeo de columnas
  // =========================================================================
  describe('Caso 1: Extracción y mapeo de archivo Excel válido', () => {
    it('Dado un archivo Excel bien estructurado en memoria, extrae todas las filas mapeando cada columna a su atributo interno', () => {
      const mockData = [
        {
          'Código Materia': 'PROG101',
          'Correo Profesor': 'Elena.Salgado@pavilion.com',
          'Aula': 'Lab 1',
          'Día': 'lunes',
          'Hora Inicio': '08:00',
          'Hora Fin': '10:00',
          'Cupo': 25
        },
        {
          'Código Materia': 'MAT202',
          'Correo Profesor': 'carlos.vega@pavilion.com',
          'Aula': 'Aula A-102',
          'Día': 'Miércoles',
          'Hora Inicio': '10:00',
          'Hora Fin': '12:00',
          'Cupo': 30
        }
      ];

      const buffer = buildMockExcelBuffer(mockData);
      const result = parseExcelBuffer(buffer);

      expect(result.errors).toEqual([]);
      expect(result.missingColumns).toEqual([]);
      expect(result.rows).toHaveLength(2);

      expect(result.rows[0]).toEqual({
        fila: 2,
        subject_code: 'PROG101',
        teacher_email: 'elena.salgado@pavilion.com',
        classroom_name: 'Lab 1',
        day_of_week: 'Lunes',
        start_time: '08:00',
        end_time: '10:00',
        max_students: 25
      });

      expect(result.rows[1]).toEqual({
        fila: 3,
        subject_code: 'MAT202',
        teacher_email: 'carlos.vega@pavilion.com',
        classroom_name: 'Aula A-102',
        day_of_week: 'Miércoles',
        start_time: '10:00',
        end_time: '12:00',
        max_students: 30
      });
    });

    it('Soporta alias de encabezados sin acentos y horas como fracción numérica de Excel', () => {
      const mockData = [
        {
          'Codigo': 'BD301',
          'Correo Docente': 'profesor@itc.edu',
          'Salon': 'B-201',
          'Dia': 'sabado',
          'Inicio': 0.5, // 12:00 en fracción de día de Excel
          'Fin': 0.625,  // 15:00 en fracción de día de Excel
          'Max Alumnos': 40
        }
      ];

      const buffer = buildMockExcelBuffer(mockData);
      const result = parseExcelBuffer(buffer);

      expect(result.errors).toHaveLength(0);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]).toMatchObject({
        fila: 2,
        subject_code: 'BD301',
        teacher_email: 'profesor@itc.edu',
        classroom_name: 'B-201',
        day_of_week: 'Sábado',
        start_time: '12:00',
        end_time: '15:00',
        max_students: 40
      });
    });
  });

  // =========================================================================
  // CRITERIO 2: Columnas faltantes y filas vacías/inválidas -> omitir y reportar
  // =========================================================================
  describe('Caso 2: Manejo de columnas faltantes y omisión de filas vacías o inválidas', () => {
    it('Dado un archivo con columnas obligatorias faltantes, omite el procesamiento y reporta las columnas ausentes', () => {
      const incompleteHeadersData = [
        {
          'Código Materia': 'PROG101',
          'Aula': 'Lab 1'
          // Faltan: Correo Profesor, Día, Hora Inicio, Hora Fin
        }
      ];

      const buffer = buildMockExcelBuffer(incompleteHeadersData);
      const result = parseExcelBuffer(buffer);

      expect(result.rows).toEqual([]);
      expect(result.missingColumns).toEqual([
        'Correo Profesor',
        'Día',
        'Hora Inicio',
        'Hora Fin'
      ]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].fila).toBe(1);
      expect(result.errors[0].error).toContain('Faltan columnas obligatorias');
    });

    it('Dado un archivo con filas vacías e inválidas intercaladas, omite las filas inválidas, extrae las válidas y reporta la lista de errores con número de fila', () => {
      const aoaRows = [
        ['Código Materia', 'Correo Profesor', 'Aula', 'Día', 'Hora Inicio', 'Hora Fin', 'Cupo'],
        ['PROG101', 'elena@pavilion.com', 'Lab 1', 'Lunes', '08:00', '10:00', 25], // Fila 2: Válida
        ['', '', '', '', '', '', ''],                                               // Fila 3: Completamente vacía
        ['', 'sinmateria@pavilion.com', 'Lab 2', 'Martes', '10:00', '12:00', 20],   // Fila 4: Falta Código Materia
        ['RED404', 'redes@pavilion.com', 'Lab 3', 'Domingo', '14:00', '12:00', -5], // Fila 5: Día inválido, rango horario invertido y cupo negativo
        ['FIS102', 'fisica@pavilion.com', 'Aula 4', 'Viernes', '12:00', '14:00', 30] // Fila 6: Válida
      ];

      const buffer = buildMockExcelBuffer(aoaRows, { asAoa: true });
      const result = parseExcelBuffer(buffer);

      // Debe conservar únicamente las 2 filas válidas (filas 2 y 6)
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].fila).toBe(2);
      expect(result.rows[0].subject_code).toBe('PROG101');
      expect(result.rows[1].fila).toBe(6);
      expect(result.rows[1].subject_code).toBe('FIS102');

      // Debe reportar errores detallados para las filas 3, 4 y 5
      const errorRows = result.errors.map((e) => e.fila);
      expect(errorRows).toContain(3); // Fila vacía
      expect(errorRows).toContain(4); // Falta Código Materia
      expect(errorRows).toContain(5); // Errores de Día, Hora y Cupo

      expect(result.errors.find((e) => e.fila === 3).error).toContain('vacía');
      expect(result.errors.find((e) => e.fila === 4).error).toContain('Código Materia');
      const row5Errors = result.errors.filter((e) => e.fila === 5).map((e) => e.error);
      expect(row5Errors.some((msg) => msg.includes('Día'))).toBe(true);
      expect(row5Errors.some((msg) => msg.includes('hora de inicio debe ser anterior'))).toBe(true);
      expect(row5Errors.some((msg) => msg.includes('Cupo'))).toBe(true);
    });

    it('Dado un buffer vacío o sin filas de datos, reporta el error de lectura sin lanzar excepciones no controladas', () => {
      const emptyBufferResult = parseExcelBuffer(Buffer.alloc(0));
      expect(emptyBufferResult.rows).toEqual([]);
      expect(emptyBufferResult.errors[0].error).toContain('vacío o es inválido');

      const headerOnlyBuffer = buildMockExcelBuffer(
        [['Código Materia', 'Correo Profesor', 'Aula', 'Día', 'Hora Inicio', 'Hora Fin']],
        { asAoa: true }
      );
      const headerOnlyResult = parseExcelBuffer(headerOnlyBuffer);
      expect(headerOnlyResult.rows).toEqual([]);
      expect(headerOnlyResult.errors[0].error).toContain('no contiene filas de datos');
    });
  });

  // =========================================================================
  // CRITERIO 3: Aislamiento total en memoria (sin BD ni sistema de archivos)
  // =========================================================================
  describe('Caso 3: Ejecución 100% en memoria sin depender de BD ni sistema de archivos', () => {
    it('Procesa el buffer en memoria sin invocar conexiones a PostgreSQL ni lecturas/escrituras en disco (fs)', () => {
      const dbConnectSpy = vi.spyOn(pool, 'connect');
      const dbQuerySpy = vi.spyOn(pool, 'query');
      const fsReadFileSpy = vi.spyOn(fs, 'readFileSync');
      const fsWriteFileSpy = vi.spyOn(fs, 'writeFileSync');
      const fsPromisesReadSpy = vi.spyOn(fs.promises, 'readFile');
      const cwdSpy = vi.spyOn(process, 'cwd');

      const buffer = buildMockExcelBuffer([
        {
          'Código Materia': 'ALG100',
          'Correo Profesor': 'docente@itc.edu',
          'Aula': 'A-101',
          'Día': 'Jueves',
          'Hora Inicio': '07:00',
          'Hora Fin': '09:00',
          'Cupo': 35
        }
      ]);

      const result = parseExcelBuffer(buffer);

      expect(result.rows).toHaveLength(1);
      expect(result.errors).toHaveLength(0);

      // Verificación estricta de aislamiento
      expect(dbConnectSpy).not.toHaveBeenCalled();
      expect(dbQuerySpy).not.toHaveBeenCalled();
      expect(fsReadFileSpy).not.toHaveBeenCalled();
      expect(fsWriteFileSpy).not.toHaveBeenCalled();
      expect(fsPromisesReadSpy).not.toHaveBeenCalled();
      expect(cwdSpy).not.toHaveBeenCalled();
    });

    it('Las funciones auxiliares mapExcelRows, parseExcelTime y normalizeKey operan de forma pura en memoria', () => {
      expect(normalizeKey('Código Matéria #1!')).toBe('codigomateria1');
      expect(parseExcelTime('9:05')).toBe('09:05');
      expect(parseExcelTime('25:00')).toBeNull();
      expect(
        mapExcelRows([{ 'Código Materia': 'MAT1', 'Correo Profesor': 'a@b.com' }])
      ).toEqual([{ subject_code: 'MAT1', teacher_email: 'a@b.com' }]);
    });
  });
});
