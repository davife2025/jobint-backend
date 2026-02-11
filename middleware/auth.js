const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/auth/register
 * LEGACY ENDPOINT - Kept for backwards compatibility but not used in main flow
 * Users now register via guest application form
 */
router.post('/register', async (req, res) => {
  const { email, password, firstName, lastName, location } = req.body;

  try {
    // Check if user already exists
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user (not a guest user since they're providing a password)
    const result = await query(
      `INSERT INTO users (email, password_hash, first_name, last_name, location, is_guest)
       VALUES ($1, $2, $3, $4, $5, FALSE)
       RETURNING id, email, first_name, last_name, location, tracking_token, created_at`,
      [email, passwordHash, firstName, lastName, location]
    );

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '7d' }
    );

    logger.info(`User registered (legacy): ${email}`);

    res.status(201).json({
      message: 'User registered successfully',
      token,
      trackingToken: user.tracking_token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        location: user.location
      }
    });
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

/**
 * POST /api/auth/login
 * DISABLED - Login is not part of the guest flow
 * Users access their data via tracking token instead
 */
router.post('/login', async (req, res) => {
  res.status(403).json({ 
    error: 'Login is disabled. Please use your tracking link to access your applications.',
    message: 'Check your email for your unique tracking link, or submit a new application to receive one.'
  });
});

/**
 * GET /api/auth/verify-token/:token
 * Verify a tracking token and return user info
 */
router.get('/verify-token/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await query(
      `SELECT id, email, first_name, last_name, tracking_token, is_guest, created_at
       FROM users WHERE tracking_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Invalid tracking token',
        message: 'This tracking link is not valid. Please check your email or submit a new application.'
      });
    }

    const user = result.rows[0];

    res.json({
      valid: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        trackingToken: user.tracking_token,
        isGuest: user.is_guest,
        createdAt: user.created_at
      }
    });

  } catch (error) {
    logger.error('Token verification error:', error);
    res.status(500).json({ error: 'Failed to verify token' });
  }
});

/**
 * GET /api/auth/me
 * MODIFIED - Now works with tracking token instead of JWT
 * Kept for backwards compatibility but requires tracking token
 */
router.get('/me', async (req, res) => {
  try {
    // Try to get tracking token from query params or headers
    const trackingToken = req.query.token || req.headers['x-tracking-token'];

    if (!trackingToken) {
      return res.status(401).json({ 
        error: 'No tracking token provided',
        message: 'Please provide your tracking token to access your data'
      });
    }

    const result = await query(
      `SELECT id, email, first_name, last_name, phone, location, 
              tracking_token, is_guest, created_at
       FROM users WHERE tracking_token = $1`,
      [trackingToken]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    logger.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user data' });
  }
});

/**
 * POST /api/auth/request-tracking-link
 * Request a new tracking link to be sent via email
 */
router.post('/request-tracking-link', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const result = await query(
      'SELECT id, email, first_name, tracking_token FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Email not found',
        message: 'No account found with this email. Please submit a new application.'
      });
    }

    const user = result.rows[0];

    // Send tracking link email
    const emailService = require('../services/emailService');
    await emailService.sendWelcomeEmail(user);

    res.json({ 
      message: 'Tracking link sent to your email',
      email: user.email
    });

  } catch (error) {
    logger.error('Request tracking link error:', error);
    res.status(500).json({ error: 'Failed to send tracking link' });
  }
});

/**
 * POST /api/auth/refresh
 * DISABLED - Not needed in guest flow
 */
router.post('/refresh', async (req, res) => {
  res.status(403).json({ 
    error: 'Token refresh is not available',
    message: 'Please use your tracking link to access your applications.'
  });
});

module.exports = router;