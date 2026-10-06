import { setActivePinia, createPinia } from 'pinia';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '../authStore';
import api from '../../api/client';

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

    it('debe limpiar el estado al cerrar sesión', async () => {
        const store = useAuthStore();
        
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
    });
});
