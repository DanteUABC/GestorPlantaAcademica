import { mount, config } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ExcelScheduleUploader from '../ExcelScheduleUploader.vue';
import api from '../../api/client';

config.global.renderStubDefaultSlot = true;

vi.mock('../../api/client', () => ({
  default: {
    post: vi.fn()
  }
}));

describe('ExcelScheduleUploader.vue - Carga de Horarios Excel', () => {
  const vuetifyStubs = {
    'v-card': true,
    'v-avatar': true,
    'v-icon': true,
    'v-btn': true,
    'v-alert': true
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe renderizar la zona de drop y el botón de carga deshabilitado inicialmente', () => {
    const wrapper = mount(ExcelScheduleUploader, {
      global: { stubs: vuetifyStubs }
    });

    expect(wrapper.find('[data-testid="drop-zone"]').exists()).toBe(true);
    const uploadBtn = wrapper.find('[data-testid="upload-button"]');
    expect(uploadBtn.attributes('disabled')).toBe('true');
    expect(wrapper.vm.selectedFile).toBeNull();
  });

  it('debe rechazar archivos con extensiones no válidas como .csv o .pdf', async () => {
    const wrapper = mount(ExcelScheduleUploader, {
      global: { stubs: vuetifyStubs }
    });

    // 1. Probar archivo .pdf
    const invalidPdf = new File(['dummy content'], 'documento.pdf', { type: 'application/pdf' });
    wrapper.vm.processFile(invalidPdf);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.selectedFile).toBeNull();
    expect(wrapper.vm.errorMessage).toContain('.xlsx');
    expect(wrapper.find('[data-testid="error-alert"]').exists()).toBe(true);

    // 2. Probar archivo .csv
    const invalidCsv = new File(['col1,col2\nval1,val2'], 'reporte.csv', { type: 'text/csv' });
    wrapper.vm.processFile(invalidCsv);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.selectedFile).toBeNull();
    expect(wrapper.vm.errorMessage).toContain('.xlsx');
  });

  it('debe aceptar y almacenar un archivo mock válido .xlsx', async () => {
    const wrapper = mount(ExcelScheduleUploader, {
      global: { stubs: vuetifyStubs }
    });

    const validFile = new File(['fake excel binary'], 'horarios_2026.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });

    wrapper.vm.processFile(validFile);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.selectedFile).not.toBeNull();
    expect(wrapper.vm.selectedFile.name).toBe('horarios_2026.xlsx');
    expect(wrapper.vm.errorMessage).toBe('');
    expect(wrapper.find('[data-testid="file-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="file-name"]').text()).toBe('horarios_2026.xlsx');
  });

  it('debe activar el botón de carga únicamente cuando hay un archivo .xlsx válido', async () => {
    const wrapper = mount(ExcelScheduleUploader, {
      global: { stubs: vuetifyStubs }
    });

    // Sin archivo: deshabilitado
    expect(wrapper.find('[data-testid="upload-button"]').attributes('disabled')).toBe('true');

    // Con archivo inválido: sigue deshabilitado
    const invalidFile = new File(['test'], 'archivo.txt', { type: 'text/plain' });
    wrapper.vm.processFile(invalidFile);
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="upload-button"]').attributes('disabled')).toBe('true');

    // Con archivo válido: habilitado (disabled === 'false')
    const validFile = new File(['data'], 'carga_docentes.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    wrapper.vm.processFile(validFile);
    await wrapper.vm.$nextTick();

    const uploadBtn = wrapper.find('[data-testid="upload-button"]');
    expect(uploadBtn.attributes('disabled')).toBe('false');
  });

  it('debe permitir descartar el archivo seleccionado y restablecer el estado', async () => {
    const wrapper = mount(ExcelScheduleUploader, {
      global: { stubs: vuetifyStubs }
    });

    const validFile = new File(['excel data'], 'plantilla.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    wrapper.vm.processFile(validFile);
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.selectedFile).not.toBeNull();

    // Descartar archivo
    wrapper.vm.clearFile();
    await wrapper.vm.$nextTick();

    expect(wrapper.vm.selectedFile).toBeNull();
    expect(wrapper.find('[data-testid="file-card"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="drop-zone"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="upload-button"]').attributes('disabled')).toBe('true');
  });

  it('debe enviar el FormData al endpoint y emitir evento upload-success tras respuesta exitosa', async () => {
    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        message: 'Archivo .xlsx recibido correctamente',
        filename: 'horarios_semestre.xlsx'
      }
    });

    const wrapper = mount(ExcelScheduleUploader, {
      global: { stubs: vuetifyStubs }
    });

    const validFile = new File(['excel bytes'], 'horarios_semestre.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    wrapper.vm.processFile(validFile);
    await wrapper.vm.$nextTick();

    await wrapper.vm.handleUpload();

    expect(api.post).toHaveBeenCalledWith(
      '/schedules/upload-excel',
      expect.any(FormData),
      expect.objectContaining({
        headers: { 'Content-Type': 'multipart/form-data' }
      })
    );
    expect(wrapper.emitted('upload-success')).toBeTruthy();
    expect(wrapper.emitted('upload-success')[0][0]).toEqual({
      success: true,
      message: 'Archivo .xlsx recibido correctamente',
      filename: 'horarios_semestre.xlsx'
    });
  });
});
