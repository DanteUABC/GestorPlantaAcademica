import { mount, config, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CoordinatorView from '../CoordinatorView.vue';
import { createPinia } from 'pinia';
import api from '../../api/client';

config.global.renderStubDefaultSlot = true;

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn((url) => {
      if (url.includes('/schedules/coordinator')) return Promise.resolve({ data: [] });
      if (url.includes('/subjects')) return Promise.resolve({ data: [
        { id: 'sub-1', name: 'Cálculo Diferencial', code: 'MAT-101', credits: 5 },
        { id: 'sub-2', name: 'Programación Web', code: 'INF-201', credits: 6 }
      ] });
      if (url.includes('/teachers')) return Promise.resolve({ data: [
        { id: 't-1', name: 'Elena Salgado', email: 'elena@itc.edu', identifier: 'DOC-101' },
        { id: 't-2', name: 'Carlos Vega', email: 'carlos@itc.edu', identifier: 'DOC-102' }
      ] });
      if (url.includes('/classrooms')) return Promise.resolve({ data: [
        { id: 'c-1', name: 'Aula A-101', building: 'Edificio A', capacity: 30 }
      ] });
      return Promise.resolve({ data: [] });
    }),
    post: vi.fn(() => Promise.resolve({ data: { message: 'OK' } })),
    delete: vi.fn(() => Promise.resolve({ data: { message: 'OK' } }))
  }
}));

const VAutocompleteStub = {
  name: 'v-autocomplete',
  props: ['customFilter', 'items', 'label', 'placeholder', 'prependInnerIcon', 'modelValue'],
  template: '<div class="v-autocomplete-stub"><slot name="append-inner"></slot><slot name="append"></slot></div>'
};

describe('CoordinatorView.vue - Búsqueda de Maestro, Materia y Alta Rápida Inline', () => {
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
          'v-btn': {
            props: ['icon', 'color', 'size'],
            template: '<button @click="$emit(\'click\', $event)"><slot /></button>'
          },
          'v-alert': true,
          'v-tabs': true,
          'v-tab': true,
          'v-table': true,
          'v-dialog': true,
          'v-form': {
            template: '<form @submit.prevent="$emit(\'submit\', $event)"><slot /></form>'
          },
          'v-autocomplete': VAutocompleteStub,
          'v-select': true,
          'v-text-field': true,
          'v-snackbar': true,
          'v-chip': true,
          'v-list-item': true,
          'v-divider': true,
          'v-progress-linear': true,
          'ExcelScheduleUploader': true,
          'ClassroomCatalogView': true
        }
      }
    });
  }

  it('debe incluir la pestaña "Catálogo de Aulas" enlazada a la nueva vista (/classrooms)', () => {
    const wrapper = getWrapper();
    const catalogTab = wrapper.find('[data-testid="tab-classroom-catalog"]');
    expect(catalogTab.exists()).toBe(true);
    expect(catalogTab.text()).toContain('Catálogo de Aulas');
    expect(catalogTab.attributes('to')).toBe('/classrooms');
  });

  it('debe contener componentes v-autocomplete para la búsqueda de Materia y Maestro con sus placeholders e iconos de lupa', () => {
    const wrapper = getWrapper();
    const autocompletes = wrapper.findAllComponents({ name: 'v-autocomplete' });
    expect(autocompletes.length).toBeGreaterThanOrEqual(2);

    const subjectAutocomplete = autocompletes.find(w => w.props('label')?.includes('Materia'));
    expect(subjectAutocomplete).toBeDefined();
    expect(subjectAutocomplete.props('placeholder')).toContain('Buscar materia');
    expect(subjectAutocomplete.props('prependInnerIcon')).toBe('mdi-magnify');

    const teacherAutocomplete = autocompletes.find(w => w.props('label')?.includes('Maestro'));
    expect(teacherAutocomplete).toBeDefined();
    expect(teacherAutocomplete.props('placeholder')).toContain('Buscar maestro');
    expect(teacherAutocomplete.props('prependInnerIcon')).toBe('mdi-magnify');
  });

  it('debe filtrar materias por nombre y por código', () => {
    const wrapper = getWrapper();
    const autocompletes = wrapper.findAllComponents({ name: 'v-autocomplete' });
    const subjectAutocomplete = autocompletes.find(w => w.props('label')?.includes('Materia'));
    const customFilter = subjectAutocomplete.props('customFilter');
    expect(typeof customFilter).toBe('function');

    const itemSample = {
      raw: { name: 'Cálculo Diferencial', code: 'MAT-101', credits: 5 }
    };

    // Coincidencia por nombre (con o sin acentos)
    expect(customFilter('Cálculo Diferencial', 'cálculo', itemSample)).toBe(true);
    expect(customFilter('Cálculo Diferencial', 'calculo', itemSample)).toBe(true);
    // Coincidencia por código de materia
    expect(customFilter('Cálculo Diferencial', 'MAT-101', itemSample)).toBe(true);
    // No coincidencia
    expect(customFilter('Cálculo Diferencial', 'química', itemSample)).toBe(false);
  });

  it('debe filtrar maestros por nombre, correo o número de nómina', () => {
    const wrapper = getWrapper();
    const autocompletes = wrapper.findAllComponents({ name: 'v-autocomplete' });
    const teacherAutocomplete = autocompletes.find(w => w.props('label')?.includes('Maestro'));
    const customFilter = teacherAutocomplete.props('customFilter');
    expect(typeof customFilter).toBe('function');

    const itemSample = {
      raw: { name: 'Elena Salgado', email: 'elena.salgado@itc.edu', identifier: 'DOC-101' }
    };

    expect(customFilter('Elena Salgado', 'elena', itemSample)).toBe(true);
    expect(customFilter('Elena Salgado', 'elena.salgado@itc', itemSample)).toBe(true);
    expect(customFilter('Elena Salgado', 'DOC-101', itemSample)).toBe(true);
    expect(customFilter('Elena Salgado', 'roberto', itemSample)).toBe(false);

    const maestroConAcento = {
      raw: { name: 'José Rodríguez', email: 'jose.rodriguez@itc.edu', identifier: 'DOC-103' }
    };
    expect(customFilter('José Rodríguez', 'jose', maestroConAcento)).toBe(true);
    expect(customFilter('José Rodríguez', 'rodriguez', maestroConAcento)).toBe(true);
  });

  describe('Alta Rápida de Materia (Flujo Inline sin romper estado padre)', () => {
    it('inyecta el botón mdi-plus en el slot append-inner del selector de materias y abre el modal secundario sin cerrar ni resetear el formulario padre', async () => {
      const wrapper = getWrapper();
      await flushPromises();

      // Abrir diálogo principal de horario y llenar campos previos
      wrapper.vm.openCreateDialog();
      wrapper.vm.newSchedule.teacher_id = 't-1';
      wrapper.vm.newSchedule.classroom_id = 'c-1';
      wrapper.vm.newSchedule.day_of_week = 'Miércoles';
      wrapper.vm.newSchedule.start_time = '10:00';
      wrapper.vm.newSchedule.end_time = '12:00';
      wrapper.vm.newSchedule.group_code = '502';

      expect(wrapper.vm.createDialog).toBe(true);
      expect(wrapper.vm.isQuickSubjectModalOpen).toBe(false);

      // Hacer clic en el botón '+' dentro del selector de materias
      const quickBtn = wrapper.find('[data-testid="btn-quick-subject"]');
      expect(quickBtn.exists()).toBe(true);
      await quickBtn.trigger('click');

      // El modal secundario se abre y el diálogo principal permanece abierto con sus datos intactos
      expect(wrapper.vm.isQuickSubjectModalOpen).toBe(true);
      expect(wrapper.vm.createDialog).toBe(true);
      expect(wrapper.vm.newSchedule.teacher_id).toBe('t-1');
      expect(wrapper.vm.newSchedule.day_of_week).toBe('Miércoles');
      expect(wrapper.vm.newSchedule.group_code).toBe('502');
    });

    it('ejecuta POST /api/subjects, inyecta la nueva materia en subjects, la autoselecciona en newSchedule.subject_id y cierra solo el modal secundario', async () => {
      const createdSubjectMock = {
        id: 'sub-new-999',
        tenant_id: 'tenant-itc',
        code: 'IA-401',
        name: 'Inteligencia Artificial',
        credits: 6
      };
      api.post.mockResolvedValueOnce({ status: 201, data: createdSubjectMock });

      const wrapper = getWrapper();
      await flushPromises();

      // Preparar estado del formulario padre
      wrapper.vm.openCreateDialog();
      wrapper.vm.newSchedule.teacher_id = 't-2';
      wrapper.vm.newSchedule.day_of_week = 'Jueves';
      wrapper.vm.openQuickSubjectModal();

      // Llenar formulario de alta rápida de materia
      wrapper.vm.quickSubjectForm.code = 'ia-401';
      wrapper.vm.quickSubjectForm.name = 'Inteligencia Artificial';
      wrapper.vm.quickSubjectForm.credits = 6;

      // Procesar guardado rápido
      const result = await wrapper.vm.submitQuickSubject();
      await flushPromises();

      // 1. Petición enviada a POST /subjects
      expect(api.post).toHaveBeenCalledWith('/subjects', {
        code: 'IA-401',
        name: 'Inteligencia Artificial',
        credits: 6
      });
      expect(result).toEqual(createdSubjectMock);

      // 2. Objeto inyectado en el arreglo local de opciones (subjects)
      expect(wrapper.vm.subjects).toContainEqual(createdSubjectMock);

      // 3. Asignado automáticamente al v-model del selector en el formulario padre
      expect(wrapper.vm.newSchedule.subject_id).toBe('sub-new-999');

      // 4. Diálogo secundario cerrado y limpio, pero diálogo padre intacto
      expect(wrapper.vm.isQuickSubjectModalOpen).toBe(false);
      expect(wrapper.vm.quickSubjectForm.code).toBe('');
      expect(wrapper.vm.quickSubjectForm.name).toBe('');
      expect(wrapper.vm.createDialog).toBe(true);
      expect(wrapper.vm.newSchedule.teacher_id).toBe('t-2');
      expect(wrapper.vm.newSchedule.day_of_week).toBe('Jueves');
    });
  });
});
