const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.get('/', auth, authController.getUser);
router.put('/profile', [auth, upload.single('profilePicture')], authController.updateProfile);
router.put('/finalize-email', auth, authController.finalizeEmailUpdate);

module.exports = router;
