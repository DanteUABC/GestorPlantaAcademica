<template>
  <v-container fluid class="pa-6">
    <!-- Header -->
    <div class="d-flex flex-wrap justify-space-between align-center mb-6">
      <div>
        <h1 class="text-h4 font-weight-bold text-amber-darken-3 mb-1">
          <v-icon icon="mdi-account-school" class="mr-2"></v-icon>
          Portal del Alumno
        </h1>
        <p class="text-body-1 text-grey-darken-1">
          {{ authStore.user?.name }}
          <v-chip size="x-small" color="amber-darken-2" variant="tonal" class="ml-1">{{ authStore.user?.identifier || '' }}</v-chip>
          &bull; {{ authStore.tenantName }}
        </p>
      </div>
      <v-btn
        color="amber-darken-3"
        variant="tonal"
        prepend-icon="mdi-refresh"
        class="text-none"
        :loading="loading"
        @click="loadAll"
      >
        Actualizar
      </v-btn>
    </div>

    <!-- Stats -->
    <v-row class="mb-6">
      <v-col cols="12" sm="4">
        <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-amber">
          <div class="text-caption text-grey font-weight-bold">MATERIAS INSCRITAS</div>
          <div class="text-h4 font-weight-bold text-amber-darken-3 mt-1">{{ mySchedules.length }}</div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-info">
          <div class="text-caption text-grey font-weight-bold">CRÉDITOS TOTALES</div>
          <div class="text-h4 font-weight-bold text-info mt-1">{{ totalCredits }}</div>
        </v-card>
      </v-col>
      <v-col cols="12" sm="4">
        <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-secondary">
          <div class="text-caption text-grey font-weight-bold">DÍAS CON CLASE</div>
          <div class="text-h4 font-weight-bold text-secondary mt-1">{{ activeDays }}</div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Tabs -->
    <v-card elevation="2" rounded="lg">
      <v-tabs v-model="tab" color="amber-darken-3" grow>
        <v-tab value="catalog" prepend-icon="mdi-book-open-variant">Oferta Académica</v-tab>
        <v-tab value="myschedule" prepend-icon="mdi-calendar-account">Mi Horario Semanal</v-tab>
      </v-tabs>
      <v-divider></v-divider>

      <v-card-text class="pa-4">
        <!-- TAB 1: OFERTA ACADÉMICA -->
        <div v-if="tab === 'catalog'">
          <!-- Conflict Alert -->
          <v-alert
            v-if="conflictError"
            type="error"
            variant="tonal"
            closable
            class="mb-4"
            border="start"
            border-color="error"
            @click:close="conflictError = ''"
          >
            <div class="font-weight-bold mb-1">
              <v-icon icon="mdi-alert-circle" class="mr-1"></v-icon>
              ¡Conflicto de Horario Detectado!
            </div>
            <div class="text-body-2">{{ conflictError }}</div>
          </v-alert>

          <!-- Empty Catalog -->
          <div v-if="available.length === 0" class="text-center py-8 text-grey">
            <v-icon icon="mdi-book-off-outline" size="64" class="mb-2"></v-icon>
            <div class="text-h6">No hay grupos disponibles en este momento</div>
          </div>

          <!-- Available Schedule Cards -->
          <v-row>
            <v-col
              v-for="item in available"
              :key="item.id"
              cols="12"
              sm="6"
              lg="4"
            >
              <v-card
                :variant="item.is_enrolled ? 'tonal' : 'elevated'"
                :color="item.is_enrolled ? 'amber-lighten-5' : undefined"
                rounded="lg"
                class="h-100"
                elevation="2"
              >
                <v-card-title class="d-flex justify-space-between align-center pb-0">
                  <span class="text-subtitle-1 font-weight-bold">{{ item.subject_name }}</span>
                  <v-chip
                    v-if="item.is_enrolled"
                    color="success"
                    size="small"
                    variant="flat"
                    prepend-icon="mdi-check-circle"
                  >
                    Ya inscrito
                  </v-chip>
                </v-card-title>
                <v-card-subtitle class="pb-2">
                  {{ item.subject_code }} &bull; {{ item.subject_credits }} créditos
                </v-card-subtitle>

                <v-card-text class="pt-0">
                  <div class="mb-1">
                    <v-icon icon="mdi-account-tie" size="small" class="mr-1"></v-icon>
                    {{ item.teacher_name }}
                  </div>
                  <div class="mb-1">
                    <v-icon icon="mdi-door" size="small" class="mr-1"></v-icon>
                    {{ item.classroom_name }}
                    <span v-if="item.classroom_building" class="text-caption text-grey ml-1">({{ item.classroom_building }})</span>
                  </div>
                  <div class="mb-1">
                    <v-icon icon="mdi-calendar-today" size="small" class="mr-1"></v-icon>
                    <v-chip size="x-small" color="primary" variant="tonal" class="font-weight-bold mr-1">{{ item.day_of_week }}</v-chip>
                    {{ item.start_time }} - {{ item.end_time }}
                  </div>
                  <div>
                    <v-icon icon="mdi-account-group" size="small" class="mr-1"></v-icon>
                    {{ item.enrolled_count }} / {{ item.max_students }} alumnos
                    <v-chip
                      v-if="item.enrolled_count >= item.max_students"
                      color="error"
                      size="x-small"
                      variant="flat"
                      class="ml-1"
                    >
                      LLENO
                    </v-chip>
                  </div>
                </v-card-text>

                <v-card-actions class="px-4 pb-3">
                  <v-btn
                    v-if="!item.is_enrolled"
                    color="amber-darken-3"
                    variant="flat"
                    block
                    class="text-none font-weight-bold"
                    prepend-icon="mdi-plus-circle"
                    :disabled="item.enrolled_count >= item.max_students"
                    :loading="enrollingId === item.id"
                    @click="enroll(item.id)"
                  >
                    Inscribirse
                  </v-btn>
                  <v-btn
                    v-else
                    color="grey"
                    variant="tonal"
                    block
                    class="text-none"
                    prepend-icon="mdi-check-circle"
                    disabled
                  >
                    Inscrito
                  </v-btn>
                </v-card-actions>
              </v-card>
            </v-col>
          </v-row>
        </div>

        <!-- TAB 2: MI HORARIO SEMANAL -->
        <div v-if="tab === 'myschedule'">
          <!-- Credits Summary -->
          <div class="d-flex align-center mb-4" v-if="mySchedules.length > 0">
            <v-chip color="amber-darken-3" variant="flat" class="font-weight-bold mr-3">
              <v-icon icon="mdi-star" start></v-icon>
              {{ totalCredits }} créditos inscritos
            </v-chip>
            <v-chip color="info" variant="tonal">
              {{ mySchedules.length }} materias
            </v-chip>
          </div>

          <!-- Empty State -->
          <div v-if="mySchedules.length === 0" class="text-center py-10 text-grey">
            <v-icon icon="mdi-calendar-blank" size="80" class="mb-3"></v-icon>
            <h2 class="text-h5 text-grey-darken-1 mb-2">Tu horario está vacío</h2>
            <p class="text-body-1">
              Dirígete a la pestaña "Oferta Académica" para inscribirte en tus materias.
            </p>
            <v-btn
              color="amber-darken-3"
              variant="flat"
              class="text-none mt-2"
              prepend-icon="mdi-book-open-variant"
              @click="tab = 'catalog'"
            >
              Ver Oferta Académica
            </v-btn>
          </div>

          <!-- Weekly Grid -->
          <v-row v-if="mySchedules.length > 0">
            <v-col
              v-for="day in daysOfWeek"
              :key="day"
              cols="12"
              sm="6"
              md="4"
              lg="2"
            >
              <v-card variant="outlined" class="h-100" rounded="lg">
                <v-card-title class="bg-amber-darken-3 text-white text-center py-2 text-subtitle-2 font-weight-bold">
                  {{ day }}
                </v-card-title>
                <v-divider></v-divider>
                <div class="pa-2">
                  <div v-if="getMyByDay(day).length === 0" class="text-center py-6 text-caption text-grey">
                    Sin clases
                  </div>
                  <v-card
                    v-for="item in getMyByDay(day)"
                    :key="item.id"
                    variant="tonal"
                    color="amber"
                    class="mb-2 pa-2 rounded"
                  >
                    <div class="text-caption font-weight-bold text-amber-darken-4">
                      <v-icon icon="mdi-clock-outline" size="x-small"></v-icon>
                      {{ item.start_time }} - {{ item.end_time }}
                    </div>
                    <div class="text-subtitle-2 font-weight-bold mt-1">{{ item.subject_name }}</div>
                    <div class="text-caption text-grey-darken-2">
                      <v-icon icon="mdi-account-tie" size="x-small"></v-icon>
                      {{ item.teacher_name }}
                    </div>
                    <div class="text-caption text-grey-darken-2">
                      <v-icon icon="mdi-door" size="x-small"></v-icon>
                      {{ item.classroom_name }}
                    </div>
                    <v-btn
                      color="error"
                      variant="text"
                      size="x-small"
                      class="text-none mt-1"
                      prepend-icon="mdi-close-circle"
                      :loading="unenrollingId === item.id"
                      @click="unenroll(item.id)"
                    >
                      Dar de baja
                    </v-btn>
                  </v-card>
                </div>
              </v-card>
            </v-col>
          </v-row>
        </div>
      </v-card-text>
    </v-card>

    <!-- Snackbar -->
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" timeout="3500">
      {{ snackbar.text }}
    </v-snackbar>
  </v-container>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { useAuthStore } from '../stores/auth';
import api from '../api/client';

const authStore = useAuthStore();
const tab = ref('catalog');
const loading = ref(false);
const available = ref([]);
const mySchedules = ref([]);
const conflictError = ref('');
const enrollingId = ref(null);
const unenrollingId = ref(null);
const daysOfWeek = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const snackbar = ref({ show: false, text: '', color: 'success' });

const totalCredits = computed(() => {
  return mySchedules.value.reduce((sum, s) => sum + (s.subject_credits || 0), 0);
});

const activeDays = computed(() => {
  const days = new Set(mySchedules.value.map(s => s.day_of_week));
  return days.size;
});

function getMyByDay(day) {
  return mySchedules.value.filter(s => s.day_of_week === day);
}

async function loadAll() {
  loading.value = true;
  try {
    const [avRes, myRes] = await Promise.all([
      api.get('/schedules/available'),
      api.get('/schedules/student')
    ]);
    available.value = avRes.data;
    mySchedules.value = myRes.data;
  } catch (err) {
    console.error('Error al cargar datos del alumno:', err);
  } finally {
    loading.value = false;
  }
}

async function enroll(scheduleId) {
  conflictError.value = '';
  enrollingId.value = scheduleId;
  try {
    const res = await api.post('/schedules/enroll', { scheduleId });
    snackbar.value = { show: true, text: res.data.message || '¡Inscripción exitosa!', color: 'success' };
    await loadAll();
  } catch (err) {
    const data = err.response?.data;
    if (err.response?.status === 409) {
      conflictError.value = data?.error || 'Conflicto de horario detectado.';
    } else {
      conflictError.value = data?.error || 'Error al inscribirse.';
    }
  } finally {
    enrollingId.value = null;
  }
}

async function unenroll(scheduleId) {
  if (!confirm('¿Seguro que deseas dar de baja esta materia?')) return;
  unenrollingId.value = scheduleId;
  try {
    await api.delete(`/schedules/${scheduleId}/unenroll`);
    snackbar.value = { show: true, text: 'Materia dada de baja correctamente', color: 'info' };
    await loadAll();
  } catch (err) {
    snackbar.value = {
      show: true,
      text: err.response?.data?.error || 'Error al dar de baja',
      color: 'error'
    };
  } finally {
    unenrollingId.value = null;
  }
}

onMounted(loadAll);
</script>
