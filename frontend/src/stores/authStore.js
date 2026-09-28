import { defineStore } from 'pinia';
import apiClient from '../api/client';

function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: null, // Solo en memoria. ¡No usar localStorage!
    tenantId: null,
    user: null,
    loading: false,
    error: null
  }),

  getters: {
    isAuthenticated: (state) => !!state.accessToken,
    userRole: (state) => state.user?.role_name || '',
    isCoordinator: (state) => state.user?.role_name === 'Coordinador' || state.user?.role_name === 'Administrador',
    isTeacher: (state) => state.user?.role_name === 'Profesor',
    isStudent: (state) => state.user?.role_name === 'Alumno',
    tenantName: (state) => state.user?.tenant_name || state.tenantId || 'Institución Desconocida'
  },

  actions: {
    // Fase 2: Seleccionar tenant mediante Identity Token tras login SSO
    async selectTenant(tenantId, identityToken) {
      this.loading = true;
      this.error = null;
      try {
        const res = await apiClient.post('/auth/select-tenant', { tenantId }, {
          headers: { Authorization: `Bearer ${identityToken}` }
        });

        this.accessToken = res.data.accessToken;
        this.tenantId = tenantId;

        // Parsear payload del JWT para setear estado de user/roles
        const decoded = parseJwt(this.accessToken);
        if (decoded) {
          this.user = {
            id: decoded.sub || decoded.id,
            name: decoded.name || res.data.user?.name || 'Usuario',
            email: decoded.email || res.data.user?.email,
            tenant_id: decoded.tenant_id,
            tenant_name: res.data.user?.tenant_name || '',
            role_id: decoded.role_id,
            role_name: decoded.role_name
          };
        } else if (res.data.user) {
          this.user = res.data.user;
        }

        return this.user;
      } catch (err) {
        this.error = err.response?.data?.error || err.message;
        throw this.error;
      } finally {
        this.loading = false;
      }
    },

    // Silent Refresh: La cookie refresh_token se envía automáticamente por withCredentials
    async silentRefresh() {
      try {
        const res = await apiClient.post('/auth/refresh');
        this.accessToken = res.data.accessToken;

        const decoded = parseJwt(this.accessToken);
        if (decoded) {
          this.tenantId = decoded.tenant_id;
          this.user = {
            id: decoded.sub || decoded.id,
            name: decoded.name || this.user?.name || 'Usuario',
            email: decoded.email || this.user?.email,
            tenant_id: decoded.tenant_id,
            tenant_name: this.user?.tenant_name || '',
            role_id: decoded.role_id,
            role_name: decoded.role_name
          };
        }
        return this.accessToken;
      } catch (err) {
        this.accessToken = null;
        this.tenantId = null;
        this.user = null;
        throw err;
      }
    },

    // Iniciar sesión con correo y contraseña
    async login(email, password, tenant_id = null) {
      this.loading = true;
      this.error = null;
      try {
        const res = await apiClient.post('/auth/login', { email, password, tenant_id });
        const { token, user } = res.data;
        this.accessToken = token;
        this.tenantId = user.tenant_id || tenant_id;
        this.user = user;
        return user;
      } catch (err) {
        this.error = err.response?.data?.error || 'Error al iniciar sesión';
        throw this.error;
      } finally {
        this.loading = false;
      }
    },

    // Registro de nuevo usuario
    async register(formData) {
      this.loading = true;
      this.error = null;
      try {
        const res = await apiClient.post('/auth/register', formData);
        const { token, user } = res.data;
        this.accessToken = token;
        this.tenantId = user.tenant_id || formData.tenant_id;
        this.user = user;
        return user;
      } catch (err) {
        this.error = err.response?.data?.error || 'Error al registrarse';
        throw this.error;
      } finally {
        this.loading = false;
      }
    },

    // Acceso rápido de demostración
    async quickLogin(roleName) {
      const demoAccounts = {
        coordinador: { email: 'coordinador@itc.edu', password: 'demo123', tenant_id: 'tenant-itc' },
        profesor: { email: 'elena.salgado@itc.edu', password: 'demo123', tenant_id: 'tenant-itc' },
        alumno: { email: 'alumno@itc.edu', password: 'demo123', tenant_id: 'tenant-itc' }
      };

      const creds = demoAccounts[roleName.toLowerCase()];
      if (creds) {
        return await this.login(creds.email, creds.password, creds.tenant_id);
      }
    },

    // Cierre de sesión y limpieza de memoria y cookie HttpOnly
    async logout() {
      this.accessToken = null;
      this.tenantId = null;
      this.user = null;
      this.error = null;
      try {
        await apiClient.post('/auth/logout'); // Elimina la cookie en el backend
      } catch (e) {
        // Ignora error de red en logout
      }
    }
  }
});
