import { mount, config, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CoordinatorView from '../CoordinatorView.vue';
import { createPinia } from 'pinia';
import api from '../../api/client';
import { generateOfficialSchedulePdf } from '../../utils/schedulePdfGenerator';

config.global.renderStubDefaultSlot = true;

vi.mock('../../utils/schedulePdfGenerator', () => ({
  generateOfficialSchedulePdf: vi.fn()
}));

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
        { id: 'c-1', name: 'Aula A-101', building: 'Edificio A', capacity: 30, type: 'Aula Teórica' }
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

const VSelectStub = {
  name: 'v-select',
  props: ['items', 'itemTitle', 'itemValue', 'label', 'modelValue'],
  template: '<div class="v-select-stub"><slot name="append-inner"></slot><slot name="append"></slot></div>'
};

describe('CoordinatorView.vue - Búsqueda de Maestro, Materia y Altas Rápidas Inline', () => {
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
            emits: ['click'],
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
          'v-select': VSelectStub,
          'v-combobox': true,
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

    expect(customFilter('Cálculo Diferencial', 'cálculo', itemSample)).toBe(true);
    expect(customFilter('Cálculo Diferencial', 'calculo', itemSample)).toBe(true);
    expect(customFilter('Cálculo Diferencial', 'MAT-101', itemSample)).toBe(true);
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

      wrapper.vm.openCreateDialog();
      wrapper.vm.newSchedule.teacher_id = 't-1';
      wrapper.vm.newSchedule.classroom_id = 'c-1';
      wrapper.vm.newSchedule.day_of_week = 'Miércoles';
      wrapper.vm.newSchedule.start_time = '10:00';
      wrapper.vm.newSchedule.end_time = '12:00';
      wrapper.vm.newSchedule.group_code = '502';

      expect(wrapper.vm.createDialog).toBe(true);
      expect(wrapper.vm.isQuickSubjectModalOpen).toBe(false);

      const quickBtn = wrapper.find('[data-testid="btn-quick-subject"]');
      expect(quickBtn.exists()).toBe(true);
      await quickBtn.trigger('click');

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

      wrapper.vm.openCreateDialog();
      wrapper.vm.newSchedule.teacher_id = 't-2';
      wrapper.vm.newSchedule.day_of_week = 'Jueves';
      wrapper.vm.openQuickSubjectModal();

      wrapper.vm.quickSubjectForm.code = 'ia-401';
      wrapper.vm.quickSubjectForm.name = 'Inteligencia Artificial';
      wrapper.vm.quickSubjectForm.credits = 6;

      const result = await wrapper.vm.submitQuickSubject();
      await flushPromises();

      expect(api.post).toHaveBeenCalledWith('/subjects', {
        code: 'IA-401',
        name: 'Inteligencia Artificial',
        credits: 6
      });
      expect(result).toEqual(createdSubjectMock);
      expect(wrapper.vm.subjects).toContainEqual(createdSubjectMock);
      expect(wrapper.vm.newSchedule.subject_id).toBe('sub-new-999');
      expect(wrapper.vm.isQuickSubjectModalOpen).toBe(false);
      expect(wrapper.vm.quickSubjectForm.code).toBe('');
      expect(wrapper.vm.quickSubjectForm.name).toBe('');
      expect(wrapper.vm.createDialog).toBe(true);
      expect(wrapper.vm.newSchedule.teacher_id).toBe('t-2');
      expect(wrapper.vm.newSchedule.day_of_week).toBe('Jueves');
    });
  });

  describe('Alta Rápida de Aula (Flujo Inline con sobreescritura reactiva de cupo)', () => {
    it('inyecta el botón mdi-plus en el slot append-inner del selector de aulas y abre isQuickClassroomModalOpen preservando el estado del horario', async () => {
      const wrapper = getWrapper();
      await flushPromises();

      wrapper.vm.openCreateDialog();
      wrapper.vm.newSchedule.subject_id = 'sub-1';
      wrapper.vm.newSchedule.teacher_id = 't-1';
      wrapper.vm.newSchedule.day_of_week = 'Viernes';
      wrapper.vm.newSchedule.group_code = '601';

      expect(wrapper.vm.createDialog).toBe(true);
      expect(wrapper.vm.isQuickClassroomModalOpen).toBe(false);

      const quickClassroomBtn = wrapper.find('[data-testid="btn-quick-classroom"]');
      expect(quickClassroomBtn.exists()).toBe(true);
      await quickClassroomBtn.trigger('click');

      expect(wrapper.vm.isQuickClassroomModalOpen).toBe(true);
      expect(wrapper.vm.createDialog).toBe(true);
      expect(wrapper.vm.newSchedule.subject_id).toBe('sub-1');
      expect(wrapper.vm.newSchedule.teacher_id).toBe('t-1');
      expect(wrapper.vm.newSchedule.day_of_week).toBe('Viernes');
      expect(wrapper.vm.newSchedule.group_code).toBe('601');
    });

    it('valida estrictamente que la capacidad sea > 0 en el alta rápida de aula', async () => {
      const wrapper = getWrapper();
      await flushPromises();

      wrapper.vm.openCreateDialog();
      wrapper.vm.openQuickClassroomModal();

      wrapper.vm.quickClassroomForm = {
        name: 'Lab Inválido',
        building: 'Edificio D',
        capacity: 0,
        type: 'Laboratorio de Cómputo'
      };

      const res = await wrapper.vm.submitQuickClassroom();
      expect(res).toBeNull();
      expect(wrapper.vm.quickClassroomError).toBe('Capacidad debe ser mayor a 0');
      expect(api.post).not.toHaveBeenCalled();
    });

    it('ejecuta POST /api/classrooms, inyecta la nueva aula, la selecciona y sobreescribe reactivamente el cupo sugerido (max_students) del horario', async () => {
      const createdClassroomMock = {
        id: 'cr-quick-777',
        tenant_id: 'tenant-itc',
        name: 'Auditorio Magna Sur',
        building: 'Edificio Sur',
        capacity: 85,
        type: 'Auditorio'
      };
      api.post.mockResolvedValueOnce({ status: 201, data: createdClassroomMock });

      const wrapper = getWrapper();
      await flushPromises();

      // Abrir diálogo padre (cupo inicial 30 del Aula A-101)
      wrapper.vm.openCreateDialog();
      wrapper.vm.newSchedule.subject_id = 'sub-2';
      wrapper.vm.newSchedule.teacher_id = 't-1';
      expect(wrapper.vm.newSchedule.max_students).toBe(30);

      // Abrir modal de alta rápida de aula y llenar datos con capacidad 85
      wrapper.vm.openQuickClassroomModal();
      wrapper.vm.quickClassroomForm = {
        name: 'Auditorio Magna Sur',
        building: 'Edificio Sur',
        capacity: 85,
        type: 'Auditorio'
      };

      const result = await wrapper.vm.submitQuickClassroom();
      await flushPromises();

      // 1. Petición enviada a POST /classrooms
      expect(api.post).toHaveBeenCalledWith('/classrooms', {
        name: 'Auditorio Magna Sur',
        building: 'Edificio Sur',
        capacity: 85,
        type: 'Auditorio'
      });
      expect(result).toEqual(createdClassroomMock);

      // 2. Nueva aula inyectada en el arreglo local classrooms
      expect(wrapper.vm.classrooms).toContainEqual(createdClassroomMock);

      // 3. Nueva aula autoseleccionada en el formulario principal
      expect(wrapper.vm.newSchedule.classroom_id).toBe('cr-quick-777');

      // 4. El cupo sugerido del horario (max_students) se sobreescribe reactivamente con el aforo de la nueva aula (85)
      expect(wrapper.vm.newSchedule.max_students).toBe(85);

      // 5. Modal secundario cerrado y reseteado; modal principal intacto
      expect(wrapper.vm.isQuickClassroomModalOpen).toBe(false);
      expect(wrapper.vm.quickClassroomForm.name).toBe('');
      expect(wrapper.vm.quickClassroomForm.building).toBe('');
      expect(wrapper.vm.quickClassroomForm.capacity).toBe(30);
      expect(wrapper.vm.createDialog).toBe(true);
      expect(wrapper.vm.newSchedule.subject_id).toBe('sub-2');
      expect(wrapper.vm.newSchedule.teacher_id).toBe('t-1');
    });
  });

  describe('Exportación Oficial de Horarios a PDF (Task 4.1)', () => {
    it('invoca generateOfficialSchedulePdf al hacer clic en el botón de exportación con los horarios filtrados e institución', async () => {
      const originalImpl = api.get.getMockImplementation();
      const mockSchedules = [
        {
          id: 'sch-1',
          teacher_id: 't-1',
          teacher_name: 'Elena Salgado',
          subject_code: 'MAT-101',
          subject_name: 'Cálculo Diferencial',
          classroom_name: 'Aula A-101',
          group_code: 'G1',
          day_of_week: 'Lunes',
          start_time: '08:00',
          end_time: '10:00'
        },
        {
          id: 'sch-2',
          teacher_id: 't-2',
          teacher_name: 'Carlos Vega',
          subject_code: 'INF-201',
          subject_name: 'Programación Web',
          classroom_name: 'Aula A-101',
          group_code: 'G2',
          day_of_week: 'Martes',
          start_time: '10:00',
          end_time: '12:00'
        }
      ];

      api.get.mockImplementation((url) => {
        if (url.includes('/schedules/coordinator')) {
          return Promise.resolve({ data: mockSchedules });
        }
        return originalImpl(url);
      });

      try {
        const wrapper = getWrapper();
        await flushPromises();

        wrapper.vm.selectedTeacherFilter = 't-1';
        await wrapper.vm.$nextTick();

        const exportBtn = wrapper.find('[data-testid="btn-export-schedule-pdf"]');
        expect(exportBtn.exists()).toBe(true);

        await exportBtn.trigger('click');

        expect(generateOfficialSchedulePdf).toHaveBeenCalledTimes(1);
        expect(generateOfficialSchedulePdf).toHaveBeenCalledWith({
          schedules: [mockSchedules[0]],
          tenantName: 'Institución Activa',
          teacherName: 'Elena Salgado',
          period: '2026-2'
        });
      } finally {
        api.get.mockImplementation(originalImpl);
      }
    });
  });

  describe('Exportación de Sábana de Horarios a Excel (Task 4.2)', () => {
    it('invoca GET /schedules/export-excel con responseType blob al hacer clic en "Descargar Sábana Excel"', async () => {
      const originalImpl = api.get.getMockImplementation();
      api.get.mockImplementation((url, configArg) => {
        if (url === '/schedules/export-excel') {
          return Promise.resolve({ data: new Blob(['xlsx-mock']) });
        }
        return originalImpl(url, configArg);
      });

      try {
        const wrapper = getWrapper();
        await flushPromises();

        const excelBtn = wrapper.find('[data-testid="btn-export-schedule-excel"]');
        expect(excelBtn.exists()).toBe(true);

        await excelBtn.trigger('click');
        await flushPromises();

        expect(api.get).toHaveBeenCalledWith('/schedules/export-excel', {
          responseType: 'blob'
        });
        expect(wrapper.vm.exportingExcel).toBe(false);
        expect(wrapper.vm.snackbar.show).toBe(true);
        expect(wrapper.vm.snackbar.color).toBe('success');
      } finally {
        api.get.mockImplementation(originalImpl);
      }
    });
  });
});
