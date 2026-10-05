<template>
  <v-app>
    <!-- Top Navigation Bar (Visible when authenticated) -->
    <v-app-bar
      v-if="authStore.isAuthenticated"
      color="primary"
      density="comfortable"
      elevation="2"
    >
      <v-app-bar-title class="font-weight-bold d-flex align-center">
        <v-icon icon="mdi-school" class="mr-2"></v-icon>
        Gestor de Planta Académica
      </v-app-bar-title>

      <!-- Tenant Info Chip -->
      <v-chip
        color="secondary"
        variant="elevated"
        class="mr-3 font-weight-medium"
        prepend-icon="mdi-domain"
      >
        {{ authStore.tenantName }}
      </v-chip>

      <v-spacer></v-spacer>

      <!-- Role Switcher for Rapid Prototype Testing -->
      <v-menu>
        <template #activator="{ props }">
          <v-btn
            v-bind="props"
            variant="outlined"
            color="white"
            class="mr-3 text-none"
            prepend-icon="mdi-swap-horizontal-bold"
          >
            Cambiar Rol Rápido
          </v-btn>
        </template>
        <v-list density="compact" elevation="4">
          <v-list-subheader>PROBAR OTRO ROL DEMO</v-list-subheader>
          <v-list-item
            prepend-icon="mdi-account-tie"
            title="Dr. Mendoza (Coordinador)"
            subtitle="Armado y gestión de horarios"
            @click="switchRole('coordinador')"
          ></v-list-item>
          <v-list-item
            prepend-icon="mdi-teach"
            title="Mtra. Elena (Profesora)"
            subtitle="Consulta de carga horaria"
            @click="switchRole('profesor')"
          ></v-list-item>
        </v-list>
      </v-menu>

      <!-- User Profile & Role Info -->
      <div class="d-flex align-center mr-4">
        <div class="text-right mr-2 d-none d-sm-block">
          <div class="text-subtitle-2 font-weight-bold">{{ authStore.user?.name }}</div>
          <div class="text-caption text-blue-lighten-4">{{ authStore.user?.email }}</div>
        </div>
        <v-chip
          :color="getRoleColor(authStore.userRole)"
          variant="flat"
          class="font-weight-bold"
          size="small"
        >
          {{ authStore.userRole }}
        </v-chip>
      </div>

      <!-- Logout Button -->
      <v-btn
        icon="mdi-logout"
        variant="text"
        color="white"
        title="Cerrar Sesión"
        @click="handleLogout"
      ></v-btn>
    </v-app-bar>

    <!-- Main Application View -->
    <v-main class="bg-grey-lighten-4">
      <router-view />
    </v-main>

    <!-- Footer -->
    <v-footer app border class="text-center d-flex justify-center text-caption text-grey-darken-1 py-1">
      <span>Gestor de Planta Académica SaaS Multi-tenant &copy; 2026 — Modelo "Shared Database, Shared Schema"</span>
    </v-footer>
  </v-app>
</template>

<script setup>
import { useAuthStore } from './stores/auth';
import { useRouter } from 'vue-router';

const authStore = useAuthStore();
const router = useRouter();

function getRoleColor(role) {
  switch (role) {
    case 'Coordinador':
    case 'Administrador':
      return 'purple-accent-3';
    case 'Profesor':
      return 'teal-darken-1';
    default:
      return 'grey';
  }
}

async function switchRole(roleName) {
  try {
    await authStore.quickLogin(roleName);
    if (roleName === 'coordinador') router.push('/coordinador');
    else if (roleName === 'profesor') router.push('/profesor');
  } catch (err) {
    console.error('Error switching role:', err);
  }
}

function handleLogout() {
  authStore.logout();
  router.push('/login');
}
</script>

<style>
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  margin: 0;
  padding: 0;
}
</style>
