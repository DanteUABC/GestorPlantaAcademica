import { mount, config } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CoordinatorView from '../CoordinatorView.vue';
import { createPinia } from 'pinia';

config.global.renderStubDefaultSlot = true;

const mockClassrooms = [
  { id: 'c-1', name: 'Aula A-101', building: 'Edificio A', capacity: 30, type: 'Aula Teórica' },
  { id: 'c-2', name: 'Lab Cómputo 1', building: 'Edificio Tecnologías', capacity: 25, type: 'Laboratorio' }
];

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn((url) => {
      if (url.includes('/schedules/coordinator')) return Promise.resolve({ data: [] });
      if (url.includes('/subjects')) return Promise.resolve({ data: [
        { id: 'sub-1', name: 'Cálculo Diferencial', code: 'MAT-101', credits: 5 }
      ] });
      if (url.includes('/teachers')) return Promise.resolve({ data: [
        { id: 't-1', name: 'Elena Salgado', email: 'elena@itc.edu', identifier: 'DOC-101' }
      ] });
      if (url.includes('/classrooms')) return Promise.resolve({ data: mockClassrooms });
      return Promise.resolve({ data: [] });
    }),
    post: vi.fn(() => Promise.resolve({ data: { message: 'OK' } })),
    delete: vi.fn(() => Promise.resolve({ data: { message: 'OK' } }))
  }
}));

const VSelectStub = {
  name: 'v-select',
  props: ['items', 'itemTitle', 'itemValue', 'label', 'modelValue'],
  template: '<div class="v-select-stub"><slot name="item" v-for="item in items" :item="{ raw: item }"></slot></div>'
};

const VTextFieldStub = {
  name: 'v-text-field',
  props: ['label', 'modelValue', 'error', 'errorMessages', 'messages'],
  template: '<div class="v-text-field-stub" :data-error="error">{{ (errorMessages || []).join(\', \') }}</div>'
};

const VBtnStub = {
  name: 'v-btn',
  props: ['type', 'disabled', 'loading'],
  template: '<button class="v-btn-stub" :disabled="disabled"><slot></slot></button>'
};

const VAlertStub = {
  name: 'v-alert',
  props: ['type', 'color'],
  template: '<div class="v-alert-stub" :data-type="type"><slot></slot></div>'
};

describe('CoordinatorView.vue - Selector de Espacios y Alerta Dinámica de Sobrecupo', () => {
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
          'v-btn': VBtnStub,
          'v-alert': VAlertStub,
          'v-tabs': true,
          'v-tab': true,
          'v-table': true,
          'v-dialog': true,
          'v-form': true,
          'v-autocomplete': true,
          'v-select': VSelectStub,
          'v-text-field': VTextFieldStub,
          'v-snackbar': true,
          'v-chip': true,
          'v-list-item': true,
          'v-divider': true,
          'v-progress-linear': true,
          'ExcelScheduleUploader': true
        }
      }
    });
  }

  it('Criterio 1: El componente de selección de aula muestra nombre, tipo de espacio y capacidad máxima', async () => {
    const wrapper = getWrapper();
    // Esperar a que se carguen los datos
    await new Promise(r => setTimeout(r, 50));
    await wrapper.vm.$nextTick();

    const selects = wrapper.findAllComponents({ name: 'v-select' });
    const classroomSelect = selects.find(s => s.props('label')?.includes('Aula Física'));
    expect(classroomSelect).toBeDefined();

    const items = classroomSelect.props('items');
    expect(items.length).toBe(2);

    // Debe mostrar formato: "Nombre • Tipo • Capacidad: XX"
    expect(items[0].displayName).toBe('Aula A-101 • Aula Teórica • Capacidad: 30');
    expect(items[1].displayName).toBe('Lab Cómputo 1 • Laboratorio • Capacidad: 25');
  });

  it('Criterio 2: Si el usuario ingresa en Cupo Máximo un valor mayor a la capacidad del aula, se activa la advertencia visual', async () => {
    const wrapper = getWrapper();
    await new Promise(r => setTimeout(r, 50));
    await wrapper.vm.$nextTick();

    // Abrir el diálogo de creación
    wrapper.vm.openCreateDialog();
    await wrapper.vm.$nextTick();

    // Seleccionar Lab Cómputo 1 (capacidad: 25)
    wrapper.vm.newSchedule.classroom_id = 'c-2';
    // Ingresar cupo que excede la capacidad: 40 > 25
    wrapper.vm.newSchedule.max_students = 40;
    await wrapper.vm.$nextTick();

    // Verificar computada de sobrecupo
    expect(wrapper.vm.isCapacityExceeded).toBe(true);
    expect(wrapper.vm.capacityWarningMessage).toContain('Sobrecupo detectado');
    expect(wrapper.vm.capacityWarningMessage).toContain('40 alumnos');
    expect(wrapper.vm.capacityWarningMessage).toContain('25 alumnos');

    // Verificar v-alert visual en el DOM
    const alerts = wrapper.findAllComponents({ name: 'v-alert' });
    const capacityAlert = alerts.find(a => a.text().includes('Advertencia de Sobrecupo'));
    expect(capacityAlert).toBeDefined();
    expect(capacityAlert.text()).toContain('25');

    // Verificar v-text-field en estado de error
    const textFields = wrapper.findAllComponents({ name: 'v-text-field' });
    const maxStudentsField = textFields.find(t => t.props('label')?.includes('Cupo Máximo'));
    expect(maxStudentsField.props('error')).toBe(true);
    expect(maxStudentsField.props('errorMessages')[0]).toContain('Sobrecupo detectado');
  });

  it('Criterio 3: El botón "Guardar Horario" se deshabilita cuando la regla de capacidad se infringe', async () => {
    const wrapper = getWrapper();
    await new Promise(r => setTimeout(r, 50));
    await wrapper.vm.$nextTick();

    wrapper.vm.openCreateDialog();
    await wrapper.vm.$nextTick();

    wrapper.vm.newSchedule.classroom_id = 'c-2'; // capacidad: 25
    wrapper.vm.newSchedule.max_students = 50; // Infracción de capacidad
    await wrapper.vm.$nextTick();

    // Buscar el botón Guardar Horario
    const buttons = wrapper.findAllComponents({ name: 'v-btn' });
    const saveButton = buttons.find(b => b.text().includes('Guardar Horario'));
    expect(saveButton).toBeDefined();

    // El botón debe estar deshabilitado
    expect(saveButton.props('disabled')).toBe(true);

    // Corregir el cupo a un valor válido: 20 <= 25
    wrapper.vm.newSchedule.max_students = 20;
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isCapacityExceeded).toBe(false);
    expect(saveButton.props('disabled')).toBe(false);
  });
});
