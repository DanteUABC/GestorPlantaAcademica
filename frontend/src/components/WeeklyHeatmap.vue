<template>
  <v-card elevation="2" rounded="lg" class="pa-4">
    <!-- Header with title & Legend -->
    <div class="d-flex flex-wrap justify-space-between align-center mb-4 ga-3">
      <div>
        <v-card-title class="pa-0 text-h6 font-weight-bold text-primary d-flex align-center">
          <v-icon icon="mdi-grid" class="mr-2"></v-icon>
          Mapa de Calor Semanal de Ocupación
        </v-card-title>
        <v-card-subtitle class="pa-0 mt-1 text-caption text-grey-darken-1">
          Ocupación física de aulas por día y bloque horario. Haz clic en una celda para ver aulas libres.
        </v-card-subtitle>
      </div>

      <!-- Color Legend -->
      <div class="d-flex align-center ga-3 text-caption flex-wrap">
        <div class="d-flex align-center ga-1">
          <span class="legend-color-box rounded bg-green-lighten-4 border"></span>
          <span>0% - 30% (Baja)</span>
        </div>
        <div class="d-flex align-center ga-1">
          <span class="legend-color-box rounded bg-orange-lighten-3 border"></span>
          <span>31% - 75% (Media)</span>
        </div>
        <div class="d-flex align-center ga-1">
          <span class="legend-color-box rounded bg-red-lighten-3 border"></span>
          <span>&gt; 75% (Alta)</span>
        </div>
      </div>
    </div>

    <!-- Table Heatmap Grid -->
    <div class="heatmap-container">
      <v-table density="compact" class="heatmap-table border rounded-lg">
        <thead>
          <tr>
            <th class="text-left font-weight-bold text-uppercase text-caption bg-grey-lighten-4 time-col">
              Horario
            </th>
            <th
              v-for="dia in days"
              :key="dia"
              class="text-center font-weight-bold text-uppercase text-caption bg-grey-lighten-4 day-col"
            >
              {{ dia }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="hour in hours" :key="hour">
            <td class="font-weight-medium text-caption text-grey-darken-2 py-2 time-cell">
              {{ String(hour).padStart(2, '0') }}:00 - {{ String(hour + 1).padStart(2, '0') }}:00
            </td>
            <td
              v-for="dia in days"
              :key="dia"
              class="pa-1 text-center"
            >
              <v-tooltip
                location="top"
                :text="formatTooltip(dia, hour, getCellData(dia, hour))"
              >
                <template #activator="{ props: tooltipProps }">
                  <div
                    v-bind="tooltipProps"
                    class="heatmap-cell rounded d-flex flex-column justify-center align-center py-2 px-1"
                    :class="getCellColorClass(getCellData(dia, hour).porcentaje_ocupacion)"
                    data-testid="heatmap-cell"
                    :data-dia="dia"
                    :data-hour="hour"
                    :data-percentage="getCellData(dia, hour).porcentaje_ocupacion"
                    @click="handleCellClick(dia, hour, getCellData(dia, hour))"
                  >
                    <span class="text-body-2 font-weight-bold">
                      {{ getCellData(dia, hour).porcentaje_ocupacion }}%
                    </span>
                    <span class="text-caption text-grey-darken-3 font-weight-medium" style="font-size: 0.7rem !important;">
                      {{ getCellData(dia, hour).aulas_ocupadas }}/{{ getCellData(dia, hour).aulas_totales }}
                    </span>
                  </div>
                </template>
              </v-tooltip>
            </td>
          </tr>
        </tbody>
      </v-table>
    </div>

    <!-- Navigation Drawer for Available Classrooms -->
    <v-navigation-drawer
      v-model="drawerOpen"
      temporary
      location="right"
      width="400"
      class="elevation-6"
      data-testid="available-classrooms-drawer"
    >
      <div class="pa-4 d-flex justify-space-between align-center border-b">
        <div>
          <div class="text-h6 font-weight-bold text-primary d-flex align-center">
            <v-icon icon="mdi-door-open" class="mr-2" color="primary"></v-icon>
            Aulas Disponibles
          </div>
          <div class="text-caption text-grey-darken-1" v-if="selectedSlot">
            {{ selectedSlot.dia }} &bull; {{ String(selectedSlot.hour).padStart(2, '0') }}:00 - {{ String(selectedSlot.hour + 1).padStart(2, '0') }}:00
          </div>
        </div>
        <v-btn
          icon="mdi-close"
          variant="text"
          density="comfortable"
          data-testid="close-drawer-btn"
          @click="drawerOpen = false"
        ></v-btn>
      </div>

      <v-progress-linear
        v-if="loadingAvailable"
        indeterminate
        color="primary"
        data-testid="drawer-loading-progress"
      ></v-progress-linear>

      <div class="pa-4">
        <!-- Error Alert -->
        <v-alert
          v-if="drawerError"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-3"
          closable
          @click:close="drawerError = ''"
        >
          {{ drawerError }}
        </v-alert>

        <!-- Slot summary banner -->
        <v-card variant="tonal" color="primary" class="pa-3 mb-4" v-if="selectedSlot?.cell">
          <div class="d-flex justify-space-between text-caption">
            <span>Ocupación en este bloque:</span>
            <span class="font-weight-bold">{{ selectedSlot.cell.porcentaje_ocupacion }}%</span>
          </div>
          <div class="d-flex justify-space-between text-caption mt-1">
            <span>Aulas ocupadas:</span>
            <span>{{ selectedSlot.cell.aulas_ocupadas }} de {{ selectedSlot.cell.aulas_totales }}</span>
          </div>
        </v-card>

        <!-- Empty state when no classrooms available -->
        <div
          v-if="!loadingAvailable && availableClassrooms.length === 0 && !drawerError"
          class="text-center py-8 text-grey-darken-1"
          data-testid="no-available-classrooms"
        >
          <v-icon icon="mdi-calendar-remove-outline" size="48" color="grey" class="mb-2"></v-icon>
          <div class="text-subtitle-2 font-weight-medium">No hay aulas disponibles</div>
          <div class="text-caption">Todas las aulas de este bloque se encuentran actualmente ocupadas.</div>
        </div>

        <!-- Available Classrooms List -->
        <v-list
          v-else-if="!loadingAvailable && availableClassrooms.length > 0"
          lines="two"
          class="pa-0"
          data-testid="available-classrooms-list"
        >
          <v-list-item
            v-for="classroom in availableClassrooms"
            :key="classroom.id"
            class="border rounded-lg mb-2 pa-3"
            data-testid="classroom-item"
          >
            <template #prepend>
              <v-avatar color="green-lighten-5" rounded="lg" size="40">
                <v-icon icon="mdi-school-outline" color="success"></v-icon>
              </v-avatar>
            </template>
            <v-list-item-title class="font-weight-bold text-body-1" data-testid="classroom-name">
              {{ classroom.name }}
            </v-list-item-title>
            <v-list-item-subtitle class="text-caption text-grey-darken-1">
              {{ classroom.building || 'Sin edificio' }} &bull; {{ classroom.type || 'Aula' }}
            </v-list-item-subtitle>
            <template #append>
              <v-chip size="small" color="primary" variant="flat" class="font-weight-bold" data-testid="classroom-capacity">
                <v-icon icon="mdi-account-multiple-outline" start size="14"></v-icon>
                {{ classroom.capacity }} asientos
              </v-chip>
            </template>
          </v-list-item>
        </v-list>
      </div>
    </v-navigation-drawer>
  </v-card>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../api/client';

const props = defineProps({
  occupancyData: {
    type: Array,
    default: () => []
  },
  selectedBuilding: {
    type: String,
    default: ''
  }
});

const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const hours = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

const drawerOpen = ref(false);
const loadingAvailable = ref(false);
const availableClassrooms = ref([]);
const drawerError = ref('');
const selectedSlot = ref(null);

function normalizeDay(d) {
  return String(d || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Retorna la información de ocupación para un día y hora dados desde occupancyData.
 */
function getCellData(dia, hour) {
  if (!props.occupancyData || props.occupancyData.length === 0) {
    return {
      dia,
      hora_inicio: hour,
      aulas_ocupadas: 0,
      aulas_totales: 0,
      porcentaje_ocupacion: 0
    };
  }

  const normTarget = normalizeDay(dia);
  const found = props.occupancyData.find(
    item => normalizeDay(item.dia) === normTarget && Number(item.hora_inicio) === Number(hour)
  );

  if (found) {
    return {
      dia: found.dia || dia,
      hora_inicio: Number(found.hora_inicio),
      aulas_ocupadas: Number(found.aulas_ocupadas || 0),
      aulas_totales: Number(found.aulas_totales || 0),
      porcentaje_ocupacion: Number(found.porcentaje_ocupacion || 0)
    };
  }

  // Fallback con aulas_totales si existe en algún otro registro
  const totalAulasRef = Number(props.occupancyData[0]?.aulas_totales || 0);
  return {
    dia,
    hora_inicio: hour,
    aulas_ocupadas: 0,
    aulas_totales: totalAulasRef,
    porcentaje_ocupacion: 0
  };
}

/**
 * Asigna dinámicamente colores de fondo según el porcentaje_ocupacion:
 * - 0% a 30%: bg-green-lighten-4
 * - 31% a 75%: bg-orange-lighten-3
 * - Mayor a 75%: bg-red-lighten-3
 */
function getCellColorClass(percentage) {
  const p = Number(percentage) || 0;
  if (p <= 30) {
    return 'bg-green-lighten-4';
  } else if (p <= 75) {
    return 'bg-orange-lighten-3';
  } else {
    return 'bg-red-lighten-3';
  }
}

/**
 * Formatea el tooltip de la celda según el requerimiento:
 * "[Día] [Hora_Inicio]:00 - [Hora_Fin]:00: [aulas_ocupadas] de [aulas_totales] aulas ocupadas ([porcentaje_ocupacion]%)"
 */
function formatTooltip(dia, hour, cell) {
  const startHour = String(hour).padStart(2, '0');
  const endHour = String(Number(hour) + 1).padStart(2, '0');
  const ocupadas = cell?.aulas_ocupadas ?? 0;
  const totales = cell?.aulas_totales ?? 0;
  const pct = cell?.porcentaje_ocupacion ?? 0;
  return `${dia} ${startHour}:00 - ${endHour}:00: ${ocupadas} de ${totales} aulas ocupadas (${pct}%)`;
}

/**
 * Abre el navigation-drawer lateral y dispara la consulta al endpoint de disponibilidad.
 */
async function handleCellClick(dia, hour, cell) {
  drawerOpen.value = true;
  selectedSlot.value = { dia, hour, cell };
  loadingAvailable.value = true;
  drawerError.value = '';
  availableClassrooms.value = [];

  try {
    const params = {
      dia,
      bloque: hour
    };
    if (props.selectedBuilding && props.selectedBuilding !== 'Todos los Edificios') {
      params.edificio = props.selectedBuilding;
    }

    const response = await api.get('/analytics/available-classrooms', { params });
    availableClassrooms.value = Array.isArray(response?.data) ? response.data : [];
  } catch (err) {
    console.error('Error cargando aulas disponibles:', err);
    drawerError.value = 'No se pudieron cargar las aulas disponibles para este horario.';
  } finally {
    loadingAvailable.value = false;
  }
}

// Re-consultar si cambia el edificio mientras el drawer está abierto
watch(
  () => props.selectedBuilding,
  () => {
    if (drawerOpen.value && selectedSlot.value) {
      handleCellClick(selectedSlot.value.dia, selectedSlot.value.hour, selectedSlot.value.cell);
    }
  }
);

defineExpose({
  days,
  hours,
  drawerOpen,
  selectedSlot,
  availableClassrooms,
  loadingAvailable,
  drawerError,
  getCellData,
  getCellColorClass,
  formatTooltip,
  handleCellClick
});
</script>

<style scoped>
.heatmap-container {
  overflow-x: auto;
}

.heatmap-table {
  min-width: 650px;
}

.time-col {
  width: 140px;
}

.day-col {
  min-width: 90px;
}

.heatmap-cell {
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
  min-height: 48px;
  user-select: none;
}

.heatmap-cell:hover {
  transform: translateY(-2px);
  filter: brightness(0.95);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.12);
}

.legend-color-box {
  display: inline-block;
  width: 16px;
  height: 16px;
}
</style>
