const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initDatabase } = require('./db');
const { authenticateJWT } = require('./middleware/auth');
const { requireRole } = require('./middleware/rbac');

const authController = require('./controllers/authController');
const catalogController = require('./controllers/catalogController');
const scheduleController = require('./controllers/scheduleController');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Log requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - Tenant: ${req.headers['x-tenant-id'] || 'None'}`);
  next();
});

// -------------------------------------------------------------
// RUTAS PÚBLICAS DE AUTENTICACIÓN Y TENANTS
// -------------------------------------------------------------
app.get('/api/auth/tenants', authController.getTenants);
app.get('/api/auth/roles', authController.getRoles);
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);

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

// Módulo Alumno: Oferta Académica, Inscripción y Mi Horario
app.get('/api/schedules/available', scheduleController.getAvailableSchedules);
app.post('/api/schedules/enroll', requireRole(['Alumno', 'Coordinador']), scheduleController.enrollStudent);
app.delete('/api/schedules/:scheduleId/unenroll', requireRole(['Alumno', 'Coordinador']), scheduleController.unenrollStudent);
app.get('/api/schedules/student', requireRole(['Alumno', 'Coordinador']), scheduleController.getStudentSchedules);

// Healthcheck
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    tenant_id: req.tenant_id,
    user: req.user.name,
    role: req.user.role_name
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
      console.log(`=======================================================`);
    });
  })
  .catch((err) => {
    console.error('Error al inicializar la base de datos:', err);
    process.exit(1);
  });
