require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

connectDB();
const setupCronJobs = require('./utils/cronJobs');
setupCronJobs();

app.use(cors());
app.use(express.json({ extended: false }));

// Logger middleware with response status and timing
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
    });
    next();
});

// Make io accessible in routes/controllers
app.set('io', io);

// Debug log endpoint
app.post('/api/debug-log', (req, res) => {
    const { message, level = 'log', args = [] } = req.body;
    const colorCode = level === 'error' ? '\x1b[31m' : level === 'warn' ? '\x1b[33m' : '\x1b[36m';
    const resetCode = '\x1b[0m';
    console.log(`${colorCode}[WEB ${level.toUpperCase()}]${resetCode}: ${message}`, ...args);
    res.sendStatus(200);
});

app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/requests', require('./routes/requestRoutes'));
app.use('/api/stock', require('./routes/stockRoutes'));
app.use('/api/otp', require('./routes/otpRoutes'));

const uploadPath = path.join(__dirname, 'uploads');
if (!require('fs').existsSync(uploadPath)) {
    require('fs').mkdirSync(uploadPath);
}
app.use('/uploads', express.static(uploadPath));

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something went wrong!');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => console.log(`Server started on port ${PORT}`));

io.on('connection', (socket) => {
    console.log('New client connected:', socket.id);
    socket.on('disconnect', () => console.log('Client disconnected'));
});
