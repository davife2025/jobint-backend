// server.js - FIXED with higher rate limits and correct route imports
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const path = require('path');
const logger = require('./utils/logger');

const { pool } = require('./config/database');
const { redisClient } = require('./config/redis');

// Routes
const authRoutes = require('./routes/auth');
const guestRoutes = require('./routes/guestApplication');  // ✅ Fixed: direct import
const userRoutes = require('./routes/users');
const jobRoutes = require('./routes/jobs');
const applicationRoutes = require('./routes/applications');
const interviewRoutes = require('./routes/interviews');  // ✅ Fixed: plural
const calendarRoutes = require('./routes/calendar');
const blockchainRoutes = require('./routes/blockchain');
const notificationRoutes = require('./routes/notifications');

const dailyJobScrape = require('./jobs/dailyJobScrape');
const interviewReminders = require('./jobs/interviewReminders');

const app = express();
const PORT = process.env.PORT || 5000;

// Security
app.use(helmet());

// CORS
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      process.env.CLIENT_URL,
      'https://jobclaw.vercel.app',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003'
    ].filter(Boolean);
    
    if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked: ${origin}`);
      callback(null, true); // Allow anyway in dev
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tracking-Token']
}));

// Body parsers
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ FIXED: Much higher rate limits to prevent 429 errors
const guestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 10000 : 100, // 10k dev, 100 prod
  message: 'Too many requests from this IP',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development' // Skip in dev
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 10000 : 1000, // 10k dev, 1000 prod
  message: 'Too many requests',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development' // Skip in dev
});

// Logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, { ip: req.ip });
  next();
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    let redisStatus = 'disconnected';
    try {
      if (redisClient.isOpen) {
        await redisClient.ping();
        redisStatus = 'connected';
      }
    } catch (e) {
      // Redis optional
    }
    
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      redis: redisStatus,
      version: '2.0.0-guest'
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({ status: 'unhealthy', error: error.message });
  }
});

// Routes
app.use('/api/guest', guestLimiter, guestRoutes.router || guestRoutes); // Support both exports
app.use('/api/auth', apiLimiter, authRoutes);
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api/jobs', apiLimiter, jobRoutes);
app.use('/api/applications', apiLimiter, applicationRoutes);
app.use('/api/interviews', apiLimiter, interviewRoutes);
app.use('/api/calendar', apiLimiter, calendarRoutes);
app.use('/api/blockchain', apiLimiter, blockchainRoutes);
app.use('/api/notifications', apiLimiter, notificationRoutes);

// Welcome route
app.get('/', (req, res) => {
  res.json({
    message: 'JobInt API - Automated Job Applications',
    version: '2.0.0',
    mode: 'Guest Applications Enabled',
    endpoints: {
      submit: 'POST /api/guest/submit',
      track: 'GET /api/guest/track/:token',
      health: 'GET /health'
    }
  });
});

// 404
app.use((req, res) => {
  logger.warn(`404: ${req.method} ${req.path}`);
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Database & Redis
async function initializeDatabase() {
  try {
    await pool.query('SELECT NOW()');
    logger.info('✅ Database connected');
  } catch (error) {
    logger.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

async function initializeRedis() {
  try {
    if (!redisClient.isOpen) await redisClient.connect();
    await redisClient.ping();
    logger.info('✅ Redis connected');
  } catch (error) {
    logger.warn('⚠️  Redis connection failed (continuing without cache):', error.message);
    // Don't exit - app works without Redis
  }
}

// Cron jobs
function setupCronJobs() {
  cron.schedule('0 6 * * *', () => {
    logger.info('Running daily job scrape...');
    dailyJobScrape();
  });

  cron.schedule('0 * * * *', () => {
    logger.info('Checking for interview reminders...');
    interviewReminders();
  });

  logger.info('✅ Cron jobs scheduled');
}

// Start server
async function startServer() {
  try {
    await initializeDatabase();
    await initializeRedis();
    setupCronJobs();

    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🌐 Client URL: ${process.env.CLIENT_URL || 'http://localhost:3000'}`);
      logger.info(`📧 Mode: Guest Applications (No Login Required)`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down...');
  await pool.end();
  if (redisClient.isOpen) await redisClient.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down...');
  await pool.end();
  if (redisClient.isOpen) await redisClient.quit();
  process.exit(0);
});

startServer();

module.exports = app;