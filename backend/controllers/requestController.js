const MaterialRequest = require('../models/MaterialRequest');
const Stock = require('../models/Stock');

exports.createRequest = async (req, res) => {
    const { employeeId, employeeName, employeeEmail, materialName, quantity } = req.body;
    
    // Defensive checks for required fields
    if (!employeeId || !employeeName || !materialName) {
        return res.status(400).json({ msg: 'Missing required fields: employeeId, employeeName, or materialName' });
    }

    let photoUrl = '';
    if (req.file) {
        photoUrl = req.file.path.replace(/\\/g, '/');
    }

    try {
        const allStock = await Stock.find();
        const stockItem = allStock.find(s => s.materialName.trim().toLowerCase() === materialName.trim().toLowerCase());
        const isInsufficient = stockItem ? Number(quantity) > stockItem.quantity : true;

        const newRequest = new MaterialRequest({
            user: req.user.id,
            employeeId: (employeeId || '').toString().trim(),
            employeeName: (employeeName || '').toString().trim(),
            employeeEmail: (employeeEmail || '').toString().trim(),
            materialName: (materialName || '').toString().trim(),
            quantity: Number(quantity) || 0,
            requestId: 'REQ' + Math.floor(100000 + Math.random() * 900000),
            photoUrl,
            inTime: new Date(),
            insufficientStock: isInsufficient
        });

        const request = await newRequest.save();
        
        // Emit socket event
        const io = req.app.get('io');
        io.emit('requestUpdated');

        res.json({ request, insufficientStock: isInsufficient });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.getRequests = async (req, res) => {
    try {
        let requests;
        if (req.user.role === 'Admin') {
            requests = await MaterialRequest.find().sort({ date: -1 });
        } else {
            requests = await MaterialRequest.find({ user: req.user.id }).sort({ date: -1 });
        }
        res.json(requests);
    } catch (err) {
        res.status(500).send('Server Error');
    }
};

exports.updateRequestStatus = async (req, res) => {
    const { status, rejectionReason, adminComment, dueDate } = req.body;
    try {
        let request = await MaterialRequest.findById(req.params.id);
        if (!request) return res.status(404).json({ msg: 'Request not found' });

        let lowStockWarning = null;
        if (status === 'Approved') {
            const requestedMaterial = request.materialName.trim().toLowerCase();
            const allStock = await Stock.find();
            let stock = allStock.find(s => s.materialName.trim().toLowerCase() === requestedMaterial);
            
            if (stock) {
                if (stock.quantity >= request.quantity) {
                    stock.quantity -= request.quantity;
                    await stock.save();
                    if (stock.quantity < 10) {
                        lowStockWarning = `Low Stock Alert: "${stock.materialName}" is now at ${stock.quantity} units. Please restock soon.`;
                    }
                } else {
                    return res.status(400).json({ msg: `Insufficient Stock (Available: ${stock.quantity})` });
                }
            } else {
                return res.status(400).json({ msg: `Material "${request.materialName}" not found in inventory.` });
            }
            
            // Set due date (6 PM today or tomorrow if approved after 6 PM)
            const deadline = new Date();
            deadline.setHours(18, 0, 0, 0);
            if (new Date() > deadline) {
                deadline.setDate(deadline.getDate() + 1);
            }
            request.dueDate = deadline;
        }
        
        request.status = status;
        if (status === 'Rejected') {
            request.rejectionReason = rejectionReason || 'No reason provided';
        }
        if (adminComment) {
            request.adminComment = adminComment;
        }
        request.outTime = (status === 'Approved' || status === 'Rejected') ? new Date() : request.outTime;
        await request.save();
        
        // Emit socket event
        const io = req.app.get('io');
        io.emit('requestUpdated');

        res.json({ request, lowStockWarning });
    } catch (err) {
        res.status(500).send('Server Error');
    }
};

exports.submitPickupPhoto = async (req, res) => {
    try {
        let request = await MaterialRequest.findById(req.params.id);
        if (!request) return res.status(404).json({ msg: 'Request not found' });
        
        if (request.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'User not authorized' });
        }

        if (req.file) {
            request.pickupPhotoUrl = req.file.path.replace(/\\/g, '/');
            request.pickupTime = new Date();
            request.status = 'PendingReturn';
            await request.save();

            // Emit socket event
            const io = req.app.get('io');
            io.emit('requestUpdated');

            res.json(request);
        } else {
            res.status(400).json({ msg: 'No photo provided' });
        }
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.submitReturnPhoto = async (req, res) => {
    try {
        let request = await MaterialRequest.findById(req.params.id);
        if (!request) return res.status(404).json({ msg: 'Request not found' });
        
        if (request.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'User not authorized' });
        }

        if (req.file) {
            request.returnPhotoUrl = req.file.path.replace(/\\/g, '/');
            request.returnTime = new Date();
            request.status = 'Closed';
            await request.save();

            // Emit socket event
            const io = req.app.get('io');
            io.emit('requestUpdated');

            res.json(request);
        } else {
            res.status(400).json({ msg: 'No photo provided' });
        }
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.issuePenalty = async (req, res) => {
    const { penalty } = req.body;
    try {
        let request = await MaterialRequest.findById(req.params.id);
        if (!request) return res.status(404).json({ msg: 'Request not found' });

        request.status = 'Penalized';
        request.penalty = penalty;
        request.penaltyIssuedAt = new Date();
        await request.save();
        
        // Emit socket event
        const io = req.app.get('io');
        io.emit('requestUpdated');

        res.json(request);
    } catch (err) {
        res.status(500).send('Server Error');
    }
};

exports.getReports = async (req, res) => {
    try {
        const reports = await MaterialRequest.find().sort({ inTime: -1 });
        res.json(reports);
    } catch (err) {
        res.status(500).send('Server Error');
    }
};
