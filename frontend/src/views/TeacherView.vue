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
      <v-col cols="12" sm="6">
        <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-teal">
          <div class="text-caption text-grey font-weight-bold">CLASES ASIGNADAS</div>
          <div class="text-h4 font-weight-bold text-teal-darken-2 mt-1">{{ schedules.length }}</div>
          <div class="text-caption text-grey mt-1">Grupos bajo mi responsabilidad</div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6">
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
import { useAuthStore } from '../stores/auth';
import api from '../api/client';

const authStore = useAuthStore();
const schedules = ref([]);
const loading = ref(false);
const daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

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
