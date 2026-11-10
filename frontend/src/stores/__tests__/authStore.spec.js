import { setActivePinia, createPinia } from 'pinia';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../authStore';
import api from '../../api/client';
import router from '../../router';

// Mock del cliente API
vi.mock('../../api/client', () => ({
    default: {
        post: vi.fn(),
        get: vi.fn()
    }
}));

// No mockearemos jwt-decode porque processToken lo necesita, 
// o sí lo mockeamos para devolver el payload directo:
vi.mock('jwt-decode', () => ({
    jwtDecode: vi.fn((token) => ({
        tenant_id: 10,
        role: 'Coordinador',
        sub: 'usr-1',
        name: 'Admin'
    }))
}));

describe('authStore - Gestión de Sesión', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
        localStorage.clear();
    });

    it('el estado inicial debe estar desautenticado', () => {
        const store = useAuthStore();
        expect(store.isAuthenticated).toBe(false);
        expect(store.accessToken).toBeNull();
    });

    it('debe actualizar el estado al iniciar sesión exitosamente', async () => {
        const store = useAuthStore();
        
        api.post.mockResolvedValueOnce({
            data: { accessToken: 'jwt123', user: { id: 'usr-1', name: 'Admin', role_name: 'Coordinador' } }
        });

        await store.login('test@test.com', 'pwd123');
        
        expect(store.isAuthenticated).toBe(true);
        expect(store.tenantId).toBe(10);
        expect(store.accessToken).toBe('jwt123');
        expect(store.userRole).toBe('Coordinador');
    });

    it('debe limpiar el estado al cerrar sesión y redirigir a /login', async () => {
        const store = useAuthStore();
        const pushSpy = vi.spyOn(router, 'push').mockImplementation(() => Promise.resolve());
        
        // Setup initial auth state manually
        store.accessToken = 'jwt123';
        store.tenantId = 10;
        store.userRole = 'Coordinador';
        
        api.post.mockResolvedValueOnce({});
        
        await store.logout();
        
        expect(store.isAuthenticated).toBe(false);
        expect(store.accessToken).toBeNull();
        expect(store.tenantId).toBeNull();
        expect(store.userRole).toBeNull();
        expect(pushSpy).toHaveBeenCalledWith('/login');
    });

    it('debe actualizar el estado al completar registro externo exitosamente', async () => {
        const store = useAuthStore();
        
        api.post.mockResolvedValueOnce({
            data: { accessToken: 'jwt123', user: { id: 'usr-ext-1', name: 'Externo User', role_name: 'Profesor' } }
        });

        await store.completeExternalRegistration({
            token: 'regToken123',
            nombre: 'Externo',
            apellidos: 'User',
            rol_id: 2,
            tenant_id: 'tenant-itc'
        });
        
        expect(api.post).toHaveBeenCalledWith('/auth/external-register', {
            token: 'regToken123',
            nombre: 'Externo',
            apellidos: 'User',
            rol_id: 2,
            tenant_id: 'tenant-itc'
        });
        expect(store.isAuthenticated).toBe(true);
        expect(store.accessToken).toBe('jwt123');
    });

    it('debe normalizar roles y resolver getHomeRoute correctamente', () => {
        const store = useAuthStore();

        // Rol role-teacher
        store.userRole = 'role-teacher';
        expect(store.isTeacher).toBe(true);
        expect(store.isCoordinator).toBe(false);
        expect(store.hasRole(['Profesor'])).toBe(true);
        expect(store.hasRole(['role-teacher'])).toBe(true);
        expect(store.hasRole(['Coordinador'])).toBe(false);
        expect(store.homeRoute).toBe('/teacher');
        expect(store.getHomeRoute()).toBe('/teacher');

        // Rol role-coord
        store.userRole = 'role-coord';
        expect(store.isCoordinator).toBe(true);
        expect(store.isTeacher).toBe(false);
        expect(store.hasRole(['Coordinador'])).toBe(true);
        expect(store.hasRole(['role-coord'])).toBe(true);
        expect(store.hasRole(['Profesor'])).toBe(false);
        expect(store.homeRoute).toBe('/coordinator');
        expect(store.getHomeRoute()).toBe('/coordinator');

        // Rol español Profesor / Coordinador
        expect(store.getHomeRoute('Profesor')).toBe('/teacher');
        expect(store.getHomeRoute('Coordinador')).toBe('/coordinator');
        expect(store.getHomeRoute('Desconocido')).toBe('/unauthorized');
    });

    it('debe manejar error HTTP 401 (Unauthorized) sin guardar tokens ni persistir sesion', async () => {
        const store = useAuthStore();
        api.post.mockRejectedValueOnce({
            response: {
                status: 401,
                data: { error: 'Credenciales invalidas' }
            }
        });

        await expect(store.login('docente@pavilion.com', 'badpwd', 'tenant-itc'))
            .rejects.toEqual('Credenciales invalidas');

        expect(store.isAuthenticated).toBe(false);
        expect(store.accessToken).toBeNull();
        expect(store.user).toBeNull();
        expect(store.error).toBe('Credenciales invalidas');
        expect(localStorage.getItem('token')).toBeNull();
        expect(localStorage.getItem('user')).toBeNull();
    });

    it('debe manejar error HTTP 403 (Forbidden) denegando acceso sin persistir sesion', async () => {
        const store = useAuthStore();
        api.post.mockRejectedValueOnce({
            response: {
                status: 403,
                data: { error: 'Acceso no autorizado para esta institucion' }
            }
        });

        await expect(store.login('coordinador@pavilion.com', 'password123', 'tenant-prohibido'))
            .rejects.toEqual('Acceso no autorizado para esta institucion');

        expect(store.isAuthenticated).toBe(false);
        expect(store.accessToken).toBeNull();
        expect(store.user).toBeNull();
        expect(store.error).toBe('Acceso no autorizado para esta institucion');
        expect(localStorage.getItem('token')).toBeNull();
        expect(localStorage.getItem('user')).toBeNull();
    });

    it('debe limpiar la sesion ante token expirado o invalido durante silentRefresh / checkAuth', async () => {
        const store = useAuthStore();
        vi.spyOn(router, 'push').mockImplementation(() => Promise.resolve());

        // Sesion activa previa
        store.accessToken = 'expired-token';
        store.tenantId = 'tenant-itc';
        store.userRole = 'Profesor';
        store.user = { id: 'usr-1', name: 'Docente Test' };
        localStorage.setItem('token', 'expired-token');
        localStorage.setItem('tenant_id', 'tenant-itc');
        localStorage.setItem('user', JSON.stringify(store.user));
        expect(store.isAuthenticated).toBe(true);

        // Mockear falla 401 en silentRefresh
        api.post.mockRejectedValueOnce({
            response: {
                status: 401,
                data: { error: 'Token expirado' }
            }
        });

        const refreshOk = await store.silentRefresh();

        expect(refreshOk).toBe(false);
        expect(store.isAuthenticated).toBe(false);
        expect(store.accessToken).toBeNull();
        expect(store.user).toBeNull();
        expect(store.tenantId).toBeNull();
        expect(localStorage.getItem('token')).toBeNull();
        expect(localStorage.getItem('user')).toBeNull();
        expect(localStorage.getItem('tenant_id')).toBeNull();

        // Validar comportamiento homologo mediante checkAuth
        store.accessToken = 'expired-token-2';
        expect(store.isAuthenticated).toBe(true);

        api.post.mockRejectedValueOnce(new Error('Sesion invalida'));
        const checkOk = await store.checkAuth();

        expect(checkOk).toBe(false);
        expect(store.isAuthenticated).toBe(false);
        expect(store.accessToken).toBeNull();
        expect(store.user).toBeNull();
    });
});
