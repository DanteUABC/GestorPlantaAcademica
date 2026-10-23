/**
 * Migración DDL: Incorporar Modelo de Grupos y tipo de sesión en tabla schedules
 *
 * Criterios de Aceptación:
 * 1. La tabla schedules incorpora group_code VARCHAR(50) NOT NULL DEFAULT 'G1' (ej. "501", "1A", "Grupo 1").
 * 2. La tabla schedules incorpora session_type VARCHAR(50) NOT NULL DEFAULT 'Clase Teórica' (Valores permitidos: 'Clase Teórica', 'Laboratorio', 'Taller').
 * 3. Se crea el índice compuesto idx_schedules_tenant_group ON schedules (tenant_id, group_code).
 * 4. La migración es idempotente con valores por defecto para los horarios existentes.
 */

const ALLOWED_SESSION_TYPES = ['Clase Teórica', 'Laboratorio', 'Taller'];

async function migrateSchedulesGroupAndSession(clientOrPool) {
  let db = clientOrPool;
  if (!db) {
    const dbModule = require('../db');
    db = dbModule.pool || dbModule;
  }

  const execute = async (sql) => {
    if (typeof db.query === 'function') {
      return db.query(sql);
    }
    if (typeof db.exec === 'function') {
      return db.exec(sql);
    }
    throw new Error('Unsupported database client provided to migrateSchedulesGroupAndSession');
  };

  // 1. Columna group_code: agregar, migrar existentes a 'G1', asegurar NOT NULL y DEFAULT 'G1'
  await execute(`
    ALTER TABLE schedules ADD COLUMN IF NOT EXISTS group_code VARCHAR(50) DEFAULT 'G1';
  `);
  await execute(`
    UPDATE schedules SET group_code = 'G1' WHERE group_code IS NULL;
  `);
  await execute(`
    ALTER TABLE schedules ALTER COLUMN group_code SET NOT NULL;
  `);
  await execute(`
    ALTER TABLE schedules ALTER COLUMN group_code SET DEFAULT 'G1';
  `);

  // 2. Columna session_type: agregar, migrar existentes a 'Clase Teórica', asegurar NOT NULL y DEFAULT 'Clase Teórica'
  await execute(`
    ALTER TABLE schedules ADD COLUMN IF NOT EXISTS session_type VARCHAR(50) DEFAULT 'Clase Teórica';
  `);
  await execute(`
    UPDATE schedules SET session_type = 'Clase Teórica' WHERE session_type IS NULL OR session_type = 'Teoría';
  `);
  await execute(`
    ALTER TABLE schedules ALTER COLUMN session_type SET NOT NULL;
  `);
  await execute(`
    ALTER TABLE schedules ALTER COLUMN session_type SET DEFAULT 'Clase Teórica';
  `);

  // 3. Restricción CHECK de valores permitidos para session_type
  await execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conrelid = 'schedules'::regclass AND conname = 'chk_schedules_session_type'
      ) THEN
        ALTER TABLE schedules ADD CONSTRAINT chk_schedules_session_type CHECK (session_type IN ('Clase Teórica', 'Laboratorio', 'Taller'));
      END IF;
    END $$;
  `);

  // 4. Índice compuesto multi-tenant idx_schedules_tenant_group ON schedules (tenant_id, group_code)
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_schedules_tenant_group ON schedules (tenant_id, group_code);
  `);
}

module.exports = {
  ALLOWED_SESSION_TYPES,
  migrateSchedulesGroupAndSession
};
