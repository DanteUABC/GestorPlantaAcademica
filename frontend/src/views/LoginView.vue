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
              :rules="[v => !!v || 'El correo es requerido']"
            ></v-text-field>

            <v-text-field
              v-model="loginForm.password"
              label="Contraseña"
              type="password"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-lock-outline"
              class="mb-4"
              :rules="[v => !!v || 'La contraseña es requerida']"
            ></v-text-field>

            <v-btn
              type="submit"
              color="primary"
              block
              size="large"
              class="text-none font-weight-bold"
              :loading="loading"
            >
              Ingresar al Sistema
            </v-btn>
          </v-form>

          <!-- SSO Login Options -->
          <div class="my-4 d-flex align-center">
            <v-divider></v-divider>
            <span class="mx-3 text-caption text-grey">O continúa con SSO Institucional</span>
            <v-divider></v-divider>
          </div>

          <div class="d-flex gap-2">
            <v-btn
              variant="outlined"
              color="grey-darken-3"
              class="flex-grow-1 mr-2 text-none"
              prepend-icon="mdi-google"
              href="/api/auth/google"
            >
              Google
            </v-btn>
            <v-btn
              variant="outlined"
              color="blue-darken-2"
              class="flex-grow-1 text-none"
              prepend-icon="mdi-microsoft"
              href="/api/auth/microsoft"
            >
              Microsoft
            </v-btn>
          </div>
        </v-window-item>

        <!-- TAB 2: REGISTRARSE CON PREGUNTA DE ROL Y DATOS BÁSICOS -->
        <v-window-item value="register">
          <v-form @submit.prevent="handleRegister">
            <!-- Institution -->
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
              :rules="[v => !!v || 'Seleccione la institución']"
            ></v-select>

            <!-- Personal Basic Info -->
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
              label="Nómina o Identificador Docente"
              placeholder="Ej: DOC-101 ó EMP-001"
              variant="outlined"
              density="comfortable"
              prepend-inner-icon="mdi-card-account-details-outline"
              class="mb-2"
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
  </v-container>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '../stores/authStore';
import api from '../api/client';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const tab = ref('login');
const loading = ref(false);
const quickLoading = ref('');
const errorMessage = ref('');
const successMessage = ref('');
const tenants = ref([]);

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
  role_name: 'Profesor'
});

onMounted(async () => {
  // Manejar callback de SSO con token en query params
  if (route.query.token) {
    try {
      authStore._processToken(route.query.token);
      // Si ya tiene rol completo (usuario existente), navegar
      if (authStore.userRole) {
        return await navigateByRole(authStore.userRole);
      } 
      // Si tiene tenant_id (asignado por JIT Provisioning) pero falta el rol, solicitar token final
      else if (authStore.tenantId) {
        const responseData = await authStore.selectTenant(authStore.tenantId);
        // Usar responseData.role si userRole no estuviera seteado, aunque _processToken ya debió hacerlo
        const finalRole = authStore.userRole || responseData.role;
        return await navigateByRole(finalRole);
      } else {
        errorMessage.value = 'El token institucional no tiene una institución asignada.';
      }
    } catch (err) {
      console.error('SSO Error:', err);
      errorMessage.value = 'Error al asignar institución tras SSO: ' + (err.message || 'Fallo desconocido');
    }
  }

  if (route.query.error) {
    errorMessage.value = 'Error durante la autenticación con el proveedor externo';
  }

  try {
    const res = await api.get('/auth/tenants');
    tenants.value = res.data;
    if (tenants.value.length > 0 && !loginForm.value.tenant_id) {
      loginForm.value.tenant_id = tenants.value[0].id;
      registerForm.value.tenant_id = tenants.value[0].id;
    }
  } catch (err) {
    console.error('Error cargando tenants:', err);
  }
});

async function handleLogin() {
  loading.value = true;
  errorMessage.value = '';
  try {
    const user = await authStore.login(loginForm.value.email, loginForm.value.password, loginForm.value.tenant_id);
    await navigateByRole(user.role_name);
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
    setTimeout(async () => {
      await navigateByRole(user.role_name);
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
    await navigateByRole(user.role_name);
  } catch (err) {
    errorMessage.value = err || 'Error en acceso rápido demo';
  } finally {
    quickLoading.value = '';
  }
}

function navigateByRole(role) {
  if (role === 'Coordinador' || role === 'Administrador') {
    return router.push('/coordinator');
  } else if (role === 'Profesor') {
    return router.push('/teacher');
  } else {
    return router.push('/unauthorized');
  }
}
</script>
