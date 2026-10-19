import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../src/server';
const { pool } = require('../../src/db');
const { JWT_SECRET } = require('../../src/middleware/auth');
const authController = require('../../src/controllers/authController');

describe('Integración: Registro y Autenticación con Correo Externo (OAuth & Delegation)', () => {

    let poolQuerySpy;

    beforeEach(() => {
        vi.clearAllMocks();
        poolQuerySpy = vi.spyOn(pool, 'query');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('oauthCallback controller', () => {
        it('debe redirigir a /register/external con token temporal si el usuario es nuevo (isNew: true)', async () => {
            const req = {
                user: {
                    email: 'nuevo.usuario@gmail.com',
                    provider: 'google',
                    provider_id: 'g-123456',
                    isNew: true
                }
            };
            const redirectMock = vi.fn();
            const res = { redirect: redirectMock };

            await authController.oauthCallback(req, res);

            expect(redirectMock).toHaveBeenCalledTimes(1);
            const redirectUrl = redirectMock.mock.calls[0][0];
            expect(redirectUrl).toContain('/register/external?token=');
            expect(redirectUrl).toContain('email=nuevo.usuario%40gmail.com');

            // Extraer y validar el token temporal generado
            const tokenMatch = redirectUrl.match(/token=([^&]+)/);
            expect(tokenMatch).not.toBeNull();
            const decoded = jwt.verify(tokenMatch[1], JWT_SECRET);
            expect(decoded.email).toBe('nuevo.usuario@gmail.com');
            expect(decoded.provider).toBe('google');
            expect(decoded.provider_id).toBe('g-123456');
        });

        it('debe redirigir a /login con access token si el usuario ya existe (isNew: false)', async () => {
            const req = {
                user: {
                    id: 'usr-existing-1',
                    email: 'existente@gmail.com',
                    tenant_id: 'tenant-itc',
                    role_id: 'role-coord',
                    role_name: 'Coordinador',
                    name: 'Usuario Existente',
                    identifier: 'C005',
                    isNew: false
                }
            };
            const redirectMock = vi.fn();
            const cookieMock = vi.fn();
            const res = { redirect: redirectMock, cookie: cookieMock };

            await authController.oauthCallback(req, res);

            expect(cookieMock).toHaveBeenCalledWith('refresh_token', expect.any(String), expect.any(Object));
            expect(redirectMock).toHaveBeenCalledTimes(1);
            const redirectUrl = redirectMock.mock.calls[0][0];
            expect(redirectUrl).toContain('/login?token=');

            const tokenMatch = redirectUrl.match(/token=([^&]+)/);
            const decoded = jwt.verify(tokenMatch[1], JWT_SECRET);
            expect(decoded.sub).toBe('usr-existing-1');
            expect(decoded.role).toBe('Coordinador');
        });
    });

    describe('POST /api/auth/external-register', () => {
        it('debe devolver 400 si falta el token de registro', async () => {
            const response = await request(app)
                .post('/api/auth/external-register')
                .send({
                    nombre: 'Carlos',
                    apellidos: 'Santana',
                    rol_id: 2
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Token de registro inválido o expirado');
        });

        it('debe devolver 400 si el token es inválido o expirado', async () => {
            const response = await request(app)
                .post('/api/auth/external-register')
                .send({
                    token: 'invalid_token_xyz',
                    nombre: 'Carlos',
                    apellidos: 'Santana',
                    rol_id: 2
                });

            expect(response.status).toBe(400);
            expect(response.body.error).toBe('Token de registro inválido o expirado');
        });

        it('debe registrar un profesor con prefijo DOC y sin contraseña con token válido', async () => {
            const regToken = jwt.sign(
                { email: 'profesor.externo@gmail.com', provider: 'google', provider_id: 'g-987' },
                JWT_SECRET,
                { expiresIn: '15m' }
            );

            poolQuerySpy
                .mockResolvedValueOnce({ rows: [{ id_val: 'DOC-001' }] }) // generateIdentifier -> DOC-002
                .mockResolvedValueOnce({ rows: [{ id: 'usr-ext-1' }] }) // INSERT INTO usuarios
                .mockResolvedValueOnce({ rowCount: 1 }) // INSERT INTO usuarios_roles
                .mockResolvedValueOnce({
                    rows: [{
                        id: 'usr-ext-1',
                        tenant_id: 'tenant-itc',
                        email: 'profesor.externo@gmail.com',
                        name: 'Mateo Lopez',
                        identifier: 'DOC-002',
                        identificador: 'DOC-002',
                        role_id: 'role-teacher',
                        role_name: 'Profesor',
                        tenant_name: 'Instituto Tecnológico Central'
                    }]
                });

            const response = await request(app)
                .post('/api/auth/external-register')
                .send({
                    token: regToken,
                    nombre: 'Mateo',
                    apellidos: 'Lopez',
                    rol_id: 2,
                    tenant_id: 'tenant-itc'
                });

            expect(response.status).toBe(201);
            expect(response.body.message).toBe('Registro externo completado exitosamente');
            expect(response.body.token).toBeDefined();
            expect(response.body.role).toBe('Profesor');
            expect(response.body.user.identifier).toBe('DOC-002');
            expect(response.body.user.email).toBe('profesor.externo@gmail.com');

            const decoded = jwt.verify(response.body.token, JWT_SECRET);
            expect(decoded.role).toBe('Profesor');
            expect(decoded.sub).toBe('usr-ext-1');
        });

        it('debe registrar un coordinador con prefijo EMP cuando rol_id es 1', async () => {
            const regToken = jwt.sign(
                { email: 'coord.externo@outlook.com', provider: 'microsoft', provider_id: 'ms-555' },
                JWT_SECRET,
                { expiresIn: '15m' }
            );

            poolQuerySpy
                .mockResolvedValueOnce({ rows: [] }) // generateIdentifier -> EMP-001
                .mockResolvedValueOnce({ rows: [{ id: 'usr-ext-2' }] }) // INSERT usuarios
                .mockResolvedValueOnce({ rowCount: 1 }) // INSERT usuarios_roles
                .mockResolvedValueOnce({
                    rows: [{
                        id: 'usr-ext-2',
                        tenant_id: 'tenant-itc',
                        email: 'coord.externo@outlook.com',
                        name: 'Clara Oswald',
                        identifier: 'EMP-001',
                        identificador: 'EMP-001',
                        role_id: 'role-coord',
                        role_name: 'Coordinador',
                        tenant_name: 'Instituto Tecnológico Central'
                    }]
                });

            const response = await request(app)
                .post('/api/auth/external-register')
                .send({
                    token: regToken,
                    nombre: 'Clara',
                    apellidos: 'Oswald',
                    rol_id: 1,
                    tenant_id: 1
                });

            expect(response.status).toBe(201);
            expect(response.body.role).toBe('Coordinador');
            expect(response.body.user.identifier).toBe('EMP-001');
        });
    });
});
