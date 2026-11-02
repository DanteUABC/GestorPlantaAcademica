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
 * - created_at TIMESTAMP
 * - Índices compuestos: (tenant_id, schedule_id) y (tenant_id, substitute_teacher_id)
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

  await execute(`
    CREATE TABLE IF NOT EXISTS schedule_substitutions (
      id VARCHAR(50) PRIMARY KEY,
      tenant_id VARCHAR(50) NOT NULL,
      schedule_id VARCHAR(50) NOT NULL,
      original_teacher_id VARCHAR(50) NOT NULL,
      substitute_teacher_id VARCHAR(50) NOT NULL,
      reason VARCHAR(255),
      effective_date DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
      FOREIGN KEY (original_teacher_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (substitute_teacher_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_substitutions_tenant_schedule ON schedule_substitutions (tenant_id, schedule_id);
    CREATE INDEX IF NOT EXISTS idx_substitutions_tenant_substitute ON schedule_substitutions (tenant_id, substitute_teacher_id);
  `);
}

module.exports = {
  migrateScheduleSubstitutions
};
