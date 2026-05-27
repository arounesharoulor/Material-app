const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

// Mark Attendance
router.post('/mark', auth, attendanceController.markAttendance);
router.post('/mark-v2', auth, upload.single('photo'), attendanceController.markAttendanceV2);

// User Actions
router.get('/my-attendance', auth, attendanceController.getMyAttendance);
router.put('/:id/checkout', auth, attendanceController.checkoutAttendance);

// Admin Actions
router.get('/all', auth, attendanceController.getAllAttendance);
router.put('/:id/approve', auth, attendanceController.updateAttendanceStatus);
router.put('/:id/action', auth, attendanceController.actionAttendance);
router.put('/:id/close', auth, attendanceController.closeAttendance);

module.exports = router;
