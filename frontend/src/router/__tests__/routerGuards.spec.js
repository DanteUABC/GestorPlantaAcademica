import { describe, it, expect, vi } from 'vitest';

// Simulación del Navigation Guard para la Task 1.6
const mockRouterGuard = (to, from, next, isAuthenticated) => {
    if (to.meta.requiresAuth && !isAuthenticated) {
        next('/login');
    } else {
        next();
    }
};

describe('Vue Router - Navigation Guards', () => {
    it('debe redirigir a /login si el usuario no está autenticado e intenta acceder a una ruta protegida', () => {
        const to = { path: '/dashboard', meta: { requiresAuth: true } };
        const from = { path: '/' };
        const next = vi.fn();
        const isAuthenticated = false;

        mockRouterGuard(to, from, next, isAuthenticated);

        expect(next).toHaveBeenCalledWith('/login');
    });

    it('debe permitir el acceso si el usuario está autenticado', () => {
        const to = { path: '/dashboard', meta: { requiresAuth: true } };
        const from = { path: '/' };
        const next = vi.fn();
        const isAuthenticated = true;

        mockRouterGuard(to, from, next, isAuthenticated);

        expect(next).toHaveBeenCalledWith(); // next() sin argumentos permite la navegación
    });
});
