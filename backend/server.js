import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { connectDB } from './config/database.js';
import { describeSafepayConfig } from './config/safepay.js';
import publicRoutes from './routes/public.routes.js';
import authRoutes from './routes/auth.routes.js';
import userRoutes from './routes/user.routes.js';
import chatRoutes from './routes/chat.routes.js';
import meetingsRoutes from './routes/meetings.routes.js';
import feedbackRoutes from './routes/feedback.routes.js';
import creditsRoutes from './routes/credits.routes.js';
import recommendationsRoutes from './routes/recommendations.routes.js';
import paymentRoutes from './routes/payment.routes.js';
import supportRoutes from './routes/support.routes.js';
import payoutRoutes from './routes/payout.routes.js';
import adminRoutes from './routes/admin.routes.js';
import verificationRoutes from './routes/verification.routes.js';
import notificationsRoutes from './routes/notifications.routes.js';
import Conversation from './models/Conversation.js';
import Message from './models/Message.js';
import User from './models/User.js';
import { setSocketIO, notifyUser } from './utils/notify.js';
import { startMeetingReminderJob } from './jobs/meetingReminders.js';
import { startMeetingCompletionJob } from './jobs/completeMeetings.js';
import { isBlockedBetween } from './utils/blocking.js';
import { addOnlineSocket, removeOnlineSocket, isUserOnline, getOnlineUserIds } from './utils/presence.js';

// Get current directory for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

const app = express();
const server = http.createServer(app);

// One list for both the HTTP API and the socket server, so they can't drift
// apart. FRONTEND_URL is folded in: it is already the domain Safepay redirects
// buyers back to, so pointing it at a new domain shouldn't also require a code
// change here to stop CORS rejecting that same domain.
const ALLOWED_ORIGINS = [
  'https://skill-bridge-mern.vercel.app', // Vercel deployment
  'https://skill-bridge.me', // Custom domain (apex)
  'https://www.skill-bridge.me', // Custom domain (www)
  'http://localhost:5173', // Local development
  'http://localhost:3000',
  ...(process.env.FRONTEND_URL ? [process.env.FRONTEND_URL.trim().replace(/\/+$/, '')] : []),
].filter((v, i, all) => all.indexOf(v) === i);

const io = new SocketIOServer(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    credentials: true,
  },
});

// Make io available to routes
app.set('io', io);
setSocketIO(io);

// Middleware
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true
}));
// Safepay signs its webhooks as an HMAC over the RAW body, so those bytes must
// survive untouched. This has to be mounted BEFORE express.json(), which would
// otherwise consume the stream and leave only a parsed object - re-serialising
// that would reorder keys and break the digest. express.json() then skips the
// body it finds already parsed here.
app.use('/api/payments/safepay-webhook', express.raw({ type: '*/*' }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database connection is established before the server starts listening - see
// the await below. Starting to serve requests first meant any query that
// arrived during a slow connect buffered until it timed out and crashed the
// process.

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'SkillBridge API is running!' });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'
  });
});

// API Routes
// No authenticateToken anywhere inside - see routes/public.routes.js for what
// that means for the shape of its responses.
app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/meetings', meetingsRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/credits', creditsRoutes);
app.use('/api/recommendations', recommendationsRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/verification', verificationRoutes);
app.use('/api/notifications', notificationsRoutes);

// Socket auth
io.use((socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization || '').split(' ')[1];

    if (!token) return next(new Error('Access token required'));

    jwt.verify(token, process.env.JWT_SECRET, async (err, user) => {
      if (err) return next(new Error('Invalid or expired token'));
      const dbUser = await User.findById(user.userId).select('isSuspended role');
      if (dbUser?.isSuspended) return next(new Error('Account suspended'));
      socket.user = user;
      // Needed below to put admins in a shared room - the JWT itself only
      // carries the user id.
      socket.userRole = dbUser?.role;
      next();
    });
  } catch (e) {
    next(new Error('Socket auth failed'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.user?.userId;

  // Personal room so any backend code can push a notification to this user
  // regardless of which conversation rooms they're in.
  if (userId) {
    socket.join(`user:${userId}`);

    const wasOffline = addOnlineSocket(userId, socket.id);
    if (wasOffline) io.emit('userOnline', { userId: String(userId) });

    socket.emit('onlineUsers', { userIds: getOnlineUserIds() });

    // Shared room for moderation events (new verification submissions etc.)
    // so admin screens can update without polling.
    if (socket.userRole === 'admin') socket.join('admins');
  }

  socket.on('joinConversation', async ({ conversationId }) => {
    if (!conversationId) return;
    const conv = await Conversation.findById(conversationId).select('participants');
    if (!conv) return;
    if (!conv.participants.map(String).includes(String(userId))) return;
    socket.join(`conv:${conversationId}`);

    // Joining a conversation means this user's client has received/rendered
    // it, so mark any messages sent to them as delivered.
    const result = await Message.updateMany(
      { conversation: conversationId, sender: { $ne: userId }, deliveredTo: { $ne: userId } },
      { $addToSet: { deliveredTo: userId } }
    );
    if (result.modifiedCount > 0) {
      io.to(`conv:${conversationId}`).emit('messagesDelivered', { conversationId, userId: String(userId) });
    }
  });

  socket.on('sendMessage', async ({ conversationId, text }, ack) => {
    try {
      if (!conversationId || !text?.trim()) return;
      const conv = await Conversation.findById(conversationId);
      if (!conv) return;
      if (!conv.participants.map(String).includes(String(userId))) return;

      const otherParticipantId = conv.participants.map(String).find((p) => p !== String(userId));
      if (otherParticipantId && (await isBlockedBetween(userId, otherParticipantId))) {
        if (ack) ack({ ok: false, error: 'Unable to message this user' });
        return;
      }

      const message = await Message.create({
        conversation: conversationId,
        sender: userId,
        text: text.trim(),
        readBy: [userId],
        deliveredTo: otherParticipantId && isUserOnline(otherParticipantId) ? [otherParticipantId] : [],
      });
      conv.lastMessage = message._id;
      await conv.save();

      const populated = await Message.findById(message._id).populate('sender', 'name email avatar');
      io.to(`conv:${conversationId}`).emit('newMessage', { message: populated });
      if (ack) ack({ ok: true, message: populated });

      const recipients = conv.participants.map(String).filter((p) => p !== String(userId));
      for (const recipientId of recipients) {
        notifyUser({
          userId: recipientId,
          type: 'new_message',
          title: `New message from ${populated.sender.name}`,
          body: populated.text.length > 140 ? `${populated.text.slice(0, 140)}...` : populated.text,
          link: '/chat',
        });
      }
    } catch (err) {
      if (ack) ack({ ok: false, error: err.message });
    }
  });

  socket.on('disconnect', async () => {
    if (!userId) return;
    const wentOffline = removeOnlineSocket(userId, socket.id);
    if (wentOffline) {
      const lastSeen = new Date();
      try {
        await User.findByIdAndUpdate(userId, { lastSeen });
      } catch (e) {
        // non-fatal - presence broadcast still goes out even if the DB write fails
      }
      io.emit('userOffline', { userId: String(userId), lastSeen: lastSeen.toISOString() });
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!', 
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

// Top-level await (ESM): nothing is served, and no scheduled job runs, until
// the database is actually reachable.
await connectDB();

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  // Names and set/missing only, never values - see describeSafepayConfig.
  describeSafepayConfig();
  startMeetingReminderJob();
  startMeetingCompletionJob();
});

