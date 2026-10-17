import { describe, it, expect, vi } from 'vitest';
import { getRolePrefix, getNextIdentifier, migrateExistingUserIdentifiers } from '../../src/utils/identifierHelper';

describe('identifierHelper - Generación y asignación de IDs por rol', () => {
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

  it('debe devolver C001 o M001 si no existen registros previos', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({ rows: [] })
    };

    const nextCoord = await getNextIdentifier('Coordinador', mockClient);
    expect(nextCoord).toBe('C001');

    const nextTeacher = await getNextIdentifier('Profesor', mockClient);
    expect(nextTeacher).toBe('M001');
  });

  it('debe incrementar de uno en uno según el mayor ID existente', async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValue({
        rows: [
          { identifier: 'C001' },
          { identifier: 'C002' },
          { identifier: 'C015' }
        ]
      })
    };

    const nextCoord = await getNextIdentifier('Coordinador', mockClient);
    expect(nextCoord).toBe('C016');
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
