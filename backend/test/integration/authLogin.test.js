import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../../src/server';
const { pool } = require('../../src/db');

describe('Integración: Login Endpoint con PostgreSQL (Mockeado via spy)', () => {

    let poolQuerySpy;

    beforeEach(() => {
        vi.clearAllMocks();
        poolQuerySpy = vi.spyOn(pool, 'query');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('Debe devolver 401 si faltan credenciales', async () => {
        const response = await request(app)
            .post('/api/auth/login')
            .send({ email: 'coordinador@itc.edu' }); // Falta password

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Debe ingresar correo y contraseña');
    });

    it('Debe devolver 401 si el usuario no existe', async () => {
        // Simulamos que la BD no encuentra al usuario (rows = [])
        poolQuerySpy.mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
            .post('/api/auth/login')
            .send({ email: 'noexiste@itc.edu', password: 'password123' });

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Credenciales inválidas (usuario o institución no encontrados)');
        expect(poolQuerySpy).toHaveBeenCalledTimes(1);
    });

    it('Debe devolver 401 con contraseña incorrecta', async () => {
        const hashedPassword = bcrypt.hashSync('correct-password', 10);
        
        // Simulamos usuario encontrado en db.js -> pool.query()
        poolQuerySpy.mockResolvedValueOnce({ 
            rows: [{ id: 'usr-1', email: 'test@itc.edu', password_hash: hashedPassword, tenant_id: 'tenant-itc', role_id: 'role-coord' }] 
        });

        const response = await request(app)
            .post('/api/auth/login')
            .send({ email: 'test@itc.edu', password: 'wrong-password' });

        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Credenciales inválidas (contraseña incorrecta)');
    });

    it('Debe autenticar y devolver un JWT válido al proporcionar credenciales correctas', async () => {
        const hashedPassword = bcrypt.hashSync('demo123', 10);
        
        // authController.login -> Busca usuario
        poolQuerySpy.mockResolvedValueOnce({ 
            rows: [{ id: 'usr-coord-1', email: 'coordinador@itc.edu', password_hash: hashedPassword, tenant_id: 'tenant-itc', role_id: 'role-coord', role_name: 'Coordinador', name: 'Dr. Roberto Mendoza (Coordinador)' }] 
        });

        const response = await request(app)
            .post('/api/auth/login')
            .send({ email: 'coordinador@itc.edu', password: 'demo123', tenant_id: 'tenant-itc' });

        expect(response.status).toBe(200);
        expect(response.body.token).toBeDefined();
        expect(response.body.user).toBeDefined();
        expect(response.body.user.role_name).toBe('Coordinador');

        // Verificar el payload del JWT
        const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET || 'planta_academica_super_secret_jwt_key_2026');
        expect(decoded.tenant_id).toBe('tenant-itc');
        expect(decoded.role).toBe('Coordinador');
    });
});
