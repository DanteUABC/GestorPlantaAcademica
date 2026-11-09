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

const mockTeachers = [
  {
    id: 'teach-optimo',
    name: 'Dr. Roberto Mendoza',
    nombre: 'Roberto',
    apellidos: 'Mendoza',
    email: 'roberto.mendoza@universidad.edu.mx',
    identificador: 'DOC-101',
    horas_contratadas: 25,
    horas_asignadas: 15, // 15 / 25 = 60% (<80% -> success)
    grupos_asignados_count: 2,
    estatus: 'activo',
    email_activo: true
  },
  {
    id: 'teach-warning',
    name: 'Mtra. Ana Karenina Ruiz',
    nombre: 'Ana Karenina',
    apellidos: 'Ruiz',
    email: 'ana.ruiz@universidad.edu.mx',
    identificador: 'DOC-102',
    horas_contratadas: 20,
    horas_asignadas: 18, // 18 / 20 = 90% (80% a 100% -> warning)
    grupos_asignados_count: 2,
    estatus: 'activo',
    email_activo: true
  },
  {
    id: 'teach-error',
    name: 'Ing. Carlos Slim Helú',
    nombre: 'Carlos',
    apellidos: 'Slim Helú',
    email: 'carlos.slim@universidad.edu.mx',
    identificador: 'DOC-103',
    horas_contratadas: 25,
    horas_asignadas: 28, // 28 / 25 = 112% (>100% -> error)
    grupos_asignados_count: 3,
    estatus: 'activo',
    email_activo: true
  },
  {
    id: 'teach-sin-materias',
    name: 'Lic. Laura Elena Ponce',
    nombre: 'Laura Elena',
    apellidos: 'Ponce',
    email: null,
    identificador: 'DOC-104',
    horas_contratadas: 25,
    horas_asignadas: 0,
    grupos_asignados_count: 0,
    estatus: 'inactivo',
    email_activo: false
  }
];

const mockSchedules = [
  {
    id: 'sch-1',
    teacher_id: 'teach-optimo',
    subject_name: 'Cálculo Diferencial',
    group_code: 'G1',
    classroom_name: 'Aula 101',
    day_of_week: 'Lunes',
    start_time: '08:00',
    end_time: '12:00',
    session_type: 'Clase Teórica'
  },
  {
    id: 'sch-2',
    teacher_id: 'teach-optimo',
    subject_name: 'Álgebra Lineal',
    group_code: 'G2',
    classroom_name: 'Lab Cómputo 1',
    day_of_week: 'Miércoles',
    start_time: '10:00',
    end_time: '13:00',
    session_type: 'Laboratorio'
  },
  {
    id: 'sch-3',
    teacher_id: 'teach-warning',
    subject_name: 'Física I',
    group_code: 'G1',
    classroom_name: 'Aula 202',
    day_of_week: 'Martes',
    start_time: '08:00',
    end_time: '14:00',
    session_type: 'Clase Teórica'
  },
  {
    id: 'sch-4',
    teacher_id: 'teach-error',
    subject_name: 'Estructuras de Datos',
    group_code: 'G3',
    classroom_name: 'Lab Software',
    day_of_week: 'Jueves',
    start_time: '08:00',
    end_time: '16:00',
    session_type: 'Laboratorio'
  }
];

describe('CoordinatorView.vue - Miniventana Modal de Detalle de Docente (Tarea Enhanced Modal)', () => {
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
    'v-avatar': {
      props: ['size', 'color'],
      template: '<div class="v-avatar-stub" :class="color" v-bind="$attrs"><slot /></div>'
    },
    'v-list-item': true,
    'v-progress-linear': {
      props: {
        modelValue: [Number, String],
        color: String,
        height: [Number, String],
        rounded: [Boolean, String]
      },
      template: `
        <div
          class="v-progress-linear-stub"
          :data-value="modelValue"
          :data-color="color"
          :data-height="height"
          :data-rounded="rounded === true || rounded === '' ? 'true' : 'false'"
          v-bind="$attrs"
        ><slot /></div>
      `
    },
    'v-btn': {
      props: ['icon', 'color', 'size', 'loading', 'variant'],
      template: '<button :class="color" v-bind="$attrs"><slot /></button>'
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
      props: ['modelValue', 'maxWidth', 'transition', 'persistent'],
      template: `
        <div
          v-if="modelValue"
          class="v-dialog-stub"
          :data-max-width="maxWidth"
          :data-transition="transition"
          :data-persistent="persistent"
          v-bind="$attrs"
        >
          <slot />
        </div>
      `
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
      template: '<span class="v-chip-stub" :class="color" v-bind="$attrs"><slot /></span>'
    },
    'v-snackbar': {
      props: ['modelValue', 'color'],
      template: '<div v-if="modelValue" class="v-snackbar-stub"><slot /></div>'
    },
    'v-select': true,
    'v-combobox': true,
    'v-autocomplete': true,
    'ExcelScheduleUploader': true,
    'ClassroomCatalogView': true,
    'ScheduleTransferModal': true
  };

  beforeEach(() => {
    vi.clearAllMocks();
    pinia = createPinia();

    api.get.mockImplementation((url) => {
      if (url.includes('/schedules/coordinator')) {
        return Promise.resolve({ data: JSON.parse(JSON.stringify(mockSchedules)) });
      }
      if (url.includes('/teachers')) {
        return Promise.resolve({ data: JSON.parse(JSON.stringify(mockTeachers)) });
      }
      if (url.includes('/subjects')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/classrooms')) {
        return Promise.resolve({ data: [] });
      }
      return Promise.resolve({ data: [] });
    });
  });

  async function createWrapper() {
    const wrapper = mount(CoordinatorView, {
      global: {
        plugins: [pinia],
        stubs
      }
    });
    await flushPromises();
    return wrapper;
  }

  it('Criterio 1: Configuración de la miniventana modal (v-dialog con ancho máximo de 680px y cierre con cruz o botón)', async () => {
    const wrapper = await createWrapper();
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    // Abrir modal seleccionando el docente 1
    const teacher = mockTeachers[0];
    wrapper.vm.openTeacherDetailModal(teacher);
    await wrapper.vm.$nextTick();

    const dialog = wrapper.find('[data-testid="dialog-teacher-detail"]');
    expect(dialog.exists()).toBe(true);

    // Verificar ancho máximo de 680px y transición suave
    expect(dialog.attributes('data-max-width')).toBe('680');
    expect(dialog.attributes('data-transition')).toBe('dialog-bottom-transition');
    expect(dialog.attributes('data-persistent')).toBeUndefined();

    // Cerrar con botón de cruz superior
    const crossBtn = dialog.find('[data-testid="btn-close-detail-modal-top"]');
    expect(crossBtn.exists()).toBe(true);
    await crossBtn.trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.teacherDetailDialog).toBe(false);

    // Volver a abrir y cerrar con botón inferior "Cerrar"
    wrapper.vm.openTeacherDetailModal(teacher);
    await wrapper.vm.$nextTick();
    const closeBtn = wrapper.find('[data-testid="btn-close-detail-modal"]');
    expect(closeBtn.exists()).toBe(true);
    await closeBtn.trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.teacherDetailDialog).toBe(false);
  });

  it('Criterio 2: Encabezado con Nombre completo, avatar con iniciales, identificador institucional y chip de estatus', async () => {
    const wrapper = await createWrapper();
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    wrapper.vm.openTeacherDetailModal(mockTeachers[0]);
    await wrapper.vm.$nextTick();

    const dialog = wrapper.find('[data-testid="dialog-teacher-detail"]');
    expect(dialog.find('[data-testid="detail-teacher-name"]').text()).toBe('Dr. Roberto Mendoza');
    expect(dialog.find('[data-testid="detail-teacher-identifier"]').text()).toContain('DOC-101');
    expect(dialog.find('[data-testid="detail-teacher-avatar"]').text()).toBe('RM');
    expect(dialog.find('[data-testid="detail-teacher-status"]').text()).toBe('Activo');
  });

  it('Criterio 3A: Tarjeta de Carga Contractual - Carga Óptima (<80%) semaforiza en Verde (color="success")', async () => {
    const wrapper = await createWrapper();
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    // teach-optimo: 15 / 25 hrs = 60%
    wrapper.vm.openTeacherDetailModal(mockTeachers[0]);
    await wrapper.vm.$nextTick();

    const dialog = wrapper.find('[data-testid="dialog-teacher-detail"]');
    const progressBar = dialog.find('[data-testid="detail-teacher-progress-linear"]');
    expect(progressBar.exists()).toBe(true);
    expect(progressBar.attributes('data-height')).toBe('12');
    expect(progressBar.attributes('data-rounded')).toBe('true');
    expect(progressBar.attributes('data-value')).toBe('60');
    expect(progressBar.attributes('data-color')).toBe('success');

    // Visualización numérica
    const numText = dialog.find('[data-testid="detail-teacher-workload-numeric"]').text();
    expect(numText).toContain('Horas asignadas: 15 / Horas contractuales: 25 hrs (60%)');

    // Etiqueta de semaforización
    expect(dialog.find('[data-testid="detail-teacher-workload-chip"]').text()).toBe('Carga óptima');
  });

  it('Criterio 3B: Tarjeta de Carga Contractual - Carga Próxima al Tope (80% a 100%) semaforiza en Ámbar (color="warning")', async () => {
    const wrapper = await createWrapper();
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    // teach-warning: 18 / 20 hrs = 90%
    wrapper.vm.openTeacherDetailModal(mockTeachers[1]);
    await wrapper.vm.$nextTick();

    const dialog = wrapper.find('[data-testid="dialog-teacher-detail"]');
    const progressBar = dialog.find('[data-testid="detail-teacher-progress-linear"]');
    expect(progressBar.attributes('data-value')).toBe('90');
    expect(progressBar.attributes('data-color')).toBe('warning');

    const numText = dialog.find('[data-testid="detail-teacher-workload-numeric"]').text();
    expect(numText).toContain('Horas asignadas: 18 / Horas contractuales: 20 hrs (90%)');
    expect(dialog.find('[data-testid="detail-teacher-workload-chip"]').text()).toBe('Carga próxima al tope');
  });

  it('Criterio 3C: Tarjeta de Carga Contractual - Sobrecupo o Sobrecarga (>100%) semaforiza en Rojo (color="error")', async () => {
    const wrapper = await createWrapper();
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    // teach-error: 28 / 25 hrs = 112%
    wrapper.vm.openTeacherDetailModal(mockTeachers[2]);
    await wrapper.vm.$nextTick();

    const dialog = wrapper.find('[data-testid="dialog-teacher-detail"]');
    const progressBar = dialog.find('[data-testid="detail-teacher-progress-linear"]');
    expect(progressBar.attributes('data-value')).toBe('112');
    expect(progressBar.attributes('data-color')).toBe('error');

    const numText = dialog.find('[data-testid="detail-teacher-workload-numeric"]').text();
    expect(numText).toContain('Horas asignadas: 28 / Horas contractuales: 25 hrs (112%)');
    expect(dialog.find('[data-testid="detail-teacher-workload-chip"]').text()).toBe('Sobrecarga laboral');
  });

  it('Criterio 4: Lista de Materias y Horarios Asignados enumera materias, grupos, aulas y franjas horarias', async () => {
    const wrapper = await createWrapper();
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    // teach-optimo tiene 2 horarios asignados en mockSchedules
    wrapper.vm.openTeacherDetailModal(mockTeachers[0]);
    await wrapper.vm.$nextTick();

    const dialog = wrapper.find('[data-testid="dialog-teacher-detail"]');
    const table = dialog.find('[data-testid="detail-teacher-schedules-table"]');
    expect(table.exists()).toBe(true);

    const row1 = dialog.find('[data-testid="row-teacher-schedule-sch-1"]');
    expect(row1.exists()).toBe(true);
    expect(row1.find('[data-testid="schedule-subject-name"]').text()).toContain('Cálculo Diferencial');
    expect(row1.find('[data-testid="schedule-group-code"]').text()).toBe('G1');
    expect(row1.find('[data-testid="schedule-classroom-name"]').text()).toContain('Aula 101');
    expect(row1.find('[data-testid="schedule-time-slot"]').text()).toContain('Lunes');
    expect(row1.find('[data-testid="schedule-time-slot"]').text()).toContain('08:00 - 12:00');

    const row2 = dialog.find('[data-testid="row-teacher-schedule-sch-2"]');
    expect(row2.exists()).toBe(true);
    expect(row2.find('[data-testid="schedule-subject-name"]').text()).toContain('Álgebra Lineal');
    expect(row2.find('[data-testid="schedule-group-code"]').text()).toBe('G2');
    expect(row2.find('[data-testid="schedule-classroom-name"]').text()).toContain('Lab Cómputo 1');
  });

  it('Criterio 5: Si el docente no tiene materias asignadas, se despliega el mensaje amigable exacto', async () => {
    const wrapper = await createWrapper();
    wrapper.vm.viewTab = 'teachers';
    await wrapper.vm.$nextTick();

    // teach-sin-materias no tiene horarios en mockSchedules
    wrapper.vm.openTeacherDetailModal(mockTeachers[3]);
    await wrapper.vm.$nextTick();

    const dialog = wrapper.find('[data-testid="dialog-teacher-detail"]');
    expect(dialog.find('[data-testid="detail-teacher-schedules-table"]').exists()).toBe(false);

    const noSchedMessage = dialog.find('[data-testid="no-teacher-schedules-message"]');
    expect(noSchedMessage.exists()).toBe(true);
    expect(noSchedMessage.text()).toContain('El docente no tiene carga horaria asignada en este periodo.');
  });

  it('Criterio 6: Pestaña "Disponibilidad y Bloqueos de Horario" dispara GET /teachers/:teacherId/restrictions y renderiza chips formateados', async () => {
    const mockRestrictions = [
      {
        id: 'rest-1',
        teacher_id: 'teach-optimo',
        day_of_week: 'Lunes',
        start_time: '07:00',
        end_time: '09:00',
        reason: 'Consulta médica'
      },
      {
        id: 'rest-2',
        teacher_id: 'teach-optimo',
        day_of_week: 'Miércoles',
        start_time: '14:00',
        end_time: '16:00',
        reason: 'Comité académico'
      }
    ];

    api.get.mockImplementation((url) => {
      if (url.includes('/restrictions')) {
        return Promise.resolve({ data: mockRestrictions });
      }
      if (url.includes('/schedules/coordinator')) {
        return Promise.resolve({ data: mockSchedules });
      }
      if (url.includes('/teachers')) {
        return Promise.resolve({ data: mockTeachers });
      }
      return Promise.resolve({ data: [] });
    });

    const wrapper = await createWrapper();
    wrapper.vm.openTeacherDetailModal(mockTeachers[0]);
    await flushPromises();

    // Cambiar a la pestaña de restricciones
    const tabRestrictions = wrapper.find('[data-testid="tab-teacher-restrictions"]');
    expect(tabRestrictions.exists()).toBe(true);
    expect(tabRestrictions.text()).toContain('Disponibilidad y Bloqueos de Horario');

    await tabRestrictions.trigger('click');
    await flushPromises();

    expect(api.get).toHaveBeenCalledWith('/teachers/teach-optimo/restrictions');
    expect(wrapper.vm.restrictionsList).toHaveLength(2);

    const chip1 = wrapper.find('[data-testid="chip-restriction-rest-1"]');
    expect(chip1.exists()).toBe(true);
    expect(chip1.text()).toContain('[Lunes 07:00 - 09:00] • Consulta médica');

    const chip2 = wrapper.find('[data-testid="chip-restriction-rest-2"]');
    expect(chip2.exists()).toBe(true);
    expect(chip2.text()).toContain('[Miércoles 14:00 - 16:00] • Comité académico');
  });

  it('Criterio 7: Validación en cliente inhabilita el botón de envío y muestra error visual si hora de inicio >= hora de fin', async () => {
    const wrapper = await createWrapper();
    wrapper.vm.openTeacherDetailModal(mockTeachers[0]);
    wrapper.vm.teacherDetailTab = 'restrictions';
    await wrapper.vm.$nextTick();

    // Configurar hora de inicio >= hora de fin (ej. 12:00 >= 10:00)
    wrapper.vm.restrictionForm.day_of_week = 'Martes';
    wrapper.vm.restrictionForm.start_time = '12:00';
    wrapper.vm.restrictionForm.end_time = '10:00';
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.isRestrictionTimeInvalid).toBe(true);

    const submitBtn = wrapper.find('[data-testid="btn-add-restriction"]');
    expect(submitBtn.attributes('disabled')).toBeDefined();

    const timeError = wrapper.find('[data-testid="restriction-time-error"]');
    expect(timeError.exists()).toBe(true);
    expect(timeError.text()).toContain('La hora de inicio debe ser menor a la hora de fin');

    // Igualdad (10:00 >= 10:00) también es inválida
    wrapper.vm.restrictionForm.start_time = '10:00';
    wrapper.vm.restrictionForm.end_time = '10:00';
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isRestrictionTimeInvalid).toBe(true);
    expect(submitBtn.attributes('disabled')).toBeDefined();

    // Rango válido (08:00 < 10:00) habilita el botón y oculta el error
    wrapper.vm.restrictionForm.start_time = '08:00';
    wrapper.vm.restrictionForm.end_time = '10:00';
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isRestrictionTimeInvalid).toBe(false);
    expect(submitBtn.attributes('disabled')).toBeUndefined();
    expect(wrapper.find('[data-testid="restriction-time-error"]').exists()).toBe(false);
  });

  it('Criterio 8: Alta y eliminación reactiva de restricciones (POST 201 y DELETE con confirmación) preservando el modal abierto', async () => {
    api.get.mockImplementation((url) => {
      if (url.includes('/restrictions')) {
        return Promise.resolve({ data: [] });
      }
      if (url.includes('/schedules/coordinator')) {
        return Promise.resolve({ data: mockSchedules });
      }
      if (url.includes('/teachers')) {
        return Promise.resolve({ data: mockTeachers });
      }
      return Promise.resolve({ data: [] });
    });

    const createdRestriction = {
      id: 'rest-new-99',
      teacher_id: 'teach-optimo',
      day_of_week: 'Jueves',
      start_time: '09:00',
      end_time: '11:00',
      reason: 'Investigación SNI'
    };
    api.post.mockResolvedValueOnce({ status: 201, data: createdRestriction });
    api.delete.mockResolvedValueOnce({ status: 200, data: { message: 'Restricción eliminada', id: 'rest-new-99' } });

    const wrapper = await createWrapper();
    wrapper.vm.openTeacherDetailModal(mockTeachers[0]);
    wrapper.vm.teacherDetailTab = 'restrictions';
    await flushPromises();

    // 1. Alta de restricción (POST)
    wrapper.vm.restrictionForm.day_of_week = 'Jueves';
    wrapper.vm.restrictionForm.start_time = '09:00';
    wrapper.vm.restrictionForm.end_time = '11:00';
    wrapper.vm.restrictionForm.reason = 'Investigación SNI';
    await wrapper.vm.$nextTick();

    await wrapper.vm.submitTeacherRestriction();
    await flushPromises();

    expect(api.post).toHaveBeenCalledWith('/teachers/teach-optimo/restrictions', {
      day_of_week: 'Jueves',
      start_time: '09:00',
      end_time: '11:00',
      reason: 'Investigación SNI'
    });
    expect(wrapper.vm.restrictionsList).toHaveLength(1);
    expect(wrapper.find('[data-testid="chip-restriction-rest-new-99"]').text()).toContain('[Jueves 09:00 - 11:00] • Investigación SNI');
    expect(wrapper.vm.teacherDetailDialog).toBe(true);

    // 2. Abrir confirmación de borrado y confirmar DELETE
    const deleteBtn = wrapper.find('[data-testid="btn-delete-restriction-rest-new-99"]');
    expect(deleteBtn.exists()).toBe(true);
    await deleteBtn.trigger('click');
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.deleteRestrictionDialog).toBe(true);
    const confirmDeleteDialog = wrapper.find('[data-testid="dialog-confirm-delete-restriction"]');
    expect(confirmDeleteDialog.exists()).toBe(true);

    const confirmBtn = confirmDeleteDialog.find('[data-testid="btn-confirm-delete-restriction"]');
    await confirmBtn.trigger('click');
    await flushPromises();

    expect(api.delete).toHaveBeenCalledWith('/teachers/restrictions/rest-new-99');
    expect(wrapper.vm.restrictionsList).toHaveLength(0);
    expect(wrapper.find('[data-testid="chip-restriction-rest-new-99"]').exists()).toBe(false);
    // El modal principal del docente permanece abierto
    expect(wrapper.vm.teacherDetailDialog).toBe(true);
  });
});
