const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const { initDatabase } = require('./db');
const { authenticateJWT } = require('./middleware/auth');
const { requireRole } = require('./middleware/rbac');
const passport = require('./config/passport');

const authController = require('./controllers/authController');
const catalogController = require('./controllers/catalogController');
const scheduleController = require('./controllers/scheduleController');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS con soporte para cookies HttpOnly y credenciales
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

app.use(cookieParser());
app.use(passport.initialize());
app.use(express.json());

// Log de solicitudes
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Tenant: ${req.headers['x-tenant-id'] || 'None'}`);
  next();
});

// -------------------------------------------------------------
// RUTAS PÚBLICAS DE AUTENTICACIÓN, TENANTS Y OAUTH 2.0
// -------------------------------------------------------------
app.get('/api/auth/tenants', authController.getTenants);
app.get('/api/auth/roles', authController.getRoles);
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);
app.post('/api/auth/refresh', authController.refreshToken);
app.post('/api/auth/logout', authController.logout);

// OAuth: Google SSO
app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'], session: false }));
app.get(
  '/api/auth/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: '/login?error=oauth_failed' }),
  authController.oauthCallback
);

// OAuth: Microsoft SSO
app.get('/api/auth/microsoft', passport.authenticate('microsoft', { scope: ['user.read'], session: false }));
app.get(
  '/api/auth/microsoft/callback',
  passport.authenticate('microsoft', { session: false, failureRedirect: '/login?error=oauth_failed' }),
  authController.oauthCallback
);

// Selección de Tenant (Requiere Identity Token o Access Token previo)
app.post('/api/auth/select-tenant', authenticateJWT, authController.selectTenant);

// -------------------------------------------------------------
// RUTAS PROTEGIDAS (Requieren Token JWT y Tenant Scoping)
// -------------------------------------------------------------
app.use('/api', authenticateJWT);

// Perfil de usuario autenticado
app.get('/api/auth/me', authController.getMe);

// Catálogos generales (Materias, Aulas, Docentes)
app.get('/api/subjects', catalogController.getSubjects);
app.post('/api/subjects', requireRole(['Coordinador', 'Administrador']), catalogController.createSubject);

app.get('/api/classrooms', catalogController.getClassrooms);
app.post('/api/classrooms', requireRole(['Coordinador', 'Administrador']), catalogController.createClassroom);

app.get('/api/teachers', catalogController.getTeachers);

// Módulo Coordinador: Armado de Horarios
app.post('/api/schedules', requireRole(['Coordinador', 'Administrador']), scheduleController.createSchedule);
app.get('/api/schedules/coordinator', requireRole(['Coordinador', 'Administrador']), scheduleController.getCoordinatorSchedules);
app.delete('/api/schedules/:id', requireRole(['Coordinador', 'Administrador']), scheduleController.deleteSchedule);

// Módulo Docente: Consulta de Horario y Grupos
app.get('/api/schedules/teacher', requireRole(['Profesor', 'Coordinador', 'Administrador']), scheduleController.getTeacherSchedules);

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    tenant_id: req.tenant_id,
    user: req.user?.name,
    role: req.user?.role || req.user?.role_name
  });
});

// Inicializar DB e iniciar servidor
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`🚀 Gestor de Planta Académica - Backend SaaS Activo`);
      console.log(`📡 Puerto: http://localhost:${PORT}`);
      console.log(`🔒 Multi-tenant: "Shared Database, Shared Schema"`);
      console.log(`🛡️  SSO: Google & Microsoft OAuth 2.0 integrado`);
      console.log(`=======================================================`);
    });
  })
  .catch((err) => {
    console.error('Error al inicializar la base de datos:', err);
    process.exit(1);
  });
