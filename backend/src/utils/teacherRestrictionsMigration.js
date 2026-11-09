/**
 * Migración DDL: Tabla de restricciones horarias de docentes (teacher_restrictions)
 *
 * Requisitos:
 * - id VARCHAR(50) PRIMARY KEY
 * - tenant_id VARCHAR(50) NOT NULL FK (tenants) ON DELETE CASCADE
 * - teacher_id VARCHAR(50) NOT NULL FK (users) ON DELETE CASCADE
 * - day_of_week VARCHAR(20) NOT NULL CHECK ('Lunes'..'Domingo')
 * - start_time VARCHAR(5) NOT NULL
 * - end_time VARCHAR(5) NOT NULL
 * - reason VARCHAR(255)
 * - created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
 * - CONSTRAINT chk_time_order CHECK (start_time < end_time)
 * - Índice compuesto: idx_teacher_restrictions ON (tenant_id, teacher_id, day_of_week)
 */

const ALLOWED_RESTRICTION_DAYS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo'
];

async function migrateTeacherRestrictions(clientOrPool) {
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
    throw new Error('Unsupported database client provided to migrateTeacherRestrictions');
  };

  await execute(`
CREATE TABLE IF NOT EXISTS teacher_restrictions (
  id VARCHAR(50) PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  teacher_id VARCHAR(50) NOT NULL,
  day_of_week VARCHAR(20) NOT NULL CHECK (day_of_week IN ('Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo')),
  start_time VARCHAR(5) NOT NULL, 
  end_time VARCHAR(5) NOT NULL,   
  reason VARCHAR(255),            
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_time_order CHECK (start_time < end_time),
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_teacher_restrictions 
ON teacher_restrictions (tenant_id, teacher_id, day_of_week);
  `);
}

module.exports = {
  ALLOWED_RESTRICTION_DAYS,
  migrateTeacherRestrictions
};
