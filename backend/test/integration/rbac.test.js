import { describe, it, expect } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { authenticateJWT, JWT_SECRET } from '../../src/middleware/auth';
import { requireRole } from '../../src/middleware/rbac';

const app = express();
app.use(express.json());

// Ruta temporal protegida por JWT y RBAC
app.get('/api/protected', authenticateJWT, requireRole(['Coordinador', 'Administrador']), (req, res) => {
    res.status(200).json({ message: 'Acceso permitido', user: req.user });
});

describe('Integración: RBAC y JWT', () => {

    it('Debe devolver 401 si no se envía el header Authorization (Escenario A)', async () => {
        const response = await request(app).get('/api/protected');
        expect(response.status).toBe(401);
        expect(response.body.error).toBe('Acceso no autorizado: Token ausente');
    });

    it('Debe devolver 403 si el JWT es inválido o expirado (Escenario A)', async () => {
        const response = await request(app)
            .get('/api/protected')
            .set('Authorization', 'Bearer token_invalido_123');
        
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Token inválido o expirado');
    });

    it('Debe devolver 403 si el rol es insuficiente (Escenario B)', async () => {
        // Generamos un token válido, pero con rol 'Profesor' (insuficiente)
        const token = jwt.sign(
            { id: 'usr-1', role_name: 'Profesor', tenant_id: 'tenant-1' }, 
            JWT_SECRET, 
            { expiresIn: '1h' }
        );

        const response = await request(app)
            .get('/api/protected')
            .set('Authorization', `Bearer ${token}`);
        
        expect(response.status).toBe(403);
        expect(response.body.error).toContain('Acceso denegado: Se requiere uno de los roles');
    });

    it('Debe autorizar el acceso (HTTP 200) si el JWT y rol son correctos (Escenario C)', async () => {
        // Generamos un token válido con rol 'Coordinador' (suficiente)
        const token = jwt.sign(
            { id: 'usr-2', role_name: 'Coordinador', tenant_id: 'tenant-1' }, 
            JWT_SECRET, 
            { expiresIn: '1h' }
        );

        const response = await request(app)
            .get('/api/protected')
            .set('Authorization', `Bearer ${token}`);
        
        expect(response.status).toBe(200);
        expect(response.body.message).toBe('Acceso permitido');
        expect(response.body.user.role_name).toBe('Coordinador');
    });

    it('Debe devolver 403 si el JWT no tiene rol definido', async () => {
        // Token válido pero sin role_name
        const token = jwt.sign(
            { id: 'usr-3', tenant_id: 'tenant-1' }, 
            JWT_SECRET, 
            { expiresIn: '1h' }
        );

        const response = await request(app)
            .get('/api/protected')
            .set('Authorization', `Bearer ${token}`);
        
        expect(response.status).toBe(403);
        expect(response.body.error).toBe('Acceso denegado: Rol no identificado');
    });
});
