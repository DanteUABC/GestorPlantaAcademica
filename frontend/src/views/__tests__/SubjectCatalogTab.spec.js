import { mount, config, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPinia } from 'pinia';
import CoordinatorView from '../CoordinatorView.vue';
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

const sampleSubjects = [
  { id: 'sub-1', code: 'MAT-101', name: 'Cálculo Diferencial', credits: 5, assigned_groups: 2, tenant_id: 'tenant-itc' },
  { id: 'sub-2', code: 'INF-201', name: 'Programación Web', credits: 4, assigned_groups: 0, tenant_id: 'tenant-itc' },
  { id: 'sub-3', code: 'ADM-301', name: 'Administración de Proyectos', credits: 3, assigned_groups: 1, tenant_id: 'tenant-itc' }
];

const sampleSchedules = [
  { id: 'sch-1', subject_id: 'sub-1', tenant_id: 'tenant-itc' },
  { id: 'sch-2', subject_id: 'sub-1', tenant_id: 'tenant-itc' },
  { id: 'sch-3', subject_id: 'sub-3', tenant_id: 'tenant-itc' }
];

describe('CoordinatorView.vue - Catálogo de Materias (Tarea 3778)', () => {
  let pinia;

  const stubs = {
    'v-container': true,
    'v-card': true,
    'v-card-title': true,
    'v-card-text': true,
    'v-card-actions': true,
    'v-row': true,
    'v-col': true,
    'v-icon': true,
    'v-divider': true,
    'v-list-item': true,
    'v-progress-linear': true,
    'v-btn': {
      props: ['icon', 'color', 'size', 'loading', 'variant'],
      template: '<button :class="color"><slot /></button>'
    },
    'v-alert': {
      props: ['type', 'closable'],
      template: '<div class="v-alert-stub" v-bind="$attrs"><slot /></div>'
    },
    'v-tabs': true,
    'v-tab': {
      props: ['value'],
      template: '<button class="v-tab-stub" :data-value="value"><slot /></button>'
    },
    'v-table': {
      template: '<table><slot /></table>'
    },
    'v-dialog': {
      props: ['modelValue'],
      template: '<div v-if="modelValue" class="v-dialog-stub" v-bind="$attrs"><slot /></div>'
    },
    'v-form': {
      template: '<form><slot /></form>'
    },
    'v-text-field': {
      inheritAttrs: false,
      props: ['modelValue', 'label', 'placeholder', 'type'],
      emits: ['update:modelValue', 'input'],
      template: `
        <input
          :type="type || 'text'"
          :value="modelValue"
          @input="$emit('update:modelValue', $event.target.value); $emit('input', $event)"
          v-bind="$attrs"
        />
      `
    },
    'v-chip': {
      props: ['color', 'size', 'variant'],
      template: '<span class="v-chip-stub"><slot /></span>'
    },
    'v-snackbar': {
      props: ['modelValue', 'color'],
      template: '<div v-if="modelValue" class="v-snackbar-stub"><slot /></div>'
    },
    'v-select': true,
    'v-combobox': true,
    'v-autocomplete': true,
    'ExcelScheduleUploader': true,
    'ClassroomCatalogView': true
  };

  let newSubCounter = 1;

  beforeEach(() => {
    vi.clearAllMocks();
    pinia = createPinia();
    newSubCounter = 1;

    api.get.mockImplementation((url) => {
      if (url.includes('/schedules/coordinator')) {
        return Promise.resolve({ data: JSON.parse(JSON.stringify(sampleSchedules)) });
      }
      if (url.includes('/subjects')) {
        return Promise.resolve({ data: JSON.parse(JSON.stringify(sampleSubjects)) });
      }
      if (url.includes('/teachers')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/classrooms')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });

    api.post.mockImplementation((url, body) => {
      if (url === '/subjects') {
        return Promise.resolve({
          data: {
            id: 'sub-new-' + (newSubCounter++),
            tenant_id: 'tenant-itc',
            code: body.code,
            name: body.name,
            credits: body.credits
          }
        });
      }
      return Promise.resolve({ data: {} });
    });

    api.put.mockImplementation((url, body) => {
      if (url.startsWith('/subjects/')) {
        const id = url.split('/').pop();
        return Promise.resolve({
          data: {
            id,
            tenant_id: 'tenant-itc',
            code: body.code,
            name: body.name,
            credits: body.credits
          }
        });
      }
      return Promise.resolve({ data: {} });
    });

    api.delete.mockImplementation((url) => {
      if (url.startsWith('/subjects/')) {
        return Promise.resolve({ data: { message: 'Materia eliminada exitosamente' } });
      }
      return Promise.resolve({ data: {} });
    });
  });

  function getWrapper() {
    return mount(CoordinatorView, {
      global: {
        plugins: [pinia],
        stubs
      }
    });
  }

  // =========================================================================
  // CRITERIO 1: NAVEGACIÓN Y RENDERIZADO DEL TAB CATÁLOGO DE MATERIAS
  // =========================================================================
  it('Criterio 1: Navegación y renderizado de la pestaña Catálogo de Materias', async () => {
    const wrapper = getWrapper();
    await flushPromises();

    // 1. Verifica que la pestaña exista en la barra de navegación
    const tabSubjects = wrapper.find('[data-testid="tab-subjects-catalog"]');
    expect(tabSubjects.exists()).toBe(true);
    expect(tabSubjects.text()).toContain('Catálogo de Materias');

    // 2. En vista por defecto (grid), el contenido del catálogo no está presente
    expect(wrapper.find('[data-testid="subjects-catalog-tab-content"]').exists()).toBe(false);

    // 3. Al cambiar a viewTab = 'subjects', se renderiza el contenedor correspondiente
    wrapper.vm.viewTab = 'subjects';
    await wrapper.vm.$nextTick();

    const catalogContent = wrapper.find('[data-testid="subjects-catalog-tab-content"]');
    expect(catalogContent.exists()).toBe(true);
  });

  // =========================================================================
  // CRITERIO 2: LISTADO Y RENDERIZADO DE FILAS CON CONTEO DE GRUPOS
  // =========================================================================
  it('Criterio 2: Listado y renderizado de filas de materias con clave, nombre, créditos y grupos asignados', async () => {
    const wrapper = getWrapper();
    await flushPromises();

    wrapper.vm.viewTab = 'subjects';
    await wrapper.vm.$nextTick();

    // Verifica que cada materia de prueba tenga su fila identificada
    for (const sub of sampleSubjects) {
      const row = wrapper.find(`[data-testid="row-subject-${sub.id}"]`);
      expect(row.exists()).toBe(true);
      expect(row.text()).toContain(sub.code);
      expect(row.text()).toContain(sub.name);
      expect(row.text()).toContain(String(sub.credits));
    }

    // Verifica el cálculo y visualización de grupos asignados
    const rowSub1 = wrapper.find('[data-testid="row-subject-sub-1"]');
    expect(rowSub1.find('[data-testid="chip-assigned-groups"]').text()).toBe('2');

    const rowSub2 = wrapper.find('[data-testid="row-subject-sub-2"]');
    expect(rowSub2.find('[data-testid="chip-assigned-groups"]').text()).toBe('0');

    const rowSub3 = wrapper.find('[data-testid="row-subject-sub-3"]');
    expect(rowSub3.find('[data-testid="chip-assigned-groups"]').text()).toBe('1');
  });

  // =========================================================================
  // CRITERIO 3: FILTRADO EN TIEMPO REAL POR NOMBRE Y CLAVE
  // =========================================================================
  it('Criterio 3: Filtrado en tiempo real por nombre y por clave mediante el buscador', async () => {
    const wrapper = getWrapper();
    await flushPromises();

    wrapper.vm.viewTab = 'subjects';
    await wrapper.vm.$nextTick();

    const searchInput = wrapper.find('[data-testid="input-search-subjects"]');
    expect(searchInput.exists()).toBe(true);

    // 1. Filtrar por clave exacta
    await searchInput.setValue('MAT-101');
    expect(wrapper.find('[data-testid="row-subject-sub-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="row-subject-sub-2"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="row-subject-sub-3"]').exists()).toBe(false);

    // 2. Filtrar por texto en minúsculas y sin acentos
    await searchInput.setValue('calculo');
    expect(wrapper.find('[data-testid="row-subject-sub-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="row-subject-sub-2"]').exists()).toBe(false);

    // 3. Filtrar por otra materia
    await searchInput.setValue('web');
    expect(wrapper.find('[data-testid="row-subject-sub-2"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="row-subject-sub-1"]').exists()).toBe(false);

    // 4. Búsqueda sin coincidencias muestra mensaje de estado vacío
    await searchInput.setValue('XYZ-NOEXISTE');
    expect(wrapper.find('[data-testid="no-subjects-message"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="no-subjects-message"]').text()).toContain(
      'No se encontraron materias que coincidan con la búsqueda.'
    );

    // 5. Limpiar búsqueda restaura la lista completa
    await searchInput.setValue('');
    expect(wrapper.find('[data-testid="row-subject-sub-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="row-subject-sub-2"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="row-subject-sub-3"]').exists()).toBe(true);
  });

  // =========================================================================
  // CRITERIO 4: ALTA DE MATERIA, MAYÚSCULAS Y POST /api/subjects
  // =========================================================================
  it('Criterio 4: Apertura de diálogo "Nueva Materia", auto-uppercase de código, POST /api/subjects y actualización reactiva', async () => {
    const wrapper = getWrapper();
    await flushPromises();

    wrapper.vm.viewTab = 'subjects';
    await wrapper.vm.$nextTick();

    // 1. Abrir diálogo de nueva materia
    const btnNew = wrapper.find('[data-testid="btn-new-subject"]');
    expect(btnNew.exists()).toBe(true);
    await btnNew.trigger('click');
    await wrapper.vm.$nextTick();

    const dialog = wrapper.find('[data-testid="dialog-subject"]');
    expect(dialog.exists()).toBe(true);
    expect(dialog.text()).toContain('Nueva Materia');

    // 2. Escribir código en minúsculas y comprobar conversión a mayúsculas
    const inputCode = wrapper.find('[data-testid="input-subject-code"]');
    await inputCode.setValue('fis-101');
    expect(wrapper.vm.subjectForm.code).toBe('FIS-101');

    // 3. Llenar nombre y créditos
    const inputName = wrapper.find('[data-testid="input-subject-name"]');
    await inputName.setValue('Física I');

    const inputCredits = wrapper.find('[data-testid="input-subject-credits"]');
    await inputCredits.setValue('4');

    // 4. Enviar formulario
    const form = wrapper.find('[data-testid="subject-form"]');
    await form.trigger('submit');
    await flushPromises();

    // 5. Verificar llamado a la API
    expect(api.post).toHaveBeenCalledWith('/subjects', {
      code: 'FIS-101',
      name: 'Física I',
      credits: 4
    });

    // 6. Verificar que el diálogo se cierra y el snackbar notifica éxito
    expect(wrapper.vm.subjectDialog).toBe(false);
    expect(wrapper.vm.snackbar.text).toBe('Materia registrada exitosamente');
    expect(wrapper.vm.snackbar.color).toBe('success');

    // 7. La nueva materia debe estar en la lista
    expect(wrapper.vm.subjects.some(s => s.code === 'FIS-101')).toBe(true);
  });

  // =========================================================================
  // CRITERIO 5: EDICIÓN DE MATERIA, PRECARGA Y PUT /api/subjects/:id
  // =========================================================================
  it('Criterio 5: Apertura de diálogo "Editar Materia", precarga de datos, PUT /api/subjects/:id y actualización reactiva', async () => {
    const wrapper = getWrapper();
    await flushPromises();

    wrapper.vm.viewTab = 'subjects';
    await wrapper.vm.$nextTick();

    // 1. Pulsar botón editar de la materia INF-201 (sub-2)
    const rowSub2 = wrapper.find('[data-testid="row-subject-sub-2"]');
    const btnEdit = rowSub2.find('[data-testid="btn-edit-subject"]');
    expect(btnEdit.exists()).toBe(true);
    await btnEdit.trigger('click');
    await wrapper.vm.$nextTick();

    // 2. Verificar diálogo en modo edición y precarga de datos
    const dialog = wrapper.find('[data-testid="dialog-subject"]');
    expect(dialog.exists()).toBe(true);
    expect(dialog.text()).toContain('Editar Materia');
    expect(wrapper.vm.subjectForm.id).toBe('sub-2');
    expect(wrapper.vm.subjectForm.code).toBe('INF-201');
    expect(wrapper.vm.subjectForm.name).toBe('Programación Web');
    expect(wrapper.vm.subjectForm.credits).toBe(4);

    // 3. Modificar nombre y créditos
    const inputName = wrapper.find('[data-testid="input-subject-name"]');
    await inputName.setValue('Programación Web Fullstack');

    const inputCredits = wrapper.find('[data-testid="input-subject-credits"]');
    await inputCredits.setValue('6');

    // 4. Guardar cambios
    const form = wrapper.find('[data-testid="subject-form"]');
    await form.trigger('submit');
    await flushPromises();

    // 5. Verificar llamada PUT a la API
    expect(api.put).toHaveBeenCalledWith('/subjects/sub-2', {
      code: 'INF-201',
      name: 'Programación Web Fullstack',
      credits: 6
    });

    // 6. Verificar cierre de diálogo y feedback
    expect(wrapper.vm.subjectDialog).toBe(false);
    expect(wrapper.vm.snackbar.text).toBe('Materia actualizada exitosamente');

    // 7. Verificar reflejo reactivo en la fila de la tabla
    await wrapper.vm.$nextTick();
    const updatedRow = wrapper.find('[data-testid="row-subject-sub-2"]');
    expect(updatedRow.text()).toContain('Programación Web Fullstack');
    expect(updatedRow.text()).toContain('6');
  });

  // =========================================================================
  // CRITERIO 6: MANEJO DE COLISIÓN DE CÓDIGO (HTTP 409) EN CREACIÓN Y EDICIÓN
  // =========================================================================
  it('Criterio 6: Manejo de colisión de código (HTTP 409) mostrando feedback de error en alert', async () => {
    const wrapper = getWrapper();
    await flushPromises();

    wrapper.vm.viewTab = 'subjects';
    await wrapper.vm.$nextTick();

    // Simular que el endpoint retorna 409 por código duplicado
    api.post.mockImplementationOnce(() =>
      Promise.reject({
        response: {
          status: 409,
          data: { error: 'Ya existe una materia con ese código en esta institución' }
        }
      })
    );

    // 1. Abrir diálogo y llenar con un código en colisión
    await wrapper.find('[data-testid="btn-new-subject"]').trigger('click');
    await wrapper.find('[data-testid="input-subject-code"]').setValue('MAT-101');
    await wrapper.find('[data-testid="input-subject-name"]').setValue('Cálculo Duplicado');
    await wrapper.find('[data-testid="input-subject-credits"]').setValue('5');

    // 2. Enviar formulario
    await wrapper.find('[data-testid="subject-form"]').trigger('submit');
    await flushPromises();

    // 3. El diálogo debe seguir abierto y el alert de error debe mostrar el mensaje exacto
    expect(wrapper.vm.subjectDialog).toBe(true);
    const alertError = wrapper.find('[data-testid="subject-error"]');
    expect(alertError.exists()).toBe(true);
    expect(alertError.text()).toContain('Ya existe una materia con ese código en esta institución');
  });

  // =========================================================================
  // CRITERIO 7: BAJA SEGURA Y CONFIRMACIÓN DE BORRADO (409 VS 200)
  // =========================================================================
  it('Criterio 7A: Baja segura - Rechaza con HTTP 409 cuando tiene dependencias horarias y no elimina la fila', async () => {
    const wrapper = getWrapper();
    await flushPromises();

    wrapper.vm.viewTab = 'subjects';
    await wrapper.vm.$nextTick();

    // 1. Pulsar botón eliminar en materia con dependencias (sub-1)
    const rowSub1 = wrapper.find('[data-testid="row-subject-sub-1"]');
    const btnDelete = rowSub1.find('[data-testid="btn-delete-subject"]');
    await btnDelete.trigger('click');
    await wrapper.vm.$nextTick();

    // 2. Verificar apertura del diálogo de confirmación
    const deleteDialog = wrapper.find('[data-testid="dialog-delete-subject"]');
    expect(deleteDialog.exists()).toBe(true);
    expect(deleteDialog.text()).toContain('Cálculo Diferencial');
    expect(deleteDialog.text()).toContain('MAT-101');

    // 3. Simular rechazo de la API por dependencias horarias activas
    const expectedErrorMsg = 'No se puede eliminar la materia porque tiene horarios asignados en el periodo actual';
    api.delete.mockImplementationOnce(() =>
      Promise.reject({
        response: {
          status: 409,
          data: { error: expectedErrorMsg }
        }
      })
    );

    // 4. Confirmar eliminación
    const btnConfirm = wrapper.find('[data-testid="btn-confirm-delete-subject"]');
    await btnConfirm.trigger('click');
    await flushPromises();

    // 5. Verificar feedback de error exacto y que la materia NO se eliminó
    expect(wrapper.vm.deleteSubjectDialog).toBe(false);
    expect(wrapper.vm.snackbar.text).toBe(expectedErrorMsg);
    expect(wrapper.vm.snackbar.color).toBe('error');
    expect(wrapper.find('[data-testid="row-subject-sub-1"]').exists()).toBe(true);
  });

  it('Criterio 7B: Baja segura - Elimina con HTTP 200 cuando no tiene dependencias horarias y remueve la fila', async () => {
    const wrapper = getWrapper();
    await flushPromises();

    wrapper.vm.viewTab = 'subjects';
    await wrapper.vm.$nextTick();

    // 1. Pulsar botón eliminar en materia sin dependencias (sub-2)
    const rowSub2 = wrapper.find('[data-testid="row-subject-sub-2"]');
    const btnDelete = rowSub2.find('[data-testid="btn-delete-subject"]');
    await btnDelete.trigger('click');
    await wrapper.vm.$nextTick();

    // 2. Diálogo de confirmación visible
    expect(wrapper.find('[data-testid="dialog-delete-subject"]').exists()).toBe(true);

    // 3. Simular éxito en la API
    api.delete.mockResolvedValueOnce({
      data: { message: 'Materia eliminada exitosamente' }
    });

    // 4. Confirmar eliminación
    const btnConfirm = wrapper.find('[data-testid="btn-confirm-delete-subject"]');
    await btnConfirm.trigger('click');
    await flushPromises();

    // 5. Diálogo cerrado, snackbar de éxito y fila removida
    expect(wrapper.vm.deleteSubjectDialog).toBe(false);
    expect(wrapper.vm.snackbar.text).toBe('Materia eliminada exitosamente');
    expect(wrapper.vm.snackbar.color).toBe('success');
    expect(wrapper.find('[data-testid="row-subject-sub-2"]').exists()).toBe(false);
  });
});
