import { defineStore } from 'pinia';
import { jwtDecode } from 'jwt-decode';
import api from '../api/client';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    accessToken: localStorage.getItem('token') || null,
    tenantId: localStorage.getItem('tenant_id') || null,
    userRole: null,
    user: JSON.parse(localStorage.getItem('user') || 'null'),
    loading: false,
    error: null,
  }),
  getters: {
    isAuthenticated: (state) => !!state.accessToken,
    hasRole: (state) => (allowedRoles) => {
      if (!state.userRole) return false;
      return allowedRoles.includes(state.userRole);
    },
    isCoordinator: (state) => state.userRole === 'Coordinador' || state.userRole === 'Administrador',
    isTeacher: (state) => state.userRole === 'Profesor',
    tenantName: (state) => state.user?.tenant_name || (state.tenantId === 'tenant-itc' ? 'Instituto Tecnológico Central' : (state.tenantId === 'tenant-upn' ? 'Universidad Politécnica del Norte' : state.tenantId || 'Institución Activa')),
  },
  actions: {
    _processToken(token) {
      this.accessToken = token;
      try {
        const decoded = jwtDecode(token);
        this.tenantId = decoded.tenant_id || null;
        this.userRole = decoded.role || decoded.role_name || null;
        this.user = {
          id: decoded.sub || decoded.id,
          name: decoded.name || (this.userRole === 'Coordinador' ? 'Dr. Roberto Mendoza' : 'Mtra. Elena Salgado'),
          email: decoded.email || '',
          role_name: this.userRole,
          tenant_id: this.tenantId,
          tenant_name: this.tenantName
        };
        localStorage.setItem('token', token);
        if (this.tenantId) localStorage.setItem('tenant_id', this.tenantId);
        localStorage.setItem('user', JSON.stringify(this.user));
      } catch (e) {
        console.error('Error decodificando token', e);
        this.userRole = null;
      }
    },
    async selectTenant(tenantId) {
      const response = await api.post('/auth/select-tenant', { tenant_id: tenantId });
      this._processToken(response.data.accessToken);
      return response.data;
    },
    async silentRefresh() {
      try {
        const response = await api.post('/auth/refresh');
        this._processToken(response.data.accessToken);
        return true;
      } catch (err) {
        this.logout();
        return false;
      }
    },
    async login(email, password, tenant_id = null) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.post('/auth/login', { email, password, tenant_id });
        const { accessToken, token, user } = response.data;
        const finalToken = accessToken || token;
        this._processToken(finalToken);
        if (user) {
          this.user = user;
          localStorage.setItem('user', JSON.stringify(user));
        }
        return this.user || user;
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
        const { accessToken, token, user } = response.data;
        const finalToken = accessToken || token;
        this._processToken(finalToken);
        if (user) {
          this.user = user;
          localStorage.setItem('user', JSON.stringify(user));
        }
        return this.user || user;
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
        profesor: { email: 'elena.salgado@itc.edu', password: 'demo123', tenant_id: 'tenant-itc' }
      };

      const creds = demoAccounts[roleName.toLowerCase()];
      if (creds) {
        return await this.login(creds.email, creds.password, creds.tenant_id);
      }
    },
    async logout() {
      try {
        await api.post('/auth/logout');
      } catch (e) {
        // Silently continue
      }
      this.accessToken = null;
      this.tenantId = null;
      this.userRole = null;
      this.user = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('tenant_id');
    }
  }
});
