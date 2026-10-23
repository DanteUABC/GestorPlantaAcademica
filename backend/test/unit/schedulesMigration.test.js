import { describe, it, expect, vi } from 'vitest';
import { migrateSchedulesGroupAndSession, ALLOWED_SESSION_TYPES } from '../../src/utils/schedulesMigration';
import { pool } from '../../src/db';

describe('Migración DDL: Modelo de Grupos y tipo de sesión en tabla schedules', () => {
  describe('Criterios de Aceptación (Unidad con Mock)', () => {
    it('Criterio 1, 2 y 4: La migración ejecuta DDL idempotente con IF NOT EXISTS, NOT NULL y DEFAULTs', async () => {
      const executedQueries = [];
      const mockClient = {
        query: vi.fn(async (sql) => {
          executedQueries.push(sql.trim());
          return { rowCount: 1, rows: [] };
        })
      };

      await migrateSchedulesGroupAndSession(mockClient);

      expect(mockClient.query).toHaveBeenCalled();
      const combinedSql = executedQueries.join('\n');

      // 1. group_code VARCHAR(50) NOT NULL DEFAULT 'G1'
      expect(combinedSql).toMatch(/ALTER TABLE schedules ADD COLUMN IF NOT EXISTS group_code VARCHAR\(50\) DEFAULT 'G1'/i);
      expect(combinedSql).toMatch(/UPDATE schedules SET group_code = 'G1' WHERE group_code IS NULL/i);
      expect(combinedSql).toMatch(/ALTER TABLE schedules ALTER COLUMN group_code SET NOT NULL/i);
      expect(combinedSql).toMatch(/ALTER TABLE schedules ALTER COLUMN group_code SET DEFAULT 'G1'/i);

      // 2. session_type VARCHAR(50) NOT NULL DEFAULT 'Clase Teórica'
      expect(combinedSql).toMatch(/ALTER TABLE schedules ADD COLUMN IF NOT EXISTS session_type VARCHAR\(50\) DEFAULT 'Clase Teórica'/i);
      expect(combinedSql).toMatch(/UPDATE schedules SET session_type = 'Clase Teórica'/i);
      expect(combinedSql).toMatch(/ALTER TABLE schedules ALTER COLUMN session_type SET NOT NULL/i);
      expect(combinedSql).toMatch(/ALTER TABLE schedules ALTER COLUMN session_type SET DEFAULT 'Clase Teórica'/i);

      // 3. Restricción CHECK para session_type
      expect(combinedSql).toMatch(/chk_schedules_session_type/i);
      expect(combinedSql).toMatch(/CHECK\s*\(\s*session_type IN \('Clase Teórica',\s*'Laboratorio',\s*'Taller'\)\)/i);

      // 4. Índice compuesto idx_schedules_tenant_group ON schedules (tenant_id, group_code)
      expect(combinedSql).toMatch(/CREATE INDEX IF NOT EXISTS idx_schedules_tenant_group ON schedules\s*\(\s*tenant_id\s*,\s*group_code\s*\)/i);
    });

    it('Criterio 4: La migración es idempotente y puede ejecutarse múltiples veces consecutivas sin fallar', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] })
      };

      // Ejecutar 3 veces consecutivas
      await expect(migrateSchedulesGroupAndSession(mockClient)).resolves.not.toThrow();
      await expect(migrateSchedulesGroupAndSession(mockClient)).resolves.not.toThrow();
      await expect(migrateSchedulesGroupAndSession(mockClient)).resolves.not.toThrow();

      // Debe haber ejecutado 10 queries por cada llamada (total 30)
      expect(mockClient.query).toHaveBeenCalledTimes(30);
    });

    it('Soporta clientes con método exec además de query', async () => {
      const execQueries = [];
      const mockClientWithExec = {
        exec: vi.fn(async (sql) => {
          execQueries.push(sql);
          return true;
        })
      };

      await expect(migrateSchedulesGroupAndSession(mockClientWithExec)).resolves.not.toThrow();
      expect(mockClientWithExec.exec).toHaveBeenCalledTimes(10);
    });

    it('Define la constante ALLOWED_SESSION_TYPES con los 3 tipos permitidos', () => {
      expect(ALLOWED_SESSION_TYPES).toEqual(['Clase Teórica', 'Laboratorio', 'Taller']);
    });
  });

  describe('Criterios de Aceptación (Verificación sobre PostgreSQL)', () => {
    it('Criterio 1: La tabla schedules cuenta con group_code VARCHAR(50) DEFAULT "G1" NOT NULL', async () => {
      const res = await pool.query(`
        SELECT column_name, data_type, character_maximum_length, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'schedules' AND column_name = 'group_code'
      `);

      expect(res.rows.length).toBe(1);
      const col = res.rows[0];
      expect(col.column_name).toBe('group_code');
      expect(col.data_type).toBe('character varying');
      expect(col.character_maximum_length).toBe(50);
      expect(col.is_nullable).toBe('NO');
      expect(col.column_default).toContain('G1');
    });

    it('Criterio 2: La tabla schedules cuenta con session_type VARCHAR(50) DEFAULT "Clase Teórica" NOT NULL', async () => {
      const res = await pool.query(`
        SELECT column_name, data_type, character_maximum_length, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'schedules' AND column_name = 'session_type'
      `);

      expect(res.rows.length).toBe(1);
      const col = res.rows[0];
      expect(col.column_name).toBe('session_type');
      expect(col.data_type).toBe('character varying');
      expect(col.character_maximum_length).toBe(50);
      expect(col.is_nullable).toBe('NO');
      expect(col.column_default).toContain('Clase Teórica');
    });

    it('Criterio 2: Restricción CHECK chk_schedules_session_type rechaza valores fuera de los permitidos', async () => {
      const res = await pool.query(`
        SELECT conname, pg_get_constraintdef(oid) as def
        FROM pg_constraint
        WHERE conrelid = 'schedules'::regclass AND conname = 'chk_schedules_session_type'
      `);

      expect(res.rows.length).toBe(1);
      const constraint = res.rows[0];
      expect(constraint.conname).toBe('chk_schedules_session_type');
      expect(constraint.def).toContain('Clase Teórica');
      expect(constraint.def).toContain('Laboratorio');
      expect(constraint.def).toContain('Taller');
    });

    it('Criterio 3: Existe el índice compuesto idx_schedules_tenant_group ON schedules (tenant_id, group_code)', async () => {
      const res = await pool.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'schedules' AND indexname = 'idx_schedules_tenant_group'
      `);

      expect(res.rows.length).toBe(1);
      const idx = res.rows[0];
      expect(idx.indexname).toBe('idx_schedules_tenant_group');
      expect(idx.indexdef).toContain('tenant_id');
      expect(idx.indexdef).toContain('group_code');
    });

    it('Criterio 4: La migración sobre PostgreSQL es idempotente y se puede ejecutar múltiples veces sin error', async () => {
      await expect(migrateSchedulesGroupAndSession(pool)).resolves.not.toThrow();
      await expect(migrateSchedulesGroupAndSession(pool)).resolves.not.toThrow();
    });

    it('Criterio 4: Todos los registros existentes en schedules cuentan con valores no nulos en group_code y session_type', async () => {
      const res = await pool.query(`
        SELECT count(*) as null_count
        FROM schedules
        WHERE group_code IS NULL OR session_type IS NULL
      `);

      expect(Number(res.rows[0].null_count)).toBe(0);
    });
  });
});
