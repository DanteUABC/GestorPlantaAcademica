import { describe, it, expect, vi, beforeEach } from 'vitest';
import router from '../index';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../../stores/authStore';

// Evitar dependencias de componentes reales para el router test
vi.mock('../../views/LoginView.vue', () => ({ default: { template: '<div></div>' } }));
vi.mock('../../views/CoordinatorView.vue', () => ({ default: { template: '<div></div>' } }));
vi.mock('../../views/TeacherView.vue', () => ({ default: { template: '<div></div>' } }));
vi.mock('../../views/UnauthorizedView.vue', () => ({ default: { template: '<div></div>' } }));

describe('Vue Router - Navigation Guards', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        vi.clearAllMocks();
    });

    it('debe redirigir a /login si el usuario no está autenticado e intenta acceder a una ruta protegida', async () => {
        const store = useAuthStore();
        // Forzamos que silentRefresh falle
        store.silentRefresh = vi.fn().mockResolvedValue(false);
        store.accessToken = null;

        await router.push('/coordinator');
        await router.isReady();
        
        expect(router.currentRoute.value.path).toBe('/login');
    });

    it('debe permitir el acceso si el usuario está autenticado', async () => {
        const store = useAuthStore();
        store.accessToken = 'dummy';
        store.userRole = 'Coordinador';

        await router.push('/coordinator');
        await router.isReady();
        
        expect(router.currentRoute.value.path).toBe('/coordinator');
    });
});
