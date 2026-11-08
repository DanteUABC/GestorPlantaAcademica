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
      id: 'teach-1',
      name: 'Dr. Roberto Mendoza Pérez',
      nombre: 'Roberto',
      apellidos: 'Mendoza Pérez',
      email: 'roberto.mendoza@universidad.edu.mx',
      identificador: 'DOC-101',
      horas_contratadas: 25,
      horas_asignadas: 18,
      grupos_asignados_count: 2,
      estatus: 'activo',
      email_activo: true
    },
    {
      id: 'teach-2',
      name: 'Mtra. Ana Karenina Ruiz Solís',
      nombre: 'Ana Karenina',
      apellidos: 'Ruiz Solís',
      email: 'ana.ruiz@universidad.edu.mx',
      identificador: 'DOC-202',
      horas_contratadas: 20,
      horas_asignadas: 12,
      grupos_asignados_count: 1,
      estatus: 'activo',
      email_activo: true
    },
    {
      id: 'teach-3',
      name: 'Ing. Carlos Slim Helú',
      nombre: 'Carlos',
      apellidos: 'Slim Helú',
      email: 'carlos.slim@universidad.edu.mx',
      identificador: 'DOC-303',
      horas_contratadas: 30,
      horas_asignadas: 24,
      grupos_asignados_count: 3,
      estatus: 'activo',
      email_activo: true
    },
    {
      id: 'teach-4',
      name: 'Lic. Laura Elena Ponce',
      nombre: 'Laura Elena',
      apellidos: 'Ponce',
      email: null,
      identificador: 'DOC-404',
      horas_contratadas: 25,
      horas_asignadas: 0,
      grupos_asignados_count: 0,
      estatus: 'inactivo',
      email_activo: false
    }
  ];
}

const mockSchedules = [
  { id: 'sch-1', teacher_id: 'teach-1', group_code: 'G1', start_time: '08:00', end_time: '14:00' },
  { id: 'sch-2', teacher_id: 'teach-2', group_code: 'G2', start_time: '08:00', end_time: '14:00' }
];

describe('CoordinatorView.vue - Pruebas Automatizadas de Catálogo de Profesores', () => {
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
    'v-avatar': {
      props: ['size', 'color'],
      template: '<div class="v-avatar-stub" :class="color" v-bind="$attrs"><slot /></div>'
    },
    'v-list': true,
    'v-list-item': true,
    'v-menu': true,
    'v-tooltip': true,
    'v-textarea': true,
    'v-progress-linear': true,
    'v-progress-circular': true,
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
      template: '<button class="v-tab-stub" :data-value="value" v-bind="$attrs"><slot /></button>'
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

  async function createWrapper(teachersData = null) {
    if (teachersData !== null) {
      api.get.mockImplementation((url) => {
        if (url.includes('/teachers')) {
          return Promise.resolve({ data: teachersData });
        }
        return Promise.resolve({ data: [] });
      });
    }

    const wrapper = mount(CoordinatorView, {
      global: {
        plugins: [pinia],
        stubs
      }
    });
    await flushPromises();
    return wrapper;
  }

  it('1. Montaje del componente con mock de datos de profesores', async () => {
    const wrapper = await createWrapper();

    // Verificamos que se cargaron los datos desde api.get('/teachers')
    expect(api.get).toHaveBeenCalledWith('/teachers');
    expect(wrapper.vm.teachers.length).toBe(4);

    // Navegar a la pestaña de docentes
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    expect(wrapper.find('[data-testid="teachers-catalog-tab-content"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="teachers-catalog-table"]').exists()).toBe(true);
  });

  it('2. Renderizado correcto del total de filas según la cantidad de items', async () => {
    const wrapper = await createWrapper();
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    // Chip de resumen de total
    const chipTotal = wrapper.find('[data-testid="chip-total-teachers"]');
    expect(chipTotal.exists()).toBe(true);
    expect(chipTotal.text()).toBe('Total de docentes: 4');

    // Filas renderizadas: debe coincidir exactamente con los 4 profesores del mock
    const rows = wrapper.findAll('tbody tr');
    expect(rows.length).toBe(4);

    expect(wrapper.find('[data-testid="row-teacher-teach-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="row-teacher-teach-2"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="row-teacher-teach-3"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="row-teacher-teach-4"]').exists()).toBe(true);

    // Verificación de datos de una fila
    const row1 = wrapper.find('[data-testid="row-teacher-teach-1"]');
    expect(row1.find('[data-testid="teacher-identifier"]').text()).toBe('DOC-101');
    expect(row1.find('[data-testid="teacher-name"]').text()).toBe('Dr. Roberto Mendoza Pérez');
    expect(row1.find('[data-testid="teacher-email-text"]').text()).toBe('roberto.mendoza@universidad.edu.mx');
    expect(row1.find('[data-testid="chip-teacher-workload"]').text()).toContain('18 / 25 hrs');
    expect(row1.find('[data-testid="chip-teacher-status"]').text()).toBe('Activo');
  });

  it('3. Prueba explícitamente el caso de lista vacía mostrando el mensaje: "No se encontraron docentes registrados"', async () => {
    // Montamos con mock de lista vacía de profesores
    const wrapper = await createWrapper([]);
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    // Verificamos contador en 0
    expect(wrapper.find('[data-testid="chip-total-teachers"]').text()).toBe('Total de docentes: 0');

    // No debe haber filas de docentes
    expect(wrapper.find('[data-testid="row-teacher-teach-1"]').exists()).toBe(false);

    // Debe mostrar la fila de estado vacío con el mensaje exacto
    const emptyMsgCell = wrapper.find('[data-testid="no-teachers-message"]');
    expect(emptyMsgCell.exists()).toBe(true);
    expect(emptyMsgCell.text()).toBe('No se encontraron docentes registrados');
  });

  it('4. Comportamiento del filtro de búsqueda y reducción de filas visibles al resultado coincidente', async () => {
    const wrapper = await createWrapper();
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    const searchInput = wrapper.find('[data-testid="input-search-teachers"]');
    expect(searchInput.exists()).toBe(true);

    // 4A: Búsqueda por nombre parcial (ej. "Carlos" -> reduce de 4 a 1 fila visible)
    await searchInput.setValue('Carlos');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.filteredTeachersList.length).toBe(1);
    expect(wrapper.find('[data-testid="row-teacher-teach-3"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="row-teacher-teach-1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="row-teacher-teach-2"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="row-teacher-teach-4"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="chip-total-teachers"]').text()).toBe('Total de docentes: 1');

    // 4B: Búsqueda por correo institucional (ej. "ana.ruiz" -> reduce a 1 fila visible)
    await searchInput.setValue('ana.ruiz');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.filteredTeachersList.length).toBe(1);
    expect(wrapper.find('[data-testid="row-teacher-teach-2"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="row-teacher-teach-3"]').exists()).toBe(false);

    // 4C: Búsqueda por identificador / nómina (ej. "DOC-101" -> reduce a 1 fila visible)
    await searchInput.setValue('DOC-101');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.filteredTeachersList.length).toBe(1);
    expect(wrapper.find('[data-testid="row-teacher-teach-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="row-teacher-teach-2"]').exists()).toBe(false);

    // 4D: Búsqueda sin coincidencias -> reduce a 0 filas y muestra mensaje amigable
    await searchInput.setValue('ProfesorDesconocido999');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.filteredTeachersList.length).toBe(0);
    expect(wrapper.find('[data-testid="no-teachers-message"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="no-teachers-message"]').text()).toBe('No se encontraron docentes registrados');

    // 4E: Limpieza del buscador restaura las 4 filas completas
    await searchInput.setValue('');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.filteredTeachersList.length).toBe(4);
    expect(wrapper.findAll('tbody tr').length).toBe(4);
  });

  it('5. Emisión correcta del evento de selección de profesor al hacer clic en una fila', async () => {
    const wrapper = await createWrapper();
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    // Hacemos clic en la fila del docente 2 (Mtra. Ana Karenina Ruiz Solís)
    const row2 = wrapper.find('[data-testid="row-teacher-teach-2"]');
    expect(row2.exists()).toBe(true);

    await row2.trigger('click');
    await wrapper.vm.$nextTick();

    // Verificamos la emisión del evento 'teacher-selected' con el payload exacto
    const emittedSelected = wrapper.emitted('teacher-selected');
    expect(emittedSelected).toBeTruthy();
    expect(emittedSelected.length).toBe(1);
    expect(emittedSelected[0][0].id).toBe('teach-2');
    expect(emittedSelected[0][0].name).toBe('Mtra. Ana Karenina Ruiz Solís');
    expect(emittedSelected[0][0].identificador).toBe('DOC-202');

    // Verificamos la emisión del evento complementario 'open-teacher-detail'
    const emittedDetail = wrapper.emitted('open-teacher-detail');
    expect(emittedDetail).toBeTruthy();
    expect(emittedDetail.length).toBe(1);
    expect(emittedDetail[0][0].id).toBe('teach-2');

    // Verificamos que se abre el modal de detalle del docente seleccionado
    expect(wrapper.vm.teacherDetailDialog).toBe(true);
    expect(wrapper.vm.selectedTeacherDetail.id).toBe('teach-2');
  });
});
