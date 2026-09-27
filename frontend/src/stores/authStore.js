import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

export const useAuthStore = defineStore('auth', () => {
  // Estado reactivo
  const token = ref(localStorage.getItem('auth_token') || null);
  const tenant_id = ref(localStorage.getItem('tenant_id') || null);
  const userProfile = ref(
    localStorage.getItem('user_profile')
      ? JSON.parse(localStorage.getItem('user_profile'))
      : null
  );
  const loading = ref(false);
  const error = ref(null);

  // Getters
  const isAuthenticated = computed(() => !!token.value);
  const userRole = computed(() => userProfile.value?.role || null);

  // Acciones
  async function login(credentials) {
    loading.value = true;
    error.value = null;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(credentials.tenant_id ? { 'x-tenant-id': String(credentials.tenant_id) } : {})
        },
        body: JSON.stringify(credentials)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Error en autenticación');
      }

      const receivedToken = data.token || data.data?.token;
      const receivedUser = data.user || data.data?.user;
      const receivedTenantId = data.tenant_id || data.data?.tenant_id || receivedUser?.tenant_id || credentials.tenant_id;

      token.value = receivedToken;
      userProfile.value = receivedUser;
      tenant_id.value = receivedTenantId ? String(receivedTenantId) : null;

      localStorage.setItem('auth_token', token.value);
      if (tenant_id.value) {
        localStorage.setItem('tenant_id', tenant_id.value);
      }
      if (userProfile.value) {
        localStorage.setItem('user_profile', JSON.stringify(userProfile.value));
      }

      return { success: true, user: userProfile.value };
    } catch (err) {
      error.value = err.message;
      return { success: false, error: err.message };
    } finally {
      loading.value = false;
    }
  }

  function logout() {
    token.value = null;
    tenant_id.value = null;
    userProfile.value = null;
    error.value = null;

    localStorage.removeItem('auth_token');
    localStorage.removeItem('tenant_id');
    localStorage.removeItem('user_profile');
  }

  return {
    token,
    tenant_id,
    userProfile,
    loading,
    error,
    isAuthenticated,
    userRole,
    login,
    logout
  };
});
