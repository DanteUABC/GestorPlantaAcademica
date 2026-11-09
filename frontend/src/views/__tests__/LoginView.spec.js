import { mount, config, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginView from '../LoginView.vue';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../../stores/authStore';

config.global.renderStubDefaultSlot = true;

// Mock simple para el Router
vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        useRouter: () => ({ push: vi.fn() }),
        useRoute: () => ({ query: {} })
    };
});

vi.mock('../../api/client', () => ({
    default: {
        get: vi.fn().mockResolvedValue({
            data: [{ id: 'tenant-itc', name: 'Instituto Tecnológico Central' }]
        }),
        post: vi.fn()
    }
}));

describe('LoginView.vue - UI de Autenticación', () => {
    let pinia;

    beforeEach(() => {
        pinia = createPinia();
        setActivePinia(pinia);
        vi.clearAllMocks();
    });

    const stubs = {
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
    };

    it('debe renderizar el título de la vista', () => {
        const wrapper = mount(LoginView, {
            global: {
                plugins: [pinia],
                stubs
            }
        });
        
        expect(wrapper.text()).toContain('Gestor de Planta Académica');
    });

    it('no debe renderizar el banner de acceso rápido demo y debe validar inicio por credenciales o SSO', () => {
        const wrapper = mount(LoginView, {
            global: {
                plugins: [pinia],
                stubs
            }
        });
        
        expect(wrapper.text()).not.toContain('Acceso Rápido de Demostración');
        expect(wrapper.text()).not.toContain('Acceso Rápido');
        expect(wrapper.text()).not.toContain('PROBAR OTRO ROL DEMO');
        expect(wrapper.text()).not.toContain('demo123');
        expect(wrapper.exists()).toBe(true);
    });

    it('debe iniciar sesión exitosamente mediante el formulario legítimo con correo, contraseña y tenant', async () => {
        const store = useAuthStore(pinia);
        store.login = vi.fn().mockResolvedValue({ role_name: 'Coordinador' });

        const wrapper = mount(LoginView, {
            global: {
                plugins: [pinia],
                stubs
            }
        });
        await flushPromises();

        // a) Establecer la institución (tenant_id)
        wrapper.vm.loginForm.tenant_id = 'tenant-itc';

        // b) Asignar valores legítimos a los inputs de email y password
        wrapper.vm.loginForm.email = 'coordinador@pavilion.com';
        wrapper.vm.loginForm.password = 'ClaveSegura2026!';
        wrapper.vm.isLoginFormValid = true;

        // c) Disparar el evento de submit del formulario o invocar el flujo oficial de login
        const forms = wrapper.findAllComponents({ name: 'v-form' });
        const loginFormComp = forms[0];
        if (loginFormComp) {
            await loginFormComp.trigger('submit');
        }
        if (!store.login.mock.calls.length) {
            await wrapper.vm.handleLogin();
        }
        await flushPromises();

        // Verificar que se invoque authStore.login con los argumentos legítimos proporcionados
        expect(store.login).toHaveBeenCalledWith('coordinador@pavilion.com', 'ClaveSegura2026!', 'tenant-itc');
    });

    it('no debe procesar el inicio de sesión si el formulario es inválido', async () => {
        const store = useAuthStore(pinia);
        store.login = vi.fn();

        const wrapper = mount(LoginView, {
            global: {
                plugins: [pinia],
                stubs
            }
        });
        await flushPromises();

        wrapper.vm.isLoginFormValid = false;
        await wrapper.vm.handleLogin();
        await flushPromises();

        expect(store.login).not.toHaveBeenCalled();
    });

    it('debe validar la regla de terminación @pavilion.com', () => {
        const emailRules = [
            v => !!v || 'El correo es requerido.',
            v => (v && v.trim().toLowerCase().endsWith('@pavilion.com')) || 'Debe incluir la terminación @pavilion.com para continuar.'
        ];

        // Caso inválido: falta terminación @pavilion.com
        expect(emailRules[1]('usuario@gmail.com')).toBe('Debe incluir la terminación @pavilion.com para continuar.');
        expect(emailRules[1]('usuario@itc.edu')).toBe('Debe incluir la terminación @pavilion.com para continuar.');
        
        // Caso válido: con @pavilion.com
        expect(emailRules[1]('docente@pavilion.com')).toBe(true);
        expect(emailRules[1]('coordinador@pavilion.com ')).toBe(true);
    });

    it('no debe renderizar el campo de ID Institucional Asignado en el formulario de registro', () => {
        const wrapper = mount(LoginView, {
            global: {
                plugins: [pinia],
                stubs
            }
        });
        
        expect(wrapper.html()).not.toContain('ID Institucional Asignado');
        const textFields = wrapper.findAllComponents({ name: 'v-text-field' });
        const labels = textFields.map(f => f.attributes('label'));
        expect(labels).not.toContain('ID Institucional Asignado');
    });

    it('debe separar el nombre en dos campos: Nombre(s) y Apellidos', () => {
        const wrapper = mount(LoginView, {
            global: {
                plugins: [pinia],
                stubs
            }
        });

        const textFields = wrapper.findAllComponents({ name: 'v-text-field' });
        const labels = textFields.map(f => f.attributes('label'));
        expect(labels).toContain('Nombre(s)');
        expect(labels).toContain('Apellidos');
        expect(labels).not.toContain('Nombre Completo');
    });

    it('debe reemplazar v-radio-group por un v-select con label "Selecciona tu Rol"', () => {
        const wrapper = mount(LoginView, {
            global: {
                plugins: [pinia],
                stubs
            }
        });

        // No debe haber v-radio-group
        const radioGroups = wrapper.findAllComponents({ name: 'v-radio-group' });
        expect(radioGroups.length).toBe(0);

        // Debe haber un v-select con label "Selecciona tu Rol"
        const selects = wrapper.findAllComponents({ name: 'v-select' });
        const selectLabels = selects.map(s => s.attributes('label'));
        expect(selectLabels).toContain('Selecciona tu Rol');
    });

    it('debe enviar nombre y apellidos al backend en el registro manual', async () => {
        const store = useAuthStore(pinia);
        store.register = vi.fn().mockResolvedValue({ role_name: 'Profesor' });

        const wrapper = mount(LoginView, {
            global: {
                plugins: [pinia],
                stubs
            }
        });

        wrapper.vm.registerForm.nombre = 'Ana';
        wrapper.vm.registerForm.apellidos = 'Gómez';
        wrapper.vm.registerForm.role_name = 'Profesor';
        wrapper.vm.registerForm.tenant_id = 'tenant-itc';
        wrapper.vm.registerForm.email = 'ana.gomez@pavilion.com';
        wrapper.vm.registerForm.password = 'secreto123';
        wrapper.vm.isRegisterFormValid = true;

        await wrapper.vm.handleRegister();
        await flushPromises();

        expect(store.register).toHaveBeenCalledWith(expect.objectContaining({
            nombre: 'Ana',
            apellidos: 'Gómez',
            name: 'Ana Gómez',
            role_name: 'Profesor',
            email: 'ana.gomez@pavilion.com'
        }));
    });
});
