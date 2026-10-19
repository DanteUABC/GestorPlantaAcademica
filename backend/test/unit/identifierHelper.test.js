import { describe, it, expect, vi } from 'vitest';
import { getRolePrefix, getNextIdentifier, migrateExistingUserIdentifiers } from '../../src/utils/identifierHelper';

describe('identifierHelper - Generación y asignación de IDs por rol', () => {
  describe('Criterios de especificación para generación automática de IDs', () => {
    it('Dado el rol "Maestro", la función debe generar un ID que cumpla con el prefijo y longitud estándar definidos por la institución', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [] })
      };

      const idMaestro = await getNextIdentifier('Maestro', mockClient);

      // Debe cumplir con el prefijo 'M'
      expect(idMaestro.startsWith('M')).toBe(true);
      // Longitud estándar definida por la institución: 4 caracteres ('M' + 3 dígitos)
      expect(idMaestro).toHaveLength(4);
      // Formato estándar institucional: M001 a M999
      expect(idMaestro).toMatch(/^M\d{3}$/);
      expect(idMaestro).toBe('M001');

      // Verificar también con alias de rol 'Profesor'
      const idProfesor = await getNextIdentifier('Profesor', mockClient);
      expect(idProfesor.startsWith('M')).toBe(true);
      expect(idProfesor).toHaveLength(4);
    });

    it('Dado el rol "Coordinador", la función debe generar un ID con el prefijo correspondiente', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rows: [] })
      };

      const idCoordinador = await getNextIdentifier('Coordinador', mockClient);

      // Debe cumplir con el prefijo correspondiente 'C'
      expect(idCoordinador.startsWith('C')).toBe(true);
      expect(idCoordinador).toHaveLength(4);
      expect(idCoordinador).toMatch(/^C\d{3}$/);
      expect(idCoordinador).toBe('C001');

      // Verificar también con alias de rol 'Administrador'
      const idAdmin = await getNextIdentifier('Administrador', mockClient);
      expect(idAdmin.startsWith('C')).toBe(true);
      expect(idAdmin).toHaveLength(4);
    });

    it('La función debe garantizar que el ID generado sea único simulando un mock de ID existente', async () => {
      // Simulación de mock con IDs existentes en la base de datos
      const mockExistingTeacherIds = ['M001', 'M002', 'M003'];
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          rows: mockExistingTeacherIds.map(identifier => ({ identifier }))
        })
      };

      const newTeacherId = await getNextIdentifier('Maestro', mockClient);

      // Garantizar que no colisiona con ningún ID existente en la base de datos
      expect(mockExistingTeacherIds).not.toContain(newTeacherId);
      // Debe ser el consecutivo siguiente
      expect(newTeacherId).toBe('M004');

      // Simulación análoga con mock de ID existente para Coordinador
      const mockExistingCoordIds = ['C001', 'C002', 'C005'];
      mockClient.query.mockResolvedValueOnce({
        rows: mockExistingCoordIds.map(identifier => ({ identifier }))
      });

      const newCoordId = await getNextIdentifier('Coordinador', mockClient);

      // Garantizar que no colisiona con ningún ID existente en la base de datos
      expect(mockExistingCoordIds).not.toContain(newCoordId);
      // Debe ser el consecutivo mayor siguiente
      expect(newCoordId).toBe('C006');
    });
  });

  describe('Casos límite y migraciones de identificadores', () => {
    it('debe asignar prefijo "C" para Coordinador y Administrador, y "M" para Profesor/Maestro', () => {
      expect(getRolePrefix('Coordinador')).toBe('C');
      expect(getRolePrefix('coordinador')).toBe('C');
      expect(getRolePrefix('Administrador')).toBe('C');
      expect(getRolePrefix('role-coord')).toBe('C');

      expect(getRolePrefix('Profesor')).toBe('M');
      expect(getRolePrefix('profesor')).toBe('M');
      expect(getRolePrefix('Maestro')).toBe('M');
      expect(getRolePrefix('role-teacher')).toBe('M');
    });

    it('debe formatear con padding de 3 dígitos (ej: M001 hasta M999)', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { identifier: 'M009' }
          ]
        })
      };

      const next = await getNextIdentifier('Profesor', mockClient);
      expect(next).toBe('M010');

      mockClient.query.mockResolvedValueOnce({
        rows: [{ identifier: 'M099' }]
      });
      const next100 = await getNextIdentifier('Profesor', mockClient);
      expect(next100).toBe('M100');
    });

    it('debe lanzar un error descriptivo si se superan los 999 registros', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({
          rows: [
            { identifier: 'C999' }
          ]
        })
      };

      await expect(getNextIdentifier('Coordinador', mockClient)).rejects.toThrow(
        'Se ha alcanzado el límite máximo de identificadores para el prefijo C'
      );
    });

    it('migrateExistingUserIdentifiers debe asignar IDs únicos secuenciales a cuentas existentes', async () => {
      const updateQueries = [];
      const mockClient = {
        query: vi.fn((sql, params) => {
          if (sql.includes("LOWER(r.name) LIKE '%coord%'")) {
            return Promise.resolve({
              rows: [
                { id: 'usr-coord-1', identifier: 'EMP-001' },
                { id: 'usr-coord-2', identifier: 'Hola2' }
              ]
            });
          }
          if (sql.includes("LOWER(r.name) LIKE '%prof%'")) {
            return Promise.resolve({
              rows: [
                { id: 'usr-prof-1', identifier: 'DOC-101' },
                { id: 'usr-prof-2', identifier: null },
                { id: 'usr-prof-3', identifier: 'M003' }
              ]
            });
          }
          if (sql.includes('UPDATE users SET identifier = $1 WHERE id = $2')) {
            updateQueries.push({ id: params[1], identifier: params[0] });
            return Promise.resolve({ rowCount: 1 });
          }
          return Promise.resolve({ rows: [] });
        })
      };

      await migrateExistingUserIdentifiers(mockClient);

      // Coordinadores deben ser C001 y C002
      expect(updateQueries).toContainEqual({ id: 'usr-coord-1', identifier: 'C001' });
      expect(updateQueries).toContainEqual({ id: 'usr-coord-2', identifier: 'C002' });

      // Maestros deben ser M001 y M002 (M003 ya coincidía)
      expect(updateQueries).toContainEqual({ id: 'usr-prof-1', identifier: 'M001' });
      expect(updateQueries).toContainEqual({ id: 'usr-prof-2', identifier: 'M002' });
    });
  });
});
