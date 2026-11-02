<template>
  <v-container fluid class="pa-6">
    <!-- Top Header and Primary Action -->
    <div class="d-flex flex-wrap justify-space-between align-center mb-6 ga-4">
      <div>
        <h1 class="text-h4 font-weight-bold text-primary mb-1 d-flex align-center">
          <v-icon icon="mdi-office-building-cog-outline" class="mr-2"></v-icon>
          Catálogo de Espacios Físicos
        </h1>
        <p class="text-body-1 text-grey-darken-1 mb-0">
          Coordinación Académica &bull; {{ authStore.tenantName }} &bull; Gestión de aulas, laboratorios, talleres y auditorios
        </p>
      </div>

      <div class="d-flex flex-wrap align-center ga-3">
        <v-btn
          variant="outlined"
          color="grey-darken-2"
          prepend-icon="mdi-calendar-clock"
          class="text-none"
          to="/coordinator"
        >
          Armado de Horarios
        </v-btn>

        <v-btn
          color="primary"
          size="large"
          prepend-icon="mdi-plus"
          class="text-none font-weight-bold elevation-2"
          data-testid="btn-register-space"
          @click="openCreateModal"
        >
          Registrar Espacio Físico
        </v-btn>
      </div>
    </div>

    <!-- Error / Status Alerts -->
    <v-alert
      v-if="errorMessage"
      type="error"
      variant="tonal"
      closable
      density="comfortable"
      class="mb-4"
      data-testid="catalog-error-alert"
      @click:close="errorMessage = ''"
    >
      {{ errorMessage }}
    </v-alert>

    <!-- Filter Bar & Data Table Card -->
    <v-card elevation="2" rounded="lg" class="pa-4">
      <!-- Top Filter Bar with two v-select -->
      <v-row class="mb-4 align-center" dense>
        <v-col cols="12" sm="6" md="4">
          <v-select
            v-model="selectedBuilding"
            :items="buildingFilterOptions"
            label="Filtrar por Edificio"
            density="comfortable"
            variant="outlined"
            hide-details
            prepend-inner-icon="mdi-office-building-marker-outline"
            data-testid="select-filter-building"
          ></v-select>
        </v-col>

        <v-col cols="12" sm="6" md="4">
          <v-select
            v-model="selectedType"
            :items="typeFilterOptions"
            label="Filtrar por Tipo de Espacio"
            density="comfortable"
            variant="outlined"
            hide-details
            prepend-inner-icon="mdi-shape-outline"
            data-testid="select-filter-type"
          ></v-select>
        </v-col>

        <v-col cols="12" md="4" class="d-flex justify-end align-center">
          <v-chip color="primary" variant="tonal" class="font-weight-bold" data-testid="total-spaces-chip">
            {{ filteredClassrooms.length }} espacios mostrados
          </v-chip>
        </v-col>
      </v-row>

      <v-divider class="mb-4"></v-divider>

      <!-- Vuetify Data Table -->
      <v-data-table
        :headers="headers"
        :items="filteredClassrooms"
        :loading="loading"
        item-value="id"
        hover
        class="elevation-0"
        no-data-text="No se encontraron espacios físicos con los criterios seleccionados."
        data-testid="classrooms-table"
      >
        <!-- Columna: Identificador/Nombre -->
        <template #item.name="{ item }">
          <div class="font-weight-bold text-body-2 text-slate-800 d-flex align-center">
            <v-icon icon="mdi-door" size="small" color="primary" class="mr-2"></v-icon>
            {{ (item.raw || item).name }}
          </div>
        </template>

        <!-- Columna: Edificio/Pabellón -->
        <template #item.building="{ item }">
          <div class="text-body-2 text-grey-darken-2">
            {{ (item.raw || item).building }}
          </div>
        </template>

        <!-- Columna: Capacidad -->
        <template #item.capacity="{ item }">
          <v-chip size="small" color="teal" variant="tonal" class="font-weight-bold">
            <v-icon icon="mdi-account-multiple-outline" start size="14"></v-icon>
            {{ (item.raw || item).capacity }} alumnos
          </v-chip>
        </template>

        <!-- Columna: Tipo de Espacio -->
        <template #item.type="{ item }">
          <v-chip
            size="small"
            :color="getSpaceTypeColor((item.raw || item).type)"
            variant="outlined"
            class="font-weight-medium"
          >
            {{ (item.raw || item).type }}
          </v-chip>
        </template>

        <!-- Columna: Acciones -->
        <template #item.actions="{ item }">
          <div class="d-flex justify-end ga-1">
            <v-btn
              icon="mdi-pencil"
              size="small"
              variant="text"
              color="primary"
              title="Editar espacio físico"
              data-testid="btn-edit-space"
              @click="openEditModal(item.raw || item)"
            ></v-btn>
            <v-btn
              icon="mdi-delete"
              size="small"
              variant="text"
              color="error"
              title="Eliminar espacio físico"
              data-testid="btn-delete-space"
              @click="deleteClassroom(item.raw || item)"
            ></v-btn>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Modal de Formulario (Crear / Editar) -->
    <v-dialog
      v-model="dialogOpen"
      max-width="560"
      persistent
      data-testid="space-form-dialog"
    >
      <v-card rounded="lg" elevation="6">
        <v-card-title class="bg-primary text-white pa-4 d-flex justify-space-between align-center">
          <span class="font-weight-bold d-flex align-center">
            <v-icon :icon="isEditing ? 'mdi-pencil-box-outline' : 'mdi-plus-box-outline'" class="mr-2"></v-icon>
            {{ isEditing ? 'Editar Espacio Físico' : 'Registrar Espacio Físico' }}
          </span>
          <v-btn
            icon="mdi-close"
            variant="text"
            color="white"
            density="compact"
            data-testid="btn-close-modal"
            @click="closeModal"
          ></v-btn>
        </v-card-title>

        <v-card-text class="pa-5">
          <v-alert
            v-if="formError"
            type="error"
            variant="tonal"
            density="comfortable"
            class="mb-4"
            closable
            data-testid="form-validation-alert"
            @click:close="formError = ''"
          >
            {{ formError }}
          </v-alert>

          <v-form ref="formRef" v-model="formValid" @submit.prevent="saveClassroom" data-testid="classroom-form">
            <!-- 1. Nombre del espacio -->
            <v-text-field
              v-model="form.name"
              label="Nombre del Espacio *"
              placeholder="Ej. Aula A-101, Lab Cómputo 2..."
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-door"
              class="mb-3"
              :rules="nameRules"
              data-testid="input-space-name"
            ></v-text-field>

            <!-- 2. Edificio o zona (v-combobox para escribir nuevos o seleccionar existentes) -->
            <v-combobox
              v-model="form.building"
              :items="existingBuildings"
              label="Edificio o Zona *"
              placeholder="Selecciona o escribe un edificio..."
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-office-building"
              class="mb-3"
              :rules="buildingRules"
              data-testid="input-space-building"
            ></v-combobox>

            <!-- 3. Capacidad máxima (numérico con validación estricta v => v > 0) -->
            <v-text-field
              v-model.number="form.capacity"
              label="Capacidad Máxima *"
              type="number"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-account-group"
              class="mb-3"
              min="1"
              :rules="capacityRules"
              data-testid="input-space-capacity"
            ></v-text-field>

            <!-- 4. Tipo de instalación (v-select cerrado) -->
            <v-select
              v-model="form.type"
              :items="allowedSpaceTypes"
              label="Tipo de Instalación *"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-domain"
              class="mb-4"
              :rules="typeRules"
              data-testid="input-space-type"
            ></v-select>

            <div class="d-flex justify-end ga-2">
              <v-btn
                variant="text"
                class="text-none"
                data-testid="btn-cancel-modal"
                @click="closeModal"
              >
                Cancelar
              </v-btn>
              <v-btn
                type="submit"
                color="primary"
                class="text-none font-weight-bold"
                :loading="saving"
                data-testid="btn-save-space"
              >
                {{ isEditing ? 'Guardar Cambios' : 'Registrar Espacio' }}
              </v-btn>
            </div>
          </v-form>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Snackbar de confirmación -->
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3000">
      {{ snackbar.text }}
    </v-snackbar>
  </v-container>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/authStore';
import api from '../api/client';

const emit = defineEmits(['updated']);
const authStore = useAuthStore();

const classrooms = ref([]);
const loading = ref(false);
const saving = ref(false);
const errorMessage = ref('');
const formError = ref('');

// Filtros reactivos de la barra superior
const selectedBuilding = ref('Todos');
const selectedType = ref('Todos');

// Configuración del Modal y Formulario
const dialogOpen = ref(false);
const isEditing = ref(false);
const editingId = ref(null);
const formRef = ref(null);
const formValid = ref(false);

const allowedSpaceTypes = [
  'Aula Teórica',
  'Laboratorio de Cómputo',
  'Taller',
  'Auditorio'
];

const form = ref({
  name: '',
  building: '',
  capacity: 30,
  type: 'Aula Teórica'
});

const snackbar = ref({
  show: false,
  text: '',
  color: 'success'
});

// Reglas de validación estrictas
const nameRules = [
  v => !!(v && String(v).trim()) || 'El nombre del espacio es obligatorio'
];
const buildingRules = [
  v => !!(v && String(v).trim()) || 'El edificio o zona es obligatorio'
];
const capacityRules = [
  v => v > 0 || 'Capacidad debe ser mayor a 0'
];
const typeRules = [
  v => allowedSpaceTypes.includes(v) || 'Seleccione un tipo de instalación válido'
];

// Columnas de v-data-table
const headers = [
  { title: 'Identificador / Nombre', key: 'name', align: 'start', sortable: true },
  { title: 'Edificio / Pabellón', key: 'building', align: 'start', sortable: true },
  { title: 'Capacidad', key: 'capacity', align: 'center', sortable: true },
  { title: 'Tipo de Espacio', key: 'type', align: 'start', sortable: true },
  { title: 'Acciones', key: 'actions', align: 'end', sortable: false }
];

// Lista dinámica de edificios existentes para el v-combobox y filtro
const existingBuildings = computed(() => {
  const set = new Set(
    classrooms.value
      .map(c => c.building)
      .filter(b => b && String(b).trim())
  );
  return Array.from(set).sort();
});

const buildingFilterOptions = computed(() => {
  return ['Todos', ...existingBuildings.value];
});

const typeFilterOptions = computed(() => {
  const extraTypes = classrooms.value
    .map(c => c.type)
    .filter(t => t && !allowedSpaceTypes.includes(t));
  return ['Todos', ...new Set([...allowedSpaceTypes, ...extraTypes])];
});

// Filtrado local reactivo de la tabla
const filteredClassrooms = computed(() => {
  return classrooms.value.filter(item => {
    const matchBuilding =
      !selectedBuilding.value ||
      selectedBuilding.value === 'Todos' ||
      selectedBuilding.value === 'Todos los Edificios' ||
      item.building === selectedBuilding.value;

    const matchType =
      !selectedType.value ||
      selectedType.value === 'Todos' ||
      selectedType.value === 'Todos los Tipos' ||
      item.type === selectedType.value;

    return matchBuilding && matchType;
  });
});

function getSpaceTypeColor(type) {
  switch (type) {
    case 'Laboratorio de Cómputo':
      return 'deep-purple';
    case 'Taller':
      return 'amber-darken-3';
    case 'Auditorio':
      return 'indigo';
    default:
      return 'info';
  }
}

async function loadClassrooms() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const res = await api.get('/classrooms');
    classrooms.value = Array.isArray(res?.data) ? res.data : [];
  } catch (err) {
    console.error('Error al cargar espacios físicos:', err);
    errorMessage.value = err.response?.data?.error || 'No se pudo cargar el catálogo de espacios físicos.';
  } finally {
    loading.value = false;
  }
}

function openCreateModal() {
  isEditing.value = false;
  editingId.value = null;
  formError.value = '';
  form.value = {
    name: '',
    building: '',
    capacity: 30,
    type: 'Aula Teórica'
  };
  dialogOpen.value = true;
}

function openEditModal(item) {
  isEditing.value = true;
  editingId.value = item.id;
  formError.value = '';
  form.value = {
    name: item.name || '',
    building: item.building || '',
    capacity: Number(item.capacity ?? 30),
    type: item.type || 'Aula Teórica'
  };
  dialogOpen.value = true;
}

function closeModal() {
  dialogOpen.value = false;
  formError.value = '';
}

async function saveClassroom() {
  formError.value = '';

  // Validación estricta de capacidad > 0
  const capacityValidation = capacityRules[0](Number(form.value.capacity));
  if (capacityValidation !== true) {
    formError.value = capacityValidation;
    return false;
  }

  if (!form.value.name || !String(form.value.name).trim()) {
    formError.value = 'El nombre del espacio es obligatorio';
    return false;
  }

  if (!form.value.building || !String(form.value.building).trim()) {
    formError.value = 'El edificio o zona es obligatorio';
    return false;
  }

  if (!form.value.type || !String(form.value.type).trim()) {
    formError.value = 'Seleccione un tipo de instalación válido';
    return false;
  }

  saving.value = true;
  try {
    const payload = {
      name: String(form.value.name).trim(),
      building: String(form.value.building).trim(),
      capacity: Number(form.value.capacity),
      type: String(form.value.type).trim()
    };

    if (isEditing.value && editingId.value) {
      await api.put(`/classrooms/${editingId.value}`, payload);
      snackbar.value = {
        show: true,
        text: 'Espacio físico actualizado correctamente',
        color: 'success'
      };
    } else {
      await api.post('/classrooms', payload);
      snackbar.value = {
        show: true,
        text: 'Espacio físico registrado exitosamente',
        color: 'success'
      };
    }

    dialogOpen.value = false;
    await loadClassrooms();
    emit('updated');
    return true;
  } catch (err) {
    formError.value = err.response?.data?.error || 'Error al guardar el espacio físico.';
    return false;
  } finally {
    saving.value = false;
  }
}

async function deleteClassroom(item) {
  if (!item || !item.id) return;
  errorMessage.value = '';
  try {
    await api.delete(`/classrooms/${item.id}`);
    snackbar.value = {
      show: true,
      text: 'Espacio físico eliminado exitosamente',
      color: 'info'
    };
    await loadClassrooms();
    emit('updated');
  } catch (err) {
    errorMessage.value = err.response?.data?.error || 'No se pudo eliminar el espacio físico.';
  }
}

onMounted(() => {
  loadClassrooms();
});

defineExpose({
  classrooms,
  filteredClassrooms,
  loading,
  saving,
  errorMessage,
  formError,
  selectedBuilding,
  selectedType,
  buildingFilterOptions,
  typeFilterOptions,
  existingBuildings,
  allowedSpaceTypes,
  dialogOpen,
  isEditing,
  editingId,
  form,
  nameRules,
  buildingRules,
  capacityRules,
  typeRules,
  headers,
  loadClassrooms,
  openCreateModal,
  openEditModal,
  closeModal,
  saveClassroom,
  deleteClassroom
});
</script>
