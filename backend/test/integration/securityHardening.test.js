import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const app = require('../../src/server');

describe('Hardening de Seguridad: CORS, Cabeceras HTTP y Endpoint de Salud', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Endpoint de Salud (/api/health)', () => {
    it('GET /api/health debe responder HTTP 200 OK con payload JSON { status: "OK", timestamp }', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'OK');
      expect(res.body).toHaveProperty('timestamp');
      expect(new Date(res.body.timestamp).getTime()).not.toBeNaN();
    });

    it('GET /health también debe responder HTTP 200 OK', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('status', 'OK');
    });
  });

  describe('Sanitización y Cabeceras de Seguridad HTTP', () => {
    it('debe incluir X-Content-Type-Options: nosniff, X-Frame-Options: DENY y Referrer-Policy en todas las respuestas', async () => {
      process.env.NODE_ENV = 'development';
      const res = await request(app).get('/api/health');

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(res.headers['strict-transport-security']).toBeUndefined();
    });

    it('debe incorporar Strict-Transport-Security (HSTS) únicamente cuando NODE_ENV="production"', async () => {
      process.env.NODE_ENV = 'production';
      const res = await request(app).get('/api/health');

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
    });
  });

  describe('Hardening de CORS en Producción (NODE_ENV="production")', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      process.env.FRONTEND_URL = 'https://gestor-planta.onrender.com';
    });

    it('debe rechazar orígenes no autorizados sin conceder cabeceras Access-Control-Allow-Origin', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://sitio-malicioso.com');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it('debe conceder cabeceras CORS al origen exacto configurado en FRONTEND_URL con credentials: true', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'https://gestor-planta.onrender.com');

      expect(res.headers['access-control-allow-origin']).toBe('https://gestor-planta.onrender.com');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('preflight OPTIONS con origen autorizado debe responder con cabeceras CORS válidas', async () => {
      const res = await request(app)
        .options('/api/health')
        .set('Origin', 'https://gestor-planta.onrender.com')
        .set('Access-Control-Request-Method', 'GET');

      expect(res.headers['access-control-allow-origin']).toBe('https://gestor-planta.onrender.com');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('preflight OPTIONS con origen no autorizado no debe conceder Access-Control-Allow-Origin', async () => {
      const res = await request(app)
        .options('/api/health')
        .set('Origin', 'http://sitio-atacante.xyz')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('debe rechazar comodines (*) en FRONTEND_URL en modo producción', async () => {
      process.env.FRONTEND_URL = '*';
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'https://cualquier-sitio.com');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('CORS en Desarrollo y Test (NODE_ENV="test" / "development")', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      process.env.FRONTEND_URL = 'http://localhost:5173';
    });

    it('debe permitir orígenes locales de desarrollo (localhost / 127.0.0.1)', async () => {
      const res1 = await request(app)
        .get('/api/health')
        .set('Origin', 'http://localhost:5173');

      expect(res1.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(res1.headers['access-control-allow-credentials']).toBe('true');

      const res2 = await request(app)
        .get('/api/health')
        .set('Origin', 'http://127.0.0.1:5173');

      expect(res2.headers['access-control-allow-origin']).toBe('http://127.0.0.1:5173');
    });

    it('debe denegar orígenes externos no locales en desarrollo si no coinciden con FRONTEND_URL', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'http://sitio-desconocido.org');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('debe permitir peticiones sin header Origin (ej. curl, herramientas internas, monitores locales)', async () => {
      const res = await request(app).get('/api/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('OK');
    });
  });
});
