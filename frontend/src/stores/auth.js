import { defineStore } from 'pinia';
import api from '../api/client';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem('token') || null,
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    loading: false,
    error: null,
  }),

  getters: {
    isAuthenticated: (state) => !!state.token,
    userRole: (state) => state.user?.role_name || '',
    isCoordinator: (state) => state.user?.role_name === 'Coordinador' || state.user?.role_name === 'Administrador',
    isTeacher: (state) => state.user?.role_name === 'Profesor',
    isStudent: (state) => state.user?.role_name === 'Alumno',
    tenantName: (state) => state.user?.tenant_name || 'Institución Desconocida',
    tenantId: (state) => state.user?.tenant_id || '',
  },

  actions: {
    async login(email, password, tenant_id = null) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.post('/auth/login', { email, password, tenant_id });
        const { token, user } = response.data;
        this.token = token;
        this.user = user;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('tenant_id', user.tenant_id);
        return user;
      } catch (err) {
        this.error = err.response?.data?.error || 'Error al iniciar sesión';
        throw this.error;
      } finally {
        this.loading = false;
      }
    },

    async register(formData) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.post('/auth/register', formData);
        const { token, user } = response.data;
        this.token = token;
        this.user = user;
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(user));
        localStorage.setItem('tenant_id', user.tenant_id);
        return user;
      } catch (err) {
        this.error = err.response?.data?.error || 'Error al registrarse';
        throw this.error;
      } finally {
        this.loading = false;
      }
    },

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

    logout() {
      this.token = null;
      this.user = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('tenant_id');
    }
  }
});
