const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const { initDatabase } = require('./db');
const { authenticateJWT } = require('./middleware/auth');
const { requireRole } = require('./middleware/rbac');
const passport = require('./config/passport');

const authController = require('./controllers/authController');
const catalogController = require('./controllers/catalogController');
const classroomController = require('./controllers/classroomController');
const scheduleController = require('./controllers/scheduleController');
const analyticsRoutes = require('./routes/analyticsRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// CORS con soporte para cookies HttpOnly y credenciales
const frontendUrl = process.env.FRONTEND_URL;
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (!frontendUrl || frontendUrl === '*' || origin === frontendUrl || origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    if (origin.endsWith('.onrender.com') || origin.endsWith('.railway.app') || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    return callback(null, true);
  },
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
// HEALTHCHECKS PÚBLICOS (Balanceadores y Plataformas Cloud)
// -------------------------------------------------------------
app.get(['/health', '/api/health'], (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString()
  });
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
app.post('/api/auth/external-register', authController.completeExternalRegistration);

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
app.put('/api/subjects/:id', requireRole(['Coordinador', 'Administrador']), catalogController.updateSubject);
app.delete('/api/subjects/:id', requireRole(['Coordinador', 'Administrador']), catalogController.deleteSubject);

app.get('/api/classrooms', classroomController.getClassrooms);
app.post('/api/classrooms', requireRole(['Coordinador', 'Administrador']), classroomController.createClassroom);
app.put('/api/classrooms/:id', requireRole(['Coordinador', 'Administrador']), classroomController.updateClassroom);
app.delete('/api/classrooms/:id', requireRole(['Coordinador', 'Administrador']), classroomController.deleteClassroom);

app.get('/api/teachers', catalogController.getTeachers);

// Módulo Coordinador: Armado de Horarios
app.post('/api/schedules', requireRole(['Coordinador', 'Administrador']), scheduleController.createSchedule);
app.get('/api/schedules/coordinator', requireRole(['Coordinador', 'Administrador']), scheduleController.getCoordinatorSchedules);
app.get('/api/schedules/:id/available-substitutes', requireRole(['Coordinador', 'Administrador']), scheduleController.getAvailableSubstitutes);
app.post('/api/schedules/:id/transfer', requireRole(['Coordinador', 'Administrador']), scheduleController.transferSchedule);
app.delete('/api/schedules/:id', requireRole(['Coordinador', 'Administrador']), scheduleController.deleteSchedule);
app.post(
  '/api/schedules/upload-excel',
  requireRole(['Coordinador', 'Administrador']),
  scheduleController.uploadExcelMiddleware,
  scheduleController.uploadExcelSchedule
);
app.get('/api/schedules/export', authenticateJWT, scheduleController.exportSchedules);

// Módulo Docente: Consulta de Horario y Grupos
app.get('/api/schedules/teacher', requireRole(['Profesor', 'Coordinador', 'Administrador']), scheduleController.getTeacherSchedules);

// Motor de Analítica: Ocupación de Aulas y Subutilización Docente
app.use('/api/analytics', analyticsRoutes);

// -------------------------------------------------------------
// SERVIDOR DE ARCHIVOS ESTÁTICOS Y SPA FALLBACK (PRODUCCIÓN)
// -------------------------------------------------------------
const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));

  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(frontendDistPath, 'index.html'));
    }
    next();
  });
}

// Inicializar DB e iniciar servidor solo si es ejecutado directamente
if (require.main === module) {
  const dbUrl = process.env.DATABASE_URL;
  console.log(`[GPA] 🚀 Arrancando Gestor de Planta Académica en puerto ${PORT}...`);
  if (!dbUrl) {
    console.warn(`[GPA] ⚠️ AVISO: process.env.DATABASE_URL no está configurada.`);
  } else {
    try {
      const parsed = new URL(dbUrl);
      console.log(`[GPA] 📡 Configuración DB detectada -> Host: ${parsed.hostname}, Puerto: ${parsed.port || 5432}, DB: ${parsed.pathname.slice(1)}`);
    } catch {
      console.log(`[GPA] 📡 DATABASE_URL provista (longitud: ${dbUrl.length})`);
    }
  }

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
      console.error('❌ [GPA] Error al inicializar la base de datos:');
      console.error(`   👉 Mensaje: ${err.message}`);
      console.error(`   👉 Código: ${err.code || 'N/A'}`);
      if (err.code === 'ECONNREFUSED') {
        console.error('   ⚠️  Causa: No se pudo conectar al servidor de base de datos.');
        console.error('   👉 Si el host es localhost / 127.0.0.1, recuerda que Render se ejecuta en la nube y no puede acceder a tu máquina local.');
        console.error('   👉 Debes configurar la variable DATABASE_URL en Render con una base de datos en la nube accesible.');
      } else if (err.code === '28P01') {
        console.error('   ⚠️  Causa: Error de autenticación (usuario o contraseña de la base de datos incorrectos).');
      }
      process.exit(1);
    });
}

module.exports = app;
