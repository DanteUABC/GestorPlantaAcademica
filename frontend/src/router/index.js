import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';

import LoginView from '../views/LoginView.vue';
import CoordinatorView from '../views/CoordinatorView.vue';
import TeacherView from '../views/TeacherView.vue';
import StudentView from '../views/StudentView.vue';

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: LoginView,
    meta: { public: true }
  },
  {
    path: '/',
    name: 'Home',
    redirect: '/dashboard'
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    component: {
      template: '<div>Cargando panel...</div>'
    }
  },
  {
    path: '/coordinador',
    name: 'Coordinator',
    component: CoordinatorView,
    meta: { roles: ['Coordinador', 'Administrador'] }
  },
  {
    path: '/profesor',
    name: 'Teacher',
    component: TeacherView,
    meta: { roles: ['Profesor', 'Coordinador', 'Administrador'] }
  },
  {
    path: '/alumno',
    name: 'Student',
    component: StudentView,
    meta: { roles: ['Alumno', 'Coordinador', 'Administrador'] }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/login'
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

router.beforeEach((to, from, next) => {
  const authStore = useAuthStore();

  if (to.meta.public) {
    if (authStore.isAuthenticated && to.path === '/login') {
      return next('/dashboard');
    }
    return next();
  }

  if (!authStore.isAuthenticated) {
    return next('/login');
  }

  if (to.path === '/dashboard') {
    if (authStore.isCoordinator) return next('/coordinador');
    if (authStore.isTeacher) return next('/profesor');
    if (authStore.isStudent) return next('/alumno');
  }

  if (to.meta.roles && !to.meta.roles.includes(authStore.userRole)) {
    return next('/dashboard');
  }

  next();
});

export default router;
