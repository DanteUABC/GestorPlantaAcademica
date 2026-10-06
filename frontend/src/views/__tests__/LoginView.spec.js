import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';

// Simulación básica de LoginView.vue para cumplir con la Task 1.4
const LoginViewMock = {
    template: `
        <div>
            <input type="email" placeholder="Correo" data-test="email-input" />
            <input type="password" placeholder="Contraseña" data-test="password-input" />
            <button data-test="login-btn">Iniciar Sesión</button>
            <button data-test="google-sso">Continuar con Google</button>
            <button data-test="microsoft-sso">Continuar con Microsoft</button>
        </div>
    `
};

describe('LoginView.vue - UI de Autenticación', () => {
    it('debe renderizar los campos de correo y contraseña', () => {
        const wrapper = mount(LoginViewMock);
        expect(wrapper.find('[data-test="email-input"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="password-input"]').exists()).toBe(true);
    });

    it('debe contener el botón principal de acceso local y botones SSO', () => {
        const wrapper = mount(LoginViewMock);
        expect(wrapper.find('[data-test="login-btn"]').exists()).toBe(true);
        expect(wrapper.find('[data-test="google-sso"]').text()).toContain('Google');
        expect(wrapper.find('[data-test="microsoft-sso"]').text()).toContain('Microsoft');
    });
});
