import { mount, config } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import CoordinatorView from '../CoordinatorView.vue';
import { createPinia } from 'pinia';

config.global.renderStubDefaultSlot = true;

const mockTeachers = [
  { id: 't-1', name: 'Elena Salgado', email: 'elena@itc.edu', identifier: 'DOC-101', max_hours: 25 },
  { id: 't-2', name: 'Carlos Vega', email: 'carlos@itc.edu', identifier: 'DOC-102', max_hours: 25 }
];

// Supongamos que Elena Salgado (t-1) tiene asignados 18 horas en schedules existentes:
// 9 clases de 2 horas cada una = 18 hrs
const mockSchedules = [
  { id: 's-1', teacher_id: 't-1', start_time: '08:00', end_time: '10:00' }, // 2h
  { id: 's-2', teacher_id: 't-1', start_time: '10:00', end_time: '12:00' }, // 2h
  { id: 's-3', teacher_id: 't-1', start_time: '12:00', end_time: '14:00' }, // 2h
  { id: 's-4', teacher_id: 't-1', start_time: '14:00', end_time: '16:00' }, // 2h
  { id: 's-5', teacher_id: 't-1', start_time: '16:00', end_time: '18:00' }, // 2h
  { id: 's-6', teacher_id: 't-1', start_time: '08:00', end_time: '10:00' }, // 2h
  { id: 's-7', teacher_id: 't-1', start_time: '10:00', end_time: '12:00' }, // 2h
  { id: 's-8', teacher_id: 't-1', start_time: '12:00', end_time: '14:00' }, // 2h
  { id: 's-9', teacher_id: 't-1', start_time: '14:00', end_time: '16:00' }  // 2h -> Total 18 hrs
];

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn((url) => {
      if (url.includes('/schedules/coordinator')) return Promise.resolve({ data: mockSchedules });
      if (url.includes('/subjects')) return Promise.resolve({ data: [
        { id: 'sub-1', name: 'Cálculo', code: 'MAT-101', credits: 5 }
      ] });
      if (url.includes('/teachers')) return Promise.resolve({ data: mockTeachers });
      if (url.includes('/classrooms')) return Promise.resolve({ data: [
        { id: 'c-1', name: 'Aula A-101', building: 'Edificio A', capacity: 35, type: 'Aula Teórica' }
      ] });
      return Promise.resolve({ data: [] });
    }),
    post: vi.fn(() => Promise.resolve({ data: { message: 'OK' } })),
    delete: vi.fn(() => Promise.resolve({ data: { message: 'OK' } }))
  }
}));

const VProgressLinearStub = {
  name: 'v-progress-linear',
  props: ['modelValue', 'color', 'height', 'dataColor', 'dataColorName'],
  template: '<div class="v-progress-linear-stub" :data-color="color" :data-color-name="dataColorName"><slot></slot></div>'
};

describe('CoordinatorView.vue - Medidor Visual de Carga Laboral del Docente', () => {
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
          'v-progress-linear': VProgressLinearStub,
          'ExcelScheduleUploader': true
        }
      }
    });
  }

  it('Criterio 1: Al seleccionar un docente en el diálogo de armado de horario, aparece inmediatamente v-progress-linear', async () => {
    const wrapper = getWrapper();
    await new Promise(r => setTimeout(r, 50));
    await wrapper.vm.$nextTick();

    wrapper.vm.openCreateDialog();
    await wrapper.vm.$nextTick();

    // Inicialmente no hay docente seleccionado
    expect(wrapper.vm.newSchedule.teacher_id).toBeNull();
    let progressBar = wrapper.findComponent({ name: 'v-progress-linear' });
    expect(progressBar.exists()).toBe(false);

    // Seleccionar docente t-1
    wrapper.vm.newSchedule.teacher_id = 't-1';
    await wrapper.vm.$nextTick();

    // Ahora aparece inmediatamente la barra de progreso
    progressBar = wrapper.findComponent({ name: 'v-progress-linear' });
    expect(progressBar.exists()).toBe(true);
  });

  it('Criterio 2: La barra muestra texto con el formato "Horas: 18 / 25 hrs semanales (7 hrs disponibles)"', async () => {
    const wrapper = getWrapper();
    await new Promise(r => setTimeout(r, 50));
    await wrapper.vm.$nextTick();

    wrapper.vm.openCreateDialog();
    wrapper.vm.newSchedule.teacher_id = 't-1'; // Elena Salgado tiene 18 horas asignadas de 25 máximas
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.currentAssignedHours).toBe(18);
    expect(wrapper.vm.maxWeeklyHours).toBe(25);
    expect(wrapper.vm.availableHours).toBe(7);

    // Formato exacto
    expect(wrapper.vm.teacherMeterText).toBe('Horas: 18 / 25 hrs semanales (7 hrs disponibles)');

    const progressBar = wrapper.findComponent({ name: 'v-progress-linear' });
    expect(progressBar.text()).toContain('Horas: 18 / 25 hrs semanales (7 hrs disponibles)');
  });

  it('Criterio 3: Código de colores (Verde < 80%, Ámbar 80%-100%, Rojo si clase en proceso superaría 100%)', async () => {
    const wrapper = getWrapper();
    await new Promise(r => setTimeout(r, 50));
    await wrapper.vm.$nextTick();

    wrapper.vm.openCreateDialog();

    // 1. Caso Verde (< 80%): Docente t-2 no tiene clases asignadas (0 / 25 = 0%), nueva clase 2h -> 2/25 = 8% (< 80%)
    wrapper.vm.newSchedule.teacher_id = 't-2';
    wrapper.vm.newSchedule.start_time = '08:00';
    wrapper.vm.newSchedule.end_time = '10:00'; // 2 hrs
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.currentAssignedHours).toBe(0);
    expect(wrapper.vm.teacherMeterColor).toBe('success'); // Verde
    expect(wrapper.vm.teacherMeterColorName).toBe('verde');

    let progressBar = wrapper.findComponent({ name: 'v-progress-linear' });
    expect(progressBar.props('color')).toBe('success');

    // 2. Caso Ámbar (80% - 100%): Elena Salgado (t-1) tiene 18 hrs asignadas (72%), más 2 hrs de la nueva clase = 20 / 25 = 80%
    wrapper.vm.newSchedule.teacher_id = 't-1';
    wrapper.vm.newSchedule.start_time = '08:00';
    wrapper.vm.newSchedule.end_time = '10:00'; // 2 hrs -> Total con nueva clase: 20 hrs (80%)
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.totalHoursWithPending).toBe(20);
    expect(wrapper.vm.teacherMeterColor).toBe('warning'); // Ámbar
    expect(wrapper.vm.teacherMeterColorName).toBe('ambar');

    progressBar = wrapper.findComponent({ name: 'v-progress-linear' });
    expect(progressBar.props('color')).toBe('warning');

    // 3. Caso Rojo (> 100%): Elena Salgado tiene 18 hrs, clase en proceso de 8 horas (08:00 a 16:00) -> 18 + 8 = 26 hrs (> 25 hrs)
    wrapper.vm.newSchedule.start_time = '08:00';
    wrapper.vm.newSchedule.end_time = '16:00'; // 8 hrs -> Total 26 hrs > 25 hrs (supera 100%)
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.totalHoursWithPending).toBe(26);
    expect(wrapper.vm.totalHoursWithPending > wrapper.vm.maxWeeklyHours).toBe(true);
    expect(wrapper.vm.teacherMeterColor).toBe('error'); // Rojo
    expect(wrapper.vm.teacherMeterColorName).toBe('rojo');

    progressBar = wrapper.findComponent({ name: 'v-progress-linear' });
    expect(progressBar.props('color')).toBe('error');
  });

  it('Criterio 4: Al limpiar la selección del profesor (clearable), el medidor se oculta limpiamente', async () => {
    const wrapper = getWrapper();
    await new Promise(r => setTimeout(r, 50));
    await wrapper.vm.$nextTick();

    wrapper.vm.openCreateDialog();
    wrapper.vm.newSchedule.teacher_id = 't-1';
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent({ name: 'v-progress-linear' }).exists()).toBe(true);

    // Simular que el usuario hace clic en el botón clear de v-autocomplete
    wrapper.vm.newSchedule.teacher_id = null;
    await wrapper.vm.$nextTick();

    // El medidor se oculta completamente
    expect(wrapper.findComponent({ name: 'v-progress-linear' }).exists()).toBe(false);
    expect(wrapper.find('.teacher-workload-container').exists()).toBe(false);
  });
});
