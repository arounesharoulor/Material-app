require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first'); // Force IPv4 first to fix ENETUNREACH with Nodemailer (IPv6 issues)
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// ✅ Socket.io setup - permissive for dev tunnels
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'x-auth-token', 'X-Tunnel-Skip-AntiPhishing-Page'],
        credentials: true
    }
});

// ✅ Connect Database
connectDB();

// ✅ Setup Cron Jobs
const setupCronJobs = require('./utils/cronJobs');
setupCronJobs(io);

// ✅ Middlewares
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-auth-token, X-Tunnel-Skip-AntiPhishing-Page');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

const authMw = require('./middleware/authMiddleware');

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-auth-token', 'X-Tunnel-Skip-AntiPhishing-Page'],
    credentials: true
}));
app.use(express.json({ extended: false }));

// ✅ ROOT ROUTE (FIXED ISSUE)
app.get('/', (req, res) => {
    res.send('Material Request API is running 🚀');
});

// ✅ Logger Middleware
app.use((req, res, next) => {
    if (req.url === '/api/debug-log') return next();

    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(
            `[${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`
        );
    });

    next();
});

// ✅ Make io accessible
app.set('io', io);

// ✅ Debug endpoint
app.post('/api/debug-log', (req, res) => {
    const { message, level = 'log', args = [] } = req.body;

    const colorCode =
        level === 'error'
            ? '\x1b[31m'
            : level === 'warn'
                ? '\x1b[33m'
                : '\x1b[36m';

    const resetCode = '\x1b[0m';

    console.log(
        `${colorCode}[WEB ${level.toUpperCase()}]${resetCode}: ${message}`,
        ...args
    );

    res.sendStatus(200);
});

// Temporary mailer debug endpoint (guarded)
// Enable by setting DEBUG_MAILER=true in your deployment environment.
if (process.env.DEBUG_MAILER === 'true') {
    app.post('/api/debug/send-test-email', express.json(), async (req, res) => {
        const { to, subject = 'Debug Test', text = 'This is a debug test' } = req.body || {};
        if (!to) return res.status(400).json({ msg: 'Missing `to` in body' });
        try {
            const result = await require('./utils/mailer').sendEmail(to, subject, text);
            return res.json({ success: true, result });
        } catch (err) {
            // Return structured error for quick diagnosis
            const payload = { msg: err.message || 'Mailer failed' };
            if (err.response) payload.proxy = { statusCode: err.response.statusCode, body: err.response.body, headers: err.response.headers };
            if (process.env.NODE_ENV !== 'production') payload.stack = err.stack;
            return res.status(500).json(payload);
        }
    });
}

// ✅ Routes
// CRITICAL: Penalty oversight routes
const auth = require('./middleware/authMiddleware');
const authController = require('./controllers/authController');
app.post('/api/attendance/mark-v2', authMw, (req, res, next) => {
    console.log(`[ROUTE-HIT-V2] ${req.method} ${req.url} - Content-Type: ${req.headers['content-type']}`);
    upload.single('photo')(req, res, (err) => {
        if (err) {
            console.error('[ATTENDANCE-MULTER-ERROR]', err.message);
            return res.status(400).json({ msg: err.message });
        }
        next();
    });
}, async (req, res) => {
    try {
        const { attendType, leaveType, reason, date, locationLat, locationLng } = req.body;
        const type = attendType; // Map back for model consistency
        const targetDate = date || new Date().toLocaleString('en-CA', {timeZone: 'Asia/Kolkata'}).split(',')[0];
        // Note: Assuming Asia/Kolkata as per user metadata, but logic handles passed date first.

        // Check existing
        const existing = await Attendance.findOne({ user: req.user.id, date: targetDate });
        if (existing) {
            console.log(`[ATTENDANCE] Found existing record for ${targetDate}. ID: ${existing._id}, Status: "${existing.status}"`);
            if (existing.status && existing.status.trim().toLowerCase() === 'rejected') {
                console.log(`[ATTENDANCE] Overwriting rejected record for ${targetDate}`);
                await Attendance.deleteOne({ _id: existing._id });
            } else {
                console.log(`[ATTENDANCE] 400: Blocking as current status is "${existing.status}"`);
                return res.status(400).json({ msg: `Attendance already marked for this date (Current Status: ${existing.status}).` });
            }
        }

        console.log(`[ATTENDANCE] Creating record for ${targetDate}. Type: ${type}, Photo: ${req.file ? 'Yes' : 'No'}`);
        const newAttendance = new Attendance({
            user: req.user.id,
            date: targetDate,
            type,
            leaveType: type === 'Leave' ? leaveType : '',
            reason: type === 'Leave' ? reason : '',
            status: 'Pending',
            locationLat: locationLat ? parseFloat(locationLat) : null,
            locationLng: locationLng ? parseFloat(locationLng) : null,
            photoUrl: req.file ? 'uploads/' + req.file.filename : null
        });

        await newAttendance.save();
        const populated = await newAttendance.populate('user', 'name email employeeId role');

        // Emit real-time socket event so Admin gets notified instantly
        const serverIo = app.get('io');
        if (serverIo) {
            serverIo.emit('attendanceNew', { attendance: populated });
        }

        // Send email to employee
        if (populated.user.email) {
            try {
                const evidenceText = type === 'Present' && req.file ? '(Photo evidence attached)' : '';
                const holdText = newAttendance.status === 'Waiting' ? '\nStatus is set to Waiting because no photo evidence was provided.' : '';
                const emailText = `Dear ${populated.user.name},\nYour attendance request for ${targetDate} as ${type} ${leaveType ? `(${leaveType})` : ''} has been submitted ${evidenceText}.${holdText}\nThank you.`;
                await sendEmail(populated.user.email, 'Attendance Submission Confirmation', emailText);
            } catch (e) { console.log('Mail error:', e.message); }
        }

        res.json(populated);
    } catch (err) {
        console.error('[ATTENDANCE-HANDLER-ERROR]', err.message);
        res.status(500).send('Server Error');
    }
});

// ✅ Route Definitions
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/requests', require('./routes/requestRoutes'));
app.use('/api/stock', require('./routes/stockRoutes'));
app.use('/api/otp', require('./routes/otpRoutes'));

// Imports moved to the top
const Attendance = require('./models/Attendance');
const User = require('./models/User');
const upload = require('./middleware/uploadMiddleware');
const { sendEmail } = require('./utils/mailer');
const cron = require('node-cron');
// End of Core Middleware Definition

// Get my attendance
app.get('/api/attendance/my-attendance', authMw, async (req, res) => {
    try {
        let records = await Attendance.find({ user: req.user.id }).sort({ date: -1 });
        
        records = records.map(a => {
            const doc = a.toObject();
            if (doc.photoUrl && (doc.photoUrl.includes(':') || doc.photoUrl.includes('\\'))) {
                 const filename = doc.photoUrl.split(/[/\\]/).pop();
                 doc.photoUrl = 'uploads/' + filename; 
            }
            return doc;
        });

        res.json(records);
    } catch (err) { res.status(500).send('Server Error'); }
});

// Admin: get all attendance
app.get('/api/attendance/all', authMw, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ msg: 'Access denied' });
        let records = await Attendance.find().populate('user', ['name', 'employeeId', 'email']).sort({ date: -1, createdAt: -1 });
        
        // Sanitize paths for old records (Migration logic)
        records = records.map(a => {
            const doc = a.toObject();
            if (doc.photoUrl && (doc.photoUrl.includes(':') || doc.photoUrl.includes('\\'))) {
                 const filename = doc.photoUrl.split(/[/\\]/).pop();
                 doc.photoUrl = 'uploads/' + filename; 
            }
            return doc;
        });

        res.json(records);
    } catch (err) { res.status(500).send('Server Error'); }
});

// Admin: approve/reject attendance check-in
app.put('/api/attendance/:id/action', authMw, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ msg: 'Access denied' });
        const { status } = req.body;
        if (!['Approved', 'Rejected'].includes(status)) return res.status(400).json({ msg: 'Invalid status' });
        const attendance = await Attendance.findById(req.params.id).populate('user', ['name', 'employeeId', 'email']);
        if (!attendance) return res.status(404).json({ msg: 'Not found' });
        attendance.status = status;
        // If approved Present → allow checkout later
        if (status === 'Approved' && attendance.type === 'Present') {
            attendance.checkOutStatus = 'NotRequired'; // will switch to PendingClose when employee checks out
        }
        await attendance.save();
        // Send email to employee
        try {
            const empEmail = attendance.user?.email;
            if (empEmail) {
                await sendEmail(empEmail, `Attendance ${status}`,
                    `Hi ${attendance.user?.name},\n\nYour attendance for ${attendance.date} has been ${status} by the Admin.\n\nRegards,\nSystem`
                );
            }
        } catch (e) { console.error('[MAILER] Attendance status email failed:', e.message); }
        const serverIo = app.get('io');
        if (serverIo) serverIo.emit('attendanceUpdated', { attendance, userId: attendance.user._id });
        res.json(attendance);
    } catch (err) { res.status(500).send('Server Error'); }
});

// Employee: close attendance (check-out)
app.put('/api/attendance/:id/checkout', authMw, async (req, res) => {
    try {
        const { locationLat, locationLng } = req.body;
        const attendance = await Attendance.findById(req.params.id);
        if (!attendance) return res.status(404).json({ msg: 'Not found' });
        if (String(attendance.user) !== String(req.user.id)) return res.status(403).json({ msg: 'Not your record' });
        if (attendance.status !== 'Approved') return res.status(400).json({ msg: 'Attendance not yet approved' });
        if (attendance.checkOutStatus !== 'NotRequired') return res.status(400).json({ msg: 'Already checked out' });
        
        attendance.checkOutTime = new Date();
        attendance.checkOutLat = locationLat ? parseFloat(locationLat) : null;
        attendance.checkOutLng = locationLng ? parseFloat(locationLng) : null;
        attendance.checkOutStatus = 'PendingClose';
        
        await attendance.save();
        const populated = await Attendance.findById(attendance._id).populate('user', ['name', 'employeeId', 'email']);
        const serverIo = app.get('io');
        if (serverIo) serverIo.emit('attendanceCheckout', { attendance: populated });
        res.json(populated);
    } catch (err) { res.status(500).send('Server Error'); }
});

// Admin: approve employee checkout (close)
app.put('/api/attendance/:id/close', authMw, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ msg: 'Access denied' });

        const attendance = await Attendance.findById(req.params.id).populate('user', 'name email employeeId');
        if (!attendance) return res.status(404).json({ msg: 'Not found' });
        if (attendance.checkOutStatus !== 'PendingClose') return res.status(400).json({ msg: 'Checkout not pending' });

        attendance.checkOutStatus = 'ClosedApproved';
        await attendance.save();

        io.emit('attendanceUpdated', { userId: attendance.user._id, attendance });

        if (attendance.user.email) {
            try {
                const emailText = `Dear ${attendance.user.name},\nYour attendance for ${attendance.date} has been successfully closed by the Admin.\nThank you for your work today!`;
                await sendEmail(attendance.user.email, 'Attendance Day Closed', emailText);
            } catch (e) { console.log('Mail error:', e.message); }
        }

        res.json(attendance);
    } catch (err) { res.status(500).send('Server Error'); }
});

// ⏰ CRON: Daily at 10:30 AM — alert employees who haven't marked attendance
cron.schedule('30 10 * * 1-6', async () => {
    console.log('[ATTENDANCE-CRON] Checking for missing attendance...');
    try {
        const today = new Date().toLocaleDateString('en-CA');
        const markedUserIds = (await Attendance.find({ date: today })).map(a => String(a.user));
        const allEmployees = await User.find({ role: 'Employee' }).select('name email employeeId');
        for (const emp of allEmployees) {
            if (!markedUserIds.includes(String(emp._id))) {
                console.log(`[ATTENDANCE-CRON] Sending late alert to ${emp.email}`);
                sendEmail(emp.email, '⚠️ Attendance Not Marked',
                    `Hi ${emp.name},\n\nThis is a reminder that you have NOT marked your attendance for today (${today}).\n\nPlease mark your attendance as soon as possible.\n\nRegards,\nSystem`
                ).catch(e => console.error('[CRON-MAILER]', e.message));
            }
        }
    } catch (e) { console.error('[ATTENDANCE-CRON] Error:', e.message); }
}, { timezone: 'Asia/Kolkata' });


// ✅ Admin Routes (Consolidated)
app.get('/api/admin/high-penalty', auth, authController.getHighPenaltyUsers);

// ✅ Debugging Route
app.get('/api/status', (req, res) => {
    res.json({
        status: 'API is healthy',
        timestamp: new Date(),
        version: '2.5'
    });
});

// ✅ Static Uploads Folder
const uploadPath = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath);
}

app.use('/uploads', express.static(uploadPath));

// ✅ Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong!');
});

// ✅ PORT (IMPORTANT FOR CLOUD)
const PORT = process.env.PORT || 5005;
// ✅ Catch-all 404 for API routes
app.use('/api/*', (req, res) => {
    console.log(`[404-UNMATCHED] ${req.method} ${req.originalUrl}`);
    res.status(404).json({ msg: `Route ${req.originalUrl} not found` });
});

// ✅ Start Server
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server started on port ${PORT}`);
});

// ✅ Socket Connection
io.on('connection', (socket) => {
    console.log('🔌 Client connected');

    socket.on('disconnect', () => {
        console.log('❌ Client disconnected');
    });
});