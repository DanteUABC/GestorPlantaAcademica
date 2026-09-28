import axios from 'axios';
import { useAuthStore } from '../stores/authStore';

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true // CRÍTICO: Permite enviar/recibir la cookie HttpOnly del refresh token
});

// Interceptor para inyectar el Access Token de la memoria
apiClient.interceptors.request.use(config => {
  const authStore = useAuthStore();
  if (authStore.accessToken) {
    config.headers.Authorization = `Bearer ${authStore.accessToken}`;
    if (authStore.tenantId) {
      config.headers['X-Tenant-Id'] = authStore.tenantId; // Soporte explícito multi-tenant
    }
  }
  return config;
});

// Interceptor de respuesta para manejar expiración (401) y refrescar token
apiClient.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    const isAuthEndpoint = originalRequest.url?.includes('/auth/refresh') ||
                           originalRequest.url?.includes('/auth/login') ||
                           originalRequest.url?.includes('/auth/select-tenant');

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint) {
      originalRequest._retry = true;
      const authStore = useAuthStore();
      try {
        await authStore.silentRefresh();
        // Actualizar header de la petición original con el nuevo token
        if (authStore.accessToken) {
          originalRequest.headers.Authorization = `Bearer ${authStore.accessToken}`;
        }
        return apiClient(originalRequest); // Re-intenta la petición
      } catch (err) {
        authStore.logout();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;
