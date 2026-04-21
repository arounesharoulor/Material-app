require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// ✅ Socket.io setup
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// ✅ Connect Database
connectDB();

// ✅ Setup Cron Jobs
const setupCronJobs = require('./utils/cronJobs');
setupCronJobs(io);

// ✅ Middlewares
app.use(cors());
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

// ✅ Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/requests', require('./routes/requestRoutes'));
app.use('/api/stock', require('./routes/stockRoutes'));
app.use('/api/otp', require('./routes/otpRoutes'));

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
const PORT = process.env.PORT || 5000;

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