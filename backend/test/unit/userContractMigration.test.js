import { describe, it, expect, vi, beforeAll } from 'vitest';
import { migrateUserContractAndStatus, ALLOWED_USER_STATUSES } from '../../src/utils/userContractMigration';
import pool, { initDatabase } from '../../src/db';

describe('Migración DDL: Límite contractual de horas, estatus y desvinculación de email en tabla users', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  describe('Criterios de Aceptación (Unidad con Mock)', () => {
    it('Criterio 1, 2 y 3: La migración ejecuta DDL idempotente con IF NOT EXISTS, NOT NULL DROP y DEFAULTs', async () => {
      const executedQueries = [];
      const mockClient = {
        query: vi.fn(async (sql) => {
          executedQueries.push(sql.trim());
          return { rowCount: 1, rows: [] };
        })
      };

      await migrateUserContractAndStatus(mockClient);

      expect(mockClient.query).toHaveBeenCalled();
      const combinedSql = executedQueries.join('\n');

      // 1. horas_contratadas INTEGER DEFAULT 25
      expect(combinedSql).toMatch(/ALTER TABLE users ADD COLUMN IF NOT EXISTS horas_contratadas INTEGER DEFAULT 25/i);
      expect(combinedSql).toMatch(/ALTER TABLE users ALTER COLUMN horas_contratadas SET DEFAULT 25/i);
      expect(combinedSql).toMatch(/UPDATE users SET horas_contratadas = 25 WHERE horas_contratadas IS NULL/i);

      // 2. estatus VARCHAR(20) DEFAULT 'activo' con CHECK constraint
      expect(combinedSql).toMatch(/ALTER TABLE users ADD COLUMN IF NOT EXISTS estatus VARCHAR\(20\) DEFAULT 'activo'/i);
      expect(combinedSql).toMatch(/ALTER TABLE users ALTER COLUMN estatus SET DEFAULT 'activo'/i);
      expect(combinedSql).toMatch(/UPDATE users SET estatus = 'activo' WHERE estatus IS NULL/i);
      expect(combinedSql).toMatch(/chk_users_estatus/i);
      expect(combinedSql).toMatch(/CHECK\s*\(\s*estatus IN \('activo',\s*'inactivo',\s*'baja'\)\)/i);

      // 3. email DROP NOT NULL y email_activo BOOLEAN DEFAULT TRUE
      expect(combinedSql).toMatch(/ALTER TABLE users ALTER COLUMN email DROP NOT NULL/i);
      expect(combinedSql).toMatch(/ALTER TABLE users ADD COLUMN IF NOT EXISTS email_activo BOOLEAN DEFAULT TRUE/i);
      expect(combinedSql).toMatch(/ALTER TABLE users ALTER COLUMN email_activo SET DEFAULT TRUE/i);
      expect(combinedSql).toMatch(/UPDATE users SET email_activo = TRUE WHERE email_activo IS NULL/i);

      // 4. Inicialización específica de profesores
      expect(combinedSql).toMatch(/UPDATE users[\s\S]*horas_contratadas = COALESCE[\s\S]*Profesor/i);

      // 5. Vista de compatibilidad usuarios actualizada
      expect(combinedSql).toMatch(/DROP VIEW IF EXISTS usuarios CASCADE/i);
      expect(combinedSql).toMatch(/CREATE OR REPLACE VIEW usuarios AS/i);
      expect(combinedSql).toMatch(/horas_contratadas/i);
      expect(combinedSql).toMatch(/estatus/i);
      expect(combinedSql).toMatch(/email_activo/i);
    });

    it('Criterio 4: La migración es idempotente y puede ejecutarse múltiples veces consecutivas sin fallar', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] })
      };

      await expect(migrateUserContractAndStatus(mockClient)).resolves.not.toThrow();
      await expect(migrateUserContractAndStatus(mockClient)).resolves.not.toThrow();
      await expect(migrateUserContractAndStatus(mockClient)).resolves.not.toThrow();

      expect(mockClient.query).toHaveBeenCalled();
    });

    it('Soporta clientes con método exec además de query', async () => {
      const execQueries = [];
      const mockClientWithExec = {
        exec: vi.fn(async (sql) => {
          execQueries.push(sql);
          return true;
        })
      };

      await expect(migrateUserContractAndStatus(mockClientWithExec)).resolves.not.toThrow();
      expect(mockClientWithExec.exec).toHaveBeenCalled();
    });

    it('Define la constante ALLOWED_USER_STATUSES con los valores permitidos', () => {
      expect(ALLOWED_USER_STATUSES).toEqual(['activo', 'inactivo', 'baja']);
    });
  });

  describe('Criterios de Aceptación (Verificación sobre PostgreSQL)', () => {
    it('Criterio 1: La tabla users cuenta con horas_contratadas INTEGER DEFAULT 25', async () => {
      const res = await pool.query(`
        SELECT column_name, data_type, column_default
        FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'horas_contratadas'
      `);

      expect(res.rows.length).toBe(1);
      const col = res.rows[0];
      expect(col.column_name).toBe('horas_contratadas');
      expect(col.data_type).toBe('integer');
      expect(col.column_default).toContain('25');
    });

    it('Criterio 2: La tabla users cuenta con estatus VARCHAR(20) DEFAULT "activo"', async () => {
      const res = await pool.query(`
        SELECT column_name, data_type, character_maximum_length, column_default
        FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'estatus'
      `);

      expect(res.rows.length).toBe(1);
      const col = res.rows[0];
      expect(col.column_name).toBe('estatus');
      expect(col.data_type).toBe('character varying');
      expect(col.character_maximum_length).toBe(20);
      expect(col.column_default).toContain('activo');
    });

    it('Criterio 2: Restricción CHECK chk_users_estatus rechaza valores fuera de ("activo", "inactivo", "baja")', async () => {
      const res = await pool.query(`
        SELECT conname, pg_get_constraintdef(oid) as def
        FROM pg_constraint
        WHERE conrelid = 'users'::regclass AND conname = 'chk_users_estatus'
      `);

      expect(res.rows.length).toBe(1);
      const constraint = res.rows[0];
      expect(constraint.conname).toBe('chk_users_estatus');
      expect(constraint.def).toContain('activo');
      expect(constraint.def).toContain('inactivo');
      expect(constraint.def).toContain('baja');

      // Intentar insertar un valor inválido debe fallar con error de check constraint
      await expect(pool.query(`
        INSERT INTO users (id, tenant_id, nombre, apellidos, email, role_id, estatus)
        VALUES ('usr-test-invalid-status', 'tenant-itc', 'Test', 'Estatus', 'test.invalid.status@pavilion.com', 'role-teacher', 'suspendido')
      `)).rejects.toThrow();
    });

    it('Criterio 3: La columna email permite valores NULL y existe email_activo BOOLEAN DEFAULT TRUE', async () => {
      const emailCol = await pool.query(`
        SELECT column_name, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'email'
      `);

      expect(emailCol.rows.length).toBe(1);
      expect(emailCol.rows[0].is_nullable).toBe('YES');

      const emailActivoCol = await pool.query(`
        SELECT column_name, data_type, column_default
        FROM information_schema.columns
        WHERE table_name = 'users' AND column_name = 'email_activo'
      `);

      expect(emailActivoCol.rows.length).toBe(1);
      expect(emailActivoCol.rows[0].data_type).toBe('boolean');
      expect(emailActivoCol.rows[0].column_default).toContain('true');
    });

    it('Criterio 4: Ejecución directa de migrateUserContractAndStatus en PostgreSQL es idempotente', async () => {
      await expect(migrateUserContractAndStatus(pool)).resolves.not.toThrow();
      await expect(migrateUserContractAndStatus(pool)).resolves.not.toThrow();
    });

    it('Criterio 5: Todos los usuarios con rol Profesor quedan con horas_contratadas = 25 y estatus = "activo"', async () => {
      const res = await pool.query(`
        SELECT u.id, u.nombre, u.role_id, u.horas_contratadas, u.estatus
        FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE r.name = 'Profesor' OR r.nombre = 'Profesor'
      `);

      expect(res.rows.length).toBeGreaterThan(0);
      for (const teacher of res.rows) {
        expect(teacher.horas_contratadas).toBe(25);
        expect(teacher.estatus).toBe('activo');
      }
    });

    it('Criterio 6: Permite desvincular correos (email = NULL o email_activo = false) sin violar UNIQUE(tenant_id, email)', async () => {
      const tenantId = 'tenant-itc';

      // Insertar dos usuarios de prueba en el mismo tenant con email desvinculado (NULL)
      await pool.query(`
        INSERT INTO users (id, tenant_id, nombre, apellidos, email, email_activo, role_id, estatus, horas_contratadas)
        VALUES ('usr-null-email-1', $1, 'Docente1', 'SinEmail', NULL, FALSE, 'role-teacher', 'inactivo', 20)
        ON CONFLICT (id) DO NOTHING;
      `, [tenantId]);

      await pool.query(`
        INSERT INTO users (id, tenant_id, nombre, apellidos, email, email_activo, role_id, estatus, horas_contratadas)
        VALUES ('usr-null-email-2', $1, 'Docente2', 'SinEmail', NULL, FALSE, 'role-teacher', 'baja', 10)
        ON CONFLICT (id) DO NOTHING;
      `, [tenantId]);

      const verify = await pool.query(`
        SELECT id, email, email_activo, estatus, horas_contratadas
        FROM users
        WHERE id IN ('usr-null-email-1', 'usr-null-email-2')
      `);

      expect(verify.rows.length).toBe(2);
      expect(verify.rows[0].email).toBeNull();
      expect(verify.rows[0].email_activo).toBe(false);
      expect(verify.rows[1].email).toBeNull();
      expect(verify.rows[1].email_activo).toBe(false);

      // Limpieza de usuarios temporales
      await pool.query("DELETE FROM users WHERE id IN ('usr-null-email-1', 'usr-null-email-2')");
    });

    it('Criterio 7: Ninguna llave foránea en schedules o schedule_substitutions se ve afectada', async () => {
      // Verificar que el docente de muestra usr-prof-1 puede actualizarse a estatus = 'inactivo' y email_activo = false
      // manteniendo su horario asignado en schedules
      await pool.query(`
        UPDATE users 
        SET estatus = 'inactivo', email_activo = FALSE, email = NULL
        WHERE id = 'usr-prof-1'
      `);

      // Verificar que el schedule sigue existiendo y apuntando a usr-prof-1
      const schedulesCheck = await pool.query(`
        SELECT s.id, s.teacher_id, u.estatus, u.email_activo, u.email
        FROM schedules s
        JOIN users u ON s.teacher_id = u.id
        WHERE s.teacher_id = 'usr-prof-1'
      `);

      expect(schedulesCheck.rows.length).toBeGreaterThan(0);
      expect(schedulesCheck.rows[0].teacher_id).toBe('usr-prof-1');
      expect(schedulesCheck.rows[0].estatus).toBe('inactivo');
      expect(schedulesCheck.rows[0].email).toBeNull();

      // Restaurar el email y estatus de usr-prof-1 para el resto de las pruebas
      await pool.query(`
        UPDATE users 
        SET estatus = 'activo', email_activo = TRUE, email = 'elena.salgado@pavilion.com'
        WHERE id = 'usr-prof-1'
      `);
    });

    it('Criterio 8: La vista usuarios incluye horas_contratadas, estatus y email_activo', async () => {
      const res = await pool.query(`
        SELECT id, nombre, email_activo, horas_contratadas, estatus
        FROM usuarios
        WHERE id = 'usr-prof-1'
      `);

      expect(res.rows.length).toBe(1);
      const row = res.rows[0];
      expect(row.horas_contratadas).toBe(25);
      expect(row.estatus).toBe('activo');
      expect(row.email_activo).toBe(true);
    });
  });
});
