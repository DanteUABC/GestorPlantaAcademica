import { mount, config } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import UnauthorizedView from '../UnauthorizedView.vue';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../../stores/authStore';

config.global.renderStubDefaultSlot = true;

const mockRouter = {
  push: vi.fn()
};

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useRouter: () => mockRouter
  };
});

describe('UnauthorizedView.vue', () => {
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
    'v-btn': true
  };

  it('debe redirigir a /teacher si el usuario tiene rol role-teacher al hacer click en Volver', async () => {
    const store = useAuthStore(pinia);
    store.userRole = 'role-teacher';

    const wrapper = mount(UnauthorizedView, {
      global: {
        plugins: [pinia],
        stubs
      }
    });

    const returnBtn = wrapper.findAllComponents({ name: 'v-btn' })[0];
    await returnBtn.trigger('click');

    expect(mockRouter.push).toHaveBeenCalledWith('/teacher');
  });

  it('debe redirigir a /coordinator si el usuario tiene rol role-coord al hacer click en Volver', async () => {
    const store = useAuthStore(pinia);
    store.userRole = 'role-coord';

    const wrapper = mount(UnauthorizedView, {
      global: {
        plugins: [pinia],
        stubs
      }
    });

    const returnBtn = wrapper.findAllComponents({ name: 'v-btn' })[0];
    await returnBtn.trigger('click');

    expect(mockRouter.push).toHaveBeenCalledWith('/coordinator');
  });
});
