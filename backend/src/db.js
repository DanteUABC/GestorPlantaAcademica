const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

// Promisified helpers
const query = {
  get: (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  }),
  all: (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  }),
  run: (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  }),
  exec: (sql) => new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  })
};

async function initDatabase() {
  // Enable foreign keys
  await query.run('PRAGMA foreign_keys = ON;');

  // Schema definition: "Shared Database, Shared Schema"
  // Every operational entity contains tenant_id
  await query.exec(`
    -- Tenants (Instituciones Educativas)
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- RBAC in 3NF: Roles
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      description TEXT
    );

    -- RBAC in 3NF: Permissions
    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      description TEXT
    );

    -- RBAC in 3NF: Role_Permissions
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id TEXT NOT NULL,
      permission_id TEXT NOT NULL,
      PRIMARY KEY (role_id, permission_id),
      FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
      FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
    );

    -- Users (Scoped by tenant_id, with role_id)
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role_id TEXT NOT NULL,
      identifier TEXT, -- Matrícula o Nómina docente
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (role_id) REFERENCES roles(id),
      UNIQUE(tenant_id, email)
    );

    -- Subjects (Materias, scoped by tenant_id)
    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      credits INTEGER DEFAULT 4,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      UNIQUE(tenant_id, code)
    );

    -- Classrooms (Aulas, scoped by tenant_id)
    CREATE TABLE IF NOT EXISTS classrooms (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      building TEXT,
      capacity INTEGER NOT NULL DEFAULT 30,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      UNIQUE(tenant_id, name)
    );

    -- Schedules (Horarios asignados, scoped by tenant_id)
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      teacher_id TEXT NOT NULL,
      classroom_id TEXT NOT NULL,
      day_of_week TEXT NOT NULL, -- 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'
      start_time TEXT NOT NULL,  -- 'HH:MM' (formato 24h ej. '08:00')
      end_time TEXT NOT NULL,    -- 'HH:MM' (formato 24h ej. '10:00')
      max_students INTEGER NOT NULL DEFAULT 30,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
      FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE CASCADE
    );

    -- Enrollments (Inscripciones de Alumnos, scoped by tenant_id)
    CREATE TABLE IF NOT EXISTS enrollments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      schedule_id TEXT NOT NULL,
      enrolled_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
      UNIQUE(student_id, schedule_id)
    );

    -- Performance indexes for tenant-isolated queries
    CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_subjects_tenant ON subjects(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_classrooms_tenant ON classrooms(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_schedules_tenant ON schedules(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_enrollments_tenant ON enrollments(tenant_id);
  `);

  await seedInitialData();
}

async function seedInitialData() {
  // 1. Roles
  const roles = [
    { id: 'role-admin', name: 'Administrador', description: 'Acceso total de configuración' },
    { id: 'role-coord', name: 'Coordinador', description: 'Gestión académica y armado de horarios' },
    { id: 'role-teacher', name: 'Profesor', description: 'Consulta de asignación de horarios y grupos' },
    { id: 'role-student', name: 'Alumno', description: 'Inscripción a materias y consulta de horario' }
  ];

  for (const r of roles) {
    const existing = await query.get('SELECT id FROM roles WHERE id = ?', [r.id]);
    if (!existing) {
      await query.run('INSERT INTO roles (id, name, description) VALUES (?, ?, ?)', [r.id, r.name, r.description]);
    }
  }

  // 2. Permisos y RBAC 3NF
  const permissions = [
    { id: 'p-sched-create', code: 'schedules:create', description: 'Crear y modificar horarios' },
    { id: 'p-sched-view', code: 'schedules:view_all', description: 'Ver todos los horarios del tenant' },
    { id: 'p-sched-teacher', code: 'schedules:view_assigned', description: 'Ver horarios asignados al profesor' },
    { id: 'p-enroll-create', code: 'enrollment:create', description: 'Inscribir materias' },
    { id: 'p-enroll-view', code: 'enrollment:view', description: 'Ver materias inscritas' }
  ];

  for (const p of permissions) {
    const existing = await query.get('SELECT id FROM permissions WHERE id = ?', [p.id]);
    if (!existing) {
      await query.run('INSERT INTO permissions (id, code, description) VALUES (?, ?, ?)', [p.id, p.code, p.description]);
    }
  }

  // Asignar permisos a roles
  const rolePermissions = [
    { role_id: 'role-coord', permission_id: 'p-sched-create' },
    { role_id: 'role-coord', permission_id: 'p-sched-view' },
    { role_id: 'role-teacher', permission_id: 'p-sched-teacher' },
    { role_id: 'role-student', permission_id: 'p-enroll-create' },
    { role_id: 'role-student', permission_id: 'p-enroll-view' },
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
    { id: 'cr-a101', tenant_id: 'tenant-itc', name: 'Aula A-101', building: 'Edificio de Ciencias', capacity: 35 },
    { id: 'cr-lab1', tenant_id: 'tenant-itc', name: 'Laboratorio de Cómputo 1', building: 'Edificio Tecnologías', capacity: 25 },
    { id: 'cr-b202', tenant_id: 'tenant-itc', name: 'Aula B-202', building: 'Edificio de Ingeniería', capacity: 40 }
  ];

  for (const cr of itcClassrooms) {
    const existing = await query.get('SELECT id FROM classrooms WHERE id = ?', [cr.id]);
    if (!existing) {
      await query.run('INSERT INTO classrooms (id, tenant_id, name, building, capacity) VALUES (?, ?, ?, ?, ?)',
        [cr.id, cr.tenant_id, cr.name, cr.building, cr.capacity]);
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
      email: 'coordinador@itc.edu',
      password_hash: defaultPasswordHash,
      role_id: 'role-coord',
      identifier: 'EMP-001'
    },
    {
      id: 'usr-prof-1',
      tenant_id: 'tenant-itc',
      name: 'Mtra. Elena Salgado (Profesora)',
      email: 'elena.salgado@itc.edu',
      password_hash: defaultPasswordHash,
      role_id: 'role-teacher',
      identifier: 'DOC-101'
    },
    {
      id: 'usr-prof-2',
      tenant_id: 'tenant-itc',
      name: 'Dr. Carlos Vega (Profesor)',
      email: 'carlos.vega@itc.edu',
      password_hash: defaultPasswordHash,
      role_id: 'role-teacher',
      identifier: 'DOC-102'
    },
    {
      id: 'usr-stud-1',
      tenant_id: 'tenant-itc',
      name: 'Juan Pérez (Alumno)',
      email: 'alumno@itc.edu',
      password_hash: defaultPasswordHash,
      role_id: 'role-student',
      identifier: 'ALU-2026-001'
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

module.exports = {
  db,
  query,
  initDatabase
};
