import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const db = require('../../src/db');
const bcrypt = require('bcryptjs');

describe('Protección y Seguridad de Semillas de Inicialización (seedInitialData)', () => {
  const originalEnv = { ...process.env };
  let getSpy;
  let runSpy;
  let loggedMessages = [];

  beforeEach(() => {
    vi.restoreAllMocks();
    loggedMessages = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      loggedMessages.push(args.join(' '));
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Interceptar llamadas a db.query
    getSpy = vi.spyOn(db.query, 'get');
    runSpy = vi.spyOn(db.query, 'run');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('debe retornar inmediatamente y omitir el semillado si NODE_ENV="production"', async () => {
    process.env.NODE_ENV = 'production';
    process.env.RUN_SEEDS = 'true';

    await db.seedInitialData();

    // No debe haber consultado ni insertado nada en la base de datos
    expect(getSpy).not.toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalled();

    const omittedLog = loggedMessages.find(m => m.includes('[DB] Seeding omitido'));
    expect(omittedLog).toBeDefined();
    expect(omittedLog).toContain('NODE_ENV=production');
  });

  it('debe omitir el semillado si RUN_SEEDS no está definido', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.RUN_SEEDS;

    await db.seedInitialData();

    expect(getSpy).not.toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalled();

    const omittedLog = loggedMessages.find(m => m.includes('[DB] Seeding omitido'));
    expect(omittedLog).toBeDefined();
    expect(omittedLog).toContain('RUN_SEEDS=false');
  });

  it('debe omitir el semillado si RUN_SEEDS="false"', async () => {
    process.env.NODE_ENV = 'development';
    process.env.RUN_SEEDS = 'false';

    await db.seedInitialData();

    expect(getSpy).not.toHaveBeenCalled();
    expect(runSpy).not.toHaveBeenCalled();

    const omittedLog = loggedMessages.find(m => m.includes('[DB] Seeding omitido'));
    expect(omittedLog).toBeDefined();
  });

  it('idempotencia: debe omitir la siembra limpiamente si la tabla tenants ya tiene registros', async () => {
    process.env.NODE_ENV = 'development';
    process.env.RUN_SEEDS = 'true';

    // Mock: la tabla tenants ya contiene 3 registros existentes
    getSpy.mockImplementation(async (sql) => {
      if (sql.includes('COUNT(*)::int AS count FROM tenants')) {
        return { count: 3 };
      }
      return null;
    });

    await db.seedInitialData();

    // Verificó el conteo de tenants
    expect(getSpy).toHaveBeenCalledWith('SELECT COUNT(*)::int AS count FROM tenants;');
    // No debe haber ejecutado ningún INSERT ni UPDATE
    expect(runSpy).not.toHaveBeenCalled();

    const existingDataLog = loggedMessages.find(m => m.includes('datos existentes en tenants. Seeding omitido'));
    expect(existingDataLog).toBeDefined();
  });

  it('debe sembrar datos iniciales con hash bcrypt y sin credenciales demo123 cuando NODE_ENV="test" y RUN_SEEDS="true" en base limpia', async () => {
    process.env.NODE_ENV = 'test';
    process.env.RUN_SEEDS = 'true';
    process.env.ADMIN_INITIAL_PASSWORD = 'CustomAdminPass2026!';

    const insertedRows = [];

    // Mock: base limpia (count = 0) y ninguna entidad existe previamente
    getSpy.mockImplementation(async (sql) => {
      if (sql.includes('COUNT(*)::int AS count FROM tenants')) {
        return { count: 0 };
      }
      return null; // Ninguna entidad existe, activando inserts
    });

    runSpy.mockImplementation(async (sql, params = []) => {
      insertedRows.push({ sql, params });
      return { rowCount: 1 };
    });

    await db.seedInitialData();

    // Debe haber ejecutado inserciones
    expect(runSpy).toHaveBeenCalled();
    expect(insertedRows.length).toBeGreaterThan(0);

    // Inspeccionar las inserciones en la tabla users
    const userInserts = insertedRows.filter(r => r.sql.includes('INSERT INTO users'));
    expect(userInserts.length).toBe(3); // Coordinador + 2 Profesores

    for (const insert of userInserts) {
      // El 6to parámetro (índice 5) corresponde a password_hash
      const passwordHash = insert.params[5];
      expect(typeof passwordHash).toBe('string');
      expect(passwordHash.startsWith('$2')).toBe(true);

      // Comprobar que el hash es válido y coincide con ADMIN_INITIAL_PASSWORD
      const isMatch = bcrypt.compareSync('CustomAdminPass2026!', passwordHash);
      expect(isMatch).toBe(true);

      // Comprobar que no coincide con ninguna contraseña residual débil
      expect(bcrypt.compareSync('demo123', passwordHash)).toBe(false);

      // Comprobar que ningún parámetro ni sentencia SQL contiene la cadena "demo123"
      expect(insert.sql).not.toContain('demo123');
      for (const param of insert.params) {
        if (typeof param === 'string') {
          expect(param).not.toContain('demo123');
        }
      }
    }
  });

  it('debe utilizar el fallback seguro ("AdminDev2026!") cuando ADMIN_INITIAL_PASSWORD no está definida', async () => {
    process.env.NODE_ENV = 'test';
    process.env.RUN_SEEDS = 'true';
    delete process.env.ADMIN_INITIAL_PASSWORD;

    const insertedRows = [];

    getSpy.mockImplementation(async (sql) => {
      if (sql.includes('COUNT(*)::int AS count FROM tenants')) {
        return { count: 0 };
      }
      return null;
    });

    runSpy.mockImplementation(async (sql, params = []) => {
      insertedRows.push({ sql, params });
      return { rowCount: 1 };
    });

    await db.seedInitialData();

    const userInserts = insertedRows.filter(r => r.sql.includes('INSERT INTO users'));
    expect(userInserts.length).toBe(3);

    for (const insert of userInserts) {
      const passwordHash = insert.params[5];
      expect(bcrypt.compareSync('AdminDev2026!', passwordHash)).toBe(true);
      expect(bcrypt.compareSync('demo123', passwordHash)).toBe(false);
    }
  });
});
