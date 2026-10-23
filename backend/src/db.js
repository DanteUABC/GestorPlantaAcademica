require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { migrateExistingUserIdentifiers } = require('./utils/identifierHelper');
const { migrateClassroomsType } = require('./utils/classroomMigration');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/gestor_planta'
});

// Helper para convertir consultas con '?' al formato de PostgreSQL '$1, $2, ...'
function convertSql(sql) {
  let idx = 1;
  return sql.replace(/\?/g, () => `$${idx++}`);
}

const query = {
  get: async (sql, params = []) => {
    const res = await pool.query(convertSql(sql), params);
    return res.rows[0];
  },
  all: async (sql, params = []) => {
    const res = await pool.query(convertSql(sql), params);
    return res.rows;
  },
  run: async (sql, params = []) => {
    const res = await pool.query(convertSql(sql), params);
    return { rowCount: res.rowCount };
  },
  exec: async (sql) => {
    await pool.query(sql);
  }
};

async function initDatabase() {
  // Schema definition: "Shared Database, Shared Schema"
  await query.exec(`
    -- Tenants (Instituciones Educativas)
    CREATE TABLE IF NOT EXISTS tenants (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- RBAC in 3NF: Roles
    CREATE TABLE IF NOT EXISTS roles (
      id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      nombre VARCHAR(100),
      description TEXT
    );

    -- RBAC in 3NF: Permissions
    CREATE TABLE IF NOT EXISTS permissions (
      id VARCHAR(50) PRIMARY KEY,
      code VARCHAR(100) UNIQUE NOT NULL,
      description TEXT
    );

    -- RBAC in 3NF: Role_Permissions
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id VARCHAR(50) NOT NULL,
      permission_id VARCHAR(50) NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    );

    -- Users (Scoped by tenant_id, with role_id, soporte para OAuth y password_hash opcional)
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(50) PRIMARY KEY,
      tenant_id VARCHAR(50),
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255),
      role_id VARCHAR(50),
      identifier VARCHAR(100),
      google_id VARCHAR(255) UNIQUE,
      microsoft_id VARCHAR(255) UNIQUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (role_id) REFERENCES roles(id),
      UNIQUE(tenant_id, email)
    );

    -- Subjects (Materias, scoped by tenant_id)
    CREATE TABLE IF NOT EXISTS subjects (
      id VARCHAR(50) PRIMARY KEY,
      tenant_id VARCHAR(50) NOT NULL,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(255) NOT NULL,
      credits INTEGER DEFAULT 4,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      UNIQUE(tenant_id, code)
    );

    -- Classrooms (Aulas, scoped by tenant_id)
    CREATE TABLE IF NOT EXISTS classrooms (
      id VARCHAR(50) PRIMARY KEY,
      tenant_id VARCHAR(50) NOT NULL,
      name VARCHAR(255) NOT NULL,
      building VARCHAR(255),
      capacity INTEGER NOT NULL DEFAULT 30,
      type VARCHAR(50) NOT NULL DEFAULT 'Aula Teórica',
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      UNIQUE(tenant_id, name)
    );

    -- Schedules (Horarios asignados, scoped by tenant_id)
    CREATE TABLE IF NOT EXISTS schedules (
      id VARCHAR(50) PRIMARY KEY,
      tenant_id VARCHAR(50) NOT NULL,
      subject_id VARCHAR(50) NOT NULL,
      teacher_id VARCHAR(50) NOT NULL,
      classroom_id VARCHAR(50) NOT NULL,
      day_of_week VARCHAR(20) NOT NULL,
      start_time VARCHAR(5) NOT NULL,
      end_time VARCHAR(5) NOT NULL,
      max_students INTEGER NOT NULL DEFAULT 30,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
      FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE
    );

    -- Horarios (Tabla para exportación y compatibilidad de horarios, scoped by tenant_id)
    CREATE TABLE IF NOT EXISTS horarios (
      id SERIAL PRIMARY KEY,
      tenant_id VARCHAR(50) NOT NULL,
      materia VARCHAR(255) NOT NULL,
      profesor VARCHAR(255) NOT NULL,
      dia VARCHAR(50) NOT NULL,
      hora_inicio VARCHAR(50) NOT NULL,
      hora_fin VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Performance indexes for tenant-isolated queries
    CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_subjects_tenant ON subjects(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_classrooms_tenant ON classrooms(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_tenant ON schedules(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_horarios_tenant ON horarios(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

    -- Vistas de compatibilidad RBAC y tablas en español
    CREATE OR REPLACE VIEW usuarios AS SELECT * FROM users;
    CREATE OR REPLACE VIEW usuarios_roles AS SELECT id AS usuario_id, tenant_id, role_id AS rol_id FROM users;
  `);

  // Migraciones incrementales sobre PostgreSQL para soporte de usuarios externos y vistas
  try {
    await query.exec(`
      ALTER TABLE roles ADD COLUMN IF NOT EXISTS nombre VARCHAR(100);
      UPDATE roles SET nombre = name WHERE nombre IS NULL;
      ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
      ALTER TABLE users ALTER COLUMN name DROP NOT NULL;
      ALTER TABLE users ALTER COLUMN id SET DEFAULT ('usr-' || substr(gen_random_uuid()::text, 1, 16));
      ALTER TABLE users ADD COLUMN IF NOT EXISTS nombre VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS apellidos VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS identificador VARCHAR(100);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS provider VARCHAR(50);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS provider_id VARCHAR(255);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_id VARCHAR(255) UNIQUE;
      UPDATE users SET email = REPLACE(email, '@itc.edu', '@pavilion.com') WHERE email LIKE '%@itc.edu';

      -- Restricción única de correo para usuarios
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conrelid = 'users'::regclass AND conname = 'users_email_unique'
        ) THEN
          ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
        END IF;
      END $$;

      -- Tabla de horarios para exportación y compatibilidad
      CREATE TABLE IF NOT EXISTS horarios (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) NOT NULL,
        materia VARCHAR(255) NOT NULL,
        profesor VARCHAR(255) NOT NULL,
        dia VARCHAR(50) NOT NULL,
        hora_inicio VARCHAR(50) NOT NULL,
        hora_fin VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_horarios_tenant ON horarios(tenant_id);

      -- Vistas y reglas para compatibilidad total
      DROP VIEW IF EXISTS usuarios CASCADE;
      CREATE OR REPLACE VIEW usuarios AS SELECT * FROM users;
      DROP VIEW IF EXISTS usuarios_roles CASCADE;
      CREATE OR REPLACE VIEW usuarios_roles AS SELECT id AS usuario_id, tenant_id, role_id AS rol_id FROM users;
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

    // Sincronización automática de campos en users
    await query.exec(`
      CREATE OR REPLACE FUNCTION sync_user_fields()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.identifier IS NULL AND NEW.identificador IS NOT NULL THEN
          NEW.identifier := NEW.identificador;
        ELSIF NEW.identificador IS NULL AND NEW.identifier IS NOT NULL THEN
          NEW.identificador := NEW.identifier;
        END IF;

        IF NEW.name IS NULL AND (NEW.nombre IS NOT NULL OR NEW.apellidos IS NOT NULL) THEN
          NEW.name := TRIM(CONCAT(COALESCE(NEW.nombre, ''), ' ', COALESCE(NEW.apellidos, '')));
        ELSIF NEW.nombre IS NULL AND NEW.name IS NOT NULL THEN
          NEW.nombre := NEW.name;
        END IF;

        IF NEW.provider = 'google' AND NEW.provider_id IS NOT NULL AND NEW.google_id IS NULL THEN
          NEW.google_id := NEW.provider_id;
        ELSIF NEW.provider = 'microsoft' AND NEW.provider_id IS NOT NULL AND NEW.microsoft_id IS NULL THEN
          NEW.microsoft_id := NEW.provider_id;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_sync_user_fields ON users;
      CREATE TRIGGER trg_sync_user_fields
      BEFORE INSERT OR UPDATE ON users
      FOR EACH ROW
      EXECUTE FUNCTION sync_user_fields();
    `);
  } catch (migErr) {
    console.warn('Nota en migraciones incrementales:', migErr.message);
  }

  // Migración DDL para classrooms: type e índice compuesto multi-tenant
  try {
    await migrateClassroomsType(pool);
  } catch (classroomsMigErr) {
    console.warn('Nota en migración de classrooms:', classroomsMigErr.message);
  }

  await seedInitialData();
  await query.exec('UPDATE roles SET nombre = name WHERE nombre IS NULL;');
  await migrateExistingUserIdentifiers(pool);
}

async function seedInitialData() {
  // 1. Roles (Sin Alumno)
  const roles = [
    { id: 'role-admin', name: 'Administrador', description: 'Acceso total de configuración' },
    { id: 'role-coord', name: 'Coordinador', description: 'Gestión académica y armado de horarios' },
    { id: 'role-teacher', name: 'Profesor', description: 'Consulta de asignación de horarios y grupos' }
  ];

  for (const r of roles) {
    const existing = await query.get('SELECT id FROM roles WHERE id = ?', [r.id]);
    if (!existing) {
      await query.run('INSERT INTO roles (id, name, nombre, description) VALUES (?, ?, ?, ?)', [r.id, r.name, r.name, r.description]);
    } else {
      await query.run('UPDATE roles SET nombre = ? WHERE id = ? AND nombre IS NULL', [r.name, r.id]);
    }
  }

  // 2. Permisos y RBAC 3NF (Sin permisos de alumno)
  const permissions = [
    { id: 'p-sched-create', code: 'schedules:create', description: 'Crear y modificar horarios' },
    { id: 'p-sched-view', code: 'schedules:view_all', description: 'Ver todos los horarios del tenant' },
    { id: 'p-sched-teacher', code: 'schedules:view_assigned', description: 'Ver horarios asignados al profesor' }
  ];

  for (const p of permissions) {
    const existing = await query.get('SELECT id FROM permissions WHERE id = ?', [p.id]);
    if (!existing) {
      await query.run('INSERT INTO permissions (id, code, description) VALUES (?, ?, ?)', [p.id, p.code, p.description]);
    }
  }

  const rolePermissions = [
    { role_id: 'role-coord', permission_id: 'p-sched-create' },
    { role_id: 'role-coord', permission_id: 'p-sched-view' },
    { role_id: 'role-teacher', permission_id: 'p-sched-teacher' },
    { role_id: 'role-admin', permission_id: 'p-sched-create' },
    { role_id: 'role-admin', permission_id: 'p-sched-view' }
  ];

  for (const rp of rolePermissions) {
    const existing = await query.get(
      'SELECT role_id FROM role_permissions WHERE role_id = ? AND permission_id = ?',
      [rp.role_id, rp.permission_id]
    );
    if (!existing) {
      await query.run('INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)', [rp.role_id, rp.permission_id]);
    }
  }

  // 3. Tenants de Demostración
  const demoTenants = [
    { id: '1', name: 'Instituto Tecnológico Central', slug: 'tenant-1' },
    { id: 'tenant-itc', name: 'Instituto Tecnológico Central', slug: 'itc' },
    { id: 'tenant-upn', name: 'Universidad Politécnica del Norte', slug: 'upn' }
  ];

  for (const t of demoTenants) {
    const existing = await query.get('SELECT id FROM tenants WHERE id = ?', [t.id]);
    if (!existing) {
      await query.run('INSERT INTO tenants (id, name, slug) VALUES (?, ?, ?)', [t.id, t.name, t.slug]);
    }
  }

  // 4. Semillado de Aulas y Materias para ITC
  const itcClassrooms = [
    { id: 'cr-a101', tenant_id: 'tenant-itc', name: 'Aula A-101', building: 'Edificio de Ciencias', capacity: 35, type: 'Aula Teórica' },
    { id: 'cr-lab1', tenant_id: 'tenant-itc', name: 'Laboratorio de Cómputo 1', building: 'Edificio Tecnologías', capacity: 25, type: 'Laboratorio de Cómputo' },
    { id: 'cr-b202', tenant_id: 'tenant-itc', name: 'Aula B-202', building: 'Edificio de Ingeniería', capacity: 40, type: 'Aula Teórica' }
  ];

  for (const cr of itcClassrooms) {
    const existing = await query.get('SELECT id FROM classrooms WHERE id = ?', [cr.id]);
    if (!existing) {
      await query.run('INSERT INTO classrooms (id, tenant_id, name, building, capacity, type) VALUES (?, ?, ?, ?, ?, ?)',
        [cr.id, cr.tenant_id, cr.name, cr.building, cr.capacity, cr.type || 'Aula Teórica']);
    }
  }

  const itcSubjects = [
    { id: 'sub-calc', tenant_id: 'tenant-itc', code: 'MAT-101', name: 'Cálculo Diferencial e Integral', credits: 5 },
    { id: 'sub-prog', tenant_id: 'tenant-itc', code: 'INF-201', name: 'Programación Orientada a Objetos', credits: 6 },
    { id: 'sub-bd', tenant_id: 'tenant-itc', code: 'INF-301', name: 'Bases de Datos Relacionales', credits: 5 },
    { id: 'sub-redes', tenant_id: 'tenant-itc', code: 'TEL-401', name: 'Redes y Telecomunicaciones', credits: 4 }
  ];

  for (const s of itcSubjects) {
    const existing = await query.get('SELECT id FROM subjects WHERE id = ?', [s.id]);
    if (!existing) {
      await query.run('INSERT INTO subjects (id, tenant_id, code, name, credits) VALUES (?, ?, ?, ?, ?)',
        [s.id, s.tenant_id, s.code, s.name, s.credits]);
    }
  }

  // 5. Usuarios iniciales para ITC (Password por defecto: "demo123")
  const defaultPasswordHash = await bcrypt.hash('demo123', 10);
  const demoUsers = [
    {
      id: 'usr-coord-1',
      tenant_id: 'tenant-itc',
      name: 'Dr. Roberto Mendoza (Coordinador)',
      email: 'coordinador@pavilion.com',
      password_hash: defaultPasswordHash,
      role_id: 'role-coord',
      identifier: 'C001'
    },
    {
      id: 'usr-prof-1',
      tenant_id: 'tenant-itc',
      name: 'Mtra. Elena Salgado (Profesora)',
      email: 'elena.salgado@pavilion.com',
      password_hash: defaultPasswordHash,
      role_id: 'role-teacher',
      identifier: 'M001'
    },
    {
      id: 'usr-prof-2',
      tenant_id: 'tenant-itc',
      name: 'Dr. Carlos Vega (Profesor)',
      email: 'carlos.vega@pavilion.com',
      password_hash: defaultPasswordHash,
      role_id: 'role-teacher',
      identifier: 'M002'
    }
  ];

  for (const u of demoUsers) {
    const existing = await query.get('SELECT id FROM users WHERE id = ?', [u.id]);
    if (!existing) {
      await query.run(
        `INSERT INTO users (id, tenant_id, name, email, password_hash, role_id, identifier)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [u.id, u.tenant_id, u.name, u.email, u.password_hash, u.role_id, u.identifier]
      );
    } else {
      await query.run('UPDATE users SET email = ? WHERE id = ?', [u.email, u.id]);
    }
  }

  // 6. Horario precargado de muestra (ejemplo sin empalmes)
  const initialSchedules = [
    {
      id: 'sch-sample-1',
      tenant_id: 'tenant-itc',
      subject_id: 'sub-prog',
      teacher_id: 'usr-prof-1',
      classroom_id: 'cr-lab1',
      day_of_week: 'Lunes',
      start_time: '08:00',
      end_time: '10:00',
      max_students: 25
    },
    {
      id: 'sch-sample-2',
      tenant_id: 'tenant-itc',
      subject_id: 'sub-calc',
      teacher_id: 'usr-prof-2',
      classroom_id: 'cr-a101',
      day_of_week: 'Lunes',
      start_time: '10:00',
      end_time: '12:00',
      max_students: 35
    },
    {
      id: 'sch-sample-3',
      tenant_id: 'tenant-itc',
      subject_id: 'sub-bd',
      teacher_id: 'usr-prof-1',
      classroom_id: 'cr-lab1',
      day_of_week: 'Miércoles',
      start_time: '09:00',
      end_time: '11:00',
      max_students: 25
    }
  ];

  for (const sch of initialSchedules) {
    const existing = await query.get('SELECT id FROM schedules WHERE id = ?', [sch.id]);
    if (!existing) {
      await query.run(
        `INSERT INTO schedules (id, tenant_id, subject_id, teacher_id, classroom_id, day_of_week, start_time, end_time, max_students)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sch.id, sch.tenant_id, sch.subject_id, sch.teacher_id, sch.classroom_id, sch.day_of_week, sch.start_time, sch.end_time, sch.max_students]
      );
    }
  }
}

const originalPoolQuery = pool.query.bind(pool);
const queryFn = (...args) => originalPoolQuery(...args);
Object.assign(queryFn, query);
pool.query = queryFn;

pool.pool = pool;
pool.default = pool;
pool.query = queryFn;
pool.initDatabase = initDatabase;

module.exports = pool;
module.exports.default = pool;
module.exports.pool = pool;
module.exports.query = queryFn;
module.exports.initDatabase = initDatabase;
