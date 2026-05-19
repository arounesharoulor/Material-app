const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const auth = require('../middleware/authMiddleware');

router.post('/mark', auth, attendanceController.markAttendance);
router.get('/my-attendance', auth, attendanceController.getMyAttendance);
router.get('/all', auth, attendanceController.getAllAttendance);
router.put('/:id/approve', auth, attendanceController.updateAttendanceStatus);

module.exports = router;
