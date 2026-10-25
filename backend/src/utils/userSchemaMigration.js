/**
 * Migración para consolidación y limpieza del esquema de usuarios:
 * 1. Unificar Nombres: Extrae y migra 'name' hacia 'nombre' y 'apellidos'. Elimina la columna 'name'.
 * 2. Unificar Identificadores: Conserva 'identificador' (DOC-XXX / EMP-XXX). Elimina la columna heredada 'identifier'.
 * 3. Normalizar OAuth: Conserva 'provider' y 'provider_id'. Migra identificadores huérfanos de 'google_id' / 'microsoft_id' y elimina dichas columnas.
 */
async function migrateUserSchema(poolOrClient) {
  const client = poolOrClient;

  // 1. Unificar Nombres
  await client.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS nombre VARCHAR(255);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS apellidos VARCHAR(255);
  `);

  const hasNameCol = await client.query(`
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'name';
  `);

  if (hasNameCol.rows.length > 0) {
    await client.query(`
      UPDATE users 
      SET 
        nombre = CASE 
          WHEN (nombre IS NULL OR TRIM(nombre) = '') AND name IS NOT NULL THEN 
            CASE 
              WHEN position(' ' in TRIM(name)) > 0 THEN split_part(TRIM(name), ' ', 1)
              ELSE TRIM(name)
            END
          ELSE COALESCE(nombre, '')
        END,
        apellidos = CASE 
          WHEN (apellidos IS NULL OR TRIM(apellidos) = '') AND name IS NOT NULL THEN 
            CASE 
              WHEN position(' ' in TRIM(name)) > 0 THEN substr(TRIM(name), position(' ' in TRIM(name)) + 1)
              ELSE ''
            END
          ELSE COALESCE(apellidos, '')
        END
      WHERE (nombre IS NULL OR apellidos IS NULL OR TRIM(nombre) = '' OR TRIM(apellidos) = '') 
        AND name IS NOT NULL;
    `);
  }

  // 2. Unificar Identificadores
  await client.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS identificador VARCHAR(100);
  `);

  const hasIdentifierCol = await client.query(`
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'identifier';
  `);

  if (hasIdentifierCol.rows.length > 0) {
    await client.query(`
      UPDATE users 
      SET identificador = identifier 
      WHERE (identificador IS NULL OR TRIM(identificador) = '') 
        AND identifier IS NOT NULL;
    `);
  }

  // 3. Normalizar OAuth
  await client.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(50);
    ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255);
  `);

  const hasGoogleCol = await client.query(`
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'google_id';
  `);
  if (hasGoogleCol.rows.length > 0) {
    await client.query(`
      UPDATE users 
      SET provider = 'google', provider_id = google_id 
      WHERE (provider IS NULL OR provider_id IS NULL) AND google_id IS NOT NULL;
    `);
  }

  const hasMicrosoftCol = await client.query(`
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'microsoft_id';
  `);
  if (hasMicrosoftCol.rows.length > 0) {
    await client.query(`
      UPDATE users 
      SET provider = 'microsoft', provider_id = microsoft_id 
      WHERE (provider IS NULL OR provider_id IS NULL) AND microsoft_id IS NOT NULL;
    `);
  }

  // 4. Eliminar triggers o dependencias previas de las columnas heredadas
  await client.query(`
    DROP TRIGGER IF EXISTS trg_sync_user_fields ON users;
    DROP FUNCTION IF EXISTS sync_user_fields() CASCADE;
    DROP VIEW IF EXISTS usuarios CASCADE;
    DROP VIEW IF EXISTS usuarios_roles CASCADE;
  `);

  if (hasNameCol.rows.length > 0) {
    await client.query(`ALTER TABLE users DROP COLUMN IF EXISTS name CASCADE;`);
  }
  if (hasIdentifierCol.rows.length > 0) {
    await client.query(`ALTER TABLE users DROP COLUMN IF EXISTS identifier CASCADE;`);
  }
  if (hasGoogleCol.rows.length > 0) {
    await client.query(`ALTER TABLE users DROP COLUMN IF EXISTS google_id CASCADE;`);
  }
  if (hasMicrosoftCol.rows.length > 0) {
    await client.query(`ALTER TABLE users DROP COLUMN IF EXISTS microsoft_id CASCADE;`);
  }

  // Recrear vistas usando las columnas en español y alias retrocompatibles
  await client.query(`
    CREATE OR REPLACE VIEW usuarios AS 
      SELECT 
        id,
        tenant_id,
        nombre,
        apellidos,
        TRIM(CONCAT(COALESCE(nombre, ''), ' ', COALESCE(apellidos, ''))) AS name,
        email,
        password_hash,
        role_id,
        identificador,
        identificador AS identifier,
        provider,
        provider_id,
        created_at
      FROM users;

    CREATE OR REPLACE VIEW usuarios_roles AS 
      SELECT id AS usuario_id, tenant_id, role_id AS rol_id 
      FROM users;

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
  migrateUserSchema
};
