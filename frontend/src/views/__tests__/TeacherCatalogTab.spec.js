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

const sampleTeachers = [
  {
    id: 'teach-1',
    name: 'Dr. Roberto Mendoza',
    nombre: 'Roberto',
    apellidos: 'Mendoza',
    email: 'roberto.mendoza@universidad.edu.mx',
    identificador: 'DOC-101',
    horas_contratadas: 25,
    horas_asignadas: 18,
    grupos_asignados_count: 3,
    estatus: 'activo',
    email_activo: true
  },
  {
    id: 'teach-2',
    name: 'Mtra. Ana Karenina Ruiz',
    nombre: 'Ana Karenina',
    apellidos: 'Ruiz',
    email: null,
    identificador: 'DOC-102',
    horas_contratadas: 20,
    horas_asignadas: 20,
    grupos_asignados_count: 2,
    estatus: 'inactivo',
    email_activo: false
  },
  {
    id: 'teach-3',
    name: 'Ing. Carlos Slim Helú',
    nombre: 'Carlos',
    apellidos: 'Slim Helú',
    email: 'carlos.slim@universidad.edu.mx',
    identificador: 'DOC-103',
    horas_contratadas: 30,
    horas_asignadas: 0,
    grupos_asignados_count: 0,
    estatus: 'activo',
    email_activo: true
  }
];

const sampleSchedules = [
  { id: 'sch-1', teacher_id: 'teach-1', group_code: 'G1', start_time: '08:00', end_time: '14:00' },
  { id: 'sch-2', teacher_id: 'teach-1', group_code: 'G2', start_time: '08:00', end_time: '14:00' },
  { id: 'sch-3', teacher_id: 'teach-1', group_code: 'G3', start_time: '08:00', end_time: '14:00' },
  { id: 'sch-4', teacher_id: 'teach-2', group_code: 'G4', start_time: '08:00', end_time: '18:00' },
  { id: 'sch-5', teacher_id: 'teach-2', group_code: 'G5', start_time: '08:00', end_time: '18:00' }
];

describe('CoordinatorView.vue - Catálogo de Maestros / Docentes (UI & UX)', () => {
  let pinia;

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
    'v-progress-circular': true,
    'v-textarea': true,
    'v-btn': {
      props: ['icon', 'color', 'size', 'loading', 'variant'],
      template: '<button :class="color"><slot /></button>'
    },
    'v-alert': {
      props: ['type', 'closable'],
      template: '<div class="v-alert-stub" v-bind="$attrs"><slot /></div>'
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
      props: ['modelValue'],
      template: '<div v-if="modelValue" class="v-dialog-stub" v-bind="$attrs"><slot /></div>'
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
      template: '<span class="v-chip-stub" :class="color"><slot /></span>'
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

    api.get.mockImplementation((url) => {
      if (url.includes('/schedules/coordinator')) {
        return Promise.resolve({ data: JSON.parse(JSON.stringify(sampleSchedules)) });
      }
      if (url.includes('/teachers')) {
        return Promise.resolve({ data: JSON.parse(JSON.stringify(sampleTeachers)) });
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

  it('Criterio 1: Navegación y renderizado de la pestaña Catálogo de Docentes', async () => {
    const wrapper = await createWrapper();

    const tabBtn = wrapper.find('[data-testid="tab-teachers-catalog"]');
    expect(tabBtn.exists()).toBe(true);
    expect(tabBtn.text()).toContain('Catálogo de Docentes');

    // Inicialmente no está seleccionada la pestaña de docentes
    expect(wrapper.find('[data-testid="teachers-catalog-tab-content"]').exists()).toBe(false);

    // Cambiar a la pestaña de docentes
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="teachers-catalog-tab-content"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="teachers-catalog-table"]').exists()).toBe(true);
  });

  it('Criterio 2: Renderizado correcto de toda la plantilla de profesores cargada desde la API y métricas', async () => {
    const wrapper = await createWrapper();
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    // Chip de resumen superior
    const totalChip = wrapper.find('[data-testid="chip-total-teachers"]');
    expect(totalChip.exists()).toBe(true);
    expect(totalChip.text()).toContain('Total de docentes: 3');

    // Filas renderizadas
    const row1 = wrapper.find('[data-testid="row-teacher-teach-1"]');
    const row2 = wrapper.find('[data-testid="row-teacher-teach-2"]');
    const row3 = wrapper.find('[data-testid="row-teacher-teach-3"]');

    expect(row1.exists()).toBe(true);
    expect(row2.exists()).toBe(true);
    expect(row3.exists()).toBe(true);

    // Columnas del primer profesor
    expect(row1.find('[data-testid="teacher-identifier"]').text()).toBe('DOC-101');
    expect(row1.find('[data-testid="teacher-name"]').text()).toBe('Dr. Roberto Mendoza');
    expect(row1.find('[data-testid="teacher-email-text"]').text()).toBe('roberto.mendoza@universidad.edu.mx');
    expect(row1.find('[data-testid="chip-teacher-workload"]').text()).toContain('18 / 25 hrs');
    expect(row1.find('[data-testid="chip-teacher-status"]').text()).toBe('Activo');

    // Botón de inspección
    expect(row1.find('[data-testid="btn-inspect-teacher"]').exists()).toBe(true);
  });

  it('Criterio 3: Buscador en tiempo real filtra instantáneamente por nombre, identificador o correo sin recargar', async () => {
    const wrapper = await createWrapper();
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    const searchInput = wrapper.find('[data-testid="input-search-teachers"]');
    expect(searchInput.exists()).toBe(true);

    // Filtrar por nombre
    await searchInput.setValue('Karenina');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.filteredTeachersList.length).toBe(1);
    expect(wrapper.vm.filteredTeachersList[0].id).toBe('teach-2');
    expect(wrapper.find('[data-testid="row-teacher-teach-2"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="row-teacher-teach-1"]').exists()).toBe(false);

    // Filtrar por identificador / nómina
    await searchInput.setValue('DOC-103');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.filteredTeachersList.length).toBe(1);
    expect(wrapper.vm.filteredTeachersList[0].id).toBe('teach-3');
    expect(wrapper.find('[data-testid="row-teacher-teach-3"]').exists()).toBe(true);

    // Filtrar por correo
    await searchInput.setValue('roberto.mendoza');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.filteredTeachersList.length).toBe(1);
    expect(wrapper.vm.filteredTeachersList[0].id).toBe('teach-1');

    // Búsqueda sin coincidencias muestra mensaje de estado vacío
    await searchInput.setValue('DocenteInexistenteXYZ');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.filteredTeachersList.length).toBe(0);
    expect(wrapper.find('[data-testid="no-teachers-message"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="no-teachers-message"]').text()).toContain('No se encontraron docentes');
  });

  it('Criterio 4: Docente con correo revocado o dado de baja muestra chip visual "Sin correo asignado (Revocado)"', async () => {
    const wrapper = await createWrapper();
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    // El segundo maestro tiene email: null y email_activo: false
    const row2 = wrapper.find('[data-testid="row-teacher-teach-2"]');
    expect(row2.find('[data-testid="teacher-email-text"]').exists()).toBe(false);

    const revokedChip = row2.find('[data-testid="chip-email-revocado"]');
    expect(revokedChip.exists()).toBe(true);
    expect(revokedChip.text()).toContain('Sin correo asignado (Revocado)');
  });

  it('Criterio 5: Al hacer clic en la fila se abre la miniventana de detalle y se emiten los eventos correspondientes', async () => {
    const wrapper = await createWrapper();
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="dialog-teacher-detail"]').exists()).toBe(false);

    // Clic en la fila del docente 1
    const row1 = wrapper.find('[data-testid="row-teacher-teach-1"]');
    await row1.trigger('click');
    await wrapper.vm.$nextTick();

    // Diálogo abierto
    const dialog = wrapper.find('[data-testid="dialog-teacher-detail"]');
    expect(dialog.exists()).toBe(true);

    // Contenido del diálogo
    expect(dialog.find('[data-testid="detail-teacher-name"]').text()).toBe('Dr. Roberto Mendoza');
    expect(dialog.find('[data-testid="detail-teacher-identifier"]').text()).toContain('DOC-101');
    expect(dialog.find('[data-testid="detail-teacher-email"]').text()).toBe('roberto.mendoza@universidad.edu.mx');
    expect(dialog.find('[data-testid="detail-teacher-status"]').text()).toBe('Activo');
    expect(dialog.find('[data-testid="detail-teacher-groups"]').text()).toContain('3 grupos');
    expect(dialog.find('[data-testid="detail-teacher-workload-text"]').text()).toContain('18 / 25 horas');

    // Emisiones de eventos
    expect(wrapper.emitted('teacher-selected')).toBeTruthy();
    expect(wrapper.emitted('teacher-selected')[0][0].id).toBe('teach-1');
    expect(wrapper.emitted('open-teacher-detail')).toBeTruthy();
    expect(wrapper.emitted('open-teacher-detail')[0][0].id).toBe('teach-1');

    // Cerrar el modal mediante el botón de cerrar
    const closeBtn = dialog.find('[data-testid="btn-close-detail-modal"]');
    expect(closeBtn.exists()).toBe(true);
    await closeBtn.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="dialog-teacher-detail"]').exists()).toBe(false);
  });

  it('Criterio 6: El botón de inspección (icono ojo) abre el detalle sin disparar eventos duplicados', async () => {
    const wrapper = await createWrapper();
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    const row2 = wrapper.find('[data-testid="row-teacher-teach-2"]');
    const inspectBtn = row2.find('[data-testid="btn-inspect-teacher"]');
    expect(inspectBtn.exists()).toBe(true);

    await inspectBtn.trigger('click');
    await wrapper.vm.$nextTick();

    const dialog = wrapper.find('[data-testid="dialog-teacher-detail"]');
    expect(dialog.exists()).toBe(true);
    expect(dialog.find('[data-testid="detail-teacher-name"]').text()).toBe('Mtra. Ana Karenina Ruiz');
    expect(dialog.find('[data-testid="detail-teacher-status"]').text()).toBe('Inactivo');
    expect(dialog.find('[data-testid="detail-teacher-email-revoked"]').exists()).toBe(true);
    expect(dialog.find('[data-testid="detail-teacher-email-revoked"]').text()).toContain('Sin correo asignado (Revocado)');

    expect(wrapper.emitted('teacher-selected')).toBeTruthy();
    expect(wrapper.emitted('teacher-selected').length).toBe(1);
    expect(wrapper.emitted('teacher-selected')[0][0].id).toBe('teach-2');
  });
});
