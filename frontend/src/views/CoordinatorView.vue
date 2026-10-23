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
      <div class="d-flex ga-2">
        <v-btn
          color="success"
          variant="tonal"
          size="large"
          prepend-icon="mdi-file-excel-box"
          class="text-none font-weight-bold"
          @click="viewTab = 'upload'"
        >
          Carga Masiva Excel
        </v-btn>
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
      <div class="d-flex flex-wrap justify-space-between align-center px-4 pt-2 no-print border-b">
        <v-tabs v-model="viewTab" color="primary">
          <v-tab value="grid" prepend-icon="mdi-view-week">Parrilla Semanal de Horarios</v-tab>
          <v-tab value="list" prepend-icon="mdi-format-list-bulleted">Listado Detallado de Grupos</v-tab>
          <v-tab value="upload" prepend-icon="mdi-file-excel-box">Carga Masiva Excel</v-tab>
        </v-tabs>
        <div class="d-flex align-center ga-3 my-2">
          <v-select
            v-model="selectedTeacherFilter"
            :items="[{ id: '', name: 'Todos los Docentes' }, ...teachers]"
            item-title="name"
            item-value="id"
            label="Consultar Docente"
            density="compact"
            variant="outlined"
            hide-details
            style="min-width: 240px;"
            prepend-inner-icon="mdi-account-tie"
          ></v-select>
          <v-btn
            color="primary"
            prepend-icon="mdi-printer"
            class="text-none font-weight-bold"
            @click="imprimirHorario"
          >
            Imprimir Horario
          </v-btn>
        </div>
      </div>

      <v-card-text class="pa-4">
        <!-- Información del Docente para Consulta e Impresión -->
        <div v-if="selectedTeacherName" class="mb-4 pa-3 bg-blue-lighten-5 rounded border d-flex justify-space-between align-center">
          <div>
            <div class="text-subtitle-1 font-weight-bold text-primary">
              <v-icon icon="mdi-teach" class="mr-1"></v-icon>
              Horario del Docente: {{ selectedTeacherName }}
            </div>
            <div class="text-caption text-grey-darken-1">
              Institución: {{ authStore.tenantName }} &bull; Carga semanal asignada
            </div>
          </div>
          <v-chip color="primary" variant="tonal" size="small" class="font-weight-bold">
            {{ filteredSchedules.length }} clases asignadas
          </v-chip>
        </div>
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
              <tr v-for="sch in filteredSchedules" :key="sch.id">
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
              <tr v-if="filteredSchedules.length === 0">
                <td colspan="6" class="text-center py-6 text-grey">
                  No hay horarios programados aún. Haz clic en "Armar Nuevo Horario" para crear el primero.
                </td>
              </tr>
            </tbody>
          </v-table>
        </div>
        <!-- TAB 3: CARGA MASIVA EXCEL -->
        <div v-if="viewTab === 'upload'" class="pa-2">
          <ExcelScheduleUploader @upload-success="handleUploadSuccess" />
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
            <!-- Materia (con barra de búsqueda) -->
            <v-autocomplete
              v-model="newSchedule.subject_id"
              :items="subjects"
              item-title="name"
              item-value="id"
              label="Materia *"
              placeholder="Buscar materia por nombre o clave..."
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-magnify"
              class="mb-2"
              clearable
              auto-select-first
              :custom-filter="filterSubjects"
              :rules="[v => !!v || 'Seleccione una materia']"
              no-data-text="No se encontraron materias que coincidan con la búsqueda"
            >
              <template #item="{ props, item }">
                <v-list-item
                  v-bind="props"
                  :title="item.raw.name"
                  :subtitle="`Código: ${item.raw.code} | Créditos: ${item.raw.credits}`"
                >
                  <template #prepend>
                    <v-icon icon="mdi-book-open-page-variant" class="mr-2 text-primary" size="small"></v-icon>
                  </template>
                </v-list-item>
              </template>
            </v-autocomplete>

            <!-- Maestro / Docente (con barra de búsqueda) -->
            <v-autocomplete
              v-model="newSchedule.teacher_id"
              :items="teachers"
              item-title="name"
              item-value="id"
              label="Maestro *"
              placeholder="Buscar maestro por nombre, nómina o correo..."
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-magnify"
              class="mb-2"
              clearable
              auto-select-first
              :custom-filter="filterTeachers"
              :rules="[v => !!v || 'Seleccione un maestro']"
              no-data-text="No se encontraron maestros que coincidan con la búsqueda"
            >
              <template #item="{ props, item }">
                <v-list-item
                  v-bind="props"
                  :title="item.raw.name"
                  :subtitle="item.raw.email ? `${item.raw.email}${item.raw.identifier ? ' • ID: ' + item.raw.identifier : ''}` : (item.raw.identifier ? 'ID: ' + item.raw.identifier : '')"
                >
                  <template #prepend>
                    <v-icon icon="mdi-account-tie" class="mr-2 text-secondary" size="small"></v-icon>
                  </template>
                </v-list-item>
              </template>
            </v-autocomplete>

            <!-- Medidor Visual de Carga Laboral del Docente -->
            <div v-if="newSchedule.teacher_id" class="mb-3 teacher-workload-container">
              <div class="d-flex justify-space-between align-center mb-1">
                <span class="text-caption font-weight-medium text-medium-emphasis">
                  {{ teacherMeterText }}
                </span>
                <span
                  class="text-caption font-weight-bold"
                  :class="{
                    'text-success': teacherMeterColor === 'success',
                    'text-warning': teacherMeterColor === 'warning',
                    'text-error': teacherMeterColor === 'error'
                  }"
                >
                  {{ teacherLoadPercentage }}% asignado
                </span>
              </div>
              <v-progress-linear
                :model-value="Math.min(100, teacherLoadPercentage)"
                :color="teacherMeterColor"
                height="22"
                rounded
                class="elevation-1"
                :data-color="teacherMeterColor"
                :data-color-name="teacherMeterColorName"
              >
                <template #default>
                  <strong class="text-caption font-weight-bold text-white px-2 text-truncate">
                    {{ teacherMeterText }}
                  </strong>
                </template>
              </v-progress-linear>
              <div v-if="totalHoursWithPending > maxWeeklyHours" class="text-caption text-error font-weight-medium mt-1">
                <v-icon icon="mdi-alert" size="x-small" class="mr-1"></v-icon>
                Esta clase de {{ pendingClassHours }} hrs haría que el docente supere su límite semanal ({{ totalHoursWithPending }} / {{ maxWeeklyHours }} hrs).
              </div>
            </div>

            <!-- Aula Física -->
            <v-select
              v-model="newSchedule.classroom_id"
              :items="classroomOptions"
              item-title="displayName"
              item-value="id"
              label="Aula Física *"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-door"
              class="mb-2"
              :rules="[v => !!v || 'Seleccione un aula']"
            >
              <template #item="{ props, item }">
                <v-list-item
                  v-bind="props"
                  :title="formatClassroomOption(item.raw)"
                  :subtitle="item.raw.building ? `Edificio: ${item.raw.building}` : undefined"
                >
                  <template #prepend>
                    <v-icon icon="mdi-door" class="mr-2 text-secondary" size="small"></v-icon>
                  </template>
                </v-list-item>
              </template>
              <template #selection="{ item }">
                <span>{{ formatClassroomOption(item.raw) }}</span>
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
              :class="isCapacityExceeded ? 'mb-1' : 'mb-4'"
              min="1"
              max="100"
              :error="isCapacityExceeded"
              :error-messages="isCapacityExceeded ? [capacityWarningMessage] : []"
              :messages="!isCapacityExceeded && selectedClassroom ? [`Capacidad máxima del aula: ${selectedClassroom.capacity} alumnos`] : []"
            ></v-text-field>

            <!-- Alerta visual de sobrecupo en tiempo real (ámbar / rojo) -->
            <v-alert
              v-if="isCapacityExceeded"
              type="warning"
              density="compact"
              variant="tonal"
              color="warning"
              class="mb-4 text-caption font-weight-medium"
              icon="mdi-alert-circle"
            >
              <strong>Advertencia de Sobrecupo:</strong>
              El aforo máximo del espacio físico seleccionado ({{ selectedClassroom?.name }}) es de <strong>{{ selectedClassroom?.capacity }}</strong> alumnos.
              Reduce el cupo para poder guardar el horario.
            </v-alert>

            <div class="d-flex justify-end gap-2">
              <v-btn variant="text" class="text-none mr-2" @click="createDialog = false">
                Cancelar
              </v-btn>
              <v-btn
                type="submit"
                color="primary"
                class="text-none font-weight-bold"
                :loading="submitting"
                :disabled="isCapacityExceeded || submitting"
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
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/authStore';
import api from '../api/client';
import ExcelScheduleUploader from '../components/ExcelScheduleUploader.vue';

const authStore = useAuthStore();

const viewTab = ref('grid');
const schedules = ref([]);
const subjects = ref([]);
const teachers = ref([]);
const classrooms = ref([]);

const formatClassroomOption = (cr) => {
  if (!cr) return '';
  const typeText = cr.type ? cr.type : 'Aula Teórica';
  return `${cr.name} • ${typeText} • Capacidad: ${cr.capacity}`;
};

const classroomOptions = computed(() => {
  return classrooms.value.map(cr => ({
    ...cr,
    displayName: formatClassroomOption(cr)
  }));
});

const selectedClassroom = computed(() => {
  return classrooms.value.find(c => c.id === newSchedule.value.classroom_id) || null;
});

const isCapacityExceeded = computed(() => {
  if (!selectedClassroom.value) return false;
  const requested = Number(newSchedule.value.max_students);
  if (!requested || isNaN(requested)) return false;
  return requested > selectedClassroom.value.capacity;
});

const capacityWarningMessage = computed(() => {
  if (!selectedClassroom.value || !isCapacityExceeded.value) return '';
  return `¡Sobrecupo detectado! El cupo ingresado (${newSchedule.value.max_students} alumnos) excede la capacidad máxima del aula "${selectedClassroom.value.name}" (${selectedClassroom.value.capacity} alumnos).`;
});

// Medidor reactivo de carga horaria del docente
function calculateScheduleDurationHours(startTime, endTime) {
  if (!startTime || !endTime || typeof startTime !== 'string' || typeof endTime !== 'string') return 0;
  const sParts = startTime.split(':').map(Number);
  const eParts = endTime.split(':').map(Number);
  if (sParts.length < 2 || eParts.length < 2 || isNaN(sParts[0]) || isNaN(eParts[0])) return 0;
  const startMin = sParts[0] * 60 + sParts[1];
  const endMin = eParts[0] * 60 + eParts[1];
  return Math.max(0, (endMin - startMin) / 60);
}

const selectedTeacher = computed(() => {
  return teachers.value.find(t => t.id === newSchedule.value.teacher_id) || null;
});

const currentAssignedHours = computed(() => {
  if (!newSchedule.value.teacher_id) return 0;
  return schedules.value
    .filter(s => s.teacher_id === newSchedule.value.teacher_id)
    .reduce((sum, s) => sum + calculateScheduleDurationHours(s.start_time, s.end_time), 0);
});

const maxWeeklyHours = computed(() => {
  if (!selectedTeacher.value) return 25;
  return selectedTeacher.value.max_hours || selectedTeacher.value.horas_maximas || 25;
});

const availableHours = computed(() => {
  return Math.max(0, maxWeeklyHours.value - currentAssignedHours.value);
});

const pendingClassHours = computed(() => {
  if (!newSchedule.value.start_time || !newSchedule.value.end_time) return 0;
  return calculateScheduleDurationHours(newSchedule.value.start_time, newSchedule.value.end_time);
});

const totalHoursWithPending = computed(() => {
  return currentAssignedHours.value + pendingClassHours.value;
});

const teacherLoadPercentage = computed(() => {
  if (!maxWeeklyHours.value) return 0;
  return Math.round((currentAssignedHours.value / maxWeeklyHours.value) * 100);
});

const totalLoadPercentageWithPending = computed(() => {
  if (!maxWeeklyHours.value) return 0;
  return Math.round((totalHoursWithPending.value / maxWeeklyHours.value) * 100);
});

const teacherMeterColor = computed(() => {
  // Rojo: Si la clase en proceso de asignación superaría el 100% (o si ya supera el 100%)
  if (totalHoursWithPending.value > maxWeeklyHours.value || currentAssignedHours.value > maxWeeklyHours.value) {
    return 'error';
  }
  // Ámbar: Entre 80% y 100%
  const relevantPercentage = Math.max(teacherLoadPercentage.value, totalLoadPercentageWithPending.value);
  if (relevantPercentage >= 80 && relevantPercentage <= 100) {
    return 'warning';
  }
  // Verde: Menor al 80% de su capacidad
  return 'success';
});

const teacherMeterColorName = computed(() => {
  if (teacherMeterColor.value === 'error') return 'rojo';
  if (teacherMeterColor.value === 'warning') return 'ambar';
  return 'verde';
});

const teacherMeterText = computed(() => {
  const assigned = currentAssignedHours.value;
  const max = maxWeeklyHours.value;
  const available = availableHours.value;
  return `Horas: ${assigned} / ${max} hrs semanales (${available} hrs disponibles)`;
});
const daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const selectedTeacherFilter = ref('');

const selectedTeacherName = computed(() => {
  if (!selectedTeacherFilter.value) return '';
  const t = teachers.value.find(teach => teach.id === selectedTeacherFilter.value);
  return t ? t.name : '';
});

const filteredSchedules = computed(() => {
  if (!selectedTeacherFilter.value) return schedules.value;
  return schedules.value.filter(s => s.teacher_id === selectedTeacherFilter.value);
});

function imprimirHorario() {
  if (typeof window !== 'undefined' && typeof window.print === 'function') {
    window.print();
  }
}

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
  return filteredSchedules.value.filter(s => s.day_of_week === day);
}

function normalizeSearchText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function filterSubjects(valueText, queryText, item) {
  if (!queryText) return true;
  const q = normalizeSearchText(queryText);
  const raw = item?.raw || item || {};
  const name = normalizeSearchText(raw.name || valueText);
  const code = normalizeSearchText(raw.code);
  return name.includes(q) || code.includes(q);
}

function filterTeachers(valueText, queryText, item) {
  if (!queryText) return true;
  const q = normalizeSearchText(queryText);
  const raw = item?.raw || item || {};
  const name = normalizeSearchText(raw.name || valueText);
  const email = normalizeSearchText(raw.email);
  const identifier = normalizeSearchText(raw.identifier);
  return name.includes(q) || email.includes(q) || identifier.includes(q);
}

function openCreateDialog() {
  conflictError.value = '';
  newSchedule.value = {
    subject_id: null,
    teacher_id: null,
    classroom_id: classrooms.value.length > 0 ? classrooms.value[0].id : null,
    day_of_week: 'Lunes',
    start_time: '08:00',
    end_time: '10:00',
    max_students: classrooms.value.length > 0 ? classrooms.value[0].capacity : 30
  };
  createDialog.value = true;
}

async function submitSchedule() {
  if (isCapacityExceeded.value) {
    conflictError.value = capacityWarningMessage.value;
    return;
  }
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

function handleUploadSuccess(data) {
  snackbar.value = {
    show: true,
    text: data?.message || '¡Archivo Excel recibido correctamente!',
    color: 'success'
  };
  loadData();
}
</script>

<style>
@media print {
  .v-app-bar,
  .v-navigation-drawer,
  .v-footer,
  .v-btn,
  .v-alert,
  .v-tabs,
  .border-b,
  .v-select,
  .no-print {
    display: none !important;
  }

  body,
  .v-application,
  .v-main,
  .v-container {
    background: #ffffff !important;
    background-color: #ffffff !important;
    color: #000000 !important;
    padding: 0 !important;
    margin: 0 !important;
    width: 100% !important;
    max-width: 100% !important;
  }

  .v-card {
    box-shadow: none !important;
    border: 1px solid #ddd !important;
    background: #ffffff !important;
    break-inside: avoid;
  }

  * {
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
}
</style>
