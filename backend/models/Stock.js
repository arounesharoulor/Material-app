const mongoose = require('mongoose');

const StockSchema = new mongoose.Schema({
    materialName: { type: String, required: true, unique: true },
    quantity: { type: Number, required: true, default: 0 }
});
module.exports = mongoose.model('Stock', StockSchema);
