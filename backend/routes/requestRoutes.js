const express = require('express');
const router = express.Router();
const requestController = require('../controllers/requestController');
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

router.post('/', [auth, upload.single('photo')], requestController.createRequest);
router.get('/', auth, requestController.getRequests);
router.get('/reports', auth, requestController.getReports);

// Specific workflow routes MUST come before generic /:id
router.put('/:id/pickup', [auth, upload.single('photo')], requestController.submitPickupPhoto);
router.put('/:id/return', [auth, upload.single('photo')], requestController.submitReturnPhoto);
router.put('/:id/penalty', auth, requestController.issuePenalty);

// Generic update route should be last
router.put('/:id', auth, requestController.updateRequestStatus);

module.exports = router;
