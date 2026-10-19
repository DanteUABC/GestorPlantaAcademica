import { mount, config, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExternalRegisterView from '../ExternalRegisterView.vue';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../../stores/authStore';

config.global.renderStubDefaultSlot = true;

const { mockRoute, mockRouter } = vi.hoisted(() => ({
  mockRoute: {
    query: { token: 'sample-reg-token', email: 'externo@gmail.com' }
  },
  mockRouter: {
    push: vi.fn()
  }
}));

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useRoute: () => mockRoute,
    useRouter: () => mockRouter
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

describe('ExternalRegisterView.vue', () => {
  let pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.clearAllMocks();
    mockRoute.query = { token: 'sample-reg-token', email: 'externo@gmail.com' };
  });

  const stubs = {
    'v-container': true,
    'v-card': true,
    'v-card-title': true,
    'v-card-text': true,
    'v-avatar': true,
    'v-icon': true,
    'v-btn': true,
    'v-alert': true,
    'v-form': true,
    'v-select': true,
    'v-text-field': true
  };

  it('debe renderizar el título de la vista y el correo externo', async () => {
    const wrapper = mount(ExternalRegisterView, {
      global: {
        plugins: [pinia],
        stubs
      }
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Completar Registro');
    expect(wrapper.text()).toContain('externo@gmail.com');
  });

  it('debe redirigir a /login si no hay token en query params', async () => {
    mockRoute.query = {};
    mount(ExternalRegisterView, {
      global: {
        plugins: [pinia],
        stubs
      }
    });
    await flushPromises();

    expect(mockRouter.push).toHaveBeenCalledWith('/login');
  });

  it('debe invocar completeExternalRegistration al someter el formulario', async () => {
    const store = useAuthStore(pinia);
    store.completeExternalRegistration = vi.fn().mockResolvedValue({ role_name: 'Profesor' });

    const wrapper = mount(ExternalRegisterView, {
      global: {
        plugins: [pinia],
        stubs
      }
    });
    await flushPromises();

    wrapper.vm.nombre = 'Juan';
    wrapper.vm.apellidos = 'Perez';
    wrapper.vm.rol_id = 2;
    wrapper.vm.tenant_id = 'tenant-itc';

    await wrapper.vm.submitRegistration();

    expect(store.completeExternalRegistration).toHaveBeenCalledWith({
      token: 'sample-reg-token',
      nombre: 'Juan',
      apellidos: 'Perez',
      rol_id: 2,
      tenant_id: 'tenant-itc'
    });
    expect(mockRouter.push).toHaveBeenCalledWith('/teacher');
  });

  it('debe redirigir a /coordinator si el rol seleccionado es Coordinador (rol_id = 1)', async () => {
    const store = useAuthStore(pinia);
    store.completeExternalRegistration = vi.fn().mockResolvedValue({ role_name: 'Coordinador' });

    const wrapper = mount(ExternalRegisterView, {
      global: {
        plugins: [pinia],
        stubs
      }
    });
    await flushPromises();

    wrapper.vm.nombre = 'Ana';
    wrapper.vm.apellidos = 'Gomez';
    wrapper.vm.rol_id = 1;

    await wrapper.vm.submitRegistration();

    expect(mockRouter.push).toHaveBeenCalledWith('/coordinator');
  });
});
