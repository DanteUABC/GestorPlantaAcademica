<template>
  <v-container fluid class="pa-6">
    <!-- Top Control Bar -->
    <div class="d-flex flex-wrap justify-space-between align-center mb-6 ga-4">
      <div>
        <h1 class="text-h4 font-weight-bold text-primary mb-1 d-flex align-center">
          <v-icon icon="mdi-chart-box-outline" class="mr-2"></v-icon>
          Tablero de Control Directivo
        </h1>
        <p class="text-body-1 text-grey-darken-1 mb-0">
          Analítica Operativa &bull; {{ authStore.tenantName }} &bull; Ocupación física de aulas y balance docente
        </p>
      </div>

      <!-- Control Bar with v-select filter and manual reload v-btn -->
      <div class="d-flex flex-wrap align-center ga-3">
        <v-select
          v-model="selectedBuilding"
          :items="buildingOptions"
          label="Edificio/Instalación"
          density="comfortable"
          variant="outlined"
          hide-details
          style="min-width: 250px;"
          prepend-inner-icon="mdi-office-building-marker-outline"
        ></v-select>

        <v-btn
          color="primary"
          variant="flat"
          prepend-icon="mdi-refresh"
          class="text-none font-weight-bold"
          :loading="loading"
          @click="loadAnalytics"
        >
          Actualizar Métricas
        </v-btn>

        <v-btn
          variant="outlined"
          color="grey-darken-2"
          prepend-icon="mdi-calendar-clock"
          class="text-none"
          to="/coordinator"
        >
          Armado de Horarios
        </v-btn>
      </div>
    </div>

    <!-- Error Alert -->
    <v-alert
      v-if="errorMessage"
      type="error"
      variant="tonal"
      closable
      density="comfortable"
      class="mb-6"
      @click:close="errorMessage = ''"
    >
      {{ errorMessage }}
    </v-alert>

    <!-- Loading Skeleton/Circular indicator -->
    <div v-if="loading" class="d-flex justify-center align-center py-12" data-testid="loading-indicator">
      <v-progress-circular indeterminate color="primary" size="64" width="6"></v-progress-circular>
    </div>

    <div v-else>
      <!-- Cuadrícula con 4 Tarjetas de Métricas (KPIs) -->
      <v-row class="mb-6">
        <!-- KPI 1: Tasa General de Ocupación Física (%) -->
        <v-col cols="12" sm="6" md="3">
          <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-primary h-100">
            <div class="d-flex justify-space-between align-start">
              <div>
                <div class="text-caption text-grey font-weight-bold text-uppercase">
                  Tasa General de Ocupación
                </div>
                <div class="text-h4 font-weight-bold text-primary mt-1" data-testid="kpi-tasa-ocupacion">
                  {{ tasaGeneralOcupacion }}%
                </div>
                <div class="text-caption text-grey-darken-1 mt-1">
                  Promedio de ocupación física
                </div>
              </div>
              <v-avatar color="blue-lighten-5" rounded="lg" size="44">
                <v-icon icon="mdi-percent" color="primary"></v-icon>
              </v-avatar>
            </div>
          </v-card>
        </v-col>

        <!-- KPI 2: Aulas con Ocupación Crítica (>90%) -->
        <v-col cols="12" sm="6" md="3">
          <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-error h-100">
            <div class="d-flex justify-space-between align-start">
              <div>
                <div class="text-caption text-grey font-weight-bold text-uppercase">
                  Aulas con Ocupación Crítica
                </div>
                <div class="text-h4 font-weight-bold text-error mt-1" data-testid="kpi-ocupacion-critica">
                  {{ ocupacionCritica }}
                </div>
                <div class="text-caption text-grey-darken-1 mt-1">
                  Bloques con ocupación > 90%
                </div>
              </div>
              <v-avatar color="red-lighten-5" rounded="lg" size="44">
                <v-icon icon="mdi-alert-circle-outline" color="error"></v-icon>
              </v-avatar>
            </div>
          </v-card>
        </v-col>

        <!-- KPI 3: Profesores Subutilizados (<10h) -->
        <v-col cols="12" sm="6" md="3">
          <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-warning h-100">
            <div class="d-flex justify-space-between align-start">
              <div>
                <div class="text-caption text-grey font-weight-bold text-uppercase">
                  Profesores Subutilizados
                </div>
                <div class="text-h4 font-weight-bold text-amber-darken-3 mt-1" data-testid="kpi-profesores-subutilizados">
                  {{ profesoresSubutilizados }}
                </div>
                <div class="text-caption text-grey-darken-1 mt-1">
                  Con menos de 10 horas asignadas
                </div>
              </div>
              <v-avatar color="amber-lighten-5" rounded="lg" size="44">
                <v-icon icon="mdi-account-alert-outline" color="amber-darken-3"></v-icon>
              </v-avatar>
            </div>
          </v-card>
        </v-col>

        <!-- KPI 4: Horas Libres Totales -->
        <v-col cols="12" sm="6" md="3">
          <v-card elevation="2" rounded="lg" class="pa-4 border-s-lg border-success h-100">
            <div class="d-flex justify-space-between align-start">
              <div>
                <div class="text-caption text-grey font-weight-bold text-uppercase">
                  Horas Libres Totales
                </div>
                <div class="text-h4 font-weight-bold text-success mt-1" data-testid="kpi-horas-libres">
                  {{ horasLibresTotales }}
                </div>
                <div class="text-caption text-grey-darken-1 mt-1">
                  Capacidad neta disponible
                </div>
              </div>
              <v-avatar color="green-lighten-5" rounded="lg" size="44">
                <v-icon icon="mdi-clock-check-outline" color="success"></v-icon>
              </v-avatar>
            </div>
          </v-card>
        </v-col>
      </v-row>

      <!-- Mapa de Calor Semanal (Heatmap de Ocupación Física) -->
      <v-row class="mb-6">
        <v-col cols="12">
          <WeeklyHeatmap
            :occupancy-data="occupancyData"
            :selected-building="selectedBuilding"
          />
        </v-col>
      </v-row>

      <!-- Sección Informativa Complementaria -->
      <v-row class="mb-6">
        <!-- Resumen de Balance Docente -->
        <v-col cols="12" md="6">
          <v-card elevation="2" rounded="lg" class="pa-4 h-100">
            <v-card-title class="pa-0 mb-3 text-subtitle-1 font-weight-bold d-flex align-center">
              <v-icon icon="mdi-account-group-outline" class="mr-2" color="primary"></v-icon>
              Distribución de la Planta Docente
            </v-card-title>
            <v-divider class="mb-4"></v-divider>

            <v-list density="compact" class="pa-0">
              <v-list-item class="px-0">
                <template #prepend>
                  <v-icon icon="mdi-check-circle-outline" color="success" class="mr-2"></v-icon>
                </template>
                <v-list-item-title class="font-weight-medium">Carga Óptima (10 a 40 horas)</v-list-item-title>
                <template #append>
                  <v-chip color="success" size="small" class="font-weight-bold">
                    {{ teacherUtilization?.profesores_optimos || 0 }} profesores
                  </v-chip>
                </template>
              </v-list-item>

              <v-list-item class="px-0">
                <template #prepend>
                  <v-icon icon="mdi-alert-outline" color="amber-darken-3" class="mr-2"></v-icon>
                </template>
                <v-list-item-title class="font-weight-medium">Subutilizados (&lt; 10 horas)</v-list-item-title>
                <template #append>
                  <v-chip color="warning" size="small" class="font-weight-bold">
                    {{ teacherUtilization?.profesores_subutilizados || 0 }} profesores
                  </v-chip>
                </template>
              </v-list-item>

              <v-list-item class="px-0">
                <template #prepend>
                  <v-icon icon="mdi-alert-octagon-outline" color="error" class="mr-2"></v-icon>
                </template>
                <v-list-item-title class="font-weight-medium">Sobrecupo (&gt; 40 horas)</v-list-item-title>
                <template #append>
                  <v-chip color="error" size="small" class="font-weight-bold">
                    {{ teacherUtilization?.profesores_sobrecupo || 0 }} profesores
                  </v-chip>
                </template>
              </v-list-item>

              <v-divider class="my-2"></v-divider>

              <v-list-item class="px-0">
                <template #prepend>
                  <v-icon icon="mdi-account-details-outline" color="primary" class="mr-2"></v-icon>
                </template>
                <v-list-item-title class="font-weight-bold">Total Docentes Registrados</v-list-item-title>
                <template #append>
                  <v-chip color="primary" size="small" class="font-weight-bold">
                    {{ teacherUtilization?.total_profesores || 0 }} profesores
                  </v-chip>
                </template>
              </v-list-item>
            </v-list>
          </v-card>
        </v-col>

        <!-- Síntesis de Ocupación de Espacios Físicos -->
        <v-col cols="12" md="6">
          <v-card elevation="2" rounded="lg" class="pa-4 h-100">
            <v-card-title class="pa-0 mb-3 text-subtitle-1 font-weight-bold d-flex align-center">
              <v-icon icon="mdi-domain" class="mr-2" color="secondary"></v-icon>
              Resumen de Infraestructura y Aulas
            </v-card-title>
            <v-divider class="mb-4"></v-divider>

            <div class="text-body-2 text-grey-darken-1 mb-3">
              Mapeo de disponibilidad en franjas operativas semanales (Lunes a Sábado, de 7:00 a 20:00 hrs):
            </div>

            <v-row dense class="text-center">
              <v-col cols="4">
                <v-card variant="tonal" color="primary" class="pa-3">
                  <div class="text-h6 font-weight-bold">{{ totalBloquesSemana }}</div>
                  <div class="text-caption">Bloques Semanales</div>
                </v-card>
              </v-col>
              <v-col cols="4">
                <v-card variant="tonal" color="teal" class="pa-3">
                  <div class="text-h6 font-weight-bold">{{ totalAulasActivas }}</div>
                  <div class="text-caption">Aulas Registradas</div>
                </v-card>
              </v-col>
              <v-col cols="4">
                <v-card variant="tonal" :color="ocupacionCritica > 0 ? 'error' : 'success'" class="pa-3">
                  <div class="text-h6 font-weight-bold">{{ ocupacionCritica }}</div>
                  <div class="text-caption">Horas Críticas</div>
                </v-card>
              </v-col>
            </v-row>
          </v-card>
        </v-col>
      </v-row>
    </div>
  </v-container>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { useAuthStore } from '../stores/authStore';
import api from '../api/client';
import WeeklyHeatmap from '../components/WeeklyHeatmap.vue';

const authStore = useAuthStore();

const loading = ref(false);
const errorMessage = ref('');

const occupancyData = ref([]);
const teacherUtilization = ref({
  total_profesores: 0,
  profesores_optimos: 0,
  profesores_subutilizados: 0,
  profesores_sobrecupo: 0
});

const selectedBuilding = ref('Todos los Edificios');
const availableBuildings = ref([]);

const buildingOptions = computed(() => {
  return ['Todos los Edificios', ...availableBuildings.value];
});

// 1. Tasa General de Ocupación Física (%) -> Promedio derivado del arreglo devuelto por /classroom-occupancy
const tasaGeneralOcupacion = computed(() => {
  if (!occupancyData.value || occupancyData.value.length === 0) return 0;
  const sum = occupancyData.value.reduce((acc, curr) => acc + Number(curr.porcentaje_ocupacion || 0), 0);
  const avg = sum / occupancyData.value.length;
  return Number(avg.toFixed(1));
});

// 2. Aulas con Ocupación Crítica -> Conteo de bloques donde el porcentaje_ocupacion > 90%
const ocupacionCritica = computed(() => {
  if (!occupancyData.value || occupancyData.value.length === 0) return 0;
  return occupancyData.value.filter(item => Number(item.porcentaje_ocupacion || 0) > 90).length;
});

// 3. Profesores Subutilizados -> Valor directo de profesores_subutilizados devuelto por /teacher-utilization
const profesoresSubutilizados = computed(() => {
  return Number(teacherUtilization.value?.profesores_subutilizados || 0);
});

// 4. Horas Libres Totales -> Capacidad total (aulas totales * bloques) menos las aulas ocupadas
const horasLibresTotales = computed(() => {
  if (!occupancyData.value || occupancyData.value.length === 0) return 0;
  const totalCapacidad = occupancyData.value.reduce((acc, curr) => acc + Number(curr.aulas_totales || 0), 0);
  const totalOcupadas = occupancyData.value.reduce((acc, curr) => acc + Number(curr.aulas_ocupadas || 0), 0);
  return Math.max(0, totalCapacidad - totalOcupadas);
});

const totalBloquesSemana = computed(() => occupancyData.value.length);
const totalAulasActivas = computed(() => {
  if (!occupancyData.value || occupancyData.value.length === 0) return 0;
  return Number(occupancyData.value[0]?.aulas_totales || 0);
});

const loadAnalytics = async () => {
  loading.value = true;
  errorMessage.value = '';

  try {
    const isFiltered = selectedBuilding.value && selectedBuilding.value !== 'Todos los Edificios';
    const occupancyUrl = isFiltered 
      ? `/analytics/classroom-occupancy?edificio=${encodeURIComponent(selectedBuilding.value)}`
      : '/analytics/classroom-occupancy';
    const teacherUrl = isFiltered 
      ? `/analytics/teacher-utilization?edificio=${encodeURIComponent(selectedBuilding.value)}`
      : '/analytics/teacher-utilization';

    const [occupancyRes, teacherRes, classroomsRes] = await Promise.all([
      api.get(occupancyUrl),
      api.get(teacherUrl),
      api.get('/classrooms').catch(() => ({ data: [] }))
    ]);

    occupancyData.value = Array.isArray(occupancyRes?.data) ? occupancyRes.data : [];
    teacherUtilization.value = teacherRes?.data || {
      total_profesores: 0,
      profesores_optimos: 0,
      profesores_subutilizados: 0,
      profesores_sobrecupo: 0
    };

    if (Array.isArray(classroomsRes?.data) && classroomsRes.data.length > 0) {
      const buildings = [...new Set(classroomsRes.data.map(c => c.building).filter(Boolean))];
      availableBuildings.value = buildings.sort();
    }
  } catch (err) {
    console.error('Error cargando analítica:', err);
    errorMessage.value = 'No se pudieron cargar los datos analíticos. Por favor, intenta de nuevo.';
  } finally {
    loading.value = false;
  }
};

// Observador reactivo sobre el selector de Edificio/Instalación
watch(selectedBuilding, () => {
  loadAnalytics();
});

onMounted(() => {
  loadAnalytics();
});

defineExpose({
  loadAnalytics,
  occupancyData,
  teacherUtilization,
  tasaGeneralOcupacion,
  ocupacionCritica,
  profesoresSubutilizados,
  horasLibresTotales,
  selectedBuilding,
  buildingOptions,
  loading
});
</script>
