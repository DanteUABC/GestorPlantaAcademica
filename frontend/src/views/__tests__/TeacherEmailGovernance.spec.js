import { mount, config, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia } from 'pinia';
import CoordinatorView from '../CoordinatorView.vue';
import api from '../../api/client';

config.global.renderStubDefaultSlot = true;

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

function getMockTeachers() {
  return [
    {
      id: 'teach-active',
      name: 'Dr. Roberto Mendoza',
      nombre: 'Roberto',
      apellidos: 'Mendoza',
      email: 'roberto.mendoza@universidad.edu.mx',
      identificador: 'DOC-101',
      horas_contratadas: 25,
      horas_asignadas: 15,
      grupos_asignados_count: 2,
      estatus: 'activo',
      email_activo: true
    },
    {
      id: 'teach-revoked',
      name: 'Mtra. Ana Karenina Ruiz',
      nombre: 'Ana Karenina',
      apellidos: 'Ruiz',
      email: null,
      identificador: 'DOC-102',
      horas_contratadas: 20,
      horas_asignadas: 18,
      grupos_asignados_count: 2,
      estatus: 'inactivo',
      email_activo: false
    }
  ];
}

const mockSchedules = [
  {
    id: 'sch-1',
    teacher_id: 'teach-active',
    subject_name: 'Cálculo Diferencial',
    group_code: 'G1',
    classroom_name: 'Aula 101',
    day_of_week: 'Lunes',
    start_time: '08:00',
    end_time: '12:00'
  }
];

describe('CoordinatorView.vue - Gobernanza de Acceso y Revocación de Correo Institucional', () => {
  let pinia;
  let mockTeachers;

  const stubs = {
    'v-container': true,
    'v-card': true,
    'v-card-title': true,
    'v-card-text': true,
    'v-card-actions': true,
    'v-row': true,
    'v-col': true,
    'v-icon': true,
    'v-divider': true,
    'v-avatar': true,
    'v-list-item': true,
    'v-progress-linear': true,
    'v-btn': {
      props: {
        icon: [String, Boolean],
        color: String,
        size: String,
        loading: Boolean,
        disabled: Boolean,
        variant: String
      },
      template: '<button :class="[color, { loading }]" :disabled="disabled || loading" :data-loading="loading" v-bind="$attrs"><slot /></button>'
    },
    'v-alert': {
      props: ['type', 'closable'],
      template: '<div class="v-alert-stub" :class="type" v-bind="$attrs"><slot /></div>'
    },
    'v-tabs': true,
    'v-tab': {
      props: ['value'],
      template: '<button class="v-tab-stub" :data-value="value"><slot /></button>'
    },
    'v-table': {
      template: '<table><slot /></table>'
    },
    'v-dialog': {
      props: ['modelValue', 'maxWidth', 'persistent'],
      template: `
        <div
          v-if="modelValue"
          class="v-dialog-stub"
          :data-max-width="maxWidth"
          :data-persistent="persistent"
          v-bind="$attrs"
        >
          <slot />
        </div>
      `
    },
    'v-form': {
      template: '<form><slot /></form>'
    },
    'v-text-field': {
      inheritAttrs: false,
      props: ['modelValue', 'label', 'placeholder', 'type'],
      emits: ['update:modelValue', 'input'],
      template: `
        <input
          :type="type || 'text'"
          :value="modelValue"
          @input="$emit('update:modelValue', $event.target.value); $emit('input', $event)"
          v-bind="$attrs"
        />
      `
    },
    'v-chip': {
      props: ['color', 'size', 'variant'],
      template: '<span class="v-chip-stub" :class="color" v-bind="$attrs"><slot /></span>'
    },
    'v-snackbar': {
      props: ['modelValue', 'color'],
      template: '<div v-if="modelValue" class="v-snackbar-stub"><slot /></div>'
    },
    'v-select': true,
    'v-combobox': true,
    'v-autocomplete': true,
    'ExcelScheduleUploader': true,
    'ClassroomCatalogView': true,
    'ScheduleTransferModal': true
  };

  beforeEach(() => {
    vi.clearAllMocks();
    pinia = createPinia();
    mockTeachers = getMockTeachers();

    api.get.mockImplementation((url) => {
      if (url.includes('/schedules/coordinator')) {
        return Promise.resolve({ data: JSON.parse(JSON.stringify(mockSchedules)) });
      }
      if (url.includes('/teachers')) {
        return Promise.resolve({ data: JSON.parse(JSON.stringify(mockTeachers)) });
      }
      if (url.includes('/subjects')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/classrooms')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });
  });

  async function createWrapper() {
    const wrapper = mount(CoordinatorView, {
      global: {
        plugins: [pinia],
        stubs
      }
    });
    await flushPromises();
    return wrapper;
  }

  it('Criterio 1: Muestra el correo actual del maestro con botón adyacente "Dar de baja correo"', async () => {
    const wrapper = await createWrapper();
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    // Abrir modal del maestro con correo activo
    wrapper.vm.openTeacherDetailModal(mockTeachers[0]);
    await wrapper.vm.$nextTick();

    const governanceSec = wrapper.find('[data-testid="section-access-governance"]');
    expect(governanceSec.exists()).toBe(true);

    const emailDisplay = governanceSec.find('[data-testid="governance-teacher-email"]');
    expect(emailDisplay.exists()).toBe(true);
    expect(emailDisplay.text()).toBe('roberto.mendoza@universidad.edu.mx');

    const revokeBtn = governanceSec.find('[data-testid="btn-revoke-email-trigger"]');
    expect(revokeBtn.exists()).toBe(true);
    expect(revokeBtn.text()).toContain('Dar de baja correo');

    // No debe mostrar el chip de sin correo activo ni botón de asignar
    expect(governanceSec.find('[data-testid="chip-no-active-email"]').exists()).toBe(false);
    expect(governanceSec.find('[data-testid="btn-assign-new-email"]').exists()).toBe(false);
  });

  it('Criterio 2: Si el profesor no tiene correo activo, muestra chip "Sin correo electrónico activo" y botón deshabilitado "Asignar nuevo correo"', async () => {
    const wrapper = await createWrapper();
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    // Abrir modal del maestro sin correo
    wrapper.vm.openTeacherDetailModal(mockTeachers[1]);
    await wrapper.vm.$nextTick();

    const governanceSec = wrapper.find('[data-testid="section-access-governance"]');
    expect(governanceSec.exists()).toBe(true);

    const noEmailChip = governanceSec.find('[data-testid="chip-no-active-email"]');
    expect(noEmailChip.exists()).toBe(true);
    expect(noEmailChip.text()).toContain('Sin correo electrónico activo');

    const assignBtn = governanceSec.find('[data-testid="btn-assign-new-email"]');
    expect(assignBtn.exists()).toBe(true);
    expect(assignBtn.text()).toContain('Asignar nuevo correo');
    expect(assignBtn.attributes('disabled')).toBeDefined();

    // No debe mostrar botón para dar de baja
    expect(governanceSec.find('[data-testid="btn-revoke-email-trigger"]').exists()).toBe(false);
  });

  it('Criterio 3: Al pulsar "Dar de baja correo", abre subdiálogo modal de confirmación crítica con advertencia explícita', async () => {
    const wrapper = await createWrapper();
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    wrapper.vm.openTeacherDetailModal(mockTeachers[0]);
    await wrapper.vm.$nextTick();

    // El diálogo de confirmación no está abierto inicialmente
    expect(wrapper.find('[data-testid="dialog-confirm-revoke-email"]').exists()).toBe(false);

    // Clic en "Dar de baja correo"
    const revokeBtn = wrapper.find('[data-testid="btn-revoke-email-trigger"]');
    await revokeBtn.trigger('click');
    await wrapper.vm.$nextTick();

    // Ahora está abierto el subdiálogo secundario
    const confirmDialog = wrapper.find('[data-testid="dialog-confirm-revoke-email"]');
    expect(confirmDialog.exists()).toBe(true);

    // No debe haberse llamado a la API todavía (previene bajas accidentales)
    expect(api.put).not.toHaveBeenCalled();

    // Advertencia crítica requerida
    const warningText = confirmDialog.find('[data-testid="text-confirm-revoke-warning"]').text();
    expect(warningText).toContain('¿Está seguro de revocar el correo de Dr. Roberto Mendoza?');
    expect(warningText).toContain('El profesor ya no podrá iniciar sesión en la plataforma ni recibir notificaciones oficiales.');
    expect(warningText).toContain('Sus horarios y materias asignadas se conservarán intactos.');

    // Al cancelar, se cierra el subdiálogo sin llamar a la API
    const cancelBtn = confirmDialog.find('[data-testid="btn-cancel-revoke-email"]');
    await cancelBtn.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="dialog-confirm-revoke-email"]').exists()).toBe(false);
    expect(api.put).not.toHaveBeenCalled();
  });

  it('Criterio 4: Al confirmar, ejecuta api.put, muestra spinner :loading, cierra modal y actualiza inmediatamente la UI', async () => {
    let resolveApi;
    const apiPromise = new Promise((resolve) => {
      resolveApi = resolve;
    });

    api.put.mockReturnValue(apiPromise);

    const wrapper = await createWrapper();
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    wrapper.vm.openTeacherDetailModal(mockTeachers[0]);
    await wrapper.vm.$nextTick();

    // Abrir confirmación
    await wrapper.find('[data-testid="btn-revoke-email-trigger"]').trigger('click');
    await wrapper.vm.$nextTick();

    const confirmDialog = wrapper.find('[data-testid="dialog-confirm-revoke-email"]');
    const confirmBtn = confirmDialog.find('[data-testid="btn-confirm-revoke-email"]');

    // Confirmar baja
    await confirmBtn.trigger('click');
    await wrapper.vm.$nextTick();

    // Verificar que se llamó al endpoint exacto
    expect(api.put).toHaveBeenCalledWith('/teachers/teach-active/revoke-email');

    // Verificar estado de carga :loading="true" en el botón mientras está pendiente
    expect(wrapper.vm.revokingEmail).toBe(true);
    expect(confirmBtn.attributes('data-loading')).toBe('true');

    // Resolver la promesa de la API con respuesta exitosa
    resolveApi({
      data: {
        message: 'Correo institucional revocado exitosamente',
        id: 'teach-active',
        email: null,
        email_activo: false
      }
    });

    await flushPromises();
    await wrapper.vm.$nextTick();

    // Subdiálogo cerrado
    expect(wrapper.find('[data-testid="dialog-confirm-revoke-email"]').exists()).toBe(false);

    // Notificación en snackbar
    expect(wrapper.vm.snackbar.show).toBe(true);
    expect(wrapper.vm.snackbar.text).toContain('Correo institucional revocado exitosamente');
    expect(wrapper.vm.snackbar.color).toBe('success');

    // En la miniventana: el correo se actualizó inmediatamente a "Sin correo electrónico activo"
    const governanceSec = wrapper.find('[data-testid="section-access-governance"]');
    expect(governanceSec.find('[data-testid="chip-no-active-email"]').exists()).toBe(true);
    expect(governanceSec.find('[data-testid="btn-assign-new-email"]').exists()).toBe(true);
    expect(governanceSec.find('[data-testid="btn-revoke-email-trigger"]').exists()).toBe(false);

    // En la tabla general de docentes de fondo: también se actualizó inmediatamente a Revocado
    const row = wrapper.find('[data-testid="row-teacher-teach-active"]');
    expect(row.find('[data-testid="chip-email-revocado"]').exists()).toBe(true);
  });

  it('Criterio 5: Si el backend devuelve un error, se muestra una alerta roja dentro del modal explicando la causa', async () => {
    api.put.mockRejectedValueOnce({
      response: {
        status: 403,
        data: {
          error: 'No tiene permisos suficientes para revocar accesos en esta institución'
        }
      }
    });

    const wrapper = await createWrapper();
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    wrapper.vm.openTeacherDetailModal(mockTeachers[0]);
    await wrapper.vm.$nextTick();

    // Abrir confirmación y confirmar
    await wrapper.find('[data-testid="btn-revoke-email-trigger"]').trigger('click');
    await wrapper.vm.$nextTick();

    const confirmBtn = wrapper.find('[data-testid="btn-confirm-revoke-email"]');
    await confirmBtn.trigger('click');
    await flushPromises();
    await wrapper.vm.$nextTick();

    // El modal de confirmación debe permanecer abierto para que el usuario lea el error
    const confirmDialog = wrapper.find('[data-testid="dialog-confirm-revoke-email"]');
    expect(confirmDialog.exists()).toBe(true);

    // Alerta roja visible explicando la causa
    const errorAlert = confirmDialog.find('[data-testid="alert-confirm-revoke-error"]');
    expect(errorAlert.exists()).toBe(true);
    expect(errorAlert.text()).toContain('No tiene permisos suficientes para revocar accesos en esta institución');

    // Loading debe volver a false
    expect(wrapper.vm.revokingEmail).toBe(false);
  });
});
