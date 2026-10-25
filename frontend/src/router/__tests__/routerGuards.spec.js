import { describe, it, expect, vi, beforeEach } from 'vitest';
import router from '../index';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../../stores/authStore';

// Evitar dependencias de componentes reales para el router test
vi.mock('../../views/LoginView.vue', () => ({ default: { template: '<div></div>' } }));
vi.mock('../../views/CoordinatorView.vue', () => ({ default: { template: '<div></div>' } }));
vi.mock('../../views/TeacherView.vue', () => ({ default: { template: '<div></div>' } }));
vi.mock('../../views/UnauthorizedView.vue', () => ({ default: { template: '<div></div>' } }));
vi.mock('../../views/ExternalRegisterView.vue', () => ({ default: { template: '<div></div>' } }));
vi.mock('../../views/AnalyticsDashboardView.vue', () => ({ default: { template: '<div></div>' } }));

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

    it('debe permitir el acceso a /register/external sin autenticación', async () => {
        const store = useAuthStore();
        store.accessToken = null;
        store.silentRefresh = vi.fn().mockResolvedValue(false);

        await router.push('/register/external');
        await router.isReady();

        expect(router.currentRoute.value.path).toBe('/register/external');
    });

    it('debe redirigir a un profesor autenticado a /teacher si intenta acceder a /login', async () => {
        const store = useAuthStore();
        store.accessToken = 'dummy-token';
        store.userRole = 'role-teacher';

        await router.push('/login');
        await router.isReady();

        expect(router.currentRoute.value.path).toBe('/teacher');
    });

    it('debe redirigir a un coordinador autenticado a /coordinator si intenta acceder a /login', async () => {
        const store = useAuthStore();
        store.accessToken = 'dummy-token';
        store.userRole = 'role-coord';

        await router.push('/login');
        await router.isReady();

        expect(router.currentRoute.value.path).toBe('/coordinator');
    });

    it('debe redirigir a /unauthorized si un usuario con role-teacher intenta acceder a /coordinator', async () => {
        const store = useAuthStore();
        store.accessToken = 'dummy-token';
        store.userRole = 'role-teacher';

        await router.push('/teacher');
        await router.push('/coordinator');
        await router.isReady();

        expect(router.currentRoute.value.path).toBe('/unauthorized');
    });

    it('debe permitir el acceso a /analytics a un coordinador autenticado', async () => {
        const store = useAuthStore();
        store.accessToken = 'dummy-token';
        store.userRole = 'role-coord';

        await router.push('/analytics');
        await router.isReady();

        expect(router.currentRoute.value.path).toBe('/analytics');
    });

    it('debe redirigir a /unauthorized si un profesor intenta acceder a /analytics', async () => {
        const store = useAuthStore();
        store.accessToken = 'dummy-token';
        store.userRole = 'role-teacher';

        await router.push('/teacher');
        await router.push('/analytics');
        await router.isReady();

        expect(router.currentRoute.value.path).toBe('/unauthorized');
    });
});
