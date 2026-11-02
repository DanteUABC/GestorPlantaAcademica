import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/server';
import { pool, initDatabase } from '../../src/db';
import { JWT_SECRET } from '../../src/middleware/auth';

describe('Integración: Alta Rápida de Materia (POST /api/subjects)', () => {
  const coordToken = jwt.sign(
    { id: 'usr-coord-1', role_name: 'Coordinador', tenant_id: 'tenant-itc', email: 'coord@itc.edu' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );

  beforeAll(async () => {
    await initDatabase();
  });

  it('POST /api/subjects retorna HTTP 201 y el objeto JSON completo de la asignatura recién creada (incluyendo id primario)', async () => {
    const uniqueCode = 'QSUB-' + Date.now().toString().slice(-5);
    const res = await request(app)
      .post('/api/subjects')
      .set('Authorization', `Bearer ${coordToken}`)
      .send({
        code: uniqueCode,
        name: 'Arquitectura de Microservicios',
        credits: 6
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('id');
    expect(typeof res.body.id).toBe('string');
    expect(res.body.id).toMatch(/^sub-/);
    expect(res.body.tenant_id).toBe('tenant-itc');
    expect(res.body.code).toBe(uniqueCode.toUpperCase());
    expect(res.body.name).toBe('Arquitectura de Microservicios');
    expect(res.body.credits).toBe(6);

    // Limpieza del registro de prueba
    await pool.query('DELETE FROM subjects WHERE id = $1', [res.body.id]);
  });

  it('POST /api/subjects retorna HTTP 400 si falta el código o nombre de la materia', async () => {
    const res = await request(app)
      .post('/api/subjects')
      .set('Authorization', `Bearer ${coordToken}`)
      .send({
        code: '',
        name: 'Materia Sin Clave'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Código y nombre de materia requeridos');
  });
});
