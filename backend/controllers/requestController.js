const MaterialRequest = require('../models/MaterialRequest');
const Stock = require('../models/Stock');
const { sendEmail } = require('../utils/mailer');

exports.createRequest = async (req, res) => {
    console.log('[DEBUG] createRequest HIT');
    console.log('[DEBUG] Headers:', req.headers);
    try {
        console.log('[REQUEST] Received Body:', JSON.stringify(req.body, null, 2));
        console.log('[REQUEST] Received File:', req.file ? req.file.fieldname : 'None');
        let { employeeId, employeeName, employeeEmail, materialName, quantity, remark } = req.body;
        
        // If body fields are missing, fetch from database using req.user.id
        if ((!employeeId || !employeeName) && req.user && req.user.id) {
            const User = require('../models/User');
            const currentUser = await User.findById(req.user.id);
            if (currentUser) {
                if (!employeeId) employeeId = currentUser.employeeId;
                if (!employeeName) employeeName = currentUser.name;
                if (!employeeEmail) employeeEmail = currentUser.email;
            }
        }

        // Sanitize: Convert "null" or "undefined" strings to actual empty strings
        if (materialName === 'null' || materialName === 'undefined' || !materialName) materialName = '';
        if (remark === 'null' || remark === 'undefined' || !remark) remark = '';
        if (quantity === 'null' || quantity === 'undefined' || quantity === '') quantity = '0';

        console.log(`[REQUEST] Processed: ${employeeName} (${employeeId}) -> ${quantity}x ${materialName}`);

        // Defensive checks for required fields
        if (!employeeId || !employeeName || materialName.trim() === '') {
            console.error('[REQUEST] Validation Failed', { 
                employeeId, 
                employeeName, 
                materialName 
            });
            return res.status(400).json({ msg: 'Missing required fields: employeeId, employeeName, or materialName' });
        }

    let photoUrl = '';
    if (req.file) {
        console.log(`[UPLOAD] File received: ${req.file.filename} (${req.file.size} bytes)`);
        photoUrl = req.file.path.replace(/\\/g, '/');
    } else {
        console.warn('[UPLOAD] No file received in req.file');
    }

        const allStock = await Stock.find();
        const stockItem = allStock.find(s => s.materialName.trim().toLowerCase() === materialName.trim().toLowerCase());
        
        // If it's a General Inquiry or Remark, it should NOT be blocked by stock
        const isGeneralInquiry = materialName.toLowerCase().includes('general inquiry') || materialName.toLowerCase().includes('remark');
        const isInsufficient = isGeneralInquiry ? false : (stockItem ? Number(quantity) > stockItem.quantity : true);

        const newRequest = new MaterialRequest({
            user: req.user.id,
            employeeId: (employeeId || '').toString().trim(),
            employeeName: (employeeName || '').toString().trim(),
            employeeEmail: (employeeEmail || '').toString().trim(),
            materialName: (materialName || '').toString().trim(),
            quantity: Number(quantity) || 0,
            requestId: 'REQ' + Math.floor(100000 + Math.random() * 900000),
            photoUrl,
            remark: (remark || '').trim(),
            inTime: new Date(),
            insufficientStock: isInsufficient
        });

        const request = await newRequest.save();
        
        // Emit socket event for real-time updates
        const io = req.app.get('io');
        if (io) {
            io.emit('requestUpdated', { type: 'CREATE', request });
            console.log(`[SOCKET] Broadcast: requestUpdated for new request ${request.requestId}`);

            // Notify Admin if stock is insufficient
            if (isInsufficient) {
                io.emit('notification', {
                    role: 'Admin',
                    type: 'warning',
                    title: '📦 STOCK REQUIRED',
                    message: `Request for "${request.materialName}" (${request.quantity}x) requires a stock update before it can be approved.`,
                    materialName: request.materialName,
                    requestId: request.requestId,
                    employeeName: request.employeeName
                });
            }

            // Check if user has high penalty score and notify admin
            const User = require('../models/User');
            const userObj = await User.findById(req.user.id);
            if (userObj && userObj.penaltyScore >= 10) {
                io.emit('notification', {
                    role: 'Admin',
                    type: 'critical',
                    title: '🚨 HIGH PENALTY USER REQUEST',
                    message: `High-penalty employee "${userObj.name}" (ID: ${userObj.employeeId || 'N/A'}) has submitted a new request.`,
                    employeeName: userObj.name,
                    employeeId: userObj.employeeId,
                    penaltyScore: userObj.penaltyScore
                });
            }
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
        const requestedMaterial = (request.materialName || '').trim().toLowerCase();
        console.log(`[APPROVE-DEBUG] Starting Approval for: "${requestedMaterial}"`);

        // 1. Initial detection
        let isModuleRequest = requestedMaterial.includes('general') || requestedMaterial.includes('remark') || requestedMaterial.includes('inquiry');
        
        // 2. Remark Parsing (Can override isModuleRequest)
        let stock = null;
        let effectiveMaterialName = request.materialName;

        if (request.remark) {
            console.log('[APPROVE-DEBUG] Parsing remark:', request.remark);
            
            // Extract quantity (e.g., "Need 3 break")
            const qtyMatch = request.remark.match(/(\d+)/);
            if (qtyMatch && request.quantity === 0) {
                request.quantity = parseInt(qtyMatch[1], 10);
                console.log(`[APPROVE-DEBUG] Extracted Quantity: ${request.quantity}`);
            }

            // Find matching material from stock
            const allStock = await Stock.find();
            const foundMaterial = allStock.find(s => 
                request.remark.toLowerCase().includes(s.materialName.toLowerCase())
            );
            
            if (foundMaterial) {
                console.log(`[APPROVE-DEBUG] Extracted Material "${foundMaterial.materialName}" from Remark!`);
                stock = foundMaterial;
                effectiveMaterialName = foundMaterial.materialName;
                if (request.quantity === 0) request.quantity = 1;
                isModuleRequest = false; // FORCE stock check because we found a material
            } else {
                // If remark contains "need" or "request" but no stock match was found, we should block!
                const requestKeywords = ['need', 'want', 'require', 'request', 'give', 'send'];
                const isExplicitRequest = requestKeywords.some(kw => request.remark.toLowerCase().includes(kw));
                
                if (isExplicitRequest) {
                    console.log('[APPROVE-DEBUG] Explicit request detected but NO stock item found. Blocking approval.');
                    stock = null; 
                    isModuleRequest = false; // FORCE failure in stock block
                    effectiveMaterialName = "Unregistered Material (from Remark)";
                }
            }
        }

        // 3. Fallback for non-module requests that weren't caught by the remark parser
        if (!isModuleRequest && !stock) {
             stock = await Stock.findOne({ materialName: { $regex: new RegExp('^' + requestedMaterial.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') } });
        }
        
        console.log(`[APPROVE-DEBUG] Result -> isModule: ${isModuleRequest}, Stock: ${stock ? stock.materialName : 'None'}, Qty: ${request.quantity}`);

        if (status === 'Approved') {
            // VERIFY STOCK (For both physical requests and remark-extracted materials)
            if (stock || !isModuleRequest) {
                if (!stock || stock.quantity < request.quantity) {
                    return res.status(400).json({ 
                        msg: `Insufficient stock! The requested item "${effectiveMaterialName}" has ${stock ? stock.quantity : 0} units available. Please restock before approving.`,
                        required: request.quantity,
                        available: stock ? stock.quantity : 0
                    });
                }

                // DECREASE STOCK ON APPROVAL
                stock.quantity -= request.quantity;
                await stock.save();
                console.log(`[STOCK] Decreased ${effectiveMaterialName} by ${request.quantity} on Approval. Remaining: ${stock.quantity}`);

                if (stock.quantity < 10) {
                    lowStockWarning = `Low Stock Alert: "${stock.materialName}" is now at ${stock.quantity} units.`;
                }
            } else {
                console.log(`[STOCK] Skipping stock deduction for pure Module Request: ${request.materialName}`);
            }
            
            // Set due date (6 PM today or tomorrow if approved after 6 PM)
            const deadline = new Date();
            deadline.setHours(18, 0, 0, 0);
            if (new Date() > deadline) {
                deadline.setDate(deadline.getDate() + 1);
            }
            request.dueDate = deadline;
            request.approvedAt = new Date();
        } else if (status === 'Rejected') {
            // No stock to return because we didn't subtract it on request creation anymore
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
        io.emit('requestUpdated', { type: 'UPDATE', request });
        
        // Also emit a stock update event if it changed
        if (status === 'Approved') {
            io.emit('stockUpdated', { 
                materialName: request.materialName, 
                quantity: stock.quantity 
            });
        }

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
            io.emit('requestUpdated', { type: 'PICKUP', request });

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
            io.emit('requestUpdated', { type: 'RETURN', request });

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
        
        // UPDATE USER PENALTY SCORE
        const User = require('../models/User');
        const userObj = await User.findById(request.user);
        if (userObj) {
            userObj.penaltyScore = (userObj.penaltyScore || 0) + 1;
            await userObj.save();
            console.log(`[PENALTY] User ${userObj.name} score updated to ${userObj.penaltyScore}`);

            // NOTIFY ADMIN ON EVERY PENALTY
            const io = req.app.get('io');
            if (io) {
                // Instantly update the request card on the employee's dashboard
                io.emit('requestUpdated', { type: 'UPDATE', request });

                // Find all users to see if this one is the highest
                const allUsers = await User.find({ penaltyScore: { $gt: 0 } }).sort({ penaltyScore: -1 });
                const isHighest = allUsers.length > 0 && allUsers[0]._id.toString() === userObj._id.toString();

                console.log(`[PENALTY-SOCKET] Notifying admin for penalty. User: ${userObj.name}, Score: ${userObj.penaltyScore}, Highest: ${isHighest}`);
                
                const payload = {
                    role: 'Admin',
                    type: isHighest ? 'critical' : 'penalty',
                    title: isHighest ? '🏆 TOP PENALTY OFFENDER UPDATED' : '⚠️ PENALTY ISSUED',
                    message: `Employee "${userObj.name}" (Emp ID: ${request.employeeId || 'N/A'}) has a new penalty. Total Score: ${userObj.penaltyScore}`,
                    employeeName: userObj.name,
                    employeeId: request.employeeId,
                    penaltyScore: userObj.penaltyScore,
                    isHighest: isHighest,
                    requestId: request.requestId,
                    materialName: request.materialName
                };
                
                io.emit('notification', payload);
                
                // NOTIFY THE EMPLOYEE INDIVIDUALLY
                if (userObj._id) {
                    io.emit('notification', {
                        userId: userObj._id.toString(), // Match employee's ID
                        employeeId: userObj.employeeId,
                        type: 'penalty',
                        title: '⚠️ NEW PENALTY ISSUED',
                        message: `You have received a penalty for "${request.materialName}". Your new total score is ${userObj.penaltyScore}. Please return any overdue items immediately.`,
                        penaltyScore: userObj.penaltyScore,
                        materialName: request.materialName
                    });
                }
                
                // Check if this person is the absolute highest
                const allUsersSorted = await User.find({ penaltyScore: { $gt: 0 } }).sort({ penaltyScore: -1 });
                const isHighestNow = allUsersSorted.length > 0 && allUsersSorted[0]._id.toString() === userObj._id.toString();

                // Also broadcast a user update so the sidebar/dashboard can refresh counts
                io.emit('userUpdated', { 
                    type: 'PENALTY_ISSUED', 
                    userId: userObj._id,
                    employeeId: userObj.employeeId,
                    name: userObj.name,
                    penaltyScore: userObj.penaltyScore,
                    isHighest: isHighestNow
                });
            } else {
                console.error('[PENALTY-SOCKET] FAILED: Socket.io instance not found');
            }
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
        console.error(err.message);
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
