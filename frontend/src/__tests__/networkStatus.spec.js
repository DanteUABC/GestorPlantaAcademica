import { mount, config, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import App from '../App.vue';
import CoordinatorView from '../views/CoordinatorView.vue';
import { useNetworkStatus } from '../composables/useNetworkStatus';
import api from '../api/client';

config.global.renderStubDefaultSlot = true;

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

const commonStubs = {
  'v-app': { template: '<div class="v-app"><slot /></div>' },
  'v-app-bar': { template: '<header class="v-app-bar"><slot /></header>' },
  'v-app-bar-title': { template: '<div><slot /></div>' },
  'v-main': { template: '<main class="v-main"><slot /></main>' },
  'v-footer': { template: '<footer><slot /></footer>' },
  'v-chip': { template: '<span class="v-chip"><slot /></span>' },
  'v-spacer': { template: '<div class="v-spacer"></div>' },
  'v-menu': { template: '<div class="v-menu"><slot /></div>' },
  'v-list': { template: '<ul><slot /></ul>' },
  'v-list-item': { template: '<li><slot /></li>' },
  'v-list-subheader': { template: '<div><slot /></div>' },
  'router-view': { template: '<div class="router-view-stub"></div>' },
  'v-container': { template: '<div class="v-container"><slot /></div>' },
  'v-card': { template: '<div class="v-card"><slot /></div>' },
  'v-card-title': { template: '<div class="v-card-title"><slot /></div>' },
  'v-card-text': { template: '<div class="v-card-text"><slot /></div>' },
  'v-card-actions': { template: '<div class="v-card-actions"><slot /></div>' },
  'v-row': { template: '<div class="v-row"><slot /></div>' },
  'v-col': { template: '<div class="v-col"><slot /></div>' },
  'v-icon': {
    props: ['icon'],
    template: '<i :class="icon"></i>'
  },
  'v-divider': true,
  'v-table': { template: '<table><slot /></table>' },
  'v-dialog': {
    props: ['modelValue'],
    template: '<div v-if="modelValue" class="v-dialog-stub"><slot /></div>'
  },
  'v-btn': {
    props: {
      disabled: Boolean,
      loading: Boolean,
      color: String
    },
    template: '<button :class="color" :disabled="disabled || loading" v-bind="$attrs"><slot /></button>'
  },
  'v-tooltip': {
    props: ['text', 'disabled'],
    template: '<div class="v-tooltip-stub" :data-text="text" :data-disabled="disabled"><slot /></div>'
  },
  'v-snackbar': {
    props: ['modelValue', 'color', 'timeout', 'location'],
    template: '<div v-if="modelValue" class="v-snackbar-stub" :class="color" :data-color="color" v-bind="$attrs"><slot /></div>'
  },
  'v-alert': {
    props: ['type'],
    template: '<div class="v-alert-stub" :class="type"><slot /></div>'
  },
  'v-autocomplete': true,
  'v-text-field': true,
  'v-select': true,
  'v-progress-linear': true,
  'ExcelScheduleUploader': true,
  'ClassroomCatalogView': true,
  'ScheduleTransferModal': true
};

describe('Indicador Reactivo de Estado de Red (Online / Offline) - Tarea 2', () => {
  let pinia;
  const network = useNetworkStatus();

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    network.resetNetworkStatus();
    vi.clearAllMocks();

    api.get.mockImplementation((url) => {
      if (url === '/schedules/coordinator') return Promise.resolve({ data: [] });
      if (url === '/subjects') return Promise.resolve({ data: [] });
      if (url === '/teachers') {
        return Promise.resolve({
          data: [
            {
              id: 'teach-1',
              name: 'Dr. Roberto Mendoza',
              email: 'roberto@uabc.edu.mx',
              email_activo: true,
              horas_contratadas: 20,
              horas_asignadas: 10
            }
          ]
        });
      }
      if (url === '/classrooms') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });
  });

  afterEach(() => {
    network.resetNetworkStatus();
  });

  describe('1. useNetworkStatus Composable', () => {
    it('debe iniciar por defecto en online y con banderas en estado base', () => {
      expect(network.isOnline.value).toBe(true);
      expect(network.showReconnectedBanner.value).toBe(false);
      expect(network.syncTrigger.value).toBe(0);
    });

    it('al disparar evento "offline", debe actualizar isOnline a false reactivamente', () => {
      window.dispatchEvent(new Event('offline'));
      expect(network.isOnline.value).toBe(false);
      expect(network.showReconnectedBanner.value).toBe(false);
    });

    it('al disparar evento "online" tras estar offline, debe activar reconexión e incrementar syncTrigger', () => {
      window.dispatchEvent(new Event('offline'));
      expect(network.isOnline.value).toBe(false);

      window.dispatchEvent(new Event('online'));
      expect(network.isOnline.value).toBe(true);
      expect(network.showReconnectedBanner.value).toBe(true);
      expect(network.syncTrigger.value).toBe(1);
    });
  });

  describe('2. Banners Offline y Notificación de Reconexión en App.vue', () => {
    it('muestra el banner offline persistente con color grey-darken-3 al pasar a offline', async () => {
      const wrapper = mount(App, {
        global: {
          plugins: [pinia],
          stubs: commonStubs
        }
      });

      // Inicialmente en online: no debe mostrarse el banner offline
      const offlineBannerInitial = wrapper.find('[data-testid="banner-offline"]');
      expect(offlineBannerInitial.exists()).toBe(false);

      // Simular pérdida de red
      window.dispatchEvent(new Event('offline'));
      await wrapper.vm.$nextTick();

      const offlineBanner = wrapper.find('[data-testid="banner-offline"]');
      expect(offlineBanner.exists()).toBe(true);
      expect(offlineBanner.attributes('data-color')).toBe('grey-darken-3');
      expect(offlineBanner.text()).toContain('Modo sin conexión: Estás visualizando los horarios guardados en tu dispositivo.');
      expect(offlineBanner.find('.mdi-wifi-off').exists()).toBe(true);
    });

    it('al recuperar la red, retira el aviso offline y despliega notificación verde de sincronización', async () => {
      const wrapper = mount(App, {
        global: {
          plugins: [pinia],
          stubs: commonStubs
        }
      });

      // Primero ir a offline
      window.dispatchEvent(new Event('offline'));
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="banner-offline"]').exists()).toBe(true);

      // Regresar a online
      window.dispatchEvent(new Event('online'));
      await wrapper.vm.$nextTick();

      // El banner offline ya no se muestra
      expect(wrapper.find('[data-testid="banner-offline"]').exists()).toBe(false);

      // Se muestra la notificación verde de reconexión
      const reconnectedBanner = wrapper.find('[data-testid="banner-reconnected"]');
      expect(reconnectedBanner.exists()).toBe(true);
      expect(reconnectedBanner.attributes('data-color')).toBe('success');
      expect(reconnectedBanner.text()).toContain('Conexión reestablecida. Datos sincronizados.');
      expect(reconnectedBanner.find('.mdi-wifi-check').exists()).toBe(true);
    });
  });

  describe('3. Protección contra Escrituras Offline y Tooltips en CoordinatorView.vue', () => {
    it('deshabilita el botón "Armar Nuevo Horario" y muestra tooltip explicativo cuando está offline', async () => {
      const wrapper = mount(CoordinatorView, {
        global: {
          plugins: [pinia],
          stubs: commonStubs
        }
      });
      await flushPromises();

      const btnCreate = wrapper.find('[data-testid="btn-open-create-schedule"]');
      expect(btnCreate.exists()).toBe(true);
      expect(btnCreate.attributes('disabled')).toBeUndefined();

      // Cambiar a offline
      window.dispatchEvent(new Event('offline'));
      await wrapper.vm.$nextTick();

      // El botón debe quedar deshabilitado
      expect(btnCreate.attributes('disabled')).toBeDefined();

      // Debe contener tooltip informativo de requerir conexión
      const tooltip = btnCreate.find('.v-tooltip-stub');
      expect(tooltip.exists()).toBe(true);
      expect(tooltip.attributes('data-text')).toBe('Se requiere conexión a internet para persistir cambios.');

      // Al pulsar openCreateDialog() offline, no debe abrir el diálogo
      wrapper.vm.openCreateDialog();
      expect(wrapper.vm.createDialog).toBe(false);
    });

    it('deshabilita botón "Dar de baja correo" en modal de detalle del docente cuando está offline', async () => {
      const wrapper = mount(CoordinatorView, {
        global: {
          plugins: [pinia],
          stubs: commonStubs
        }
      });
      await flushPromises();

      // Abrir modal de detalle del maestro
      wrapper.vm.openTeacherDetailModal({
        id: 'teach-1',
        name: 'Dr. Roberto Mendoza',
        email: 'roberto@uabc.edu.mx',
        email_activo: true
      });
      await wrapper.vm.$nextTick();

      const revokeBtn = wrapper.find('[data-testid="btn-revoke-email-trigger"]');
      expect(revokeBtn.exists()).toBe(true);
      expect(revokeBtn.attributes('disabled')).toBeUndefined();

      // Cambiar a offline
      window.dispatchEvent(new Event('offline'));
      await wrapper.vm.$nextTick();

      expect(revokeBtn.attributes('disabled')).toBeDefined();
      const tooltip = revokeBtn.find('.v-tooltip-stub');
      expect(tooltip.exists()).toBe(true);
      expect(tooltip.attributes('data-text')).toBe('Se requiere conexión a internet para persistir cambios.');

      // Al intentar invocar openRevokeEmailConfirmation() offline, no debe abrir el subdiálogo
      wrapper.vm.openRevokeEmailConfirmation();
      expect(wrapper.vm.revokeConfirmDialog).toBe(false);
    });

    it('ejecuta el refresco automático de horarios, docentes y aulas en segundo plano al reconectar (syncTrigger)', async () => {
      const wrapper = mount(CoordinatorView, {
        global: {
          plugins: [pinia],
          stubs: commonStubs
        }
      });
      await flushPromises();

      const initialApiCalls = api.get.mock.calls.length;
      expect(initialApiCalls).toBeGreaterThanOrEqual(4); // /schedules/coordinator, /subjects, /teachers, /classrooms

      // Ir a offline
      window.dispatchEvent(new Event('offline'));
      await wrapper.vm.$nextTick();

      // Volver a online -> debe disparar watch(syncTrigger)
      window.dispatchEvent(new Event('online'));
      await flushPromises();

      // Verificamos que se hayan vuelto a solicitar los datos al backend
      expect(api.get.mock.calls.length).toBeGreaterThan(initialApiCalls);
      expect(api.get).toHaveBeenCalledWith('/schedules/coordinator');
      expect(api.get).toHaveBeenCalledWith('/teachers');
      expect(api.get).toHaveBeenCalledWith('/classrooms');
    });
  });
});
