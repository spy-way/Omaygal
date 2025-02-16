// Load environment variables
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
// Import models and middleware
const Report = require('./models/Report');
const Admin = require('./models/Admin');
const BannedIP = require('./models/BannedIP');
const { isAdminAuthenticated } = require('./middleware/auth');
const ipBlocker = require('./middleware/ipBlocker');
const app = express();
const server = http.createServer(app);
// Initialize Socket.IO before routes that use it
const io = new Server(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true,
    },
});
// Set up EJS templating
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Parse form data
app.use(express.urlencoded({ extended: false }));
// ==================== Middleware Setup ====================
// Security and utility middlewares
app.use(
    helmet({
        contentSecurityPolicy: {
            useDefaults: true,
            directives: {
                "default-src": ["'self'"],
                "script-src": ["'self'", "https://cdn.tailwindcss.com"],
                "style-src": [
                    "'self'",
                    // Include 'unsafe-inline' only if necessary
                    "'unsafe-inline'",
                    "https://cdn.tailwindcss.com",
                    "https://fonts.googleapis.com",
                ],
                "font-src": ["'self'", "https://fonts.gstatic.com"],
                "img-src": ["'self'", "data:"],
                "connect-src": ["'self'"],
                "frame-src": ["'self'"],
                "object-src": ["'none'"],
                "base-uri": ["'self'"],
            },
        },
        crossOriginEmbedderPolicy: false, // Disable COEP
        crossOriginOpenerPolicy: { policy: 'same-origin' }, // Adjust COOP as needed
    })
);
app.use(morgan('combined'));
// CORS configuration
const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000'];
app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin || origin === 'null') {
                return callback(null, true);
            }
            if (allowedOrigins.indexOf(origin) === -1) {
                const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
                return callback(new Error(msg), false);
            }
            return callback(null, true);
        },
        methods: ['GET', 'POST'],
        credentials: true,
    })
);
// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP
    message: 'Too many requests from this IP, please try again after 15 minutes',
});
app.use(limiter);
// Session middleware
app.use(
    session({
        secret: process.env.SESSION_SECRET || 'your-secret-key',
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
        cookie: {
            maxAge: 1000 * 60 * 60 * 24, // 1 day
            secure: process.env.NODE_ENV === 'production', // Set to true in production
        },
    })
);
// Apply IP blocker middleware globally
app.use(ipBlocker);
// Configure trust proxy based on environment
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
} else {
    app.set('trust proxy', false);
}
// ==================== Static Files ====================
app.use(express.static(path.join(__dirname, 'public')));
// ==================== Route Definitions ====================
// Admin login routes (no authentication required)
app.get('/admin/login', (req, res) => {
    res.render('admin/login', { error: null });
});
app.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const admin = await Admin.findOne({ username });
        if (!admin) {
            return res.render('admin/login', { error: 'Invalid username or password' });
        }
        const isMatch = await admin.comparePassword(password);
        if (!isMatch) {
            return res.render('admin/login', { error: 'Invalid username or password' });
        }
        // Successful login
        req.session.adminId = admin._id;
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        res.render('admin/login', { error: 'An error occurred. Please try again.' });
    }
});
// Admin logout
app.get('/admin/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});
// Protect admin routes
app.use('/admin', isAdminAuthenticated);
// Admin dashboard (protected route)
app.get('/admin/dashboard', async (req, res) => {
    // Fetch statistics
    const totalReports = await Report.countDocuments();
    const totalActiveSockets = io.engine.clientsCount; // Total connected sockets
    const allRooms = Array.from(io.sockets.adapter.rooms.keys());
    const totalChatRooms = allRooms.filter((room) => room.startsWith('chat_')).length;
    const totalVideoRooms = allRooms.filter((room) => room.startsWith('video_')).length;
    const stats = {
        totalReports,
        totalActiveSockets,
        totalChatRooms,
        totalVideoRooms,
    };
    // Fetch recent reports
    const reports = await Report.find().sort({ timestamp: -1 }).limit(10);
    res.render('admin/dashboard', { stats, reports });
});
// View report details
app.get('/admin/reports/:id', async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) {
            return res.status(404).send('Report not found');
        }
        res.render('admin/reportDetails', { report });
    } catch (err) {
        console.error(err);
        res.status(500).send('An error occurred');
    }
});
// Ban reported IP
app.post('/admin/reports/:id/ban', async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) {
            return res.status(404).send('Report not found');
        }
        // Check if IP is already banned
        const existingBan = await BannedIP.findOne({ ip: report.reportedIp });
        if (!existingBan) {
            // Ban the reported IP
            const bannedIP = new BannedIP({
                ip: report.reportedIp,
                reason: `Reported on ${report.timestamp}`,
            });
            await bannedIP.save();
        }
        // Optionally, delete the report after banning
        await Report.findByIdAndDelete(req.params.id);
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('An error occurred');
    }
});
// Delete report
app.post('/admin/reports/:id/delete', async (req, res) => {
    try {
        await Report.findByIdAndDelete(req.params.id);
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('An error occurred');
    }
});
// Public routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/chat', (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));
app.get('/video', (req, res) => res.sendFile(path.join(__dirname, 'public', 'video.html')));
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));
app.get('/terms', (req, res) => res.sendFile(path.join(__dirname, 'public', 'terms.html')));
// ==================== Socket.IO Logic ====================
const reportLimits = {};
const chatTranscripts = {};
// Queues to manage chat and video waiting users
const chatQueue = [];
const videoQueue = [];
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    // ==================== Report Event Handlers ====================
    socket.on('reportUser', (data) => {
        const reportType = data && data.type ? data.type : 'chat';
        if (reportType === 'chat') {
            handleUserReport(socket, data);
        } else if (reportType === 'video') {
            handleVideoUserReport(socket, data);
        } else {
            socket.emit('reportError', { message: 'Invalid report type.' });
        }
    });
    // ==================== Chat Event Handlers ====================
    socket.on('findStranger', () => {
        console.log(`User ${socket.id} is searching for a chat stranger.`);
        findChatPartner(socket);
    });
    socket.on('message', (msg) => {
        const room = socket.chatRoom;
        if (!room) {
            socket.emit('noPartner', { message: 'You are not connected to a partner yet.' });
            return;
        }
        // Store the message in the transcript
        if (!chatTranscripts[room]) {
            chatTranscripts[room] = [];
        }
        chatTranscripts[room].push({
            sender: socket.id,
            message: msg,
            timestamp: new Date(),
        });
        socket.to(room).emit('message', { from: socket.id, text: msg });
        console.log(`User ${socket.id} sent chat message in room ${room}: ${msg}`);
    });
    socket.on('typing', () => {
        const room = socket.chatRoom;
        if (room) {
            socket.to(room).emit('partnerTyping');
        }
    });
    socket.on('stopTyping', () => {
        const room = socket.chatRoom;
        if (room) {
            socket.to(room).emit('partnerStopTyping');
        }
    });
    socket.on('nextChat', () => {
        leaveChatRoom(socket);
        findChatPartner(socket);
    });
    // ==================== Video Event Handlers ====================
    socket.on('findVideoPartner', () => {
        console.log(`User ${socket.id} is searching for a video partner.`);
        findVideoPartner(socket);
    });
    socket.on('videoSignal', (data) => {
        const { signalData } = data;
        const room = socket.videoRoom;
        if (room) {
            socket.to(room).emit('videoSignal', { signalData });
            console.log(`Forwarded video signal from ${socket.id} in room ${room}.`);
        }
    });
    socket.on('endCall', () => {
        leaveVideoRoom(socket);
        findVideoPartner(socket);
    });
    // ==================== Video Chat Message Handling ====================
    socket.on('videoChatMessage', (message) => {
        const room = socket.videoRoom;
        if (room) {
            socket.to(room).emit('videoChatMessage', { text: message });
            console.log(`User ${socket.id} sent video chat message in room ${room}: ${message}`);
        } else {
            socket.emit('noPartner', { message: 'You are not connected to a partner yet.' });
        }
    });
    // ============= Disconnection and Error Handling =============
    socket.on('disconnect', () => {
        leaveChatRoom(socket);
        leaveVideoRoom(socket);
        removeFromQueue(chatQueue, socket);
        removeFromQueue(videoQueue, socket);
        // Clear any transcripts associated with this socket
        const rooms = Object.keys(chatTranscripts);
        rooms.forEach((room) => {
            if (room.includes(socket.id)) {
                delete chatTranscripts[room];
            }
        });
        console.log(`User ${socket.id} disconnected.`);
    });
});
// ==================== Partner Finding Functions ====================
// Find chat partner
function findChatPartner(socket) {
    if (socket.chatRoom) return;
    // Remove the socket from the queue if already present
    removeFromQueue(chatQueue, socket);
    if (chatQueue.length > 0) {
        const partnerSocket = chatQueue.shift();
        if (partnerSocket.connected && !partnerSocket.chatRoom) {
            const roomId = `chat_${socket.id}_${partnerSocket.id}`;
            socket.join(roomId);
            partnerSocket.join(roomId);
            socket.chatRoom = roomId;
            partnerSocket.chatRoom = roomId;
            socket.emit('partnerFound');
            partnerSocket.emit('partnerFound');
            console.log(`Paired chat User ${socket.id} with User ${partnerSocket.id} in room ${roomId}`);
        } else {
            findChatPartner(socket); // Retry finding a partner
        }
    } else {
        chatQueue.push(socket);
        console.log(`User ${socket.id} is waiting for a chat partner.`);
    }
}
// Find video partner
function findVideoPartner(socket) {
    if (socket.videoRoom) return;
    // Remove the socket from the queue if already present
    removeFromQueue(videoQueue, socket);
    if (videoQueue.length > 0) {
        const partnerSocket = videoQueue.shift();
        if (partnerSocket.connected && !partnerSocket.videoRoom) {
            const roomId = `video_${socket.id}_${partnerSocket.id}`;
            socket.join(roomId);
            partnerSocket.join(roomId);
            socket.videoRoom = roomId;
            partnerSocket.videoRoom = roomId;
            // Assign initiator role
            socket.emit('videoPartnerFound', { initiator: true });
            partnerSocket.emit('videoPartnerFound', { initiator: false });
            console.log(
                `Paired video User ${socket.id} (initiator) with User ${partnerSocket.id} in room ${roomId}`
            );
        } else {
            findVideoPartner(socket); // Retry finding a partner
        }
    } else {
        videoQueue.push(socket);
        console.log(`User ${socket.id} is waiting for a video partner.`);
    }
}
// Remove a socket from a queue
function removeFromQueue(queue, socket) {
    const index = queue.indexOf(socket);
    if (index !== -1) {
        queue.splice(index, 1);
    }
}
// Leave chat room
function leaveChatRoom(socket) {
    const room = socket.chatRoom;
    if (room) {
        socket.leave(room);
        socket.to(room).emit('partnerLeft', { reason: 'disconnected' });
        const partnerSocket = getSocketFromRoom(room, socket.id);
        if (partnerSocket) {
            partnerSocket.chatRoom = null;
            findChatPartner(partnerSocket);
        }
        socket.chatRoom = null;
        console.log(`User ${socket.id} left chat room ${room}`);
        delete chatTranscripts[room];
    }
}
// Leave video room
function leaveVideoRoom(socket) {
    const room = socket.videoRoom;
    if (room) {
        socket.leave(room);
        const partnerSocket = getSocketFromRoom(room, socket.id);
        if (partnerSocket && partnerSocket.connected) {
            partnerSocket.videoRoom = null;
            partnerSocket.emit('callEnded', { reason: 'partner_left' });
        }
        socket.videoRoom = null;
        console.log(`User ${socket.id} left video room ${room}`);
    }
}
// Get the partner socket from the room
function getSocketFromRoom(room, excludeSocketId) {
    const clients = io.sockets.adapter.rooms.get(room);
    if (clients) {
        for (const clientId of clients) {
            if (clientId !== excludeSocketId) {
                return io.sockets.sockets.get(clientId);
            }
        }
    }
    return null;
}
// ==================== Report User Functions ====================
function handleUserReport(socket, data) {
    const now = Date.now();
    const timeWindow = 60 * 1000; // 1-minute time window
    const maxReportsPerWindow = 3; // Max reports allowed in the time window
    if (!reportLimits[socket.id]) {
        reportLimits[socket.id] = [];
    }
    // Filter out timestamps outside the time window
    reportLimits[socket.id] = reportLimits[socket.id].filter(
        (timestamp) => now - timestamp < timeWindow
    );
    // Check if the user has exceeded the report limit
    if (reportLimits[socket.id].length >= maxReportsPerWindow) {
        socket.emit('reportLimitExceeded', {
            message: 'You have reached the report limit. Please try again later.',
        });
        return;
    }
    // Add the current timestamp to the user's report history
    reportLimits[socket.id].push(now);
    const room = socket.chatRoom;
    if (room) {
        const partnerSocket = getSocketFromRoom(room, socket.id);
        if (partnerSocket) {
            // Retrieve the chat transcript
            const transcript = chatTranscripts[room] || [];
            // Create a new report instance
            const newReport = new Report({
                reporterSocketId: socket.id,
                reportedSocketId: partnerSocket.id,
                chatRoom: room,
                reporterIp: socket.handshake.address,
                reportedIp: partnerSocket.handshake.address,
                chatTranscript: transcript,
            });
            // Save the report to the database
            newReport
                .save()
                .then(() => {
                    console.log(`User ${socket.id} reported User ${partnerSocket.id}`);
                    // Disconnect both users from the chat room
                    leaveChatRoom(socket);
                    leaveChatRoom(partnerSocket);
                    // Both users start searching for new partners
                    findChatPartner(socket);
                    findChatPartner(partnerSocket);
                })
                .catch((err) => {
                    console.error('Error saving report:', err);
                    socket.emit('reportError', {
                        message: 'An error occurred while processing your report.',
                    });
                });
        } else {
            console.error('Partner socket not found for reporting.');
            socket.emit('reportError', { message: 'Unable to find the user to report.' });
        }
    } else {
        console.error('User is not currently in a chat room.');
        socket.emit('reportError', { message: 'You are not currently in a chat session.' });
    }
}
function handleVideoUserReport(socket, data) {
    const { reason, callDuration } = data || {};
    const now = Date.now();
    const timeWindow = 60 * 1000; // 1-minute window
    const maxReportsPerWindow = 3;
    if (!reportLimits[socket.id]) {
        reportLimits[socket.id] = [];
    }
    // Rate limiting
    reportLimits[socket.id] = reportLimits[socket.id].filter(
        (timestamp) => now - timestamp < timeWindow
    );
    if (reportLimits[socket.id].length >= maxReportsPerWindow) {
        socket.emit('reportLimitExceeded', {
            message: 'You have reached the report limit. Please try again later.',
        });
        return;
    }
    reportLimits[socket.id].push(now);
    const room = socket.videoRoom;
    if (room) {
        const partnerSocket = getSocketFromRoom(room, socket.id);
        if (partnerSocket) {
            // Create a new report instance
            const newReport = new Report({
                reporterSocketId: socket.id,
                reportedSocketId: partnerSocket.id,
                videoRoom: room,
                timestamp: new Date(),
                reporterIp: socket.handshake.address,
                reportedIp: partnerSocket.handshake.address,
                callDuration: callDuration,
                reportReason: reason,
            });
            newReport
                .save()
                .then(() => {
                    console.log(
                        `User ${socket.id} reported User ${partnerSocket.id} in video call`
                    );
                    // Disconnect both users
                    leaveVideoRoom(socket);
                    leaveVideoRoom(partnerSocket);
                    // Both users start searching for new partners
                    findVideoPartner(socket);
                    findVideoPartner(partnerSocket);
                    // Notify the reported user
                    if (partnerSocket.connected) {
                        partnerSocket.emit('callEnded', { reason: 'reported' });
                    }
                })
                .catch((err) => {
                    console.error('Error saving video report:', err);
                    socket.emit('reportError', {
                        message: 'An error occurred while processing your report.',
                    });
                });
        } else {
            socket.emit('reportError', { message: 'Unable to find the user to report.' });
        }
    } else {
        socket.emit('reportError', { message: 'You are not currently in a video session.' });
    }
}
// ==================== MongoDB Connection ====================
// MongoDB Connection URI (use environment variable)
const mongoURI = process.env.MONGODB_URI;
if (!mongoURI) {
    console.error('Error: MONGODB_URI is not defined in environment variables.');
    process.exit(1);
}
// Connect to MongoDB
mongoose
    .connect(mongoURI)
    .then(() => {
        console.log('MongoDB connected successfully.');
    })
    .catch((err) => {
        console.error('MongoDB connection error:', err);
    });
// ==================== Server Setup ====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
