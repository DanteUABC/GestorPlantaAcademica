<template>
  <v-card elevation="2" rounded="lg" class="pa-6">
    <div class="mb-4">
      <h2 class="text-h5 font-weight-bold text-primary mb-1 d-flex align-center">
        <v-icon icon="mdi-file-excel-box" color="success" class="mr-2" size="large"></v-icon>
        Carga Masiva de Horarios (.xlsx)
      </h2>
      <p class="text-body-2 text-grey-darken-1">
        Sube un archivo de hoja de cálculo en formato Excel (.xlsx) para registrar la programación académica de la institución de manera masiva.
      </p>
    </div>

    <!-- Error Alert -->
    <v-alert
      v-if="errorMessage"
      type="error"
      variant="tonal"
      density="comfortable"
      closable
      class="mb-4"
      data-testid="error-alert"
      @click:close="errorMessage = ''"
    >
      <div class="font-weight-bold">Archivo no válido</div>
      <div>{{ errorMessage }}</div>
    </v-alert>

    <!-- Success Alert -->
    <v-alert
      v-if="successMessage"
      type="success"
      variant="tonal"
      density="comfortable"
      closable
      class="mb-4"
      data-testid="success-alert"
      @click:close="successMessage = ''"
    >
      <div class="font-weight-bold">¡Carga Exitosa!</div>
      <div>{{ successMessage }}</div>
    </v-alert>

    <!-- Drag & Drop Zone (when no file selected) -->
    <div
      v-if="!selectedFile"
      class="drop-zone pa-8 text-center rounded-lg border-dashed"
      :class="{ 'drop-zone--active': isDragging }"
      data-testid="drop-zone"
      @dragover.prevent="onDragOver"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
      @click="triggerFileInput"
    >
      <input
        ref="fileInput"
        type="file"
        class="d-none"
        data-testid="file-input"
        accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        @change="onFileChange"
      />

      <v-icon
        icon="mdi-cloud-upload-outline"
        size="64"
        :color="isDragging ? 'primary' : 'grey-darken-1'"
        class="mb-3"
      ></v-icon>

      <div class="text-h6 font-weight-medium text-grey-darken-3 mb-1">
        Arrastra y suelta tu archivo aquí
      </div>
      <div class="text-body-2 text-grey mb-4">
        o haz clic en el botón para buscar en tu equipo (solo formato .xlsx)
      </div>

      <v-btn
        color="primary"
        variant="tonal"
        prepend-icon="mdi-folder-open-outline"
        class="text-none font-weight-bold"
        data-testid="browse-button"
        @click.stop="triggerFileInput"
      >
        Examinar Archivos
      </v-btn>
    </div>

    <!-- File Information Card (when valid file selected) -->
    <v-card
      v-else
      variant="outlined"
      rounded="lg"
      class="pa-4 mb-4 border-success-subtle bg-green-lighten-5"
      data-testid="file-card"
    >
      <div class="d-flex align-center justify-space-between flex-wrap ga-3">
        <div class="d-flex align-center">
          <v-avatar color="success" size="48" class="mr-3">
            <v-icon icon="mdi-file-excel" color="white" size="30"></v-icon>
          </v-avatar>
          <div>
            <div class="text-subtitle-1 font-weight-bold text-grey-darken-3" data-testid="file-name">
              {{ selectedFile.name }}
            </div>
            <div class="text-caption text-grey-darken-1" data-testid="file-size">
              Tamaño: {{ formattedSize }} &bull; Archivo listo para procesar
            </div>
          </div>
        </div>

        <v-btn
          color="error"
          variant="text"
          prepend-icon="mdi-delete-outline"
          class="text-none font-weight-medium"
          data-testid="discard-button"
          :disabled="loading"
          @click="clearFile"
        >
          Descartar
        </v-btn>
      </div>
    </v-card>

    <!-- Conflicts Resolution Section (409 Conflict) -->
    <v-card
      v-if="hasConflicts"
      variant="tonal"
      color="warning"
      rounded="lg"
      class="pa-4 mb-4"
      data-testid="conflicts-card"
    >
      <div class="d-flex align-center mb-2">
        <v-icon icon="mdi-alert-octagon-outline" size="26" class="mr-2" color="warning"></v-icon>
        <div class="text-subtitle-1 font-weight-bold">
          Empalmes Detectados (Conflicto de Horarios)
        </div>
      </div>
      <p class="text-body-2 mb-3">
        El archivo presenta conflictos con los horarios existentes en la base de datos o dentro del mismo archivo. Revisa el detalle antes de continuar:
      </p>

      <div class="conflicts-list mb-4">
        <v-card
          v-for="(c, idx) in conflicts"
          :key="idx"
          variant="outlined"
          class="pa-3 mb-2 bg-white rounded-lg"
          data-testid="conflict-item"
        >
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="font-weight-bold text-caption text-warning-darken-3">
              {{ c.tipo ? `Conflicto de ${c.tipo}` : 'Conflicto detectado' }}
            </span>
            <span
              class="text-caption font-weight-bold px-2 py-1 rounded"
              :class="c.origen === 'BD' ? 'bg-blue-lighten-4 text-blue-darken-3' : 'bg-red-lighten-4 text-red-darken-3'"
            >
              {{ c.origen === 'BD' ? 'En Base de Datos' : 'En el archivo' }}
            </span>
          </div>
          <div class="text-body-2 font-weight-medium text-grey-darken-4 mb-2">
            {{ c.mensaje }}
          </div>
          <div class="d-flex flex-wrap ga-3 text-caption text-grey-darken-2">
            <div v-if="c.existente" class="pa-2 rounded bg-grey-lighten-4 flex-grow-1">
              <strong>Existente:</strong>
              <div>Materia: {{ c.existente.materia || c.existente.codigo || 'N/A' }}</div>
              <div>Profesor: {{ c.existente.profesor || 'N/A' }}</div>
              <div>Aula: {{ c.existente.aula || 'N/A' }} ({{ c.existente.dia }} {{ c.existente.hora_inicio }} - {{ c.existente.hora_fin }})</div>
            </div>
            <div v-if="c.nuevo" class="pa-2 rounded bg-amber-lighten-5 flex-grow-1">
              <strong>Nuevo (Excel):</strong>
              <div>Materia: {{ c.nuevo.materia || 'N/A' }}</div>
              <div>Profesor: {{ c.nuevo.profesor || 'N/A' }}</div>
              <div>Aula: {{ c.nuevo.aula || 'N/A' }} ({{ c.nuevo.dia }} {{ c.nuevo.hora_inicio }} - {{ c.nuevo.hora_fin }})</div>
            </div>
          </div>
        </v-card>
      </div>

      <div class="d-flex justify-end ga-2">
        <v-btn
          color="warning"
          variant="elevated"
          prepend-icon="mdi-database-alert"
          class="text-none font-weight-bold"
          data-testid="force-upload-button"
          :loading="loading"
          @click="forceUpload"
        >
          Sobrescribir Base de Datos
        </v-btn>
      </div>
    </v-card>

    <!-- Upload Button Action -->
    <div class="d-flex justify-end mt-4">
      <v-btn
        color="success"
        size="large"
        prepend-icon="mdi-upload"
        class="text-none font-weight-bold elevation-1"
        data-testid="upload-button"
        :disabled="!selectedFile || loading"
        :loading="loading"
        @click="handleUpload"
      >
        Cargar Archivo
      </v-btn>
    </div>
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue';
import api from '../api/client';

const emit = defineEmits(['upload-success', 'upload-error']);

const fileInput = ref(null);
const selectedFile = ref(null);
const isDragging = ref(false);
const loading = ref(false);
const errorMessage = ref('');
const successMessage = ref('');
const conflicts = ref([]);
const hasConflicts = ref(false);

const formattedSize = computed(() => {
  if (!selectedFile.value) return '0 KB';
  const bytes = selectedFile.value.size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
});

function isValidXlsx(file) {
  if (!file) return false;
  const fileName = file.name ? file.name.toLowerCase() : '';
  return fileName.endsWith('.xlsx');
}

function processFile(file) {
  errorMessage.value = '';
  successMessage.value = '';
  hasConflicts.value = false;
  conflicts.value = [];

  if (!file) return;

  if (!isValidXlsx(file)) {
    errorMessage.value = 'El archivo seleccionado no es válido. Solo se admiten archivos con formato .xlsx.';
    clearFile();
    return;
  }

  selectedFile.value = file;
}

function triggerFileInput() {
  if (fileInput.value) {
    fileInput.value.click();
  }
}

function onFileChange(event) {
  const files = event.target.files;
  if (files && files.length > 0) {
    processFile(files[0]);
  }
}

function onDragOver() {
  isDragging.value = true;
}

function onDragLeave() {
  isDragging.value = false;
}

function onDrop(event) {
  isDragging.value = false;
  const files = event.dataTransfer?.files;
  if (files && files.length > 0) {
    processFile(files[0]);
  }
}

function clearFile() {
  selectedFile.value = null;
  hasConflicts.value = false;
  conflicts.value = [];
  if (fileInput.value) {
    fileInput.value.value = '';
  }
}

async function handleUpload() {
  if (!selectedFile.value) return;

  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';
  hasConflicts.value = false;
  conflicts.value = [];

  try {
    const formData = new FormData();
    formData.append('file', selectedFile.value);

    const response = await api.post('/schedules/upload-excel', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    hasConflicts.value = false;
    conflicts.value = [];
    successMessage.value = response.data?.message || 'Archivo .xlsx recibido correctamente.';
    emit('upload-success', response.data);
    clearFile();
  } catch (err) {
    if (err.response?.status === 409) {
      hasConflicts.value = true;
      conflicts.value = err.response.data?.conflicts || [];
    }
    const message = err.response?.data?.error || err.response?.data?.message || err.message || 'Error al cargar el archivo';
    errorMessage.value = message;
    emit('upload-error', err);
  } finally {
    loading.value = false;
  }
}

async function forceUpload() {
  if (!selectedFile.value) return;

  loading.value = true;
  errorMessage.value = '';
  successMessage.value = '';

  try {
    const formData = new FormData();
    formData.append('file', selectedFile.value);
    formData.append('force', 'true');

    const response = await api.post('/schedules/upload-excel?force=true', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });

    hasConflicts.value = false;
    conflicts.value = [];
    successMessage.value = response.data?.message || 'Horarios sobrescritos e importados correctamente.';
    emit('upload-success', response.data);
    clearFile();
  } catch (err) {
    if (err.response?.status === 409) {
      hasConflicts.value = true;
      conflicts.value = err.response.data?.conflicts || [];
    }
    const message = err.response?.data?.error || err.response?.data?.message || err.message || 'Error al forzar la carga del archivo';
    errorMessage.value = message;
    emit('upload-error', err);
  } finally {
    loading.value = false;
  }
}

defineExpose({
  selectedFile,
  errorMessage,
  successMessage,
  conflicts,
  hasConflicts,
  processFile,
  clearFile,
  handleUpload,
  forceUpload
});
</script>

<style scoped>
.drop-zone {
  border: 2px dashed #b0bec5;
  background-color: #f8fafc;
  cursor: pointer;
  transition: all 0.25s ease-in-out;
}

.drop-zone:hover {
  border-color: #1976d2;
  background-color: #f0f7ff;
}

.drop-zone--active {
  border-color: #1976d2 !important;
  background-color: #e3f2fd !important;
  transform: scale(1.01);
}

.border-dashed {
  border-style: dashed !important;
}
</style>
