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
    'v-list-item': true
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
      identifier: 'DOC-502'
    },
    {
      id: 'usr-prof-3',
      name: 'Prof. Juan Gomez',
      email: 'juan.gomez@pavilion.com',
      identifier: 'DOC-503'
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
      effective_date: '2026-11-05'
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
});
