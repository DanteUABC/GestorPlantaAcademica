/**
 * Migración DDL: Agregar clasificación por tipo de instalación en tabla classrooms con índice multi-tenant
 *
 * Criterios de aceptación:
 * 1. La tabla classrooms cuenta con la columna type VARCHAR(50) DEFAULT 'Aula Teórica' NOT NULL.
 * 2. Las aulas existentes en la base de datos se migran sin pérdida de información manteniendo su aforo y edificio actual.
 * 3. Se crea el índice compuesto idx_classrooms_tenant_type ON classrooms (tenant_id, type).
 * 4. La migración es idempotente (se puede ejecutar múltiples veces sin fallar con IF NOT EXISTS).
 */

async function migrateClassroomsType(clientOrPool) {
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
    throw new Error('Unsupported database client provided to migrateClassroomsType');
  };

  // 1. Agregar columna de forma idempotente con valor por defecto
  await execute(`
    ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS type VARCHAR(50) DEFAULT 'Aula Teórica';
  `);

  // 2. Migrar registros existentes sin información previa en type manteniendo aforo y edificio
  await execute(`
    UPDATE classrooms SET type = 'Aula Teórica' WHERE type IS NULL;
  `);

  // 3. Establecer restricción NOT NULL y asegurar el valor por defecto
  await execute(`
    ALTER TABLE classrooms ALTER COLUMN type SET NOT NULL;
    ALTER TABLE classrooms ALTER COLUMN type SET DEFAULT 'Aula Teórica';
  `);

  // 4. Crear índice compuesto multi-tenant de forma idempotente
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_classrooms_tenant_type ON classrooms (tenant_id, type);
  `);
}

module.exports = {
  migrateClassroomsType
};
