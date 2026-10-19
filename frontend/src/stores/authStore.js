import { defineStore } from 'pinia';
import { jwtDecode } from 'jwt-decode';
import api from '../api/client';

export const useAuthStore = defineStore('auth', {
  state: () => {
    const savedUser = JSON.parse(localStorage.getItem('user') || 'null');
    return {
      accessToken: localStorage.getItem('token') || null,
      tenantId: localStorage.getItem('tenant_id') || null,
      userRole: savedUser?.role_name || null,
      user: savedUser,
      loading: false,
      error: null,
    };
  },
  getters: {
    isAuthenticated: (state) => !!state.accessToken,
    hasRole: (state) => (allowedRoles) => {
      if (!state.userRole) return false;
      const current = String(state.userRole).toLowerCase();
      return allowedRoles.some((r) => {
        const allowed = String(r).toLowerCase();
        if (allowed === current) return true;
        if ((allowed === 'profesor' || allowed === 'role-teacher') && (current === 'profesor' || current === 'role-teacher')) return true;
        if ((allowed === 'coordinador' || allowed === 'role-coord') && (current === 'coordinador' || current === 'role-coord')) return true;
        if ((allowed === 'administrador' || allowed === 'role-admin') && (current === 'administrador' || current === 'role-admin')) return true;
        return false;
      });
    },
    isCoordinator: (state) => {
      const r = String(state.userRole || '').toLowerCase();
      return r === 'coordinador' || r === 'administrador' || r === 'role-coord' || r === 'role-admin' || r.includes('coord') || r.includes('admin');
    },
    isTeacher: (state) => {
      const r = String(state.userRole || '').toLowerCase();
      return r === 'profesor' || r === 'role-teacher' || r.includes('prof') || r.includes('teach') || r.includes('maestr');
    },
    homeRoute: (state) => {
      const r = String(state.userRole || '').toLowerCase();
      if (r === 'profesor' || r === 'role-teacher' || r.includes('prof') || r.includes('teach') || r.includes('maestr')) {
        return '/teacher';
      }
      if (r === 'coordinador' || r === 'administrador' || r === 'role-coord' || r === 'role-admin' || r.includes('coord') || r.includes('admin')) {
        return '/coordinator';
      }
      return '/login';
    },
    tenantName: (state) => state.user?.tenant_name || (state.tenantId === 'tenant-itc' ? 'Instituto Tecnológico Central' : (state.tenantId === 'tenant-upn' ? 'Universidad Politécnica del Norte' : state.tenantId || 'Institución Activa')),
  },
  actions: {
    getHomeRoute(roleOverride = null) {
      const role = roleOverride || this.userRole;
      if (!role) return '/login';
      const r = String(role).toLowerCase();
      if (r === 'profesor' || r === 'role-teacher' || r.includes('prof') || r.includes('teach') || r.includes('maestr')) {
        return '/teacher';
      }
      if (r === 'coordinador' || r === 'administrador' || r === 'role-coord' || r === 'role-admin' || r.includes('coord') || r.includes('admin')) {
        return '/coordinator';
      }
      return '/unauthorized';
    },
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
    async completeExternalRegistration(payload) {
      this.loading = true;
      this.error = null;
      try {
        const response = await api.post('/auth/external-register', payload);
        const { accessToken, token, user } = response.data;
        const finalToken = accessToken || token;
        this._processToken(finalToken);
        if (user) {
          this.user = user;
          localStorage.setItem('user', JSON.stringify(user));
        }
        return this.user || user;
      } catch (err) {
        this.error = err.response?.data?.error || 'Error al completar el registro';
        throw this.error;
      } finally {
        this.loading = false;
      }
    },
    async quickLogin(roleName) {
      const demoAccounts = {
        coordinador: { email: 'coordinador@pavilion.com', password: 'demo123', tenant_id: 'tenant-itc' },
        profesor: { email: 'elena.salgado@pavilion.com', password: 'demo123', tenant_id: 'tenant-itc' }
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
