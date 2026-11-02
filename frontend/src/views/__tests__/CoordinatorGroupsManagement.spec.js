import { mount, config } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CoordinatorView from '../CoordinatorView.vue';
import { createPinia } from 'pinia';

config.global.renderStubDefaultSlot = true;

const mockClassrooms = [
  { id: 'c-1', name: 'Aula A-101', building: 'Edificio A', capacity: 30, type: 'Aula Teórica' },
  { id: 'c-2', name: 'Lab Cómputo 1', building: 'Edificio Tecnologías', capacity: 25, type: 'Laboratorio' }
];

const mockSchedules = [
  {
    id: 'sch-1',
    subject_name: 'Cálculo Diferencial',
    subject_code: 'MAT-101',
    subject_credits: 5,
    teacher_id: 't-1',
    teacher_name: 'Elena Salgado',
    classroom_id: 'c-1',
    classroom_name: 'Aula A-101',
    day_of_week: 'Lunes',
    start_time: '08:00',
    end_time: '10:00',
    max_students: 30,
    group_code: 'G1',
    session_type: 'Clase Teórica'
  },
  {
    id: 'sch-2',
    subject_name: 'Programación Web',
    subject_code: 'INF-201',
    subject_credits: 6,
    teacher_id: 't-2',
    teacher_name: 'Carlos Vega',
    classroom_id: 'c-2',
    classroom_name: 'Lab Cómputo 1',
    day_of_week: 'Martes',
    start_time: '10:00',
    end_time: '12:00',
    max_students: 25,
    group_code: '301',
    session_type: 'Laboratorio'
  }
];

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn((url) => {
      if (url.includes('/schedules/coordinator')) return Promise.resolve({ data: mockSchedules });
      if (url.includes('/subjects')) return Promise.resolve({ data: [
        { id: 'sub-1', name: 'Cálculo Diferencial', code: 'MAT-101', credits: 5 },
        { id: 'sub-2', name: 'Programación Web', code: 'INF-201', credits: 6 }
      ] });
      if (url.includes('/teachers')) return Promise.resolve({ data: [
        { id: 't-1', name: 'Elena Salgado', email: 'elena@itc.edu', identifier: 'DOC-101' },
        { id: 't-2', name: 'Carlos Vega', email: 'carlos@itc.edu', identifier: 'DOC-102' }
      ] });
      if (url.includes('/classrooms')) return Promise.resolve({ data: mockClassrooms });
      return Promise.resolve({ data: [] });
    }),
    post: vi.fn(() => Promise.resolve({ data: { message: 'OK' } })),
    delete: vi.fn(() => Promise.resolve({ data: { message: 'OK' } }))
  }
}));

describe('CoordinatorView.vue - Épica 6 (Tasks 6.3 y 6.5: Gestión de Grupos y Tipo de Sesión)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function getWrapper() {
    return mount(CoordinatorView, {
      global: {
        plugins: [createPinia()],
        stubs: {
          'v-container': true,
          'v-card': true,
          'v-card-title': true,
          'v-card-text': true,
          'v-card-actions': true,
          'v-row': true,
          'v-col': true,
          'v-icon': true,
          'v-btn': true,
          'v-alert': true,
          'v-tabs': true,
          'v-tab': true,
          'v-table': true,
          'v-dialog': true,
          'v-form': true,
          'v-autocomplete': true,
          'v-select': true,
          'v-text-field': true,
          'v-snackbar': true,
          'v-chip': true,
          'v-list-item': true,
          'v-divider': true,
          'v-progress-linear': true,
          'v-combobox': true,
          'ExcelScheduleUploader': true,
          'ClassroomCatalogView': true,
          'ScheduleTransferModal': true
        }
      }
    });
  }

  it('Task 6.5: Debe incluir selector de filtro por grupo con valor por defecto "Todos" y opciones dinámicas', async () => {
    const wrapper = getWrapper();
    await new Promise(r => setTimeout(r, 50));
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.groupFilter).toBe('Todos');
    expect(wrapper.vm.groupFilterOptions).toContain('Todos');
    expect(wrapper.vm.groupFilterOptions).toContain('G1');
    expect(wrapper.vm.groupFilterOptions).toContain('301');
  });

  it('Task 6.5: filteredSchedules filtra adecuadamente por groupFilter y selectedTeacherFilter de forma combinada', async () => {
    const wrapper = getWrapper();
    await new Promise(r => setTimeout(r, 50));
    await wrapper.vm.$nextTick();

    // Sin filtros: muestra ambos
    expect(wrapper.vm.filteredSchedules.length).toBe(2);

    // Filtrar por grupo 301
    wrapper.vm.groupFilter = '301';
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.filteredSchedules.length).toBe(1);
    expect(wrapper.vm.filteredSchedules[0].group_code).toBe('301');

    // Combinar con docente erróneo: debe quedar vacío
    wrapper.vm.selectedTeacherFilter = 't-1'; // Elena solo tiene G1
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.filteredSchedules.length).toBe(0);

    // Docente correcto: Elena con G1
    wrapper.vm.groupFilter = 'G1';
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.filteredSchedules.length).toBe(1);
    expect(wrapper.vm.filteredSchedules[0].id).toBe('sch-1');
  });

  it('Task 6.3: newSchedule contiene scheduleGroup/group_code y scheduleSessionType/session_type con valores iniciales', () => {
    const wrapper = getWrapper();
    expect(wrapper.vm.newSchedule.group_code).toBe('G1');
    expect(wrapper.vm.newSchedule.session_type).toBe('Clase Teórica');
    expect(wrapper.vm.newSchedule.scheduleGroup).toBe('G1');
    expect(wrapper.vm.newSchedule.scheduleSessionType).toBe('Clase Teórica');
  });

  it('Task 6.3: classroomOptions prioriza primero las aulas de tipo Laboratorio si session_type es Laboratorio', async () => {
    const wrapper = getWrapper();
    await new Promise(r => setTimeout(r, 50));
    await wrapper.vm.$nextTick();

    // Default: 'Clase Teórica' -> orden original (Aula A-101 primero)
    expect(wrapper.vm.classroomOptions[0].name).toBe('Aula A-101');

    // Cambiar a Laboratorio
    wrapper.vm.newSchedule.session_type = 'Laboratorio';
    await wrapper.vm.$nextTick();

    // Debe resaltar/ordenar primero 'Lab Cómputo 1' (Laboratorio)
    expect(wrapper.vm.classroomOptions[0].name).toBe('Lab Cómputo 1');
    expect(wrapper.vm.classroomOptions[0].type).toBe('Laboratorio');
  });
});
