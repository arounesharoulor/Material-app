require('dotenv').config();
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first'); // Fix IPv6 issues with Nodemailer

const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// ✅ Socket.io Setup
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'x-auth-token', 'X-Tunnel-Skip-AntiPhishing-Page'],
        credentials: true
    }
});

// ✅ Database Connection
const connectDB = require('./config/db');
connectDB();

// ✅ Cron Jobs
const setupCronJobs = require('./utils/cronJobs');
setupCronJobs(io);

// ✅ Middlewares
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-auth-token', 'X-Tunnel-Skip-AntiPhishing-Page'],
    credentials: true
}));

app.use(express.json({ extended: false }));

// Additional CORS Headers
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, x-auth-token, X-Tunnel-Skip-AntiPhishing-Page');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// Make io accessible
app.set('io', io);

// ✅ Root Route
app.get('/', (req, res) => {
    res.send('Material Request API is running 🚀');
});

// ✅ Logger
app.use((req, res, next) => {
    if (req.url === '/api/debug-log') return next();
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
    });
    next();
});

// Debug Log Endpoint
app.post('/api/debug-log', (req, res) => {
    const { message, level = 'log', args = [] } = req.body;
    console.log(`[WEB ${level.toUpperCase()}]: ${message}`, ...args);
    res.sendStatus(200);
});

// Debug Mailer (Optional)
if (process.env.DEBUG_MAILER === 'true') {
    app.post('/api/debug/send-test-email', async (req, res) => {
        const { to, subject = 'Debug Test', text = 'This is a debug test' } = req.body || {};
        if (!to) return res.status(400).json({ msg: 'Missing `to` in body' });
        try {
            const result = await require('./utils/mailer').sendEmail(to, subject, text);
            return res.json({ success: true, result });
        } catch (err) {
            return res.status(500).json({ msg: err.message || 'Mailer failed' });
        }
    });
}

// NOTE: temporary test route removed so the real OTP controller is used.

// ✅ Main Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/requests', require('./routes/requestRoutes'));
app.use('/api/stock', require('./routes/stockRoutes'));
app.use('/api/otp', require('./routes/otpRoutes'));   // ← OTP Routes

// ==================== Attendance Routes ====================
const authMw = require('./middleware/authMiddleware');
const Attendance = require('./models/Attendance');
const User = require('./models/User');
const upload = require('./middleware/uploadMiddleware');
const { sendEmail } = require('./utils/mailer');

// Mark Attendance v2
app.post('/api/attendance/mark-v2', authMw, /* your full attendance handler code here */);

// My Attendance
app.get('/api/attendance/my-attendance', authMw, async (req, res) => {
    try {
        let records = await Attendance.find({ user: req.user.id }).sort({ date: -1 });
        res.json(records);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// Other attendance routes (Admin + Checkout) - keep your original logic here...

// Admin High Penalty
app.get('/api/admin/high-penalty', authMw, require('./controllers/authController').getHighPenaltyUsers);

// Status
app.get('/api/status', (req, res) => {
    res.json({ status: 'API is healthy', timestamp: new Date(), version: '2.5' });
});

// ✅ Static Uploads
const uploadPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath);
}
app.use('/uploads', express.static(uploadPath));

// ✅ Catch-all 404 - MUST BE LAST
app.use('/api/*', (req, res) => {
    console.log(`[404-UNMATCHED] ${req.method} ${req.originalUrl}`);
    res.status(404).json({ msg: `Route ${req.originalUrl} not found` });
});

// ✅ Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ msg: 'Something went wrong!' });
});

// ✅ Start Server
const PORT = process.env.PORT || 5005;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server started on port ${PORT}`);
});

// Socket Connection
io.on('connection', (socket) => {
    console.log('🔌 Client connected');
    socket.on('disconnect', () => {
        console.log('❌ Client disconnected');
    });
});