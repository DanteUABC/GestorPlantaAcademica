import { mount, config } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TeacherView from '../TeacherView.vue';
import { createPinia, setActivePinia } from 'pinia';
import { useAuthStore } from '../../stores/authStore';

config.global.renderStubDefaultSlot = true;

const VProgressLinearStub = {
  name: 'v-progress-linear',
  props: ['modelValue', 'color', 'height'],
  template: '<div class="v-progress-linear-stub" :data-value="modelValue" :data-color="color"><slot></slot></div>'
};

const VChipStub = {
  name: 'v-chip',
  props: ['color', 'variant', 'size'],
  template: '<span class="v-chip-stub" :data-color="color"><slot></slot></span>'
};

// Horarios de prueba: 2 clases de 2 horas = 4 horas semanales
const mockSchedules4Hours = [
  { id: 'sch-1', day_of_week: 'Lunes', start_time: '08:00', end_time: '10:00', subject_name: 'Cálculo', classroom_name: 'Aula 101', max_students: 30 },
  { id: 'sch-2', day_of_week: 'Miércoles', start_time: '10:00', end_time: '12:00', subject_name: 'Álgebra', classroom_name: 'Aula 102', max_students: 25 }
];

// Horarios de prueba: 6 clases de 2 horas = 12 horas semanales
const mockSchedules12Hours = [
  ...mockSchedules4Hours,
  { id: 'sch-3', day_of_week: 'Martes', start_time: '08:00', end_time: '10:00', subject_name: 'Física', classroom_name: 'Lab 1', max_students: 20 },
  { id: 'sch-4', day_of_week: 'Jueves', start_time: '10:00', end_time: '12:00', subject_name: 'Física', classroom_name: 'Lab 1', max_students: 20 },
  { id: 'sch-5', day_of_week: 'Viernes', start_time: '08:00', end_time: '10:00', subject_name: 'Química', classroom_name: 'Lab 2', max_students: 25 },
  { id: 'sch-6', day_of_week: 'Viernes', start_time: '12:00', end_time: '14:00', subject_name: 'Química', classroom_name: 'Lab 2', max_students: 25 }
];

let currentMockSchedules = mockSchedules4Hours;
let currentMockTeacher = {
  id: 'usr-prof-1',
  name: 'Mtra. Elena Salgado',
  email: 'elena.salgado@pavilion.com',
  min_weekly_hours: 10,
  max_weekly_hours: 30,
  assigned_hours: 4
};

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn((url) => {
      if (url.includes('/schedules/teacher')) {
        return Promise.resolve({ data: currentMockSchedules });
      }
      if (url.includes('/teachers')) {
        return Promise.resolve({ data: [currentMockTeacher] });
      }
      if (url.includes('/auth/me')) {
        return Promise.resolve({ data: currentMockTeacher });
      }
      return Promise.resolve({ data: [] });
    })
  }
}));

describe('TeacherView.vue - Tarjeta de Estatus Contractual y Resumen de Cumplimiento', () => {
  let pinia;
  let authStore;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    authStore = useAuthStore();
    authStore.user = {
      id: 'usr-prof-1',
      name: 'Mtra. Elena Salgado',
      email: 'elena.salgado@pavilion.com',
      min_weekly_hours: 10,
      max_weekly_hours: 30
    };
    currentMockSchedules = mockSchedules4Hours;
    currentMockTeacher = {
      id: 'usr-prof-1',
      name: 'Mtra. Elena Salgado',
      email: 'elena.salgado@pavilion.com',
      min_weekly_hours: 10,
      max_weekly_hours: 30,
      assigned_hours: 4
    };
  });

  function getWrapper() {
    return mount(TeacherView, {
      global: {
        plugins: [pinia],
        stubs: {
          'v-container': true,
          'v-row': true,
          'v-col': true,
          'v-card': true,
          'v-card-title': true,
          'v-card-text': true,
          'v-divider': true,
          'v-icon': true,
          'v-btn': true,
          'v-progress-linear': VProgressLinearStub,
          'v-chip': VChipStub
        }
      }
    });
  }

  it('Criterio 1: Renderiza la tarjeta de KPI "Carga Contractual" con total de horas asignadas y rango de referencia', async () => {
    const wrapper = getWrapper();
    await new Promise(r => setTimeout(r, 60));
    await wrapper.vm.$nextTick();

    const text = wrapper.text();
    expect(text).toContain('CARGA CONTRACTUAL');
    expect(text).toContain('CLASES ASIGNADAS');
    expect(text).toContain('HORAS SEMANALES');

    // Rango de referencia contractual (Mín: 10h, Máx: 30h)
    expect(text).toContain('Mín: 10h');
    expect(text).toContain('Máx: 30h');

    // Horas asignadas (4 horas)
    expect(wrapper.vm.assignedHours).toBe(4);
    expect(wrapper.vm.minWeeklyHours).toBe(10);
    expect(wrapper.vm.maxWeeklyHours).toBe(30);
  });

  it('Criterio 2: Barra comparativa visual refleja el porcentaje frente a max_weekly_hours con color dinámico', async () => {
    const wrapper = getWrapper();
    await new Promise(r => setTimeout(r, 60));
    await wrapper.vm.$nextTick();

    // 4 horas de 30 máximas = round(4/30 * 100) = 13%
    expect(wrapper.vm.workloadPercentage).toBe(13);
    expect(wrapper.vm.visualProgressPercentage).toBe(13);

    const progressBar = wrapper.findComponent({ name: 'v-progress-linear' });
    expect(progressBar.exists()).toBe(true);
    expect(progressBar.props('modelValue')).toBe(13);
    // Como 4 < 10 (mínimo), color es warning
    expect(progressBar.props('color')).toBe('warning');
  });

  it('Criterio 3 (Criterio estricto): Si assigned_hours < min_weekly_hours, muestra exactamente "Pendiente de asignación de horas mínimas"', async () => {
    // Elena tiene 4 horas asignadas, y su mínimo es 10 horas
    currentMockSchedules = mockSchedules4Hours;
    const wrapper = getWrapper();
    await new Promise(r => setTimeout(r, 60));
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.assignedHours).toBeLessThan(wrapper.vm.minWeeklyHours);

    // Debe mostrar la alerta/etiqueta informativa con el texto exacto
    expect(wrapper.text()).toContain('Pendiente de asignación de horas mínimas');
    expect(wrapper.text()).not.toContain('Cumplimiento contractual óptimo');
  });

  it('Criterio 4: Si assigned_hours >= min_weekly_hours, no muestra "Pendiente de asignación de horas mínimas" y pasa a cumplimiento óptimo', async () => {
    // Elena tiene 12 horas asignadas (mínimo 10, máximo 30)
    currentMockSchedules = mockSchedules12Hours;
    currentMockTeacher.assigned_hours = 12;
    const wrapper = getWrapper();
    await new Promise(r => setTimeout(r, 60));
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.assignedHours).toBe(12);
    expect(wrapper.vm.assignedHours).toBeGreaterThanOrEqual(wrapper.vm.minWeeklyHours);

    // NO debe mostrar la advertencia de horas mínimas
    expect(wrapper.text()).not.toContain('Pendiente de asignación de horas mínimas');
    // Muestra cumplimiento óptimo
    expect(wrapper.text()).toContain('Cumplimiento contractual óptimo');

    // Color de la barra pasa a teal/éxito
    const progressBar = wrapper.findComponent({ name: 'v-progress-linear' });
    expect(progressBar.props('color')).toBe('teal-darken-1');
  });

  it('Criterio 5: Valores por defecto son 0 horas mínimas y 40 horas máximas cuando no están definidos', async () => {
    authStore.user = { id: 'usr-new', name: 'Nuevo Docente' };
    currentMockTeacher = { id: 'usr-new', name: 'Nuevo Docente' };
    currentMockSchedules = [];

    const wrapper = getWrapper();
    await new Promise(r => setTimeout(r, 60));
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.minWeeklyHours).toBe(0);
    expect(wrapper.vm.maxWeeklyHours).toBe(40);
    expect(wrapper.vm.assignedHours).toBe(0);
  });
});
