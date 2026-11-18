import { mount, config, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import CoordinatorView from '../CoordinatorView.vue';
import { useAuthStore } from '../../stores/authStore';
import api from '../../api/client';

config.global.renderStubDefaultSlot = true;

const { mockRouter, routeState } = vi.hoisted(() => ({
  mockRouter: {
    replace: vi.fn()
  },
  routeState: {
    current: null
  }
}));

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal();
  const { reactive } = await import('vue');
  routeState.current = reactive({ query: {} });
  return {
    ...actual,
    useRoute: () => routeState.current,
    useRouter: () => mockRouter
  };
});

vi.mock('../../utils/schedulePdfGenerator', () => ({
  generateOfficialSchedulePdf: vi.fn()
}));

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn()
  }
}));

const mockTeachers = [
  {
    id: 'teach-1',
    name: 'Dr. Roberto Mendoza',
    nombre: 'Roberto',
    apellidos: 'Mendoza',
    email: 'roberto@uabc.edu.mx',
    identificador: 'DOC-101',
    horas_contratadas: 20,
    horas_asignadas: 10,
    estatus: 'activo'
  },
  {
    id: 'teach-2',
    name: 'Mtra. Elena Gómez',
    nombre: 'Elena',
    apellidos: 'Gómez',
    email: 'elena@uabc.edu.mx',
    identificador: 'DOC-102',
    horas_contratadas: 25,
    horas_asignadas: 15,
    estatus: 'activo'
  },
  {
    id: 'teach-3',
    name: 'Ing. Carlos Slim',
    nombre: 'Carlos',
    apellidos: 'Slim',
    email: 'carlos@uabc.edu.mx',
    identificador: 'DOC-103',
    horas_contratadas: 15,
    horas_asignadas: 5,
    estatus: 'activo'
  }
];

const mockSubstitutions = [
  {
    id: 'sub-1',
    substitution_id: 'sub-1',
    schedule_id: 'sch-101',
    original_teacher_id: 'teach-1',
    original_teacher_name: 'Dr. Roberto Mendoza',
    original_teacher_email: 'roberto@uabc.edu.mx',
    original_teacher_identifier: 'DOC-101',
    substitute_teacher_id: 'teach-2',
    substitute_teacher_name: 'Mtra. Elena Gómez',
    substitute_teacher_email: 'elena@uabc.edu.mx',
    substitute_teacher_identifier: 'DOC-102',
    reason: 'Comisión académica de investigación',
    effective_date: '2026-11-20',
    created_at: '2026-11-15T10:30:00Z',
    day_of_week: 'Lunes',
    start_time: '08:00',
    end_time: '10:00',
    group_code: 'G1',
    session_type: 'Clase Teórica',
    subject_id: 'sub-calc',
    subject_name: 'Cálculo Diferencial',
    subject_code: 'MAT-101',
    classroom_name: 'Aula 201',
    classroom_building: 'Edificio A',
    substitution_type: 'definitiva',
    status: 'finalizada'
  },
  {
    id: 'sub-2',
    substitution_id: 'sub-2',
    schedule_id: 'sch-102',
    original_teacher_id: 'teach-3',
    original_teacher_name: 'Ing. Carlos Slim',
    original_teacher_email: 'carlos@uabc.edu.mx',
    original_teacher_identifier: 'DOC-103',
    substitute_teacher_id: 'teach-1',
    substitute_teacher_name: 'Dr. Roberto Mendoza',
    substitute_teacher_email: 'roberto@uabc.edu.mx',
    substitute_teacher_identifier: 'DOC-101',
    reason: 'Incapacidad médica certificada',
    effective_date: '2026-12-05',
    end_date: '2026-12-15',
    substitution_type: 'temporal',
    status: 'activa',
    created_at: '2026-11-16T14:00:00Z',
    day_of_week: 'Miércoles',
    start_time: '12:00',
    end_time: '14:00',
    group_code: 'G2',
    session_type: 'Laboratorio',
    subject_id: 'sub-prog',
    subject_name: 'Programación Avanzada',
    subject_code: 'CS-202',
    classroom_name: 'Lab Cómputo 1',
    classroom_building: 'Edificio C'
  }
];

// Stubs exhaustivos para garantizar CERO advertencias de componentes en Vue
const completeStubs = {
  'v-container': { template: '<div class="v-container"><slot /></div>' },
  'v-app-bar': { template: '<header><slot /></header>' },
  'v-app-bar-title': { template: '<div><slot /></div>' },
  'v-card': { template: '<div class="v-card"><slot /></div>' },
  'v-card-title': { template: '<div class="v-card-title"><slot /></div>' },
  'v-card-text': { template: '<div class="v-card-text"><slot /></div>' },
  'v-card-actions': { template: '<div class="v-card-actions"><slot /></div>' },
  'v-row': { template: '<div class="v-row"><slot /></div>' },
  'v-col': { template: '<div class="v-col"><slot /></div>' },
  'v-icon': {
    props: ['icon'],
    template: '<i :class="icon"><slot /></i>'
  },
  'v-chip': { template: '<span class="v-chip"><slot /></span>' },
  'v-btn': {
    props: ['color', 'disabled', 'loading'],
    template: '<button :class="color" :disabled="disabled || loading" v-bind="$attrs"><slot /></button>'
  },
  'v-tabs': { template: '<div class="v-tabs"><slot /></div>' },
  'v-tab': {
    props: ['value'],
    template: '<button class="v-tab" :data-value="value" v-bind="$attrs"><slot /></button>'
  },
  'v-table': { template: '<table class="v-table" v-bind="$attrs"><slot /></table>' },
  'v-text-field': {
    props: ['modelValue', 'label', 'placeholder', 'type'],
    emits: ['update:modelValue'],
    template: '<input :type="type || \'text\'" :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" v-bind="$attrs" />'
  },
  'v-autocomplete': {
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)" v-bind="$attrs"><option v-for="item in items" :key="item.id || item.value" :value="item.id || item.value">{{ item.name || item.title }}</option></select>'
  },
  'v-select': {
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)" v-bind="$attrs"><option v-for="item in items" :key="item.id || item.value" :value="item.id || item.value">{{ item.name || item.title }}</option></select>'
  },
  'v-avatar': { template: '<div class="v-avatar"><slot /></div>' },
  'v-progress-linear': { template: '<div class="v-progress-linear"></div>' },
  'v-progress-circular': { template: '<div class="v-progress-circular"></div>' },
  'v-textarea': {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)"></textarea>'
  },
  'v-combobox': true,
  'v-alert': {
    props: ['type'],
    template: '<div class="v-alert" :class="type"><slot /></div>'
  },
  'v-dialog': {
    props: ['modelValue'],
    template: '<div v-if="modelValue" class="v-dialog"><slot /></div>'
  },
  'v-menu': { template: '<div><slot /></div>' },
  'v-list': { template: '<ul><slot /></ul>' },
  'v-list-item': { template: '<li><slot /></li>' },
  'v-list-subheader': { template: '<div><slot /></div>' },
  'v-divider': true,
  'v-spacer': true,
  'v-snackbar': {
    props: ['modelValue'],
    template: '<div v-if="modelValue" class="v-snackbar"><slot /></div>'
  },
  'v-tooltip': {
    props: ['text'],
    template: '<span class="v-tooltip" :title="text"><slot name="activator" :props="{}" /><slot /></span>'
  },
  'v-form': { template: '<form @submit.prevent><slot /></form>' },
  'ExcelScheduleUploader': true,
  'ClassroomCatalogTab': true,
  'ClassroomCatalogView': true,
  'ScheduleTransferModal': {
    props: ['modelValue', 'schedule'],
    emits: ['transferred', 'update:modelValue'],
    template: '<div v-if="modelValue" class="schedule-transfer-modal-stub"></div>'
  }
};

describe('Pestaña de Bitácora e Historial de Suplencias en CoordinatorView.vue', () => {
  let pinia;
  let authStore;
  let warnSpy;
  let errorSpy;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    pinia = createPinia();
    setActivePinia(pinia);
    authStore = useAuthStore();
    authStore.accessToken = 'fake-jwt-token';
    authStore.userRole = 'Coordinador';
    authStore.user = {
      id: 'usr-coord',
      name: 'Dr. Roberto Mendoza',
      email: 'mendoza@universidad.edu.mx',
      role_name: 'Coordinador',
      tenant_id: 'tenant-itc'
    };

    vi.clearAllMocks();
    routeState.current.query = {};

    api.get.mockImplementation((url) => {
      if (url === '/schedules/coordinator') return Promise.resolve({ data: [] });
      if (url === '/subjects') return Promise.resolve({ data: [] });
      if (url === '/teachers') return Promise.resolve({ data: mockTeachers });
      if (url === '/classrooms') return Promise.resolve({ data: [] });
      if (url === '/schedules/substitutions') {
        return Promise.resolve({
          data: {
            substitutions: mockSubstitutions,
            total: mockSubstitutions.length,
            page: 1,
            limit: 100
          }
        });
      }
      return Promise.resolve({ data: [] });
    });
  });

  afterEach(() => {
    // Verificar que no se emitieron advertencias ni errores de Vue
    const vueWarns = warnSpy.mock.calls.filter(args => String(args[0]).includes('[Vue warn]'));
    const vueErrors = errorSpy.mock.calls.filter(args => String(args[0]).includes('[Vue warn]') || String(args[0]).includes('Vue error'));
    expect(vueWarns).toHaveLength(0);
    expect(vueErrors).toHaveLength(0);

    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('1. Control de Acceso: la pestaña value="substitutions" es visible para Coordinador/Administrador y oculta para otros roles', async () => {
    // Coordinador
    authStore.userRole = 'Coordinador';
    const wrapperCoord = mount(CoordinatorView, {
      global: { plugins: [pinia], stubs: completeStubs }
    });
    await flushPromises();

    const tabCoord = wrapperCoord.find('[data-testid="tab-substitutions-history"]');
    expect(tabCoord.exists()).toBe(true);
    expect(tabCoord.text()).toContain('Historial de Suplencias');

    // Profesor (Rol no autorizado)
    authStore.userRole = 'Profesor';
    const wrapperTeacher = mount(CoordinatorView, {
      global: { plugins: [pinia], stubs: completeStubs }
    });
    await flushPromises();

    const tabTeacher = wrapperTeacher.find('[data-testid="tab-substitutions-history"]');
    expect(tabTeacher.exists()).toBe(false);
  });

  it('2. Renderizado de la tabla: muestra las 6 columnas requeridas y el formato "Docente Titular Anterior → Docente Suplente"', async () => {
    const wrapper = mount(CoordinatorView, {
      global: { plugins: [pinia], stubs: completeStubs }
    });
    await flushPromises();

    // Navegar a la pestaña de suplencias
    wrapper.vm.viewTab = 'substitutions';
    await wrapper.vm.$nextTick();

    const table = wrapper.find('[data-testid="substitutions-history-table"]');
    expect(table.exists()).toBe(true);

    // Verificar las 6 cabeceras de columnas
    const headers = table.findAll('th');
    expect(headers).toHaveLength(6);
    expect(headers[0].text()).toContain('Fecha Efectiva');
    expect(headers[1].text()).toContain('Materia y Grupo');
    expect(headers[2].text()).toContain('Día / Horario y Aula');
    expect(headers[3].text()).toContain('Docente Titular Anterior → Docente Suplente');
    expect(headers[4].text()).toContain('Motivo / Justificante');
    expect(headers[5].text()).toContain('Fecha de Registro');

    // Verificar filas de datos
    const row1 = wrapper.find('[data-testid="row-substitution-sub-1"]');
    expect(row1.exists()).toBe(true);
    expect(row1.find('[data-testid="cell-effective-date"]').text()).toContain('2026-11-20');
    expect(row1.find('[data-testid="cell-subject"]').text()).toContain('Cálculo Diferencial');
    expect(row1.find('[data-testid="cell-schedule"]').text()).toContain('Lunes: 08:00 - 10:00');

    // Formato de transición con flecha
    const transition = row1.find('[data-testid="cell-teachers-transition"]');
    expect(transition.exists()).toBe(true);
    expect(transition.text()).toContain('Dr. Roberto Mendoza');
    expect(transition.text()).toContain('→');
    expect(transition.text()).toContain('Mtra. Elena Gómez');

    expect(row1.find('[data-testid="cell-reason"]').text()).toContain('Comisión académica de investigación');
    expect(row1.find('[data-testid="cell-created-at"]').exists()).toBe(true);
  });

  it('3. Filtrado reactivo en tiempo real por texto, selector de docente y rango de fechas', async () => {
    const wrapper = mount(CoordinatorView, {
      global: { plugins: [pinia], stubs: completeStubs }
    });
    await flushPromises();

    wrapper.vm.viewTab = 'substitutions';
    await wrapper.vm.$nextTick();

    // Ambas filas visibles inicialmente
    expect(wrapper.find('[data-testid="row-substitution-sub-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="row-substitution-sub-2"]').exists()).toBe(true);

    // A. Filtrado por texto (materia "Cálculo")
    wrapper.vm.searchSubstitutionText = 'Cálculo';
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="row-substitution-sub-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="row-substitution-sub-2"]').exists()).toBe(false);

    // Filtrado por texto (motivo "Incapacidad")
    wrapper.vm.searchSubstitutionText = 'Incapacidad';
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="row-substitution-sub-1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="row-substitution-sub-2"]').exists()).toBe(true);

    // Limpiar buscador
    wrapper.vm.searchSubstitutionText = '';
    await wrapper.vm.$nextTick();

    // B. Filtrado por selector de docente
    // teach-3 (Carlos Slim) participó solo en sub-2 como titular anterior
    wrapper.vm.substitutionTeacherFilter = 'teach-3';
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="row-substitution-sub-1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="row-substitution-sub-2"]').exists()).toBe(true);

    // teach-1 (Roberto Mendoza) participó en sub-1 (titular) y sub-2 (suplente)
    wrapper.vm.substitutionTeacherFilter = 'teach-1';
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="row-substitution-sub-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="row-substitution-sub-2"]').exists()).toBe(true);

    wrapper.vm.substitutionTeacherFilter = '';
    await wrapper.vm.$nextTick();

    // C. Filtrado por rango de fechas
    // Desde 2026-12-01 debe filtrar sub-1 (2026-11-20) y dejar sub-2 (2026-12-05)
    wrapper.vm.substitutionDateFrom = '2026-12-01';
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="row-substitution-sub-1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="row-substitution-sub-2"]').exists()).toBe(true);

    // Botón "Limpiar Filtros"
    const clearBtn = wrapper.find('[data-testid="btn-clear-filters"]');
    await clearBtn.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.searchSubstitutionText).toBe('');
    expect(wrapper.vm.substitutionTeacherFilter).toBe('');
    expect(wrapper.vm.substitutionDateFrom).toBe('');
    expect(wrapper.vm.substitutionDateTo).toBe('');
    expect(wrapper.find('[data-testid="row-substitution-sub-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="row-substitution-sub-2"]').exists()).toBe(true);
  });

  it('4. Estado vacío: despliega el mensaje exacto cuando no hay resultados', async () => {
    const wrapper = mount(CoordinatorView, {
      global: { plugins: [pinia], stubs: completeStubs }
    });
    await flushPromises();

    wrapper.vm.viewTab = 'substitutions';
    await wrapper.vm.$nextTick();

    // Filtro con texto sin coincidencias
    wrapper.vm.searchSubstitutionText = 'TextoQueNoExiste12345';
    await wrapper.vm.$nextTick();

    const emptyMsg = wrapper.find('[data-testid="empty-substitutions-message"]');
    expect(emptyMsg.exists()).toBe(true);
    expect(emptyMsg.text()).toContain('No hay sustituciones registradas para los filtros seleccionados');
  });

  it('5. Actualización inmediata: al confirmarse una reasignación exitosa en ScheduleTransferModal, recarga el historial al instante', async () => {
    const wrapper = mount(CoordinatorView, {
      global: { plugins: [pinia], stubs: completeStubs }
    });
    await flushPromises();

    const initialCalls = api.get.mock.calls.filter(c => c[0] === '/schedules/substitutions').length;
    expect(initialCalls).toBeGreaterThanOrEqual(1);

    // Simular evento emitido por ScheduleTransferModal tras reasignación exitosa
    await wrapper.vm.handleTransferSuccess({
      scheduleId: 'sch-101',
      data: { message: '¡Horario reasignado y suplencia registrada exitosamente!' }
    });
    await flushPromises();

    const finalCalls = api.get.mock.calls.filter(c => c[0] === '/schedules/substitutions').length;
    expect(finalCalls).toBeGreaterThan(initialCalls);
  });

  describe('Exportación de Reporte en Excel (.xlsx)', () => {
    it('6. Renderizado: el botón "Exportar Reporte Excel" se muestra en la barra superior de la pestaña substitutions', async () => {
      const wrapper = mount(CoordinatorView, {
        global: { plugins: [pinia], stubs: completeStubs }
      });
      await flushPromises();

      wrapper.vm.viewTab = 'substitutions';
      await wrapper.vm.$nextTick();

      const exportBtn = wrapper.find('[data-testid="btn-export-substitutions-excel"]');
      expect(exportBtn.exists()).toBe(true);
      expect(exportBtn.text()).toContain('Exportar Reporte Excel');
    });

    it('7. Descarga con filtros: al hacer clic envía GET /schedules/substitutions/export con responseType blob y los filtros activos', async () => {
      const mockCreateObjectURL = vi.fn(() => 'blob:http://localhost/mock-blob-uuid');
      const mockRevokeObjectURL = vi.fn();
      window.URL.createObjectURL = mockCreateObjectURL;
      window.URL.revokeObjectURL = mockRevokeObjectURL;

      const wrapper = mount(CoordinatorView, {
        global: { plugins: [pinia], stubs: completeStubs }
      });
      await flushPromises();

      wrapper.vm.viewTab = 'substitutions';
      await wrapper.vm.$nextTick();

      // Configurar filtros activos
      wrapper.vm.searchSubstitutionText = 'robótica';
      wrapper.vm.substitutionTeacherFilter = 'teach-1';
      wrapper.vm.substitutionDateFrom = '2026-11-01';
      wrapper.vm.substitutionDateTo = '2026-11-30';
      await wrapper.vm.$nextTick();

      api.get.mockImplementation((url) => {
        if (url === '/schedules/substitutions/export') {
          return Promise.resolve({ data: new Uint8Array([1, 2, 3]) });
        }
        return Promise.resolve({ data: [] });
      });

      const exportBtn = wrapper.find('[data-testid="btn-export-substitutions-excel"]');
      await exportBtn.trigger('click');
      await flushPromises();

      const exportCall = api.get.mock.calls.find(c => c[0] === '/schedules/substitutions/export');
      expect(exportCall).toBeDefined();
      expect(exportCall[1].responseType).toBe('blob');
      expect(exportCall[1].params).toEqual({
        search: 'robótica',
        teacher_id: 'teach-1',
        from_date: '2026-11-01',
        to_date: '2026-11-30'
      });
      expect(mockCreateObjectURL).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalled();
    });

    it('8. Estado loading y notificación de error: muestra loading durante la llamada y alerta en v-snackbar ante rechazo', async () => {
      let resolveExport;
      const exportPromise = new Promise((resolve, reject) => {
        resolveExport = reject;
      });

      api.get.mockImplementation((url) => {
        if (url === '/schedules/substitutions/export') {
          return exportPromise;
        }
        return Promise.resolve({ data: [] });
      });

      const wrapper = mount(CoordinatorView, {
        global: { plugins: [pinia], stubs: completeStubs }
      });
      await flushPromises();

      wrapper.vm.viewTab = 'substitutions';
      await wrapper.vm.$nextTick();

      expect(wrapper.vm.isExportingSubstitutions).toBe(false);

      const exportBtn = wrapper.find('[data-testid="btn-export-substitutions-excel"]');
      await exportBtn.trigger('click');
      await wrapper.vm.$nextTick();

      // Verificar estado loading
      expect(wrapper.vm.isExportingSubstitutions).toBe(true);

      // Simular fallo de la petición
      resolveExport({
        response: {
          data: { error: 'Fallo al generar el archivo Excel en el servidor' }
        }
      });
      await flushPromises();

      // Verificar que finalizó el loading
      expect(wrapper.vm.isExportingSubstitutions).toBe(false);

      // Verificar que el snackbar muestra el mensaje de error
      expect(wrapper.vm.snackbar.show).toBe(true);
      expect(wrapper.vm.snackbar.text).toBe('Fallo al generar el archivo Excel en el servidor');
      expect(wrapper.vm.snackbar.color).toBe('error');
    });

    it('9. Suplencias Temporales: renderiza chips de modalidad/estado y permite revertir suplencia temporal activa', async () => {
      api.post.mockResolvedValueOnce({
        data: { message: 'Suplencia temporal finalizada exitosamente' }
      });

      const wrapper = mount(CoordinatorView, {
        global: { plugins: [pinia], stubs: completeStubs }
      });
      await flushPromises();

      wrapper.vm.viewTab = 'substitutions';
      await wrapper.vm.$nextTick();

      // Fila 1: Definitiva / Finalizada
      const row1 = wrapper.find('[data-testid="row-substitution-sub-1"]');
      expect(row1.find('[data-testid="chip-modality-definitiva"]').exists()).toBe(true);
      expect(row1.find('[data-testid="chip-modality-temporal"]').exists()).toBe(false);
      expect(row1.find('[data-testid="btn-revert-substitution"]').exists()).toBe(false);

      // Fila 2: Temporal / Activa
      const row2 = wrapper.find('[data-testid="row-substitution-sub-2"]');
      const tempChip = row2.find('[data-testid="chip-modality-temporal"]');
      expect(tempChip.exists()).toBe(true);
      expect(tempChip.text()).toContain('Temporal hasta 15/12/2026');

      const statusChip = row2.find('[data-testid="chip-substitution-status"]');
      expect(statusChip.exists()).toBe(true);
      expect(statusChip.text()).toBe('activa');

      // Botón "Finalizar Suplencia"
      const revertBtn = row2.find('[data-testid="btn-revert-substitution"]');
      expect(revertBtn.exists()).toBe(true);
      expect(revertBtn.text()).toContain('Finalizar Suplencia');

      // Clic en finalizar suplencia
      await revertBtn.trigger('click');
      await flushPromises();

      // Verificar invocación de API de reversión
      expect(api.post).toHaveBeenCalledWith('/schedules/substitutions/sub-2/revert');
      expect(wrapper.vm.snackbar.show).toBe(true);
      expect(wrapper.vm.snackbar.color).toBe('success');
      expect(wrapper.vm.snackbar.text).toBe('Suplencia temporal finalizada exitosamente');
    });
  });
});
