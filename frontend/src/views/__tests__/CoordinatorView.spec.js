import { mount, config } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import CoordinatorView from '../CoordinatorView.vue';
import { createPinia } from 'pinia';

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
  props: ['customFilter', 'items', 'label', 'placeholder', 'prependInnerIcon'],
  template: '<div class="v-autocomplete-stub"></div>'
};

describe('CoordinatorView.vue - Búsqueda de Maestro y Materia al armar horario', () => {
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
          'v-autocomplete': VAutocompleteStub,
          'v-select': true,
          'v-text-field': true,
          'v-snackbar': true,
          'v-chip': true,
          'v-list-item': true,
          'v-divider': true,
          'ExcelScheduleUploader': true
        }
      }
    });
  }

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

    // Coincidencia por nombre
    expect(customFilter('Cálculo Diferencial', 'cálculo', itemSample)).toBe(true);
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

    // Coincidencia por nombre
    expect(customFilter('Elena Salgado', 'elena', itemSample)).toBe(true);
    // Coincidencia por correo
    expect(customFilter('Elena Salgado', 'elena.salgado@itc', itemSample)).toBe(true);
    // Coincidencia por nómina/identificador
    expect(customFilter('Elena Salgado', 'DOC-101', itemSample)).toBe(true);
    // No coincidencia
    expect(customFilter('Elena Salgado', 'roberto', itemSample)).toBe(false);
  });
});
