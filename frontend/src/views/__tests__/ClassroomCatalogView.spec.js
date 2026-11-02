import { mount, config, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import ClassroomCatalogView from '../ClassroomCatalogView.vue';
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

const mockClassroomsData = [
  { id: 'cr-1', name: 'Aula A-101', building: 'Edificio A', capacity: 35, type: 'Aula Teórica' },
  { id: 'cr-2', name: 'Lab Cómputo 1', building: 'Edificio A', capacity: 25, type: 'Laboratorio de Cómputo' },
  { id: 'cr-3', name: 'Taller Mecánica', building: 'Edificio B', capacity: 20, type: 'Taller' },
  { id: 'cr-4', name: 'Auditorio Magna', building: 'Edificio Central', capacity: 120, type: 'Auditorio' }
];

describe('ClassroomCatalogView.vue - Catálogo de Espacios Físicos', () => {
  let pinia;

  const stubs = {
    'v-container': true,
    'v-card': true,
    'v-card-title': true,
    'v-card-text': true,
    'v-row': true,
    'v-col': true,
    'v-icon': true,
    'v-btn': {
      template: '<button @click="$emit(\'click\')"><slot /></button>'
    },
    'v-chip': true,
    'v-alert': true,
    'v-select': true,
    'v-combobox': true,
    'v-text-field': true,
    'v-divider': true,
    'v-dialog': {
      props: ['modelValue'],
      template: '<div v-if="modelValue" data-testid="dialog-rendered"><slot /></div>'
    },
    'v-form': {
      template: '<form @submit.prevent="$emit(\'submit\', $event)"><slot /></form>'
    },
    'v-data-table': {
      props: ['headers', 'items'],
      template: `
        <div data-testid="stub-data-table">
          <div v-for="item in items" :key="item.id" data-testid="table-row">
            <span>{{ item.name }}</span>
            <span>{{ item.building }}</span>
            <span>{{ item.capacity }}</span>
            <span>{{ item.type }}</span>
            <slot name="item.actions" :item="item"></slot>
          </div>
        </div>
      `
    },
    'v-snackbar': true
  };

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.clearAllMocks();

    api.get.mockResolvedValue({ data: [...mockClassroomsData] });
    api.post.mockResolvedValue({
      data: { id: 'cr-new', name: 'Aula Nueva', building: 'Edificio C', capacity: 40, type: 'Aula Teórica' }
    });
    api.put.mockResolvedValue({
      data: { id: 'cr-1', name: 'Aula A-101 Editada', building: 'Edificio A', capacity: 45, type: 'Aula Teórica' }
    });
    api.delete.mockResolvedValue({ data: { message: 'Aula eliminada exitosamente', id: 'cr-1' } });
  });

  it('carga inicialmente la lista de espacios físicos desde /api/classrooms', async () => {
    const wrapper = mount(ClassroomCatalogView, {
      global: { plugins: [pinia], stubs }
    });

    await flushPromises();

    expect(api.get).toHaveBeenCalledWith('/classrooms');
    expect(wrapper.vm.classrooms.length).toBe(4);
    expect(wrapper.vm.filteredClassrooms.length).toBe(4);
    expect(wrapper.findAll('[data-testid="table-row"]').length).toBe(4);
  });

  describe('Apertura y reutilización del Modal (v-dialog)', () => {
    it('abre el modal en modo creación al hacer clic en "Registrar Espacio Físico"', async () => {
      const wrapper = mount(ClassroomCatalogView, {
        global: { plugins: [pinia], stubs }
      });
      await flushPromises();

      expect(wrapper.vm.dialogOpen).toBe(false);

      const registerBtn = wrapper.find('[data-testid="btn-register-space"]');
      await registerBtn.trigger('click');

      expect(wrapper.vm.dialogOpen).toBe(true);
      expect(wrapper.vm.isEditing).toBe(false);
      expect(wrapper.vm.form.name).toBe('');
      expect(wrapper.vm.form.type).toBe('Aula Teórica');
      expect(wrapper.find('[data-testid="space-form-dialog"]').exists()).toBe(true);
    });

    it('reutiliza el mismo modal en modo edición cargando los datos del espacio seleccionado', async () => {
      const wrapper = mount(ClassroomCatalogView, {
        global: { plugins: [pinia], stubs }
      });
      await flushPromises();

      wrapper.vm.openEditModal(mockClassroomsData[1]);
      await wrapper.vm.$nextTick();

      expect(wrapper.vm.dialogOpen).toBe(true);
      expect(wrapper.vm.isEditing).toBe(true);
      expect(wrapper.vm.editingId).toBe('cr-2');
      expect(wrapper.vm.form.name).toBe('Lab Cómputo 1');
      expect(wrapper.vm.form.building).toBe('Edificio A');
      expect(wrapper.vm.form.capacity).toBe(25);
      expect(wrapper.vm.form.type).toBe('Laboratorio de Cómputo');
    });
  });

  describe('Validación estricta de Capacidad (> 0)', () => {
    it('dispara el error de validación cuando la capacidad es <= 0 en la regla de Vue y al guardar', async () => {
      const wrapper = mount(ClassroomCatalogView, {
        global: { plugins: [pinia], stubs }
      });
      await flushPromises();

      // 1. Validar directamente la regla estricta de Vue: v => v > 0 || 'Capacidad debe ser mayor a 0'
      const capacityRule = wrapper.vm.capacityRules[0];
      expect(capacityRule(0)).toBe('Capacidad debe ser mayor a 0');
      expect(capacityRule(-15)).toBe('Capacidad debe ser mayor a 0');
      expect(capacityRule(30)).toBe(true);

      // 2. Validar disparo del error al intentar enviar el formulario con capacidad <= 0
      wrapper.vm.openCreateModal();
      wrapper.vm.form.name = 'Aula Inválida';
      wrapper.vm.form.building = 'Edificio A';
      wrapper.vm.form.capacity = 0;
      wrapper.vm.form.type = 'Aula Teórica';

      const savedZero = await wrapper.vm.saveClassroom();
      await wrapper.vm.$nextTick();

      expect(savedZero).toBe(false);
      expect(wrapper.vm.formError).toBe('Capacidad debe ser mayor a 0');
      expect(wrapper.find('[data-testid="form-validation-alert"]').exists()).toBe(true);
      expect(api.post).not.toHaveBeenCalled();

      // 3. Probar con número negativo
      wrapper.vm.form.capacity = -5;
      const savedNegative = await wrapper.vm.saveClassroom();
      expect(savedNegative).toBe(false);
      expect(wrapper.vm.formError).toBe('Capacidad debe ser mayor a 0');
      expect(api.post).not.toHaveBeenCalled();
    });
  });

  describe('Filtrado local reactivo de la tabla', () => {
    it('filtra reactivamente las filas por "Edificio" y "Tipo de Espacio"', async () => {
      const wrapper = mount(ClassroomCatalogView, {
        global: { plugins: [pinia], stubs }
      });
      await flushPromises();

      // Sin filtros: 4 espacios
      expect(wrapper.vm.filteredClassrooms.length).toBe(4);

      // Filtro por Edificio = 'Edificio A' (debe mostrar Aula A-101 y Lab Cómputo 1)
      wrapper.vm.selectedBuilding = 'Edificio A';
      await wrapper.vm.$nextTick();
      expect(wrapper.vm.filteredClassrooms.length).toBe(2);
      expect(wrapper.vm.filteredClassrooms.map(c => c.name)).toEqual(['Aula A-101', 'Lab Cómputo 1']);

      // Combinar con Filtro por Tipo de Espacio = 'Laboratorio de Cómputo' (solo Lab Cómputo 1)
      wrapper.vm.selectedType = 'Laboratorio de Cómputo';
      await wrapper.vm.$nextTick();
      expect(wrapper.vm.filteredClassrooms.length).toBe(1);
      expect(wrapper.vm.filteredClassrooms[0].name).toBe('Lab Cómputo 1');

      // Cambiar Edificio a 'Todos' manteniendo Tipo = 'Taller' (solo Taller Mecánica)
      wrapper.vm.selectedBuilding = 'Todos';
      wrapper.vm.selectedType = 'Taller';
      await wrapper.vm.$nextTick();
      expect(wrapper.vm.filteredClassrooms.length).toBe(1);
      expect(wrapper.vm.filteredClassrooms[0].name).toBe('Taller Mecánica');

      // Restablecer ambos filtros a 'Todos'
      wrapper.vm.selectedType = 'Todos';
      await wrapper.vm.$nextTick();
      expect(wrapper.vm.filteredClassrooms.length).toBe(4);
    });
  });

  describe('Operaciones CRUD con el Backend', () => {
    it('envía POST /classrooms al registrar un espacio válido y actualiza la tabla', async () => {
      const wrapper = mount(ClassroomCatalogView, {
        global: { plugins: [pinia], stubs }
      });
      await flushPromises();

      wrapper.vm.openCreateModal();
      wrapper.vm.form = {
        name: 'Aula C-301',
        building: 'Edificio C',
        capacity: 40,
        type: 'Aula Teórica'
      };

      const result = await wrapper.vm.saveClassroom();
      await flushPromises();

      expect(result).toBe(true);
      expect(api.post).toHaveBeenCalledWith('/classrooms', {
        name: 'Aula C-301',
        building: 'Edificio C',
        capacity: 40,
        type: 'Aula Teórica'
      });
      expect(wrapper.vm.dialogOpen).toBe(false);
    });

    it('envía PUT /classrooms/:id al guardar cambios en modo edición', async () => {
      const wrapper = mount(ClassroomCatalogView, {
        global: { plugins: [pinia], stubs }
      });
      await flushPromises();

      wrapper.vm.openEditModal(mockClassroomsData[0]);
      wrapper.vm.form.name = 'Aula A-101 Renovada';
      wrapper.vm.form.capacity = 45;

      const result = await wrapper.vm.saveClassroom();
      await flushPromises();

      expect(result).toBe(true);
      expect(api.put).toHaveBeenCalledWith('/classrooms/cr-1', {
        name: 'Aula A-101 Renovada',
        building: 'Edificio A',
        capacity: 45,
        type: 'Aula Teórica'
      });
      expect(wrapper.vm.dialogOpen).toBe(false);
    });

    it('envía DELETE /classrooms/:id al eliminar un espacio físico', async () => {
      const wrapper = mount(ClassroomCatalogView, {
        global: { plugins: [pinia], stubs }
      });
      await flushPromises();

      await wrapper.vm.deleteClassroom(mockClassroomsData[0]);
      await flushPromises();

      expect(api.delete).toHaveBeenCalledWith('/classrooms/cr-1');
    });
  });
});
