const MaterialRequest = require('../models/MaterialRequest');
const Stock = require('../models/Stock');
const { sendEmail } = require('../utils/mailer');

exports.createRequest = async (req, res) => {
    try {
        const { employeeId, employeeName, employeeEmail, materialName, quantity } = req.body;
        
        console.log(`[REQUEST] Incoming from ${employeeName} (${employeeId}): ${quantity}x ${materialName}`);

        // Defensive checks for required fields
        if (!employeeId || !employeeName || !materialName) {
            console.error('[REQUEST] Validation Failed: Missing required fields', { 
                employeeId: !!employeeId, 
                employeeName: !!employeeName, 
                materialName: !!materialName 
            });
            return res.status(400).json({ msg: 'Missing required fields: employeeId, employeeName, or materialName' });
        }

    let photoUrl = '';
    if (req.file) {
        photoUrl = req.file.path.replace(/\\/g, '/');
    }

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

        // DECREASE STOCK IMMEDIATELY ON REQUEST
        if (stockItem) {
            stockItem.quantity -= Number(quantity);
            await stockItem.save();
            console.log(`[STOCK] Decreased ${materialName} by ${quantity}. New balance: ${stockItem.quantity}`);
        }
        
        // Emit socket event for real-time updates
        const io = req.app.get('io');
        if (io) {
            io.emit('requestUpdated');
            console.log(`[SOCKET] Broadcast: requestUpdated for new request ${request.requestId}`);
        }

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
            // Stock was already decreased on request creation. 
            // We just need to check if we should show a warning now.
            const requestedMaterial = request.materialName.trim().toLowerCase();
            const stock = await Stock.findOne({ materialName: { $regex: new RegExp('^' + requestedMaterial + '$', 'i') } });
            if (stock && stock.quantity < 10) {
                lowStockWarning = `Low Stock Alert: "${stock.materialName}" is now at ${stock.quantity} units.`;
            }
            
            // Set due date (6 PM today or tomorrow if approved after 6 PM)
            const deadline = new Date();
            deadline.setHours(18, 0, 0, 0);
            if (new Date() > deadline) {
                deadline.setDate(deadline.getDate() + 1);
            }
            request.dueDate = deadline;
        } else if (status === 'Rejected') {
            // RETURN STOCK ON REJECTION
            const requestedMaterial = request.materialName.trim().toLowerCase();
            const stock = await Stock.findOne({ materialName: { $regex: new RegExp('^' + requestedMaterial + '$', 'i') } });
            if (stock) {
                stock.quantity += request.quantity;
                await stock.save();
                console.log(`[STOCK] Restored ${request.materialName} by ${request.quantity} due to rejection.`);
            }
            request.rejectionReason = rejectionReason || 'No reason provided';
        }
        
        request.status = status;
        
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
        
        if (request.user && request.user.toString() !== req.user.id) {
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
        
        // Emit socket event for real-time updates
        const io = req.app.get('io');
        if (io) {
            io.emit('requestUpdated');
            // Specific event for the employee to trigger a sound/toast
            io.emit('notification', {
                userId: request.user,
                type: 'penalty',
                title: '⚠️ Penalty Issued',
                message: `A penalty has been issued for your request ${request.requestId}: ${penalty}`
            });
        }

        // Send Email Notification
        if (request.employeeEmail) {
            sendEmail(
                request.employeeEmail, 
                '⚠️ Important: Penalty Issued', 
                `Hi ${request.employeeName},\n\nA penalty has been issued for your material request (${request.requestId}).\n\nReason: ${penalty}\n\nPlease check the app for more details.\n\nThank you.`
            );
        }

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
