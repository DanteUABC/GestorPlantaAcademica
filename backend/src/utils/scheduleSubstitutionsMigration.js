/**
 * Migración DDL: Tabla de sustituciones/suplencias de horarios (schedule_substitutions)
 * 
 * Requisitos:
 * - id VARCHAR(50) PK
 * - tenant_id VARCHAR(50) FK (tenants)
 * - schedule_id VARCHAR(50) FK (schedules) ON DELETE CASCADE
 * - original_teacher_id VARCHAR(50) FK (users)
 * - substitute_teacher_id VARCHAR(50) FK (users)
 * - reason VARCHAR(255)
 * - effective_date DATE
 * - substitution_type VARCHAR(20) NOT NULL DEFAULT 'definitiva' ('temporal', 'definitiva')
 * - end_date DATE NULL
 * - status VARCHAR(20) NOT NULL DEFAULT 'activa' ('activa', 'finalizada', 'cancelada')
 * - created_at TIMESTAMP
 * - Índices compuestos: (tenant_id, schedule_id), (tenant_id, substitute_teacher_id) y (tenant_id, status)
 */

async function migrateScheduleSubstitutions(clientOrPool) {
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
    throw new Error('Unsupported database client provided to migrateScheduleSubstitutions');
  };

  // 1. Tabla base con soporte completo para tipos y estados
  await execute(`
    CREATE TABLE IF NOT EXISTS schedule_substitutions (
      id VARCHAR(50) PRIMARY KEY,
      tenant_id VARCHAR(50) NOT NULL,
      schedule_id VARCHAR(50) NOT NULL,
      original_teacher_id VARCHAR(50) NOT NULL,
      substitute_teacher_id VARCHAR(50) NOT NULL,
      reason VARCHAR(255),
      effective_date DATE,
      substitution_type VARCHAR(20) NOT NULL DEFAULT 'definitiva',
      end_date DATE NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'activa',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
      FOREIGN KEY (original_teacher_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (substitute_teacher_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_substitutions_tenant_schedule ON schedule_substitutions (tenant_id, schedule_id);
    CREATE INDEX IF NOT EXISTS idx_substitutions_tenant_substitute ON schedule_substitutions (tenant_id, substitute_teacher_id);
  `);

  // 2. Evolución idempotente: substitution_type
  await execute(`
    ALTER TABLE schedule_substitutions ADD COLUMN IF NOT EXISTS substitution_type VARCHAR(20) NOT NULL DEFAULT 'definitiva';
  `);
  await execute(`
    ALTER TABLE schedule_substitutions ALTER COLUMN substitution_type SET DEFAULT 'definitiva';
  `);
  await execute(`
    UPDATE schedule_substitutions SET substitution_type = 'definitiva' WHERE substitution_type IS NULL;
  `);

  // 3. Evolución idempotente: end_date
  await execute(`
    ALTER TABLE schedule_substitutions ADD COLUMN IF NOT EXISTS end_date DATE NULL;
  `);

  // 4. Evolución idempotente: status
  await execute(`
    ALTER TABLE schedule_substitutions ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'activa';
  `);
  await execute(`
    ALTER TABLE schedule_substitutions ALTER COLUMN status SET DEFAULT 'activa';
  `);
  await execute(`
    UPDATE schedule_substitutions SET status = 'finalizada' 
    WHERE status IS NULL OR (substitution_type = 'definitiva' AND status = 'activa');
  `);

  // 5. Restricciones CHECK idempotentes
  await execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conrelid = 'schedule_substitutions'::regclass AND conname = 'chk_substitutions_type'
      ) THEN
        ALTER TABLE schedule_substitutions ADD CONSTRAINT chk_substitutions_type CHECK (substitution_type IN ('temporal', 'definitiva'));
      END IF;
    END $$;
  `);

  await execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conrelid = 'schedule_substitutions'::regclass AND conname = 'chk_substitutions_status'
      ) THEN
        ALTER TABLE schedule_substitutions ADD CONSTRAINT chk_substitutions_status CHECK (status IN ('activa', 'finalizada', 'cancelada'));
      END IF;
    END $$;
  `);

  // 6. Índice de estado para consultas rápidas
  await execute(`
    CREATE INDEX IF NOT EXISTS idx_substitutions_tenant_status ON schedule_substitutions (tenant_id, status);
  `);
}

module.exports = {
  migrateScheduleSubstitutions
};
