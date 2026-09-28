-- ============================================================================
-- Migración: Soporte para OAuth 2.0 (Google / Microsoft) y Account Linking
-- Base de Datos: PostgreSQL
-- Modelo: Shared Database, Shared Schema
-- ============================================================================

-- 1. Permitir usuarios sin contraseña (exclusivos OAuth / SSO)
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE users ALTER COLUMN role_id DROP NOT NULL;

-- 2. Agregar campos para identificadores de proveedores de identidad
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_id VARCHAR(255) UNIQUE;

-- 3. Asegurar que el email sea el eje de account linking (Trust Provider por Email)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ----------------------------------------------------------------------------
-- Bloque de compatibilidad en caso de esquema en español ('usuarios')
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'usuarios') THEN
    ALTER TABLE usuarios ALTER COLUMN password_hash DROP NOT NULL;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
    ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS microsoft_id VARCHAR(255) UNIQUE;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
  END IF;
END $$;
