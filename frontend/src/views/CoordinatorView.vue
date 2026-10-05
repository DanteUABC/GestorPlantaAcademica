<template>
  <v-container fluid class="pa-6">
    <!-- Header with Institution and Action -->
    <div class="d-flex flex-wrap justify-space-between align-center mb-6">
      <div>
        <h1 class="text-h4 font-weight-bold text-primary mb-1">
          <v-icon icon="mdi-calendar-clock" class="mr-2"></v-icon>
          Armado y Gestión de Horarios
        </h1>
        <p class="text-body-1 text-grey-darken-1">
          Coordinación Académica &bull; {{ authStore.tenantName }} &bull; Modelo Multi-tenant sin empalmes
        </p>
      </div>
      <div>
        <v-btn
          color="primary"
          size="large"
          prepend-icon="mdi-plus"
          class="text-none font-weight-bold elevation-2"
          @click="openCreateDialog"
        >
          Armar Nuevo Horario
        </v-btn>
      </div>
    </div>

    <!-- Quick Stats Cards -->
    <v-row class="mb-6">
      <v-col cols="12" sm="6" md="3">
        <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-primary">
          <div class="text-caption text-grey font-weight-bold">GRUPOS ARMADOS</div>
          <div class="text-h4 font-weight-bold text-primary mt-1">{{ schedules.length }}</div>
          <div class="text-caption text-grey mt-1">Horarios activos</div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-secondary">
          <div class="text-caption text-grey font-weight-bold">DOCENTES EN PLANTILLA</div>
          <div class="text-h4 font-weight-bold text-secondary mt-1">{{ teachers.length }}</div>
          <div class="text-caption text-grey mt-1">Profesores registrados</div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-info">
          <div class="text-caption text-grey font-weight-bold">AULAS DISPONIBLES</div>
          <div class="text-h4 font-weight-bold text-info mt-1">{{ classrooms.length }}</div>
          <div class="text-caption text-grey mt-1">Espacios físicos</div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="3">
        <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-accent">
          <div class="text-caption text-grey font-weight-bold">MATERIAS OFERTADAS</div>
          <div class="text-h4 font-weight-bold text-accent mt-1">{{ subjects.length }}</div>
          <div class="text-caption text-grey mt-1">Planes de estudio</div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Conflict Simulator Banner -->
    <v-alert
      color="purple-lighten-5"
      border="start"
      border-color="purple-accent-4"
      class="mb-6 elevation-1"
    >
      <template #prepend>
        <v-icon icon="mdi-shield-check" color="purple-accent-4" size="large"></v-icon>
      </template>
      <div class="text-subtitle-1 font-weight-bold text-purple-darken-3">
        Motor de Validación Anti-Empalmes Activo
      </div>
      <div class="text-body-2 text-purple-darken-2">
        El sistema valida automáticamente en tiempo real que ningún profesor tenga dos asignaturas al mismo tiempo, ni que dos grupos ocupen la misma aula física en el mismo día y bloque horario. Si intentas forzar un cruce, el servidor responderá con un rechazo preventivo 409 indicando el motivo exacto.
      </div>
    </v-alert>

    <!-- Tabs between Weekly Grid and Data Table -->
    <v-card elevation="2" rounded="lg">
      <v-tabs v-model="viewTab" color="primary" grow>
        <v-tab value="grid" prepend-icon="mdi-view-week">Parrilla Semanal de Horarios</v-tab>
        <v-tab value="list" prepend-icon="mdi-format-list-bulleted">Listado Detallado de Grupos</v-tab>
      </v-tabs>

      <v-divider></v-divider>

      <v-card-text class="pa-4">
        <!-- TAB 1: WEEKLY GRID -->
        <div v-if="viewTab === 'grid'">
          <v-row>
            <v-col
              v-for="day in daysOfWeek"
              :key="day"
              cols="12"
              sm="6"
              md="4"
              lg="2"
            >
              <v-card variant="outlined" class="h-100" rounded="lg">
                <v-card-title class="bg-primary text-white text-center py-2 text-subtitle-1 font-weight-bold">
                  {{ day }}
                </v-card-title>
                <v-divider></v-divider>
                <div class="pa-2">
                  <div v-if="getSchedulesByDay(day).length === 0" class="text-center py-6 text-caption text-grey">
                    Sin clases programadas
                  </div>
                  <v-card
                    v-for="item in getSchedulesByDay(day)"
                    :key="item.id"
                    variant="tonal"
                    color="primary"
                    class="mb-2 pa-2 border rounded"
                  >
                    <div class="d-flex justify-space-between align-start">
                      <div class="text-caption font-weight-bold text-primary">
                        <v-icon icon="mdi-clock-outline" size="x-small"></v-icon>
                        {{ item.start_time }} - {{ item.end_time }}
                      </div>
                      <v-btn
                        icon="mdi-delete-outline"
                        size="x-small"
                        variant="text"
                        color="error"
                        title="Eliminar Horario"
                        @click="handleDeleteSchedule(item.id)"
                      ></v-btn>
                    </div>

                    <div class="text-subtitle-2 font-weight-bold text-slate-800 mt-1">
                      {{ item.subject_name }}
                    </div>
                    <div class="text-caption text-grey-darken-2">
                      <v-icon icon="mdi-account-tie" size="x-small"></v-icon>
                      {{ item.teacher_name }}
                    </div>
                    <div class="text-caption text-grey-darken-2">
                      <v-icon icon="mdi-door" size="x-small"></v-icon>
                      {{ item.classroom_name }}
                    </div>
                    <div class="text-caption text-secondary font-weight-medium mt-1">
                      <v-icon icon="mdi-account-group" size="x-small"></v-icon>
                      Cupo: {{ item.max_students }} alumnos
                    </div>
                  </v-card>
                </div>
              </v-card>
            </v-col>
          </v-row>
        </div>

        <!-- TAB 2: DETAILED DATA TABLE -->
        <div v-if="viewTab === 'list'">
          <v-table hover>
            <thead>
              <tr>
                <th class="text-left font-weight-bold">Día y Hora</th>
                <th class="text-left font-weight-bold">Materia</th>
                <th class="text-left font-weight-bold">Docente Asignado</th>
                <th class="text-left font-weight-bold">Aula</th>
                <th class="text-left font-weight-bold">Cupo Total</th>
                <th class="text-right font-weight-bold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="sch in schedules" :key="sch.id">
                <td>
                  <v-chip size="small" color="primary" variant="tonal" class="font-weight-bold mr-1">
                    {{ sch.day_of_week }}
                  </v-chip>
                  <span class="text-caption font-weight-medium">{{ sch.start_time }} - {{ sch.end_time }}</span>
                </td>
                <td>
                  <div class="font-weight-bold">{{ sch.subject_name }}</div>
                  <div class="text-caption text-grey">{{ sch.subject_code }} &bull; {{ sch.subject_credits }} créditos</div>
                </td>
                <td>
                  <div class="d-flex align-center">
                    <v-icon icon="mdi-account-tie" size="small" class="mr-1 text-grey"></v-icon>
                    <span>{{ sch.teacher_name }}</span>
                  </div>
                </td>
                <td>
                  <div>{{ sch.classroom_name }}</div>
                  <div class="text-caption text-grey">{{ sch.classroom_building }}</div>
                </td>
                <td>
                  <span class="text-caption">{{ sch.max_students }} lugares</span>
                </td>
                <td class="text-right">
                  <v-btn
                    color="error"
                    variant="text"
                    size="small"
                    prepend-icon="mdi-delete"
                    class="text-none"
                    @click="handleDeleteSchedule(sch.id)"
                  >
                    Eliminar
                  </v-btn>
                </td>
              </tr>
              <tr v-if="schedules.length === 0">
                <td colspan="6" class="text-center py-6 text-grey">
                  No hay horarios programados aún. Haz clic en "Armar Nuevo Horario" para crear el primero.
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>
      </v-card-text>
    </v-card>

    <!-- DIALOG: ARMAR NUEVO HORARIO -->
    <v-dialog v-model="createDialog" max-width="600" persistent>
      <v-card rounded="lg" elevation="6">
        <v-card-title class="bg-primary text-white pa-4 d-flex justify-space-between align-center">
          <span class="font-weight-bold">
            <v-icon icon="mdi-calendar-plus" class="mr-2"></v-icon>
            Armar Nuevo Horario
          </span>
          <v-btn icon="mdi-close" variant="text" color="white" density="compact" @click="createDialog = false"></v-btn>
        </v-card-title>

        <v-card-text class="pa-5">
          <!-- Empalme Conflict Error Alert -->
          <v-alert
            v-if="conflictError"
            type="error"
            variant="tonal"
            class="mb-4"
            density="comfortable"
            closable
            @click:close="conflictError = ''"
          >
            <div class="font-weight-bold">¡Conflicto de Horario Detectado!</div>
            <div class="text-body-2 mt-1">{{ conflictError }}</div>
          </v-alert>

          <v-form @submit.prevent="submitSchedule">
            <!-- Materia -->
            <v-select
              v-model="newSchedule.subject_id"
              :items="subjects"
              item-title="name"
              item-value="id"
              label="Materia *"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-book-open-page-variant"
              class="mb-2"
              :rules="[v => !!v || 'Seleccione una materia']"
            >
              <template #item="{ props, item }">
                <v-list-item v-bind="props" :subtitle="`Código: ${item.raw.code} | Créditos: ${item.raw.credits}`"></v-list-item>
              </template>
            </v-select>

            <!-- Docente -->
            <v-select
              v-model="newSchedule.teacher_id"
              :items="teachers"
              item-title="name"
              item-value="id"
              label="Profesor Asignado *"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-account-tie"
              class="mb-2"
              :rules="[v => !!v || 'Seleccione un docente']"
            ></v-select>

            <!-- Aula Física -->
            <v-select
              v-model="newSchedule.classroom_id"
              :items="classrooms"
              item-title="name"
              item-value="id"
              label="Aula Física *"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-door"
              class="mb-2"
              :rules="[v => !!v || 'Seleccione un aula']"
            >
              <template #item="{ props, item }">
                <v-list-item v-bind="props" :subtitle="`${item.raw.building || 'Edificio Principal'} | Capacidad: ${item.raw.capacity} alumnos`"></v-list-item>
              </template>
            </v-select>

            <!-- Día de la semana -->
            <v-select
              v-model="newSchedule.day_of_week"
              :items="daysOfWeek"
              label="Día de la Semana *"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-calendar-today"
              class="mb-2"
              :rules="[v => !!v || 'Seleccione el día']"
            ></v-select>

            <!-- Rango Horario -->
            <v-row class="mb-1">
              <v-col cols="12" sm="6">
                <v-select
                  v-model="newSchedule.start_time"
                  :items="timeSlots"
                  label="Hora de Inicio *"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-clock-start"
                  :rules="[v => !!v || 'Hora requerida']"
                ></v-select>
              </v-col>
              <v-col cols="12" sm="6">
                <v-select
                  v-model="newSchedule.end_time"
                  :items="timeSlots"
                  label="Hora de Fin *"
                  variant="outlined"
                  density="comfortable"
                  prepend-inner-icon="mdi-clock-end"
                  :rules="[v => !!v || 'Hora requerida']"
                ></v-select>
              </v-col>
            </v-row>

            <!-- Cupo Máximo -->
            <v-text-field
              v-model.number="newSchedule.max_students"
              label="Cupo Máximo de Alumnos"
              type="number"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-account-multiple"
              class="mb-4"
              min="5"
              max="100"
            ></v-text-field>

            <div class="d-flex justify-end gap-2">
              <v-btn variant="text" class="text-none mr-2" @click="createDialog = false">
                Cancelar
              </v-btn>
              <v-btn
                type="submit"
                color="primary"
                class="text-none font-weight-bold"
                :loading="submitting"
              >
                Guardar Horario
              </v-btn>
            </div>
          </v-form>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Global Snackbar -->
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3000">
      {{ snackbar.text }}
    </v-snackbar>
  </v-container>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import api from '../api/client';

const authStore = useAuthStore();

const viewTab = ref('grid');
const schedules = ref([]);
const subjects = ref([]);
const teachers = ref([]);
const classrooms = ref([]);
const daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const timeSlots = [
  '07:00', '08:00', '09:00', '10:00', '11:00', '12:00',
  '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00'
];

const createDialog = ref(false);
const submitting = ref(false);
const conflictError = ref('');

const newSchedule = ref({
  subject_id: '',
  teacher_id: '',
  classroom_id: '',
  day_of_week: 'Lunes',
  start_time: '08:00',
  end_time: '10:00',
  max_students: 30
});

const snackbar = ref({
  show: false,
  text: '',
  color: 'success'
});

onMounted(async () => {
  await loadData();
});

async function loadData() {
  try {
    const [schedRes, subRes, teachRes, classRes] = await Promise.all([
      api.get('/schedules/coordinator'),
      api.get('/subjects'),
      api.get('/teachers'),
      api.get('/classrooms')
    ]);
    schedules.value = schedRes.data;
    subjects.value = subRes.data;
    teachers.value = teachRes.data;
    classrooms.value = classRes.data;
  } catch (err) {
    console.error('Error al cargar datos del coordinador:', err);
  }
}

function getSchedulesByDay(day) {
  return schedules.value.filter(s => s.day_of_week === day);
}

function openCreateDialog() {
  conflictError.value = '';
  if (subjects.value.length > 0) newSchedule.value.subject_id = subjects.value[0].id;
  if (teachers.value.length > 0) newSchedule.value.teacher_id = teachers.value[0].id;
  if (classrooms.value.length > 0) {
    newSchedule.value.classroom_id = classrooms.value[0].id;
    newSchedule.value.max_students = classrooms.value[0].capacity;
  }
  createDialog.value = true;
}

async function submitSchedule() {
  conflictError.value = '';
  submitting.value = true;
  try {
    await api.post('/schedules', newSchedule.value);
    snackbar.value = {
      show: true,
      text: '¡Horario creado exitosamente sin conflictos!',
      color: 'success'
    };
    createDialog.value = false;
    await loadData();
  } catch (err) {
    if (err.response?.status === 409) {
      conflictError.value = err.response.data.error;
    } else {
      conflictError.value = err.response?.data?.error || 'Error al guardar el horario.';
    }
  } finally {
    submitting.value = false;
  }
}

async function handleDeleteSchedule(id) {
  if (!confirm('¿Deseas eliminar este horario programado?')) return;
  try {
    await api.delete(`/schedules/${id}`);
    snackbar.value = {
      show: true,
      text: 'Horario eliminado correctamente',
      color: 'info'
    };
    await loadData();
  } catch (err) {
    snackbar.value = {
      show: true,
      text: err.response?.data?.error || 'Error al eliminar horario',
      color: 'error'
    };
  }
}
</script>
