import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/authStore';
import LoginView from '../views/LoginView.vue';
import CoordinatorView from '../views/CoordinatorView.vue';
import TeacherView from '../views/TeacherView.vue';
import UnauthorizedView from '../views/UnauthorizedView.vue';

const routes = [
  { path: '/login', name: 'Login', component: LoginView },
  { path: '/register/external', name: 'ExternalRegister', component: () => import('../views/ExternalRegisterView.vue'), meta: { isPublic: true } },
  { 
    path: '/coordinator', 
    name: 'Coordinator', 
    component: CoordinatorView,
    meta: { requiresAuth: true, allowedRoles: ['Coordinador', 'Administrador', 'role-coord', 'role-admin'] }
  },
  { 
    path: '/teacher', 
    name: 'Teacher', 
    component: TeacherView,
    meta: { requiresAuth: true, allowedRoles: ['Profesor', 'Coordinador', 'Administrador', 'role-teacher', 'role-coord', 'role-admin'] }
  },
  { path: '/unauthorized', name: 'Unauthorized', component: UnauthorizedView },
  { path: '/coordinador', redirect: '/coordinator' },
  { path: '/profesor', redirect: '/teacher' },
  { 
    path: '/', 
    redirect: () => {
      const authStore = useAuthStore();
      if (authStore.isAuthenticated) {
        return authStore.getHomeRoute ? authStore.getHomeRoute() : (authStore.isTeacher ? '/teacher' : '/coordinator');
      }
      return '/login';
    }
  },
  { path: '/:pathMatch(.*)*', redirect: '/login' }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();

  // Si un usuario autenticado intenta acceder a /login, redirigir a su panel según su rol
  if ((to.path === '/login' || to.name === 'Login') && authStore.isAuthenticated) {
    const homeRoute = authStore.getHomeRoute ? authStore.getHomeRoute() : (authStore.isTeacher ? '/teacher' : '/coordinator');
    if (homeRoute && homeRoute !== '/login') {
      return next(homeRoute);
    }
  }

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
