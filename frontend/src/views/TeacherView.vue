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

    <!-- Stats -->
    <v-row class="mb-6">
      <v-col cols="12" sm="4">
        <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-teal">
          <div class="text-caption text-grey font-weight-bold">CLASES ASIGNADAS</div>
          <div class="text-h4 font-weight-bold text-teal-darken-2 mt-1">{{ schedules.length }}</div>
          <div class="text-caption text-grey mt-1">Grupos bajo mi responsabilidad</div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-info">
          <div class="text-caption text-grey font-weight-bold">ALUMNOS TOTALES</div>
          <div class="text-h4 font-weight-bold text-info mt-1">{{ totalStudents }}</div>
          <div class="text-caption text-grey mt-1">Inscritos en mis grupos</div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-secondary">
          <div class="text-caption text-grey font-weight-bold">HORAS SEMANALES</div>
          <div class="text-h4 font-weight-bold text-secondary mt-1">{{ totalWeeklyHours }}</div>
          <div class="text-caption text-grey mt-1">Horas de clase a la semana</div>
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
                    {{ item.enrolled_count }} / {{ item.max_students }} alumnos
                  </div>
                </v-card>
              </div>
            </v-card>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Expansion Panels per class with student list -->
    <v-card v-if="schedules.length > 0" elevation="2" rounded="lg">
      <v-card-title class="bg-teal-darken-2 text-white py-3">
        <v-icon icon="mdi-account-group" class="mr-2"></v-icon>
        Detalle por Grupo y Lista de Alumnos
      </v-card-title>
      <v-card-text class="pa-4">
        <v-expansion-panels variant="accordion">
          <v-expansion-panel
            v-for="sch in schedules"
            :key="sch.id"
          >
            <v-expansion-panel-title>
              <div class="d-flex align-center flex-wrap" style="gap: 8px; width: 100%;">
                <v-chip color="teal" variant="tonal" size="small" class="font-weight-bold">
                  {{ sch.day_of_week }}
                </v-chip>
                <span class="text-caption font-weight-medium">{{ sch.start_time }} - {{ sch.end_time }}</span>
                <span class="font-weight-bold">{{ sch.subject_name }}</span>
                <span class="text-caption text-grey">({{ sch.subject_code }})</span>
                <v-spacer></v-spacer>
                <v-chip
                  :color="sch.enrolled_count > 0 ? 'info' : 'grey'"
                  variant="tonal"
                  size="small"
                >
                  <v-icon icon="mdi-account-group" start size="small"></v-icon>
                  {{ sch.enrolled_count }} inscritos
                </v-chip>
              </div>
            </v-expansion-panel-title>
            <v-expansion-panel-text>
              <div class="mb-2">
                <v-chip size="small" variant="outlined" class="mr-2">
                  <v-icon icon="mdi-door" start size="small"></v-icon>
                  {{ sch.classroom_name }}
                </v-chip>
                <v-chip size="small" variant="outlined" class="mr-2">
                  <v-icon icon="mdi-office-building" start size="small"></v-icon>
                  {{ sch.classroom_building || 'Edificio Principal' }}
                </v-chip>
                <v-chip size="small" variant="outlined">
                  <v-icon icon="mdi-star" start size="small"></v-icon>
                  {{ sch.subject_credits }} créditos
                </v-chip>
              </div>

              <div v-if="!sch.students || sch.students.length === 0" class="text-center py-4 text-grey">
                <v-icon icon="mdi-account-off" class="mb-1"></v-icon>
                <div>Aún no hay alumnos inscritos en este grupo.</div>
              </div>

              <v-table v-else density="compact" hover>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Nombre del Alumno</th>
                    <th>Correo Electrónico</th>
                    <th>Matrícula</th>
                    <th>Fecha de Inscripción</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(student, idx) in sch.students" :key="student.id">
                    <td>{{ idx + 1 }}</td>
                    <td class="font-weight-medium">{{ student.name }}</td>
                    <td>{{ student.email }}</td>
                    <td>
                      <v-chip size="x-small" color="teal" variant="tonal">{{ student.identifier || 'N/A' }}</v-chip>
                    </td>
                    <td class="text-caption">{{ formatDate(student.enrolled_at) }}</td>
                  </tr>
                </tbody>
              </v-table>
            </v-expansion-panel-text>
          </v-expansion-panel>
        </v-expansion-panels>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import api from '../api/client';

const authStore = useAuthStore();
const schedules = ref([]);
const loading = ref(false);
const daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const totalStudents = computed(() => {
  return schedules.value.reduce((sum, s) => sum + (s.enrolled_count || 0), 0);
});

const totalWeeklyHours = computed(() => {
  return schedules.value.reduce((sum, s) => {
    const [sh, sm] = s.start_time.split(':').map(Number);
    const [eh, em] = s.end_time.split(':').map(Number);
    return sum + ((eh * 60 + em) - (sh * 60 + sm)) / 60;
  }, 0);
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
  } catch (err) {
    console.error('Error al cargar horarios del profesor:', err);
  } finally {
    loading.value = false;
  }
}

onMounted(loadData);
</script>
