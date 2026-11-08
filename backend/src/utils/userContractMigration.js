/**
 * Migración DDL: Incorporar límite contractual de horas semanales, estatus y desvinculación de email en tabla users
 *
 * Criterios de Aceptación:
 * 1. La tabla users incorpora horas_contratadas INTEGER DEFAULT 25.
 * 2. La tabla users incorpora estatus VARCHAR(20) DEFAULT 'activo' (valores permitidos: 'activo', 'inactivo', 'baja').
 * 3. La columna email permite valores NULL y se añade email_activo BOOLEAN DEFAULT TRUE para desvinculación segura.
 * 4. Se actualiza la vista SQL usuarios.
 * 5. La migración es idempotente (ADD COLUMN IF NOT EXISTS).
 * 6. Todos los usuarios existentes con rol Profesor quedan inicializados con horas_contratadas = 25 y estatus = 'activo'.
 * 7. Llaves foráneas en schedules y schedule_substitutions permanecen intactas.
 */

const ALLOWED_USER_STATUSES = ['activo', 'inactivo', 'baja'];

async function migrateUserContractAndStatus(clientOrPool) {
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
    throw new Error('Unsupported database client provided to migrateUserContractAndStatus');
  };

  // 1. Columna horas_contratadas: agregar, asegurar DEFAULT 25 e inicializar valores NULL
  await execute(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS horas_contratadas INTEGER DEFAULT 25;
  `);
  await execute(`
    ALTER TABLE users ALTER COLUMN horas_contratadas SET DEFAULT 25;
  `);
  await execute(`
    UPDATE users SET horas_contratadas = 25 WHERE horas_contratadas IS NULL;
  `);

  // 2. Columna estatus: agregar, asegurar DEFAULT 'activo', CHECK constraint e inicializar valores NULL
  await execute(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS estatus VARCHAR(20) DEFAULT 'activo';
  `);
  await execute(`
    ALTER TABLE users ALTER COLUMN estatus SET DEFAULT 'activo';
  `);
  await execute(`
    UPDATE users SET estatus = 'activo' WHERE estatus IS NULL;
  `);

  // Restricción CHECK para estatus ('activo', 'inactivo', 'baja')
  await execute(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conrelid = 'users'::regclass AND conname = 'chk_users_estatus'
      ) THEN
        ALTER TABLE users ADD CONSTRAINT chk_users_estatus CHECK (estatus IN ('activo', 'inactivo', 'baja'));
      END IF;
    END $$;
  `);

  // 3. Columna email: remover restricción NOT NULL para permitir desvinculación segura
  await execute(`
    ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
  `);

  // Columna email_activo: agregar indicador booleano con DEFAULT TRUE
  await execute(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS email_activo BOOLEAN DEFAULT TRUE;
  `);
  await execute(`
    ALTER TABLE users ALTER COLUMN email_activo SET DEFAULT TRUE;
  `);
  await execute(`
    UPDATE users SET email_activo = TRUE WHERE email_activo IS NULL;
  `);

  // 4. Inicializar específicamente a todos los usuarios con rol Profesor
  await execute(`
    UPDATE users
    SET 
      horas_contratadas = COALESCE(horas_contratadas, 25),
      estatus = COALESCE(estatus, 'activo'),
      email_activo = COALESCE(email_activo, TRUE)
    WHERE role_id IN ('role-teacher', '2')
       OR role_id IN (SELECT id FROM roles WHERE name = 'Profesor' OR nombre = 'Profesor');
  `);

  // 5. Actualizar la vista SQL de compatibilidad usuarios incorporando las nuevas columnas
  await execute(`
    DROP VIEW IF EXISTS usuarios CASCADE;
  `);
  await execute(`
    CREATE OR REPLACE VIEW usuarios AS 
      SELECT 
        id,
        tenant_id,
        nombre,
        apellidos,
        TRIM(CONCAT(COALESCE(nombre, ''), ' ', COALESCE(apellidos, ''))) AS name,
        email,
        email_activo,
        password_hash,
        role_id,
        identificador,
        identificador AS identifier,
        provider,
        provider_id,
        horas_contratadas,
        estatus,
        created_at
      FROM users;
  `);

  // Recrear vista usuarios_roles y regla si fue afectada por DROP VIEW CASCADE
  await execute(`
    CREATE OR REPLACE VIEW usuarios_roles AS 
      SELECT id AS usuario_id, tenant_id, role_id AS rol_id 
      FROM users;
  `);
  await execute(`
    CREATE OR REPLACE RULE usuarios_roles_insert AS
      ON INSERT TO usuarios_roles
      DO INSTEAD
        UPDATE users 
        SET role_id = CASE 
          WHEN NEW.rol_id::text IN ('1', 'role-coord') THEN 'role-coord'
          WHEN NEW.rol_id::text IN ('2', 'role-teacher') THEN 'role-teacher'
          WHEN NEW.rol_id::text = 'role-admin' THEN 'role-admin'
          ELSE NEW.rol_id::text
        END,
        tenant_id = CASE 
          WHEN NEW.tenant_id::text = '1' THEN 'tenant-itc'
          ELSE NEW.tenant_id::text
        END 
        WHERE id = NEW.usuario_id;
  `);
}

module.exports = {
  ALLOWED_USER_STATUSES,
  migrateUserContractAndStatus
};
