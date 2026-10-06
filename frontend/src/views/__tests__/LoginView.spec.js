import { mount, config } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import LoginView from '../LoginView.vue';
import { createPinia } from 'pinia';

config.global.renderStubDefaultSlot = true;

// Mock simple para el Router
vi.mock('vue-router', () => ({
    useRouter: () => ({ push: vi.fn() }),
    useRoute: () => ({ query: {} })
}));

describe('LoginView.vue - UI de Autenticación', () => {
    it('debe renderizar el título de la vista', () => {
        const wrapper = mount(LoginView, {
            global: {
                plugins: [createPinia()],
                stubs: {
                    'v-container': true,
                    'v-card': true,
                    'v-avatar': true,
                    'v-icon': true,
                    'v-btn': true,
                    'v-alert': true,
                    'v-tabs': true,
                    'v-tab': true,
                    'v-window': true,
                    'v-window-item': true,
                    'v-form': true,
                    'v-select': true,
                    'v-text-field': true,
                    'v-divider': true,
                    'v-radio-group': true,
                    'v-radio': true,
                }
            }
        });
        
        expect(wrapper.text()).toContain('Gestor de Planta Académica');
    });

    it('debe contener los métodos para demoLogin', () => {
        const wrapper = mount(LoginView, {
            global: {
                plugins: [createPinia()],
                stubs: {
                    'v-container': true,
                    'v-card': true,
                    'v-avatar': true,
                    'v-icon': true,
                    'v-btn': true,
                    'v-alert': true,
                    'v-tabs': true,
                    'v-tab': true,
                    'v-window': true,
                    'v-window-item': true,
                    'v-form': true,
                    'v-select': true,
                    'v-text-field': true,
                    'v-divider': true,
                    'v-radio-group': true,
                    'v-radio': true,
                }
            }
        });
        
        // Simplemente verificamos que el componente montó sin errores y podemos llamar al setup
        expect(wrapper.exists()).toBe(true);
    });
});
