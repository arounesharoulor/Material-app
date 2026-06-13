const express = require('express');
const router = express.Router();
const stockController = require('../controllers/stockController');
const auth = require('../middleware/authMiddleware');

router.get('/', auth, stockController.getStock);
router.post('/', auth, stockController.updateStock);

module.exports = router;
