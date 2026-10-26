import { mount, config, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WeeklyHeatmap from '../WeeklyHeatmap.vue';
import api from '../../api/client';

config.global.renderStubDefaultSlot = true;

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn()
  }
}));

describe('WeeklyHeatmap.vue - Mapa de Calor Semanal y Panel Lateral', () => {
  const vuetifyStubs = {
    'v-card': true,
    'v-card-title': true,
    'v-card-subtitle': true,
    'v-table': true,
    'v-icon': true,
    'v-btn': true,
    'v-alert': true,
    'v-avatar': true,
    'v-chip': true,
    'v-list': true,
    'v-list-item': true,
    'v-list-item-title': true,
    'v-list-item-subtitle': true,
    'v-progress-linear': true,
    'v-navigation-drawer': true,
    'v-tooltip': {
      template: '<div><slot name="activator" :props="{}"></slot><slot></slot></div>'
    }
  };

  const sampleOccupancyData = [
    { dia: 'Lunes', hora_inicio: 7, aulas_ocupadas: 1, aulas_totales: 4, porcentaje_ocupacion: 25 },
    { dia: 'Lunes', hora_inicio: 8, aulas_ocupadas: 2, aulas_totales: 4, porcentaje_ocupacion: 50 },
    { dia: 'Lunes', hora_inicio: 9, aulas_ocupadas: 4, aulas_totales: 4, porcentaje_ocupacion: 100 },
    { dia: 'Martes', hora_inicio: 10, aulas_ocupadas: 0, aulas_totales: 4, porcentaje_ocupacion: 0 },
    { dia: 'Miércoles', hora_inicio: 8, aulas_ocupadas: 3, aulas_totales: 4, porcentaje_ocupacion: 75 },
    { dia: 'Jueves', hora_inicio: 12, aulas_ocupadas: 1, aulas_totales: 4, porcentaje_ocupacion: 30 }
  ];

  const mockAvailableClassrooms = [
    { id: 'c1', name: 'Aula 102', building: 'Edificio Central', capacity: 35, type: 'Aula Teórica' },
    { id: 'c2', name: 'Lab 201', building: 'Edificio Central', capacity: 20, type: 'Laboratorio' }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    api.get.mockResolvedValue({ data: mockAvailableClassrooms });
  });

  describe('Asignación dinámica de colores (getCellColorClass)', () => {
    it('asigna "bg-green-lighten-4" para porcentajes de 0% a 30%', () => {
      const wrapper = mount(WeeklyHeatmap, {
        props: { occupancyData: [] },
        global: { stubs: vuetifyStubs }
      });

      expect(wrapper.vm.getCellColorClass(0)).toBe('bg-green-lighten-4');
      expect(wrapper.vm.getCellColorClass(15)).toBe('bg-green-lighten-4');
      expect(wrapper.vm.getCellColorClass(30)).toBe('bg-green-lighten-4');
    });

    it('asigna "bg-orange-lighten-3" para porcentajes de 31% a 75%', () => {
      const wrapper = mount(WeeklyHeatmap, {
        props: { occupancyData: [] },
        global: { stubs: vuetifyStubs }
      });

      expect(wrapper.vm.getCellColorClass(31)).toBe('bg-orange-lighten-3');
      expect(wrapper.vm.getCellColorClass(50)).toBe('bg-orange-lighten-3');
      expect(wrapper.vm.getCellColorClass(75)).toBe('bg-orange-lighten-3');
    });

    it('asigna "bg-red-lighten-3" para porcentajes mayores a 75%', () => {
      const wrapper = mount(WeeklyHeatmap, {
        props: { occupancyData: [] },
        global: { stubs: vuetifyStubs }
      });

      expect(wrapper.vm.getCellColorClass(76)).toBe('bg-red-lighten-3');
      expect(wrapper.vm.getCellColorClass(90)).toBe('bg-red-lighten-3');
      expect(wrapper.vm.getCellColorClass(100)).toBe('bg-red-lighten-3');
    });
  });

  describe('Formato de Tooltip (formatTooltip)', () => {
    it('formatea correctamente el tooltip con el patrón requerido', () => {
      const wrapper = mount(WeeklyHeatmap, {
        props: { occupancyData: [] },
        global: { stubs: vuetifyStubs }
      });

      const cell = { aulas_ocupadas: 3, aulas_totales: 10, porcentaje_ocupacion: 30 };
      const tooltip = wrapper.vm.formatTooltip('Lunes', 7, cell);

      // Esperado: "[Día] [Hora_Inicio]:00 - [Hora_Fin]:00: [aulas_ocupadas] de [aulas_totales] aulas ocupadas ([porcentaje_ocupacion]%)"
      expect(tooltip).toBe('Lunes 07:00 - 08:00: 3 de 10 aulas ocupadas (30%)');
    });
  });

  describe('Inyección de datos y renderizado de celdas', () => {
    it('mapea correctamente los datos preexistentes en las celdas correspondientes', () => {
      const wrapper = mount(WeeklyHeatmap, {
        props: { occupancyData: sampleOccupancyData },
        global: { stubs: vuetifyStubs }
      });

      // Lunes 7:00 (25% -> verde)
      const lunes7 = wrapper.vm.getCellData('Lunes', 7);
      expect(lunes7.porcentaje_ocupacion).toBe(25);
      expect(lunes7.aulas_ocupadas).toBe(1);
      expect(wrapper.vm.getCellColorClass(lunes7.porcentaje_ocupacion)).toBe('bg-green-lighten-4');

      // Lunes 8:00 (50% -> naranja)
      const lunes8 = wrapper.vm.getCellData('Lunes', 8);
      expect(lunes8.porcentaje_ocupacion).toBe(50);
      expect(wrapper.vm.getCellColorClass(lunes8.porcentaje_ocupacion)).toBe('bg-orange-lighten-3');

      // Lunes 9:00 (100% -> rojo)
      const lunes9 = wrapper.vm.getCellData('Lunes', 9);
      expect(lunes9.porcentaje_ocupacion).toBe(100);
      expect(wrapper.vm.getCellColorClass(lunes9.porcentaje_ocupacion)).toBe('bg-red-lighten-3');
    });
  });

  describe('Panel lateral interactivo (Drawer de Aulas Disponibles)', () => {
    it('abre el drawer y dispara la petición a /api/analytics/available-classrooms al hacer clic en una celda', async () => {
      const wrapper = mount(WeeklyHeatmap, {
        props: {
          occupancyData: sampleOccupancyData,
          selectedBuilding: 'Edificio Central'
        },
        global: { stubs: vuetifyStubs }
      });

      expect(wrapper.vm.drawerOpen).toBe(false);

      const cell = wrapper.vm.getCellData('Lunes', 8);
      await wrapper.vm.handleCellClick('Lunes', 8, cell);
      await flushPromises();

      // Drawer se abre
      expect(wrapper.vm.drawerOpen).toBe(true);

      // Petición a la API correcta
      expect(api.get).toHaveBeenCalledWith('/analytics/available-classrooms', {
        params: {
          dia: 'Lunes',
          bloque: 8,
          edificio: 'Edificio Central'
        }
      });

      // Se asignan las aulas disponibles
      expect(wrapper.vm.availableClassrooms.length).toBe(2);
      expect(wrapper.vm.availableClassrooms[0].name).toBe('Aula 102');
      expect(wrapper.vm.availableClassrooms[0].capacity).toBe(35);
    });

    it('no incluye el parámetro edificio si está seleccionado "Todos los Edificios"', async () => {
      const wrapper = mount(WeeklyHeatmap, {
        props: {
          occupancyData: sampleOccupancyData,
          selectedBuilding: 'Todos los Edificios'
        },
        global: { stubs: vuetifyStubs }
      });

      const cell = wrapper.vm.getCellData('Martes', 10);
      await wrapper.vm.handleCellClick('Martes', 10, cell);
      await flushPromises();

      expect(api.get).toHaveBeenCalledWith('/analytics/available-classrooms', {
        params: {
          dia: 'Martes',
          bloque: 10
        }
      });
    });

    it('maneja el estado vacío cuando no hay aulas disponibles', async () => {
      api.get.mockResolvedValueOnce({ data: [] });

      const wrapper = mount(WeeklyHeatmap, {
        props: { occupancyData: sampleOccupancyData },
        global: { stubs: vuetifyStubs }
      });

      const cell = wrapper.vm.getCellData('Lunes', 9);
      await wrapper.vm.handleCellClick('Lunes', 9, cell);
      await flushPromises();

      expect(wrapper.vm.drawerOpen).toBe(true);
      expect(wrapper.vm.availableClassrooms.length).toBe(0);
      expect(wrapper.find('[data-testid="no-available-classrooms"]').exists()).toBe(true);
    });

    it('maneja errores al fallar la consulta de aulas disponibles', async () => {
      api.get.mockRejectedValueOnce(new Error('Network error'));

      const wrapper = mount(WeeklyHeatmap, {
        props: { occupancyData: sampleOccupancyData },
        global: { stubs: vuetifyStubs }
      });

      const cell = wrapper.vm.getCellData('Lunes', 7);
      await wrapper.vm.handleCellClick('Lunes', 7, cell);
      await flushPromises();

      expect(wrapper.vm.drawerOpen).toBe(true);
      expect(wrapper.vm.drawerError).toBeTruthy();
    });

    it('permite cerrar el panel lateral', async () => {
      const wrapper = mount(WeeklyHeatmap, {
        props: { occupancyData: sampleOccupancyData },
        global: { stubs: vuetifyStubs }
      });

      wrapper.vm.drawerOpen = true;
      expect(wrapper.vm.drawerOpen).toBe(true);

      const closeBtn = wrapper.find('[data-testid="close-drawer-btn"]');
      await closeBtn.trigger('click');
      expect(wrapper.vm.drawerOpen).toBe(false);
    });
  });
});
