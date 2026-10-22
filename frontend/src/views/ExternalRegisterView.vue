<template>
  <v-container class="fill-height justify-center align-center py-8">
    <v-card width="520" max-width="95vw" elevation="8" rounded="lg" class="pa-6 my-auto" style="position: relative; z-index: 2; pointer-events: auto;">
      <div class="text-center mb-6">
        <v-avatar color="primary" size="64" class="mb-3">
          <v-icon icon="mdi-account-plus" size="36" color="white"></v-icon>
        </v-avatar>
        <v-card-title class="text-h5 font-weight-bold text-primary pa-0">Completar Registro</v-card-title>
        <p class="text-body-2 text-grey-darken-1 mt-1">Vinculación de cuenta mediante autenticación externa</p>
      </div>

      <v-card-text class="pa-0">
        <v-alert
          type="info"
          variant="tonal"
          density="comfortable"
          class="mb-4"
          icon="mdi-shield-check"
        >
          Tu correo externo <strong>{{ email }}</strong> ha sido verificado. Por favor, completa tus datos institucionales.
        </v-alert>

        <v-alert
          v-if="errorMessage"
          type="error"
          variant="tonal"
          closable
          density="compact"
          class="mb-4"
          @click:close="errorMessage = ''"
        >
          {{ errorMessage }}
        </v-alert>

        <v-form ref="formRef" @submit.prevent="submitRegistration" v-model="isFormValid">
          <!-- Nombre(s) -->
          <v-text-field
            ref="nombreInputRef"
            v-model="nombre"
            label="Nombre(s)"
            placeholder="Ej. Juan"
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="mdi-account-outline"
            class="mb-2"
            validate-on="blur lazy"
            :rules="[v => !!v || 'El nombre es obligatorio']"
            required
            autofocus
          ></v-text-field>

          <!-- Apellidos -->
          <v-text-field
            v-model="apellidos"
            label="Apellidos"
            placeholder="Ej. Pérez"
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="mdi-account-details-outline"
            class="mb-2"
            validate-on="blur lazy"
            :rules="[v => !!v || 'Los apellidos son obligatorios']"
            required
          ></v-text-field>

          <!-- Selectores para Rol y Tenant -->
          <v-select
            v-model="rol_id"
            :items="roles"
            item-title="title"
            item-value="value"
            label="Selecciona tu Rol"
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="mdi-badge-account-horizontal-outline"
            class="mb-2"
            :rules="[v => !!v || 'Debe seleccionar un rol']"
            required
          ></v-select>

          <!-- Institución / Tenant -->
          <v-select
            v-model="tenant_id"
            :items="tenants"
            item-title="name"
            item-value="id"
            label="Institución Educativa (Tenant)"
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="mdi-domain"
            class="mb-4"
            :rules="[v => !!v || 'Seleccione la institución']"
            required
          ></v-select>

          <v-btn
            type="submit"
            color="primary"
            block
            size="large"
            class="text-none font-weight-bold"
            :loading="loading"
          >
            Completar Registro
          </v-btn>
        </v-form>
      </v-card-text>
    </v-card>
  </v-container>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/authStore';
import api from '../api/client';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const formRef = ref(null);
const nombreInputRef = ref(null);

const email = ref('');
const regToken = ref('');
const nombre = ref('');
const apellidos = ref('');
const rol_id = ref(2); // Por defecto Profesor
const tenant_id = ref('tenant-itc');
const tenants = ref([
  { id: 'tenant-itc', name: 'Instituto Tecnológico Central' },
  { id: 'tenant-upn', name: 'Universidad Politécnica del Norte' }
]);
const roles = [{ title: 'Profesor', value: 2 }, { title: 'Coordinador', value: 1 }];

const isFormValid = ref(null);
const loading = ref(false);
const errorMessage = ref('');

onMounted(async () => {
    email.value = route.query.email || '';
    regToken.value = route.query.token || '';
    if (!regToken.value) {
      router.push('/login'); // Redirigir si no hay token de seguridad
      return;
    }

    try {
      const res = await api.get('/auth/tenants');
      if (res.data && res.data.length > 0) {
        tenants.value = res.data;
        tenant_id.value = tenants.value[0].id;
      }
    } catch (e) {
      // Usar tenant por defecto si la llamada falla
      tenant_id.value = 'tenant-itc';
    }

    await nextTick();
    setTimeout(() => {
      if (nombreInputRef.value) {
        if (typeof nombreInputRef.value.focus === 'function') {
          nombreInputRef.value.focus();
        } else if (nombreInputRef.value.$el) {
          const inputEl = nombreInputRef.value.$el.querySelector('input');
          if (inputEl) inputEl.focus();
        }
      }
    }, 100);
});

const submitRegistration = async () => {
    if (formRef.value && typeof formRef.value.validate === 'function') {
      const { valid } = await formRef.value.validate();
      if (!valid) return;
    } else {
      if (!nombre.value || !apellidos.value || !rol_id.value || !tenant_id.value) {
        return;
      }
    }

    loading.value = true;
    errorMessage.value = '';

    try {
      await authStore.completeExternalRegistration({
          token: regToken.value,
          nombre: nombre.value,
          apellidos: apellidos.value,
          rol_id: rol_id.value,
          tenant_id: tenant_id.value || 1
      });

      if (rol_id.value === 1 || authStore.isCoordinator || authStore.userRole === 'role-coord' || authStore.userRole === 'Coordinador' || authStore.userRole === 'Administrador') {
        router.push('/coordinator');
      } else {
        router.push('/teacher');
      }
    } catch (err) {
      errorMessage.value = typeof err === 'string' ? err : (err?.message || 'Error al completar el registro');
    } finally {
      loading.value = false;
    }
};

defineExpose({
  submitRegistration,
  nombre,
  apellidos,
  rol_id,
  tenant_id,
  email,
  regToken,
  formRef,
  nombreInputRef
});
</script>
