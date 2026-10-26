import { mount, config, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import AnalyticsDashboardView from '../AnalyticsDashboardView.vue';
import { createPinia, setActivePinia } from 'pinia';
import api from '../../api/client';

config.global.renderStubDefaultSlot = true;

const mockOccupancy = [
  { dia: 'Lunes', hora_inicio: 7, aulas_ocupadas: 2, aulas_totales: 2, porcentaje_ocupacion: 100 },
  { dia: 'Lunes', hora_inicio: 8, aulas_ocupadas: 1, aulas_totales: 2, porcentaje_ocupacion: 50 },
  { dia: 'Martes', hora_inicio: 7, aulas_ocupadas: 0, aulas_totales: 2, porcentaje_ocupacion: 0 },
  { dia: 'Martes', hora_inicio: 8, aulas_ocupadas: 2, aulas_totales: 2, porcentaje_ocupacion: 100 }
];

const mockTeacherUtilization = {
  total_profesores: 10,
  profesores_optimos: 5,
  profesores_subutilizados: 3,
  profesores_sobrecupo: 2
};

const mockClassrooms = [
  { id: 'c-1', name: 'Aula 101', building: 'Edificio de Ciencias', capacity: 30 },
  { id: 'c-2', name: 'Lab 201', building: 'Edificio Tecnologías', capacity: 25 }
];

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn()
  }
}));

describe('AnalyticsDashboardView.vue - Tablero de Control Directivo', () => {
  let pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    vi.clearAllMocks();

    api.get.mockImplementation((url) => {
      if (url.includes('/analytics/classroom-occupancy')) {
        return Promise.resolve({ data: mockOccupancy });
      }
      if (url.includes('/analytics/teacher-utilization')) {
        return Promise.resolve({ data: mockTeacherUtilization });
      }
      if (url.includes('/classrooms')) {
        return Promise.resolve({ data: mockClassrooms });
      }
      return Promise.resolve({ data: [] });
    });
  });

  const stubs = {
    'v-container': true,
    'v-card': true,
    'v-card-title': true,
    'v-card-text': true,
    'v-row': true,
    'v-col': true,
    'v-icon': true,
    'v-btn': true,
    'v-avatar': true,
    'v-chip': true,
    'v-alert': true,
    'v-select': true,
    'v-divider': true,
    'v-list': true,
    'v-list-item': true,
    'v-list-item-title': true,
    'v-progress-circular': true,
    'WeeklyHeatmap': true
  };

  it('debe montar el componente y ejecutar las llamadas concurrentes con Promise.all', async () => {
    const wrapper = mount(AnalyticsDashboardView, {
      global: {
        plugins: [pinia],
        stubs
      }
    });

    await flushPromises();

    expect(api.get).toHaveBeenCalledWith('/analytics/classroom-occupancy');
    expect(api.get).toHaveBeenCalledWith('/analytics/teacher-utilization');
    expect(api.get).toHaveBeenCalledWith('/classrooms');
    expect(wrapper.vm.occupancyData.length).toBe(4);
    expect(wrapper.vm.teacherUtilization.total_profesores).toBe(10);
  });

  it('KPI 1: debe calcular correctamente la Tasa General de Ocupación Física (%)', async () => {
    // Promedio de [100, 50, 0, 100] = 250 / 4 = 62.5%
    const wrapper = mount(AnalyticsDashboardView, {
      global: {
        plugins: [pinia],
        stubs
      }
    });

    await flushPromises();

    expect(wrapper.vm.tasaGeneralOcupacion).toBe(62.5);
    const kpiEl = wrapper.find('[data-testid="kpi-tasa-ocupacion"]');
    expect(kpiEl.text()).toContain('62.5%');
  });

  it('KPI 2: debe contar los bloques con ocupación crítica (> 90%)', async () => {
    // [100, 50, 0, 100] -> Hay 2 bloques con porcentaje > 90%
    const wrapper = mount(AnalyticsDashboardView, {
      global: {
        plugins: [pinia],
        stubs
      }
    });

    await flushPromises();

    expect(wrapper.vm.ocupacionCritica).toBe(2);
    const kpiEl = wrapper.find('[data-testid="kpi-ocupacion-critica"]');
    expect(kpiEl.text()).toContain('2');
  });

  it('KPI 3: debe reflejar directamente el valor de profesores subutilizados', async () => {
    const wrapper = mount(AnalyticsDashboardView, {
      global: {
        plugins: [pinia],
        stubs
      }
    });

    await flushPromises();

    expect(wrapper.vm.profesoresSubutilizados).toBe(3);
    const kpiEl = wrapper.find('[data-testid="kpi-profesores-subutilizados"]');
    expect(kpiEl.text()).toContain('3');
  });

  it('KPI 4: debe calcular las Horas Libres Totales (Capacidad Total - Aulas Ocupadas)', async () => {
    // Total Capacidad = 2 + 2 + 2 + 2 = 8
    // Total Ocupadas = 2 + 1 + 0 + 2 = 5
    // Horas Libres = 8 - 5 = 3
    const wrapper = mount(AnalyticsDashboardView, {
      global: {
        plugins: [pinia],
        stubs
      }
    });

    await flushPromises();

    expect(wrapper.vm.horasLibresTotales).toBe(3);
    const kpiEl = wrapper.find('[data-testid="kpi-horas-libres"]');
    expect(kpiEl.text()).toContain('3');
  });

  it('debe disparar la recarga de datos al invocar la función de actualización', async () => {
    const wrapper = mount(AnalyticsDashboardView, {
      global: {
        plugins: [pinia],
        stubs
      }
    });

    await flushPromises();

    expect(api.get).toHaveBeenCalledTimes(3);

    // Disparar recarga manual
    await wrapper.vm.loadAnalytics();
    await flushPromises();

    expect(api.get).toHaveBeenCalledTimes(6);
  });

  it('debe observar el cambio en selectedBuilding y disparar la recarga con el parámetro ?edificio=', async () => {
    const wrapper = mount(AnalyticsDashboardView, {
      global: {
        plugins: [pinia],
        stubs
      }
    });

    await flushPromises();
    expect(api.get).toHaveBeenCalledTimes(3);

    // Cambiar edificio a 'Edificio Tecnologías'
    wrapper.vm.selectedBuilding = 'Edificio Tecnologías';
    await flushPromises();

    // Debe haberse disparado una nueva recarga (3 llamadas adicionales)
    expect(api.get).toHaveBeenCalledTimes(6);
    expect(api.get).toHaveBeenCalledWith('/analytics/classroom-occupancy?edificio=Edificio%20Tecnolog%C3%ADas');
    expect(api.get).toHaveBeenCalledWith('/analytics/teacher-utilization?edificio=Edificio%20Tecnolog%C3%ADas');
  });

  it('debe manejar adecuadamente respuestas vacías sin errores matemáticos', async () => {
    api.get.mockImplementation(() => Promise.resolve({ data: [] }));

    const wrapper = mount(AnalyticsDashboardView, {
      global: {
        plugins: [pinia],
        stubs
      }
    });

    await flushPromises();

    expect(wrapper.vm.tasaGeneralOcupacion).toBe(0);
    expect(wrapper.vm.ocupacionCritica).toBe(0);
    expect(wrapper.vm.profesoresSubutilizados).toBe(0);
    expect(wrapper.vm.horasLibresTotales).toBe(0);
  });

  it('debe poblar las opciones del filtro de edificios incluyendo "Todos los Edificios"', async () => {
    const wrapper = mount(AnalyticsDashboardView, {
      global: {
        plugins: [pinia],
        stubs
      }
    });

    await flushPromises();

    expect(wrapper.vm.buildingOptions).toContain('Todos los Edificios');
    expect(wrapper.vm.buildingOptions).toContain('Edificio de Ciencias');
    expect(wrapper.vm.buildingOptions).toContain('Edificio Tecnologías');
  });
});
