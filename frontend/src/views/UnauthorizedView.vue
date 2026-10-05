<template>
  <v-container class="fill-height justify-center align-center py-10">
    <v-card width="500" elevation="6" rounded="lg" class="pa-6 text-center">
      <v-avatar color="red-lighten-5" size="80" class="mb-4">
        <v-icon icon="mdi-shield-lock" size="48" color="error"></v-icon>
      </v-avatar>

      <h1 class="text-h5 font-weight-bold text-grey-darken-3 mb-2">
        403 - Acceso Denegado
      </h1>

      <p class="text-body-1 text-grey-darken-1 mb-4">
        No tienes los permisos requeridos para acceder a este módulo institucional.
      </p>

      <v-card v-if="authStore.userRole" variant="tonal" color="warning" class="pa-3 mb-6" rounded="md">
        <div class="text-caption font-weight-bold text-uppercase">Tu Rol Actual</div>
        <div class="text-subtitle-1 font-weight-bold">{{ authStore.userRole }}</div>
      </v-card>

      <div class="d-flex flex-column gap-2">
        <v-btn
          color="primary"
          variant="flat"
          size="large"
          class="text-none font-weight-bold mb-2"
          prepend-icon="mdi-arrow-left"
          @click="goBack"
        >
          Volver a mi Panel Principal
        </v-btn>

        <v-btn
          color="grey"
          variant="text"
          class="text-none"
          prepend-icon="mdi-logout"
          @click="handleLogout"
        >
          Cerrar Sesión
        </v-btn>
      </div>
    </v-card>
  </v-container>
</template>

<script setup>
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/authStore';

const router = useRouter();
const authStore = useAuthStore();

function goBack() {
  if (authStore.userRole === 'Coordinador' || authStore.userRole === 'Administrador') {
    router.push('/coordinator');
  } else if (authStore.userRole === 'Profesor') {
    router.push('/teacher');
  } else {
    router.push('/login');
  }
}

function handleLogout() {
  authStore.logout();
  router.push('/login');
}
</script>
