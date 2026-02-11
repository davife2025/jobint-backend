// server.js - FIXED VERSION (Correct Middleware Order)

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const path = require('path');
const logger = require('./utils/logger');

// Database and Redis
const { pool } = require('./config/database');
const { redisClient } = require('./config/redis');

// Routes
const authRoutes = require('./routes/auth');
const { router: guestRoutes } = require('./routes/guestApplication'); // ✅ Destructure router
const userRoutes = require('./routes/users');
const jobRoutes = require('./routes/jobs');
const applicationRoutes = require('./routes/applications');
const interviewRoutes = require('./routes/interview');
const calendarRoutes = require('./routes/calendar');
const blockchainRoutes = require('./routes/blockchain');
const notificationRoutes = require('./routes/notifications');

// Cron jobs
const dailyJobScrape = require('./jobs/dailyJobScrape');
const interviewReminders = require('./jobs/interviewReminders');

const app = express();
const PORT = process.env.PORT || 5000;

// ============================================
// MIDDLEWARE ORDER IS CRITICAL!
// ============================================

// 1. HELMET (Security headers)
app.use(helmet());

// 2. CORS (BEFORE routes)
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    if (process.env.NODE_ENV !== 'production') {
      if (origin.startsWith('http://localhost:')) {
        return callback(null, true);
      }
    }
    
    const allowedOrigins = [
      process.env.CLIENT_URL,
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Tracking-Token']
}));

// 3. BODY PARSERS (BEFORE routes that need them)
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// 4. SERVE STATIC FILES
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 5. RATE LIMITING
const guestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 1000 : 10,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'development' ? 1000 : 100,
  message: 'Too many requests',
  standardHeaders: true,
  legacyHeaders: false
});

// 6. REQUEST LOGGING
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
});

// ============================================
// HEALTH CHECK (Before routes)
// ============================================

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    await redisClient.ping();
    
    res.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      redis: 'connected',
      version: '2.0.0-guest'
    });
  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({ 
      status: 'unhealthy',
      error: error.message 
    });
  }
});

// ============================================
// API ROUTES (After middleware!)
// ============================================

// Guest routes (NO authentication required) - Apply guest limiter
app.use('/api/guest', guestLimiter, guestRoutes);

// Protected routes - Apply API limiter
app.use('/api/auth', apiLimiter, authRoutes);
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api/jobs', apiLimiter, jobRoutes);
app.use('/api/applications', apiLimiter, applicationRoutes);
app.use('/api/interviews', apiLimiter, interviewRoutes);
app.use('/api/calendar', apiLimiter, calendarRoutes);
app.use('/api/blockchain', apiLimiter, blockchainRoutes);
app.use('/api/notifications', apiLimiter, notificationRoutes);

// ============================================
// WELCOME ROUTE
// ============================================

app.get('/', (req, res) => {
  res.json({
    message: 'JobInt API - Automated Job Applications',
    version: '2.0.0',
    mode: 'Guest Applications Enabled',
    endpoints: {
      submit: 'POST /api/guest/submit - Submit application (no auth required)',
      track: 'GET /api/guest/track/:token - Track applications (no auth required)',
      health: 'GET /health - Health check'
    }
  });
});

// ============================================
// ERROR HANDLERS
// ============================================

// 404 handler
app.use((req, res) => {
  logger.warn(`404: ${req.method} ${req.path}`);
  res.status(404).json({ 
    error: 'Route not found',
    path: req.path 
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// ============================================
// DATABASE & REDIS INITIALIZATION
// ============================================

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
    await redisClient.connect();
    await redisClient.ping();
    logger.info('✅ Redis connected');
  } catch (error) {
    logger.error('❌ Redis connection failed:', error);
    process.exit(1);
  }
}

// ============================================
// CRON JOBS
// ============================================

function setupCronJobs() {
  // Daily job scraping at 6:00 AM
  cron.schedule('0 6 * * *', () => {
    logger.info('Running daily job scrape...');
    dailyJobScrape();
  });

  // Interview reminders every hour
  cron.schedule('0 * * * *', () => {
    logger.info('Checking for interview reminders...');
    interviewReminders();
  });

  logger.info('✅ Cron jobs scheduled');
}

// ============================================
// START SERVER
// ============================================

async function startServer() {
  try {
    await initializeDatabase();
    await initializeRedis();
    setupCronJobs();

    app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🌐 Client URL: ${process.env.CLIENT_URL || 'http://localhost:3000'}`);
      logger.info(`📝 Mode: Guest Applications (No Login Required)`);
      logger.info(`📧 Email: ${process.env.NODE_ENV === 'production' ? 'Enabled' : 'Development Mode (Console Only)'}`);
      logger.info(`📁 Upload directory: ${path.join(__dirname, 'uploads')}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  
  await pool.end();
  await redisClient.quit();
  
  process.exit(0);
});

// Start the server
startServer();

module.exports = app;