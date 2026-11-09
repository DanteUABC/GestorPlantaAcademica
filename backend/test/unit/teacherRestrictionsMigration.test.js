import { describe, it, expect, vi, beforeAll } from 'vitest';
import { migrateTeacherRestrictions, ALLOWED_RESTRICTION_DAYS } from '../../src/utils/teacherRestrictionsMigration';
import pool, { initDatabase } from '../../src/db';

describe('Migración DDL: Tabla teacher_restrictions (Restricciones horarias de docentes)', () => {
  beforeAll(async () => {
    await initDatabase();
  });

  describe('Criterios de Aceptación (Unidad con Mock)', () => {
    it('Ejecuta el bloque DDL exacto con CREATE TABLE IF NOT EXISTS, CHECK constraints, FKs ON DELETE CASCADE e índice idx_teacher_restrictions', async () => {
      const executedQueries = [];
      const mockClient = {
        query: vi.fn(async (sql) => {
          executedQueries.push(sql.trim());
          return { rowCount: 1, rows: [] };
        })
      };

      await migrateTeacherRestrictions(mockClient);

      expect(mockClient.query).toHaveBeenCalledTimes(1);
      const combinedSql = executedQueries.join('\n');

      expect(combinedSql).toMatch(/CREATE TABLE IF NOT EXISTS teacher_restrictions/i);
      expect(combinedSql).toMatch(/id VARCHAR\(50\) PRIMARY KEY/i);
      expect(combinedSql).toMatch(/tenant_id VARCHAR\(50\) NOT NULL/i);
      expect(combinedSql).toMatch(/teacher_id VARCHAR\(50\) NOT NULL/i);
      expect(combinedSql).toMatch(/day_of_week VARCHAR\(20\) NOT NULL CHECK \(day_of_week IN \('Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'\)\)/);
      expect(combinedSql).toMatch(/start_time VARCHAR\(5\) NOT NULL/i);
      expect(combinedSql).toMatch(/end_time VARCHAR\(5\) NOT NULL/i);
      expect(combinedSql).toMatch(/reason VARCHAR\(255\)/i);
      expect(combinedSql).toMatch(/created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP/i);
      expect(combinedSql).toMatch(/CONSTRAINT chk_time_order CHECK \(start_time < end_time\)/i);
      expect(combinedSql).toMatch(/FOREIGN KEY \(tenant_id\) REFERENCES tenants\(id\) ON DELETE CASCADE/i);
      expect(combinedSql).toMatch(/FOREIGN KEY \(teacher_id\) REFERENCES users\(id\) ON DELETE CASCADE/i);
      expect(combinedSql).toMatch(/CREATE INDEX IF NOT EXISTS idx_teacher_restrictions\s+ON teacher_restrictions \(tenant_id, teacher_id, day_of_week\)/i);
    });

    it('Es idempotente y soporta múltiples ejecuciones consecutivas y clientes con método exec', async () => {
      const mockClient = {
        exec: vi.fn().mockResolvedValue(true)
      };

      await expect(migrateTeacherRestrictions(mockClient)).resolves.not.toThrow();
      await expect(migrateTeacherRestrictions(mockClient)).resolves.not.toThrow();
      expect(mockClient.exec).toHaveBeenCalledTimes(2);
    });

    it('Define ALLOWED_RESTRICTION_DAYS con los 7 días de la semana en español', () => {
      expect(ALLOWED_RESTRICTION_DAYS).toEqual([
        'Lunes',
        'Martes',
        'Miércoles',
        'Jueves',
        'Viernes',
        'Sábado',
        'Domingo'
      ]);
    });
  });

  describe('Criterios de Aceptación (Verificación sobre PostgreSQL)', () => {
    it('Crea la tabla teacher_restrictions con todas las columnas requeridas', async () => {
      const res = await pool.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'teacher_restrictions'
        ORDER BY ordinal_position
      `);

      const colNames = res.rows.map((r) => r.column_name);
      expect(colNames).toEqual([
        'id',
        'tenant_id',
        'teacher_id',
        'day_of_week',
        'start_time',
        'end_time',
        'reason',
        'created_at'
      ]);
    });

    it('Crea el índice compuesto idx_teacher_restrictions sobre (tenant_id, teacher_id, day_of_week)', async () => {
      const res = await pool.query(`
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'teacher_restrictions' AND indexname = 'idx_teacher_restrictions'
      `);

      expect(res.rows.length).toBe(1);
      expect(res.rows[0].indexdef).toMatch(/\(tenant_id,\s*teacher_id,\s*day_of_week\)/i);
    });

    it('Valida estrictamente el orden de tiempo (chk_time_order: start_time < end_time) y los días permitidos', async () => {
      // 1. Inserción válida debe funcionar
      await pool.query(`
        INSERT INTO teacher_restrictions (id, tenant_id, teacher_id, day_of_week, start_time, end_time, reason)
        VALUES ('tr-test-valid', 'tenant-itc', 'usr-prof-1', 'Lunes', '08:00', '10:00', 'Investigación')
        ON CONFLICT (id) DO NOTHING
      `);

      const checkInserted = await pool.query(`SELECT * FROM teacher_restrictions WHERE id = 'tr-test-valid'`);
      expect(checkInserted.rows.length).toBe(1);

      // 2. start_time >= end_time debe ser rechazado por chk_time_order
      await expect(
        pool.query(`
          INSERT INTO teacher_restrictions (id, tenant_id, teacher_id, day_of_week, start_time, end_time, reason)
          VALUES ('tr-test-bad-time', 'tenant-itc', 'usr-prof-1', 'Martes', '12:00', '10:00', 'Horario invertido')
        `)
      ).rejects.toThrow();

      await expect(
        pool.query(`
          INSERT INTO teacher_restrictions (id, tenant_id, teacher_id, day_of_week, start_time, end_time, reason)
          VALUES ('tr-test-equal-time', 'tenant-itc', 'usr-prof-1', 'Martes', '10:00', '10:00', 'Horario igual')
        `)
      ).rejects.toThrow();

      // 3. Día inválido fuera del catálogo debe ser rechazado por el CHECK de day_of_week
      await expect(
        pool.query(`
          INSERT INTO teacher_restrictions (id, tenant_id, teacher_id, day_of_week, start_time, end_time, reason)
          VALUES ('tr-test-bad-day', 'tenant-itc', 'usr-prof-1', 'Monday', '08:00', '10:00', 'Día en inglés')
        `)
      ).rejects.toThrow();

      // Limpieza
      await pool.query(`DELETE FROM teacher_restrictions WHERE id = 'tr-test-valid'`);
    });

    it('Garantiza integridad referencial con ON DELETE CASCADE hacia tenants y users', async () => {
      // Crear usuario temporal para probar ON DELETE CASCADE
      await pool.query(`
        INSERT INTO users (id, tenant_id, nombre, apellidos, email, role_id)
        VALUES ('usr-temp-restr', 'tenant-itc', 'Temp', 'Teacher', 'temp.restr@pavilion.com', 'role-teacher')
        ON CONFLICT (id) DO NOTHING
      `);

      await pool.query(`
        INSERT INTO teacher_restrictions (id, tenant_id, teacher_id, day_of_week, start_time, end_time, reason)
        VALUES ('tr-cascade-test', 'tenant-itc', 'usr-temp-restr', 'Viernes', '14:00', '16:00', 'Comisión académica')
      `);

      // Eliminar el docente temporal debe eliminar en cascada su restricción
      await pool.query(`DELETE FROM users WHERE id = 'usr-temp-restr'`);

      const afterDelete = await pool.query(`SELECT * FROM teacher_restrictions WHERE id = 'tr-cascade-test'`);
      expect(afterDelete.rows.length).toBe(0);
    });
  });
});
