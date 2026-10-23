import { describe, it, expect, vi } from 'vitest';
import { migrateClassroomsType } from '../../src/utils/classroomMigration';
import { getClassrooms, createClassroom } from '../../src/controllers/catalogController';
import { pool } from '../../src/db';

describe('Migración DDL: Clasificación por tipo de instalación en classrooms', () => {
  describe('Criterios de Aceptación (Unidad con Mock)', () => {
    it('Criterio 1 y 4: La migración ejecuta DDL idempotente con IF NOT EXISTS, NOT NULL y DEFAULT "Aula Teórica"', async () => {
      const executedQueries = [];
      const mockClient = {
        query: vi.fn(async (sql) => {
          executedQueries.push(sql.trim());
          return { rowCount: 1, rows: [] };
        })
      };

      await migrateClassroomsType(mockClient);

      expect(mockClient.query).toHaveBeenCalled();
      const combinedSql = executedQueries.join('\n');

      // 1. Columna type VARCHAR(50) DEFAULT 'Aula Teórica' NOT NULL
      expect(combinedSql).toMatch(/ALTER TABLE classrooms ADD COLUMN IF NOT EXISTS type VARCHAR\(50\) DEFAULT 'Aula Teórica'/i);
      expect(combinedSql).toMatch(/ALTER TABLE classrooms ALTER COLUMN type SET NOT NULL/i);
      expect(combinedSql).toMatch(/ALTER TABLE classrooms ALTER COLUMN type SET DEFAULT 'Aula Teórica'/i);

      // 2. Migración de datos existentes sin type
      expect(combinedSql).toMatch(/UPDATE classrooms SET type = 'Aula Teórica' WHERE type IS NULL/i);

      // 3. Índice compuesto idx_classrooms_tenant_type ON classrooms (tenant_id, type)
      expect(combinedSql).toMatch(/CREATE INDEX IF NOT EXISTS idx_classrooms_tenant_type ON classrooms\s*\(\s*tenant_id\s*,\s*type\s*\)/i);
    });

    it('Criterio 4: La migración es idempotente y puede ejecutarse múltiples veces consecutivas sin fallar', async () => {
      const mockClient = {
        query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] })
      };

      // Ejecutar 3 veces consecutivas
      await expect(migrateClassroomsType(mockClient)).resolves.not.toThrow();
      await expect(migrateClassroomsType(mockClient)).resolves.not.toThrow();
      await expect(migrateClassroomsType(mockClient)).resolves.not.toThrow();

      // Debe haber ejecutado 4 queries por cada llamada (total 12)
      expect(mockClient.query).toHaveBeenCalledTimes(12);
    });

    it('Soporta clientes con método exec además de query', async () => {
      const execQueries = [];
      const mockClientWithExec = {
        exec: vi.fn(async (sql) => {
          execQueries.push(sql);
          return true;
        })
      };

      await expect(migrateClassroomsType(mockClientWithExec)).resolves.not.toThrow();
      expect(mockClientWithExec.exec).toHaveBeenCalledTimes(4);
    });
  });

  describe('Criterios de Aceptación (Verificación sobre PostgreSQL)', () => {
    it('Criterio 1: La tabla classrooms cuenta con type VARCHAR(50) DEFAULT "Aula Teórica" NOT NULL', async () => {
      const res = await pool.query(`
        SELECT column_name, data_type, character_maximum_length, column_default, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'classrooms' AND column_name = 'type'
      `);

      expect(res.rows.length).toBe(1);
      const col = res.rows[0];
      expect(col.column_name).toBe('type');
      expect(col.data_type).toBe('character varying');
      expect(col.character_maximum_length).toBe(50);
      expect(col.is_nullable).toBe('NO');
      expect(col.column_default).toContain('Aula Teórica');
    });

    it('Criterio 2: Las aulas existentes en la base de datos conservan aforo y edificio actual', async () => {
      const res = await pool.query(`
        SELECT id, name, building, capacity, type
        FROM classrooms
        WHERE tenant_id = 'tenant-itc'
        ORDER BY id ASC
      `);

      expect(res.rows.length).toBeGreaterThanOrEqual(3);

      const a101 = res.rows.find(c => c.id === 'cr-a101');
      expect(a101).toBeDefined();
      expect(a101.capacity).toBe(35);
      expect(a101.building).toBe('Edificio de Ciencias');
      expect(a101.type).toBe('Aula Teórica');

      const lab1 = res.rows.find(c => c.id === 'cr-lab1');
      expect(lab1).toBeDefined();
      expect(lab1.capacity).toBe(25);
      expect(lab1.building).toBe('Edificio Tecnologías');
      expect(lab1.type).toBeTruthy();

      const b202 = res.rows.find(c => c.id === 'cr-b202');
      expect(b202).toBeDefined();
      expect(b202.capacity).toBe(40);
      expect(b202.building).toBe('Edificio de Ingeniería');
      expect(b202.type).toBe('Aula Teórica');
    });

    it('Criterio 3: El índice compuesto idx_classrooms_tenant_type existe en classrooms (tenant_id, type)', async () => {
      const res = await pool.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'classrooms' AND indexname = 'idx_classrooms_tenant_type'
      `);

      expect(res.rows.length).toBe(1);
      const idx = res.rows[0];
      expect(idx.indexname).toBe('idx_classrooms_tenant_type');
      expect(idx.indexdef).toMatch(/tenant_id/i);
      expect(idx.indexdef).toMatch(/type/i);
    });

    it('Criterio 4: Ejecución directa de migrateClassroomsType en PostgreSQL es idempotente', async () => {
      await expect(migrateClassroomsType(pool)).resolves.not.toThrow();
      await expect(migrateClassroomsType(pool)).resolves.not.toThrow();
    });
  });

  describe('Controlador de Aulas (catalogController)', () => {
    it('getClassrooms retorna la columna type para cada aula', async () => {
      const req = { tenant_id: 'tenant-itc' };
      let jsonResult = null;
      const res = {
        json: (data) => { jsonResult = data; },
        status: vi.fn().mockReturnThis()
      };

      await getClassrooms(req, res);

      expect(Array.isArray(jsonResult)).toBe(true);
      expect(jsonResult.length).toBeGreaterThan(0);
      for (const classroom of jsonResult) {
        expect(classroom).toHaveProperty('type');
        expect(typeof classroom.type).toBe('string');
        expect(classroom.type.length).toBeGreaterThan(0);
      }
    });

    it('createClassroom asigna type por defecto a "Aula Teórica" si no se proporciona', async () => {
      const testName = 'Aula Test Default ' + Date.now();
      const req = {
        tenant_id: 'tenant-itc',
        body: {
          name: testName,
          building: 'Edificio Norte',
          capacity: 20
        }
      };

      let jsonResult = null;
      let statusCode = 200;
      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (data) => { jsonResult = data; }
          };
        }
      };

      await createClassroom(req, res);

      expect(statusCode).toBe(201);
      expect(jsonResult).toBeDefined();
      expect(jsonResult.type).toBe('Aula Teórica');

      // Limpiar registro de prueba
      if (jsonResult && jsonResult.id) {
        await pool.query('DELETE FROM classrooms WHERE id = $1', [jsonResult.id]);
      }
    });

    it('createClassroom permite registrar tipos personalizados como "Laboratorio de Cómputo"', async () => {
      const testName = 'Lab Test Custom ' + Date.now();
      const req = {
        tenant_id: 'tenant-itc',
        body: {
          name: testName,
          building: 'Edificio Sur',
          capacity: 15,
          type: 'Laboratorio de Cómputo'
        }
      };

      let jsonResult = null;
      let statusCode = 200;
      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (data) => { jsonResult = data; }
          };
        }
      };

      await createClassroom(req, res);

      expect(statusCode).toBe(201);
      expect(jsonResult).toBeDefined();
      expect(jsonResult.type).toBe('Laboratorio de Cómputo');

      // Limpiar registro de prueba
      if (jsonResult && jsonResult.id) {
        await pool.query('DELETE FROM classrooms WHERE id = $1', [jsonResult.id]);
      }
    });
  });
});
