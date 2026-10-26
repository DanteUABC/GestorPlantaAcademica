const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { authenticateJWT } = require('../middleware/auth');

// Proteger todas las rutas analíticas con autenticación JWT
router.use(authenticateJWT);

router.get('/classroom-occupancy', analyticsController.getClassroomOccupancy);
router.get('/teacher-utilization', analyticsController.getTeacherUtilization);
router.get('/available-classrooms', analyticsController.getAvailableClassrooms);

module.exports = router;
