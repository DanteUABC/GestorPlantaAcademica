<template>
  <v-container fluid class="pa-6">
    <!-- Header -->
    <div class="d-flex flex-wrap justify-space-between align-center mb-6">
      <div>
        <h1 class="text-h4 font-weight-bold text-teal-darken-2 mb-1">
          <v-icon icon="mdi-teach" class="mr-2"></v-icon>
          Mi Carga Horaria Docente
        </h1>
        <p class="text-body-1 text-grey-darken-1">
          {{ authStore.user?.name }} &bull; {{ authStore.tenantName }}
        </p>
      </div>
      <div class="d-flex ga-2">
        <v-btn
          color="primary"
          prepend-icon="mdi-printer"
          class="text-none font-weight-bold"
          @click="imprimirHorario"
        >
          Imprimir Horario
        </v-btn>
        <v-btn
          color="teal-darken-1"
          variant="tonal"
          prepend-icon="mdi-refresh"
          class="text-none"
          :loading="loading"
          @click="loadData"
        >
          Actualizar
        </v-btn>
      </div>
    </div>

    <!-- Stats -->
    <v-row class="mb-6">
      <v-col cols="12" sm="6" md="4">
        <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-teal h-100 d-flex flex-column justify-space-between">
          <div>
            <div class="text-caption text-grey font-weight-bold">CLASES ASIGNADAS</div>
            <div class="text-h4 font-weight-bold text-teal-darken-2 mt-1">{{ schedules.length }}</div>
          </div>
          <div class="text-caption text-grey mt-1">Grupos bajo mi responsabilidad</div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" md="4">
        <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-secondary h-100 d-flex flex-column justify-space-between">
          <div>
            <div class="text-caption text-grey font-weight-bold">HORAS SEMANALES</div>
            <div class="text-h4 font-weight-bold text-secondary mt-1">{{ totalWeeklyHours }}</div>
          </div>
          <div class="text-caption text-grey mt-1">Horas de clase a la semana</div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="12" md="4">
        <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-primary h-100 d-flex flex-column justify-space-between">
          <div>
            <div class="d-flex justify-space-between align-center">
              <div class="text-caption text-grey font-weight-bold">CARGA CONTRACTUAL</div>
              <div class="text-caption text-grey-darken-1 font-weight-medium">
                Mín: {{ minWeeklyHours }}h &bull; Máx: {{ maxWeeklyHours }}h
              </div>
            </div>
            <div class="d-flex align-baseline ga-2 mt-1">
              <span class="text-h4 font-weight-bold text-primary">{{ assignedHours }}</span>
              <span class="text-body-2 text-grey">/ {{ maxWeeklyHours }} hrs</span>
              <span class="text-caption font-weight-bold ml-auto" :class="loadPercentageColorClass">
                {{ workloadPercentage }}%
              </span>
            </div>

            <!-- Barra comparativa visual -->
            <v-progress-linear
              :model-value="visualProgressPercentage"
              :color="progressBarColor"
              height="8"
              rounded
              class="mt-2"
            ></v-progress-linear>

            <div class="d-flex justify-space-between text-caption text-grey mt-1">
              <span>Rango: {{ minWeeklyHours }} - {{ maxWeeklyHours }} hrs</span>
              <span>{{ remainingOrOverHoursText }}</span>
            </div>
          </div>

          <!-- Etiqueta / Badge condicional -->
          <div class="mt-2">
            <v-chip
              v-if="assignedHours < minWeeklyHours"
              color="warning"
              variant="tonal"
              size="small"
              class="font-weight-medium"
            >
              <v-icon icon="mdi-alert-circle-outline" start size="x-small"></v-icon>
              Pendiente de asignación de horas mínimas
            </v-chip>
            <v-chip
              v-else-if="assignedHours > maxWeeklyHours"
              color="error"
              variant="tonal"
              size="small"
              class="font-weight-medium"
            >
              <v-icon icon="mdi-alert-outline" start size="x-small"></v-icon>
              Límite contractual superado
            </v-chip>
            <v-chip
              v-else
              color="success"
              variant="tonal"
              size="small"
              class="font-weight-medium"
            >
              <v-icon icon="mdi-check-circle-outline" start size="x-small"></v-icon>
              Cumplimiento contractual óptimo
            </v-chip>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Empty State -->
    <v-card v-if="!loading && schedules.length === 0" elevation="2" rounded="lg" class="pa-12 text-center">
      <v-icon icon="mdi-calendar-remove" size="80" color="grey-lighten-1" class="mb-4"></v-icon>
      <h2 class="text-h5 text-grey-darken-1 mb-2">Sin clases asignadas</h2>
      <p class="text-body-1 text-grey">
        Aún no se te han asignado horarios para este periodo. El Coordinador puede asignarte clases desde su panel.
      </p>
    </v-card>

    <!-- Weekly Grid -->
    <v-card v-if="schedules.length > 0" elevation="2" rounded="lg" class="mb-6">
      <v-card-title class="bg-teal-darken-2 text-white py-3">
        <v-icon icon="mdi-view-week" class="mr-2"></v-icon>
        Agenda Semanal
      </v-card-title>
      <v-card-text class="pa-4">
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
              <v-card-title class="bg-teal-lighten-5 text-teal-darken-3 text-center py-2 text-subtitle-2 font-weight-bold">
                {{ day }}
              </v-card-title>
              <v-divider></v-divider>
              <div class="pa-2">
                <div v-if="getByDay(day).length === 0" class="text-center py-6 text-caption text-grey">
                  Día libre
                </div>
                <v-card
                  v-for="item in getByDay(day)"
                  :key="item.id"
                  variant="tonal"
                  color="teal"
                  class="mb-2 pa-2 rounded"
                >
                  <div class="text-caption font-weight-bold text-teal-darken-3">
                    <v-icon icon="mdi-clock-outline" size="x-small"></v-icon>
                    {{ item.start_time }} - {{ item.end_time }}
                  </div>
                  <div class="text-subtitle-2 font-weight-bold mt-1">{{ item.subject_name }}</div>
                  <div class="text-caption text-grey-darken-2">
                    <v-icon icon="mdi-door" size="x-small"></v-icon>
                    {{ item.classroom_name }}
                  </div>
                  <div class="text-caption text-teal-darken-1 font-weight-medium mt-1">
                    <v-icon icon="mdi-account-group" size="x-small"></v-icon>
                    Cupo: {{ item.max_students }} alumnos
                  </div>
                </v-card>
              </div>
            </v-card>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/authStore';
import api from '../api/client';

const authStore = useAuthStore();
const schedules = ref([]);
const teacherProfile = ref(null);
const loading = ref(false);
const daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Cálculo reactivo de horas semanales asignadas a partir de los horarios cargados
const totalWeeklyHours = computed(() => {
  return schedules.value.reduce((sum, s) => {
    const [sh, sm] = (s.start_time || '00:00').split(':').map(Number);
    const [eh, em] = (s.end_time || '00:00').split(':').map(Number);
    return sum + ((eh * 60 + em) - (sh * 60 + sm)) / 60;
  }, 0);
});

// Total de horas frente a grupo asignadas
const assignedHours = computed(() => {
  if (teacherProfile.value?.assigned_hours !== undefined && teacherProfile.value?.assigned_hours !== null && schedules.value.length === 0) {
    return Number(teacherProfile.value.assigned_hours);
  }
  return Number(totalWeeklyHours.value);
});

// Rango contractual: Mínimo (por defecto 0) y Máximo (por defecto 40)
const minWeeklyHours = computed(() => {
  const minVal = teacherProfile.value?.min_weekly_hours ?? authStore.user?.min_weekly_hours;
  return minVal !== undefined && minVal !== null ? Number(minVal) : 0;
});

const maxWeeklyHours = computed(() => {
  const maxVal = teacherProfile.value?.max_weekly_hours ?? authStore.user?.max_weekly_hours;
  return maxVal !== undefined && maxVal !== null ? Number(maxVal) : 40;
});

// Porcentaje de horas asignadas respecto al límite contractual máximo
const workloadPercentage = computed(() => {
  if (maxWeeklyHours.value <= 0) return 0;
  return Math.round((assignedHours.value / maxWeeklyHours.value) * 100);
});

// Barra de progreso comparativa visual topada al 100%
const visualProgressPercentage = computed(() => {
  return Math.min(100, Math.max(0, workloadPercentage.value));
});

// Código de color según cumplimiento contractual
const progressBarColor = computed(() => {
  if (assignedHours.value < minWeeklyHours.value) {
    return 'warning';
  }
  if (assignedHours.value > maxWeeklyHours.value) {
    return 'error';
  }
  return 'teal-darken-1';
});

const loadPercentageColorClass = computed(() => {
  if (assignedHours.value < minWeeklyHours.value) return 'text-warning font-weight-bold';
  if (assignedHours.value > maxWeeklyHours.value) return 'text-error font-weight-bold';
  return 'text-teal-darken-2 font-weight-bold';
});

const remainingOrOverHoursText = computed(() => {
  if (assignedHours.value < minWeeklyHours.value) {
    const diff = Number((minWeeklyHours.value - assignedHours.value).toFixed(2));
    return `Faltan ${diff} hrs para mínimo`;
  }
  if (assignedHours.value > maxWeeklyHours.value) {
    const diff = Number((assignedHours.value - maxWeeklyHours.value).toFixed(2));
    return `Exceso: +${diff} hrs`;
  }
  const diff = Number((maxWeeklyHours.value - assignedHours.value).toFixed(2));
  return `${diff} hrs disponibles`;
});

function getByDay(day) {
  return schedules.value.filter(s => s.day_of_week === day);
}

function formatDate(dt) {
  if (!dt) return '—';
  try {
    return new Date(dt).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dt;
  }
}

async function loadData() {
  loading.value = true;
  try {
    const res = await api.get('/schedules/teacher');
    schedules.value = res.data;

    // Obtener información y límites contractuales del docente
    try {
      const teachersRes = await api.get('/teachers');
      const currentTeacher = (teachersRes.data || []).find(
        (t) => t.id === authStore.user?.id || t.email === authStore.user?.email
      );
      if (currentTeacher) {
        teacherProfile.value = currentTeacher;
      }
    } catch {
      // Fallback a /auth/me si /teachers no está disponible
      try {
        const meRes = await api.get('/auth/me');
        if (meRes.data) {
          teacherProfile.value = meRes.data;
        }
      } catch {
        // Mantiene valores por defecto desde authStore
      }
    }
  } catch (err) {
    console.error('Error al cargar horarios del profesor:', err);
  } finally {
    loading.value = false;
  }
}

function imprimirHorario() {
  if (typeof window !== 'undefined' && typeof window.print === 'function') {
    window.print();
  }
}

onMounted(loadData);
</script>

<style>
@media print {
  .v-app-bar,
  .v-navigation-drawer,
  .v-footer,
  .v-btn,
  .v-alert,
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
