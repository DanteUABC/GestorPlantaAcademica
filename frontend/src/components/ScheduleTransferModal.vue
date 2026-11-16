<template>
  <v-dialog
    :model-value="modelValue"
    max-width="580"
    persistent
    data-testid="schedule-transfer-dialog"
    @update:model-value="handleUpdateModelValue"
  >
    <v-card rounded="lg" elevation="6">
      <v-card-title class="bg-primary text-white pa-4 d-flex justify-space-between align-center">
        <span class="font-weight-bold d-flex align-center">
          <v-icon icon="mdi-account-switch" class="mr-2"></v-icon>
          Reasignación de Horario / Suplencia
        </span>
        <v-btn
          icon="mdi-close"
          variant="text"
          color="white"
          density="compact"
          data-testid="btn-close-transfer"
          :disabled="submitting"
          @click="closeDialog"
        ></v-btn>
      </v-card-title>

      <v-card-text class="pa-5">
        <!-- Resumen del Horario a Reasignar -->
        <div v-if="schedule" class="pa-3 mb-4 rounded bg-blue-lighten-5 border">
          <div class="text-subtitle-2 font-weight-bold text-primary mb-1">
            {{ schedule.subject_name || 'Asignatura' }}
            <span v-if="schedule.subject_code" class="text-caption text-grey-darken-2">
              ({{ schedule.subject_code }})
            </span>
          </div>
          <div class="d-flex flex-wrap ga-2 text-caption text-grey-darken-3">
            <div>
              <v-icon icon="mdi-calendar-clock" size="x-small" class="mr-1 text-primary"></v-icon>
              <strong>{{ schedule.day_of_week }}:</strong> {{ schedule.start_time }} - {{ schedule.end_time }}
            </div>
            <div v-if="schedule.classroom_name">
              <v-icon icon="mdi-door" size="x-small" class="mr-1 text-primary"></v-icon>
              {{ schedule.classroom_name }}
            </div>
            <div>
              <v-icon icon="mdi-account-tie" size="x-small" class="mr-1 text-secondary"></v-icon>
              Docente actual: <strong>{{ schedule.teacher_name || 'Sin docente asignado' }}</strong>
            </div>
          </div>
        </div>

        <!-- Alerta de Error -->
        <v-alert
          v-if="errorMessage"
          type="error"
          variant="tonal"
          density="comfortable"
          class="mb-4"
          closable
          data-testid="transfer-error-alert"
          @click:close="errorMessage = ''"
        >
          <div class="font-weight-bold">Error en la Reasignación</div>
          <div>{{ errorMessage }}</div>
        </v-alert>

        <!-- Indicador de Carga de Suplentes -->
        <div v-if="loadingSubstitutes" class="text-center py-4">
          <v-progress-circular indeterminate color="primary" size="32" class="mb-2"></v-progress-circular>
          <div class="text-caption text-grey">Consultando profesores disponibles sin empalme...</div>
        </div>

        <!-- Formulario de Reasignación -->
        <v-form v-else @submit.prevent="submitTransfer" data-testid="transfer-form">
          <!-- Selector de Suplente Disponible -->
          <v-autocomplete
            v-model="selectedSubstituteId"
            :items="availableSubstitutes"
            item-title="name"
            item-value="id"
            label="Docente Suplente *"
            placeholder="Buscar docente disponible..."
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="mdi-account-tie"
            class="mb-3"
            clearable
            auto-select-first
            :disabled="submitting"
            :rules="[v => !!v || 'Debe seleccionar un docente suplente']"
            no-data-text="No se encontraron profesores disponibles sin empalme para este horario"
            data-testid="select-substitute"
          >
            <template #item="{ props, item }">
              <v-list-item
                v-bind="props"
                :title="formatSubstituteTitle(item.raw)"
                :subtitle="item.raw.email ? `${item.raw.email}${item.raw.identifier ? ' • ID: ' + item.raw.identifier : ''}` : (item.raw.identifier ? 'ID: ' + item.raw.identifier : '')"
              >
                <template #prepend>
                  <v-icon icon="mdi-account-check" class="mr-2 text-success" size="small"></v-icon>
                </template>
              </v-list-item>
            </template>
          </v-autocomplete>

          <!-- Alerta informativa de exceso de carga contractual -->
          <v-alert
            v-if="selectedSubstitute?.will_exceed_contract"
            type="warning"
            variant="tonal"
            icon="mdi-alert-outline"
            class="mt-3 mb-3"
            density="compact"
            data-testid="alert-exceed-contract"
          >
            Atención: Asignar esta suplencia hará que el docente supere sus horas contratadas ({{ selectedSubstitute.horas_contratadas }}h).
          </v-alert>

          <!-- Fecha Efectiva -->
          <v-text-field
            v-model="effectiveDate"
            label="Fecha Efectiva *"
            type="date"
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="mdi-calendar"
            class="mb-3"
            :disabled="submitting"
            :rules="[v => !!v || 'La fecha efectiva es obligatoria']"
            data-testid="input-effective-date"
          ></v-text-field>

          <!-- Motivo de la Suplencia -->
          <v-textarea
            v-model="reason"
            label="Motivo o Justificante (Opcional)"
            placeholder="Ej. Incapacidad médica, comisión académica, relevo institucional..."
            variant="outlined"
            density="comfortable"
            rows="3"
            prepend-inner-icon="mdi-text-box-outline"
            counter="255"
            :disabled="submitting"
            :rules="[v => !v || v.length <= 255 || 'Máximo 255 caracteres']"
            class="mb-2"
            data-testid="input-transfer-reason"
          ></v-textarea>

          <div class="d-flex justify-end ga-2 mt-4">
            <v-btn
              variant="text"
              class="text-none"
              :disabled="submitting"
              data-testid="btn-cancel-transfer"
              @click="closeDialog"
            >
              Cancelar
            </v-btn>
            <v-btn
              type="submit"
              color="primary"
              class="text-none font-weight-bold"
              prepend-icon="mdi-check"
              :loading="submitting"
              :disabled="!isOnline || !selectedSubstituteId || submitting"
              data-testid="btn-confirm-transfer"
            >
              Confirmar Reasignación
              <v-tooltip
                activator="parent"
                location="top"
                :disabled="isOnline"
                text="Se requiere conexión a internet para persistir cambios."
              />
            </v-btn>
          </div>
        </v-form>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { ref, computed, watch } from 'vue';
import api from '../api/client';
import { useNetworkStatus } from '../composables/useNetworkStatus';

const { isOnline } = useNetworkStatus();

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  schedule: {
    type: Object,
    default: null
  }
});

const emit = defineEmits(['update:modelValue', 'transferred']);

const availableSubstitutes = ref([]);
const loadingSubstitutes = ref(false);
const submitting = ref(false);
const selectedSubstituteId = ref(null);
const reason = ref('');
const effectiveDate = ref(new Date().toISOString().split('T')[0]);
const errorMessage = ref('');

const selectedSubstitute = computed(() => {
  if (!selectedSubstituteId.value) return null;
  return availableSubstitutes.value.find(s => s.id === selectedSubstituteId.value) || null;
});

function formatSubstituteTitle(sub) {
  if (!sub) return '';
  const assigned = sub.horas_asignadas ?? 0;
  const contracted = sub.horas_contratadas ?? 25;
  return `${sub.name} - Carga: ${assigned}/${contracted} hrs`;
}

function handleUpdateModelValue(val) {
  emit('update:modelValue', val);
}

function closeDialog() {
  errorMessage.value = '';
  emit('update:modelValue', false);
}

async function fetchAvailableSubstitutes(scheduleId) {
  if (!scheduleId) return;
  loadingSubstitutes.value = true;
  errorMessage.value = '';
  availableSubstitutes.value = [];

  try {
    const res = await api.get(`/schedules/${scheduleId}/available-substitutes`);
    availableSubstitutes.value = Array.isArray(res.data) ? res.data : [];
  } catch (err) {
    errorMessage.value =
      err.response?.data?.error ||
      err.response?.data?.message ||
      'No fue posible consultar los suplentes disponibles.';
  } finally {
    loadingSubstitutes.value = false;
  }
}

watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen && props.schedule?.id) {
      selectedSubstituteId.value = null;
      reason.value = '';
      effectiveDate.value = new Date().toISOString().split('T')[0];
      errorMessage.value = '';
      fetchAvailableSubstitutes(props.schedule.id);
    }
  }
);

async function submitTransfer() {
  if (!isOnline.value) return;
  if (!props.schedule?.id || !selectedSubstituteId.value) return;

  submitting.value = true;
  errorMessage.value = '';

  try {
    const payload = {
      substitute_teacher_id: selectedSubstituteId.value,
      reason: reason.value ? reason.value.trim() : null,
      effective_date: effectiveDate.value || new Date().toISOString().split('T')[0]
    };

    const res = await api.post(`/schedules/${props.schedule.id}/transfer`, payload);
    emit('transferred', {
      scheduleId: props.schedule.id,
      data: res.data
    });
    closeDialog();
  } catch (err) {
    errorMessage.value =
      err.response?.data?.error ||
      err.response?.data?.message ||
      err.message ||
      'Error al registrar la transferencia del horario.';
  } finally {
    submitting.value = false;
  }
}
</script>
