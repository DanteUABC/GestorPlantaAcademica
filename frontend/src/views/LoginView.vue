<template>
  <v-container class="fill-height justify-center align-center py-8">
    <v-card width="520" elevation="8" rounded="lg" class="pa-6">
      <!-- Header -->
      <div class="text-center mb-6">
        <v-avatar color="primary" size="64" class="mb-3">
          <v-icon icon="mdi-school" size="36" color="white"></v-icon>
        </v-avatar>
        <h1 class="text-h5 font-weight-bold text-primary">Gestor de Planta Académica</h1>
        <p class="text-body-2 text-grey-darken-1">Plataforma SaaS Multi-tenant para Armado de Horarios</p>
      </div>

      <!-- Quick Demo Access Banner -->
      <v-card variant="tonal" color="primary" class="pa-3 mb-6" rounded="md">
        <div class="text-caption font-weight-bold mb-2 text-uppercase d-flex align-center">
          <v-icon icon="mdi-flash" size="small" class="mr-1"></v-icon>
          Acceso Rápido de Demostración (1 Clic)
        </div>
        <div class="d-flex flex-wrap gap-2">
          <v-btn
            size="small"
            color="purple-accent-4"
            variant="flat"
            class="text-none flex-grow-1 mr-1 mb-1"
            prepend-icon="mdi-account-tie"
            :loading="quickLoading === 'coordinador'"
            @click="demoLogin('coordinador')"
          >
            Coordinador
          </v-btn>
          <v-btn
            size="small"
            color="teal-darken-1"
            variant="flat"
            class="text-none flex-grow-1 mr-1 mb-1"
            prepend-icon="mdi-teach"
            :loading="quickLoading === 'profesor'"
            @click="demoLogin('profesor')"
          >
            Profesor
          </v-btn>
          <v-btn
            size="small"
            color="amber-darken-3"
            variant="flat"
            class="text-none flex-grow-1 mb-1"
            prepend-icon="mdi-account-school"
            :loading="quickLoading === 'alumno'"
            @click="demoLogin('alumno')"
          >
            Alumno
          </v-btn>
        </div>
      </v-card>

      <!-- Alert for error messages -->
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

      <v-alert
        v-if="successMessage"
        type="success"
        variant="tonal"
        closable
        density="compact"
        class="mb-4"
        @click:close="successMessage = ''"
      >
        {{ successMessage }}
      </v-alert>

      <!-- SSO OAuth 2.0 Buttons -->
      <div class="mb-4">
        <v-btn
          block
          variant="outlined"
          color="red-darken-1"
          class="text-none mb-2 font-weight-medium"
          prepend-icon="mdi-google"
          @click="loginGoogle"
        >
          Iniciar sesión con Google
        </v-btn>
        <v-btn
          block
          variant="outlined"
          color="blue-darken-2"
          class="text-none mb-2 font-weight-medium"
          prepend-icon="mdi-microsoft"
          @click="loginMicrosoft"
        >
          Iniciar sesión con Microsoft
        </v-btn>

        <div class="d-flex align-center my-3">
          <v-divider></v-divider>
          <span class="text-caption text-grey mx-3">O ingresa con credenciales</span>
          <v-divider></v-divider>
        </div>
      </div>

      <!-- Tabs between Login and Register -->
      <v-tabs v-model="tab" color="primary" grow class="mb-4">
        <v-tab value="login">Iniciar Sesión</v-tab>
        <v-tab value="register">Crear Cuenta</v-tab>
      </v-tabs>

      <v-window v-model="tab">
        <!-- TAB 1: INICIAR SESIÓN -->
        <v-window-item value="login">
          <v-form @submit.prevent="handleLogin">
            <!-- Institution (Tenant) Selection -->
            <v-select
              v-model="loginForm.tenant_id"
              :items="tenants"
              item-title="name"
              item-value="id"
              label="Institución Educativa (Tenant)"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-domain"
              class="mb-2"
              :rules="[v => !!v || 'Debe seleccionar una institución']"
            ></v-select>

            <v-text-field
              v-model="loginForm.email"
              label="Correo Electrónico"
              type="email"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-email-outline"
              class="mb-2"
              :rules="[v => !!v || 'El correo es obligatorio']"
            ></v-text-field>

            <v-text-field
              v-model="loginForm.password"
              label="Contraseña"
              type="password"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-lock-outline"
              class="mb-4"
              :rules="[v => !!v || 'La contraseña es obligatoria']"
            ></v-text-field>

            <v-btn
              type="submit"
              color="primary"
              block
              size="large"
              class="text-none font-weight-bold"
              :loading="loading"
            >
              Iniciar Sesión
            </v-btn>
          </v-form>
        </v-window-item>

        <!-- TAB 2: CREAR CUENTA -->
        <v-window-item value="register">
          <v-form @submit.prevent="handleRegister">
            <!-- Institution Selection or New -->
            <v-select
              v-model="registerForm.tenant_id"
              :items="tenants"
              item-title="name"
              item-value="id"
              label="Institución Educativa (Tenant)"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-domain"
              class="mb-2"
            ></v-select>

            <v-text-field
              v-model="registerForm.name"
              label="Nombre Completo"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-account-outline"
              class="mb-2"
              :rules="[v => !!v || 'El nombre es obligatorio']"
            ></v-text-field>

            <v-text-field
              v-model="registerForm.identifier"
              label="Matrícula o Nómina"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-card-account-details-outline"
              class="mb-2"
              placeholder="Ej. ALU-2026-99 o DOC-55"
            ></v-text-field>

            <v-text-field
              v-model="registerForm.email"
              label="Correo Electrónico"
              type="email"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-email-outline"
              class="mb-2"
              :rules="[v => !!v || 'El correo es obligatorio']"
            ></v-text-field>

            <v-text-field
              v-model="registerForm.password"
              label="Contraseña"
              type="password"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-lock-outline"
              class="mb-2"
              :rules="[v => !!v || 'La contraseña es obligatoria']"
            ></v-text-field>

            <!-- MANDATORY ROLE QUESTION -->
            <v-card variant="outlined" class="pa-3 mb-4 bg-grey-lighten-5">
              <div class="text-subtitle-2 font-weight-bold mb-1 text-primary">
                ¿Cuál es tu rol en la institución? *
              </div>
              <div class="text-caption text-grey-darken-1 mb-2">
                Selecciona la función que desempeñarás en el sistema:
              </div>
              <v-radio-group v-model="registerForm.role_name" inline hide-details>
                <v-radio label="Coordinador" value="Coordinador" color="purple-accent-4"></v-radio>
                <v-radio label="Profesor" value="Profesor" color="teal-darken-1"></v-radio>
                <v-radio label="Alumno" value="Alumno" color="amber-darken-3"></v-radio>
              </v-radio-group>
            </v-card>

            <v-btn
              type="submit"
              color="success"
              block
              size="large"
              class="text-none font-weight-bold"
              :loading="loading"
            >
              Completar Registro
            </v-btn>
          </v-form>
        </v-window-item>
      </v-window>
    </v-card>

    <!-- Modal para Selección de Tenant Post-OAuth (Fase 2 Handshake) -->
    <v-dialog v-model="showTenantModal" persistent max-width="460">
      <v-card class="pa-4 rounded-lg">
        <v-card-title class="text-h6 font-weight-bold text-primary d-flex align-center">
          <v-icon icon="mdi-shield-check" color="success" class="mr-2"></v-icon>
          Selecciona tu Institución
        </v-card-title>
        <v-card-text>
          <p class="text-body-2 text-grey-darken-1 mb-4">
            Autenticación completada. Selecciona la institución educativa a la que deseas acceder:
          </p>
          <v-select
            v-model="selectedTenantId"
            :items="tenants"
            item-title="name"
            item-value="id"
            label="Institución Educativa (Tenant)"
            variant="outlined"
            density="comfortable"
            prepend-inner-icon="mdi-domain"
          ></v-select>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn
            color="primary"
            variant="flat"
            :loading="tenantLoading"
            :disabled="!selectedTenantId"
            @click="confirmTenantSelection"
          >
            Ingresar al Sistema
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/authStore';
import api from '../api/client';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const tab = ref('login');
const loading = ref(false);
const quickLoading = ref('');
const errorMessage = ref('');
const successMessage = ref('');
const tenants = ref([]);

const showTenantModal = ref(false);
const selectedTenantId = ref('');
const identityToken = ref('');
const tenantLoading = ref(false);

const loginForm = ref({
  tenant_id: 'tenant-itc',
  email: 'coordinador@itc.edu',
  password: 'demo123'
});

const registerForm = ref({
  tenant_id: 'tenant-itc',
  name: '',
  identifier: '',
  email: '',
  password: '',
  role_name: 'Alumno'
});

async function fetchTenants() {
  try {
    const res = await api.get('/auth/tenants');
    tenants.value = res.data;
    if (tenants.value.length > 0) {
      if (!loginForm.value.tenant_id) loginForm.value.tenant_id = tenants.value[0].id;
      if (!registerForm.value.tenant_id) registerForm.value.tenant_id = tenants.value[0].id;
      if (!selectedTenantId.value) selectedTenantId.value = tenants.value[0].id;
    }
  } catch (err) {
    console.error('Error cargando tenants:', err);
  }
}

onMounted(async () => {
  await fetchTenants();

  const tokenUrl = route.query.token;
  if (tokenUrl) {
    // El usuario viene de Google/Microsoft con un Identity Token
    identityToken.value = tokenUrl;
    showTenantModal.value = true;
    // Limpiar URL para no dejar el token expuesto
    router.replace({ query: {} });
  } else {
    // Intento de silent refresh en recarga de página (F5)
    try {
      await authStore.silentRefresh();
      navigateByRole(authStore.userRole);
    } catch (e) {
      // No hay cookie activa, mostrar formulario de login
    }
  }
});

const loginGoogle = () => {
  const baseUrl = import.meta.env.VITE_API_URL || '';
  window.location.href = `${baseUrl}/api/auth/google`;
};

const loginMicrosoft = () => {
  const baseUrl = import.meta.env.VITE_API_URL || '';
  window.location.href = `${baseUrl}/api/auth/microsoft`;
};

async function confirmTenantSelection() {
  if (!selectedTenantId.value || !identityToken.value) return;
  tenantLoading.value = true;
  errorMessage.value = '';
  try {
    const user = await authStore.selectTenant(selectedTenantId.value, identityToken.value);
    showTenantModal.value = false;
    navigateByRole(user?.role_name || authStore.userRole);
  } catch (err) {
    errorMessage.value = err || 'Error al vincular con la institución';
  } finally {
    tenantLoading.value = false;
  }
}

async function handleLogin() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const user = await authStore.login(loginForm.value.email, loginForm.value.password, loginForm.value.tenant_id);
    navigateByRole(user.role_name);
  } catch (err) {
    errorMessage.value = err || 'Error al iniciar sesión';
  } finally {
    loading.value = false;
  }
}

async function handleRegister() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const user = await authStore.register(registerForm.value);
    successMessage.value = '¡Cuenta creada con éxito! Redirigiendo...';
    setTimeout(() => {
      navigateByRole(user.role_name);
    }, 1000);
  } catch (err) {
    errorMessage.value = err || 'Error al registrar usuario';
  } finally {
    loading.value = false;
  }
}

async function demoLogin(role) {
  quickLoading.value = role;
  errorMessage.value = '';
  try {
    const user = await authStore.quickLogin(role);
    navigateByRole(user.role_name);
  } catch (err) {
    errorMessage.value = err || 'Error en acceso rápido demo';
  } finally {
    quickLoading.value = '';
  }
}

function navigateByRole(role) {
  if (role === 'Coordinador' || role === 'Administrador') {
    router.push('/coordinador');
  } else if (role === 'Profesor') {
    router.push('/profesor');
  } else if (role === 'Alumno') {
    router.push('/alumno');
  } else {
    router.push('/dashboard');
  }
}
</script>
