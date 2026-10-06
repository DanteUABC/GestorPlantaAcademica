import { setActivePinia, createPinia, defineStore } from 'pinia';
import { describe, it, expect, beforeEach } from 'vitest';

// Simulación del store esperado para la Task 1.5
const useAuthStore = defineStore('auth', {
    state: () => ({
        isAuthenticated: false,
        userProfile: null,
        tenant_id: null,
        token: null,
    }),
    actions: {
        loginSuccess(payload) {
            this.isAuthenticated = true;
            this.token = payload.token;
            this.tenant_id = payload.tenant_id;
            this.userProfile = payload.userProfile;
        },
        logout() {
            this.isAuthenticated = false;
            this.token = null;
            this.tenant_id = null;
            this.userProfile = null;
        }
    }
});

describe('authStore - Gestión de Sesión', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
    });

    it('el estado inicial debe estar desautenticado', () => {
        const store = useAuthStore();
        expect(store.isAuthenticated).toBe(false);
        expect(store.token).toBeNull();
    });

    it('debe actualizar el estado al iniciar sesión exitosamente', () => {
        const store = useAuthStore();
        store.loginSuccess({ token: 'jwt123', tenant_id: 10, userProfile: { name: 'Admin' } });
        
        expect(store.isAuthenticated).toBe(true);
        expect(store.tenant_id).toBe(10);
        expect(store.token).toBe('jwt123');
    });

    it('debe limpiar el estado al cerrar sesión', () => {
        const store = useAuthStore();
        store.loginSuccess({ token: 'jwt123', tenant_id: 10, userProfile: { name: 'Admin' } });
        store.logout();
        
        expect(store.isAuthenticated).toBe(false);
        expect(store.token).toBeNull();
        expect(store.tenant_id).toBeNull();
    });
});
