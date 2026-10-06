import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { authenticateJWT } from '../../src/middleware/auth';

describe('JWT Guard Middleware (authenticateJWT)', () => {
    it('debe devolver 401 si no hay cabecera Authorization', () => {
        const req = { headers: {} };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();

        authenticateJWT(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Acceso no autorizado: Token ausente' });
        expect(next).not.toHaveBeenCalled();
    });

    it('debe devolver 401 si el token no comienza con Bearer', () => {
        const req = { headers: { authorization: 'InvalidTokenFormat' } };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();

        authenticateJWT(req, res, next);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Acceso no autorizado: Token ausente' });
        expect(next).not.toHaveBeenCalled();
    });

    it('debe devolver 403 si el token es inválido', () => {
        const req = { headers: { authorization: 'Bearer TokenInvalido123' } };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();

        authenticateJWT(req, res, next);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({ error: 'Token inválido o expirado' });
        expect(next).not.toHaveBeenCalled();
    });

    it('debe inyectar el payload en req.user y llamar a next si el token es válido', () => {
        const payload = { id: 'usr-1', tenant_id: 'tenant-100', role: 'Profesor' };
        const token = jwt.sign(payload, process.env.JWT_SECRET || 'planta_academica_super_secret_jwt_key_2026');
        const req = { headers: { authorization: `Bearer ${token}` } };
        const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
        const next = vi.fn();

        authenticateJWT(req, res, next);

        expect(req.user).toBeDefined();
        expect(req.user.tenant_id).toBe('tenant-100');
        expect(req.user.role).toBe('Profesor');
        expect(next).toHaveBeenCalled();
    });
});
