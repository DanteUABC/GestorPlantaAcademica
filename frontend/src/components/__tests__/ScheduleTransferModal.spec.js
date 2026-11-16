import { mount, config } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ScheduleTransferModal from '../ScheduleTransferModal.vue';
import api from '../../api/client';

config.global.renderStubDefaultSlot = true;

vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn()
  }
}));

describe('ScheduleTransferModal.vue - Reasignación de Horarios y Suplencias', () => {
  const vuetifyStubs = {
    'v-dialog': true,
    'v-card': true,
    'v-card-title': true,
    'v-card-text': true,
    'v-icon': true,
    'v-btn': true,
    'v-alert': true,
    'v-progress-circular': true,
    'v-form': true,
    'v-autocomplete': true,
    'v-text-field': true,
    'v-textarea': true,
    'v-list-item': true,
    'v-radio-group': true,
    'v-radio': true,
    'v-row': true,
    'v-col': true
  };

  const dummySchedule = {
    id: 'sch-101',
    subject_name: 'Estructura de Datos',
    subject_code: 'ED-202',
    day_of_week: 'Lunes',
    start_time: '08:00',
    end_time: '10:00',
    classroom_name: 'Aula 101',
    teacher_name: 'Prof. Carlos Santana',
    teacher_id: 'usr-prof-1'
  };

  const dummySubstitutes = [
    {
      id: 'usr-prof-2',
      name: 'Prof. Maria Lopez',
      email: 'maria.lopez@pavilion.com',
      identifier: 'DOC-502',
      horas_asignadas: 10,
      horas_contratadas: 20,
      will_exceed_contract: false
    },
    {
      id: 'usr-prof-3',
      name: 'Prof. Juan Gomez',
      email: 'juan.gomez@pavilion.com',
      identifier: 'DOC-503',
      horas_asignadas: 19,
      horas_contratadas: 20,
      will_exceed_contract: true
    }
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('no consulta suplentes si modelValue es false', () => {
    mount(ScheduleTransferModal, {
      props: {
        modelValue: false,
        schedule: dummySchedule
      },
      global: { stubs: vuetifyStubs }
    });

    expect(api.get).not.toHaveBeenCalled();
  });

  it('consulta suplentes disponibles al abrir el diálogo con un horario asignado', async () => {
    api.get.mockResolvedValueOnce({ data: dummySubstitutes });

    const wrapper = mount(ScheduleTransferModal, {
      props: {
        modelValue: false,
        schedule: dummySchedule
      },
      global: { stubs: vuetifyStubs }
    });

    await wrapper.setProps({ modelValue: true });
    await wrapper.vm.$nextTick();

    expect(api.get).toHaveBeenCalledWith('/schedules/sch-101/available-substitutes');
    expect(wrapper.vm.availableSubstitutes).toEqual(dummySubstitutes);
  });

  it('muestra mensaje de error si la consulta de suplentes falla', async () => {
    api.get.mockRejectedValueOnce({
      response: { data: { error: 'Error al consultar suplentes' } }
    });

    const wrapper = mount(ScheduleTransferModal, {
      props: {
        modelValue: false,
        schedule: dummySchedule
      },
      global: { stubs: vuetifyStubs }
    });

    await wrapper.setProps({ modelValue: true });
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.errorMessage).toBe('Error al consultar suplentes');
  });

  it('ejecuta la reasignación mediante POST y emite el evento transferred', async () => {
    api.get.mockResolvedValueOnce({ data: dummySubstitutes });
    api.post.mockResolvedValueOnce({
      data: {
        message: 'Horario transferido y suplencia registrada exitosamente',
        schedule_id: 'sch-101'
      }
    });

    const wrapper = mount(ScheduleTransferModal, {
      props: {
        modelValue: true,
        schedule: dummySchedule
      },
      global: { stubs: vuetifyStubs }
    });

    await wrapper.vm.$nextTick();

    wrapper.vm.selectedSubstituteId = 'usr-prof-2';
    wrapper.vm.reason = 'Incapacidad médica temporal';
    wrapper.vm.effectiveDate = '2026-11-05';

    await wrapper.vm.submitTransfer();

    expect(api.post).toHaveBeenCalledWith('/schedules/sch-101/transfer', {
      substitute_teacher_id: 'usr-prof-2',
      reason: 'Incapacidad médica temporal',
      effective_date: '2026-11-05',
      substitution_type: 'definitiva',
      end_date: null
    });

    expect(wrapper.emitted('transferred')).toBeTruthy();
    expect(wrapper.emitted('transferred')[0][0]).toEqual({
      scheduleId: 'sch-101',
      data: {
        message: 'Horario transferido y suplencia registrada exitosamente',
        schedule_id: 'sch-101'
      }
    });
    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
  });

  it('maneja y muestra el error cuando la transferencia es rechazada por empalme (400)', async () => {
    api.get.mockResolvedValueOnce({ data: dummySubstitutes });
    api.post.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { error: 'Empalme de horario: el docente ya tiene clase en este bloque' }
      }
    });

    const wrapper = mount(ScheduleTransferModal, {
      props: {
        modelValue: true,
        schedule: dummySchedule
      },
      global: { stubs: vuetifyStubs }
    });

    wrapper.vm.selectedSubstituteId = 'usr-prof-2';
    await wrapper.vm.submitTransfer();

    expect(wrapper.vm.errorMessage).toBe('Empalme de horario: el docente ya tiene clase en este bloque');
    expect(wrapper.emitted('transferred')).toBeFalsy();
  });

  it('formatea las métricas de carga contractual y muestra alerta preventiva sin bloquear el botón cuando will_exceed_contract es true', async () => {
    api.get.mockResolvedValueOnce({ data: dummySubstitutes });

    const wrapper = mount(ScheduleTransferModal, {
      props: {
        modelValue: false,
        schedule: dummySchedule
      },
      global: { stubs: vuetifyStubs }
    });

    await wrapper.setProps({ modelValue: true });
    await wrapper.vm.$nextTick();

    // 1. Verificar formato de título con métricas (ej. Prof. Maria Lopez - Carga: 10/20 hrs)
    expect(wrapper.vm.formatSubstituteTitle(dummySubstitutes[0])).toBe('Prof. Maria Lopez - Carga: 10/20 hrs');
    expect(wrapper.vm.formatSubstituteTitle(dummySubstitutes[1])).toBe('Prof. Juan Gomez - Carga: 19/20 hrs');

    // 2. Seleccionar docente sin sobrecupo -> no debe mostrarse la alerta
    wrapper.vm.selectedSubstituteId = 'usr-prof-2';
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="alert-exceed-contract"]').exists()).toBe(false);

    // 3. Seleccionar docente con sobrecupo (will_exceed_contract: true) -> debe mostrarse la alerta informativa
    wrapper.vm.selectedSubstituteId = 'usr-prof-3';
    await wrapper.vm.$nextTick();
    const alert = wrapper.find('[data-testid="alert-exceed-contract"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('Atención: Asignar esta suplencia hará que el docente supere sus horas contratadas (20h).');

    // 4. El botón de confirmación NO debe deshabilitarse por esta alerta informativa
    const confirmBtn = wrapper.find('[data-testid="btn-confirm-transfer"]');
    expect(confirmBtn.attributes('disabled')).toBe('false');
  });

  it('permite seleccionar modalidad temporal, valida fechas y envía payload correspondiente', async () => {
    api.get.mockResolvedValueOnce({ data: dummySubstitutes });
    api.post.mockResolvedValueOnce({
      data: {
        message: 'Suplencia temporal registrada exitosamente',
        schedule_id: 'sch-101'
      }
    });

    const wrapper = mount(ScheduleTransferModal, {
      props: {
        modelValue: true,
        schedule: dummySchedule
      },
      global: { stubs: vuetifyStubs }
    });

    await wrapper.vm.$nextTick();

    // 1. Modalidad por defecto es 'definitiva'
    expect(wrapper.vm.substitutionType).toBe('definitiva');
    expect(wrapper.find('[data-testid="substitution-type-selector"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="input-end-date"]').exists()).toBe(false);

    // 2. Cambiar a modalidad 'temporal' -> se muestra el input de fecha de fin
    wrapper.vm.substitutionType = 'temporal';
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="input-end-date"]').exists()).toBe(true);

    // 3. Seleccionar docente pero sin fecha fin -> botón deshabilitado
    wrapper.vm.selectedSubstituteId = 'usr-prof-2';
    wrapper.vm.effectiveDate = '2026-11-10';
    wrapper.vm.endDate = '';
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isSubmitDisabled).toBe(true);

    // 4. Fecha fin anterior a fecha efectiva -> botón deshabilitado
    wrapper.vm.endDate = '2026-11-09';
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isSubmitDisabled).toBe(true);

    // 5. Fecha fin válida (>= effectiveDate) -> botón habilitado y envío de payload
    wrapper.vm.endDate = '2026-11-20';
    wrapper.vm.reason = 'Incapacidad médica 10 días';
    await wrapper.vm.$nextTick();
    expect(wrapper.vm.isSubmitDisabled).toBe(false);

    await wrapper.vm.submitTransfer();

    expect(api.post).toHaveBeenCalledWith('/schedules/sch-101/transfer', {
      substitute_teacher_id: 'usr-prof-2',
      reason: 'Incapacidad médica 10 días',
      effective_date: '2026-11-10',
      substitution_type: 'temporal',
      end_date: '2026-11-20'
    });
    expect(wrapper.emitted('transferred')).toBeTruthy();
  });
});
