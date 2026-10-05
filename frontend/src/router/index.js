import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/authStore';
import LoginView from '../views/LoginView.vue';
import CoordinatorView from '../views/CoordinatorView.vue';
import TeacherView from '../views/TeacherView.vue';
import UnauthorizedView from '../views/UnauthorizedView.vue';

const routes = [
  { path: '/login', name: 'Login', component: LoginView },
  { 
    path: '/coordinator', 
    name: 'Coordinator', 
    component: CoordinatorView,
    meta: { requiresAuth: true, allowedRoles: ['Coordinador', 'Administrador'] }
  },
  { 
    path: '/teacher', 
    name: 'Teacher', 
    component: TeacherView,
    meta: { requiresAuth: true, allowedRoles: ['Profesor', 'Coordinador', 'Administrador'] }
  },
  { path: '/unauthorized', name: 'Unauthorized', component: UnauthorizedView },
  { path: '/coordinador', redirect: '/coordinator' },
  { path: '/profesor', redirect: '/teacher' },
  { path: '/', redirect: '/coordinator' },
  { path: '/:pathMatch(.*)*', redirect: '/login' }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();

  if (to.meta.requiresAuth) {
    if (!authStore.isAuthenticated) {
      const refreshed = await authStore.silentRefresh();
      if (!refreshed) return next({ name: 'Login' });
    }

    if (to.meta.allowedRoles && !authStore.hasRole(to.meta.allowedRoles)) {
      return next({ name: 'Unauthorized' });
    }
  }

  next();
});

export default router;
