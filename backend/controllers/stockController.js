const Stock = require('../models/Stock');

exports.getStock = async (req, res) => {
    try {
        const stocks = await Stock.find();
        res.json(stocks);
    } catch (err) {
        res.status(500).send('Server Error');
    }
};

exports.updateStock = async (req, res) => {
    let { materialName, quantity } = req.body;
    if (!materialName) return res.status(400).json({ msg: 'Material name is required' });
    materialName = materialName.trim();

    // Prevent stock updates for 'General Inquiry' system labels
    if (materialName.toLowerCase().includes('general inquiry')) {
        return res.status(400).json({ msg: 'Cannot update stock for General Inquiry labels' });
    }
    try {
        let stock = await Stock.findOne({ materialName: { $regex: new RegExp('^' + materialName + '$', 'i') } });
        if (stock) {
            stock.quantity += Number(quantity);
            await stock.save();
        } else {
            stock = new Stock({ materialName, quantity: Number(quantity) });
            await stock.save();
        }

        // Auto-update pending requests that were marked as insufficient stock
        const MaterialRequest = require('../models/MaterialRequest');
        const pendingReqs = await MaterialRequest.find({
            materialName: { $regex: new RegExp('^' + materialName + '$', 'i') },
            status: 'Pending',
            insufficientStock: true
        });

        for (let req of pendingReqs) {
            if (stock.quantity >= req.quantity) {
                req.insufficientStock = false;
                req.adminComment = (req.adminComment || '') + ' [STOCK UPDATED - READY]';
                await req.save();
            }
        }

        // Emit socket events to refresh everything instantly
        const io = req.app.get('io');
        if (io) {
            io.emit('stockUpdated', { materialName: stock.materialName, quantity: stock.quantity });
            io.emit('requestUpdated', { type: 'STOCK_SYNC' });
        }

        res.json(stock);
    } catch (err) {
        res.status(500).send('Server Error');
    }
};
