// routes/interviews.js - FIXED for guest mode
const express = require('express');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Flexible auth middleware - works with both JWT and tracking token
 */
async function flexibleAuth(req, res, next) {
  try {
    // Try JWT first
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const jwt = require('jsonwebtoken');
      
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        return next();
      } catch (jwtError) {
        // JWT invalid, try tracking token
      }
    }
    
    // Try tracking token
    const trackingToken = req.headers['x-tracking-token'] || req.query.token;
    if (trackingToken) {
      const result = await query(
        'SELECT id FROM users WHERE tracking_token = $1',
        [trackingToken]
      );
      
      if (result.rows.length > 0) {
        req.userId = result.rows[0].id;
        return next();
      }
    }
    
    return res.status(401).json({ error: 'Authentication required' });
  } catch (error) {
    logger.error('Auth error:', error);
    return res.status(500).json({ error: 'Authentication failed' });
  }
}

// GET /api/interviews
router.get('/', flexibleAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT 
         i.id,
         i.scheduled_at,
         i.duration_minutes,
         i.meeting_link,
         i.meeting_type,
         i.location,
         i.status,
         i.notes,
         i.created_at,
         a.id as application_id,
         jl.title as job_title,
         jl.company,
         jl.location as job_location
       FROM interviews i
       LEFT JOIN applications a ON i.application_id = a.id
       LEFT JOIN job_listings jl ON a.job_id = jl.id
       WHERE i.user_id = $1
       ORDER BY i.scheduled_at DESC`,
      [req.userId]
    );
    
    res.json({ interviews: result.rows });
  } catch (error) {
    logger.error('Get interviews error:', error);
    res.status(500).json({ error: 'Failed to fetch interviews' });
  }
});

// POST /api/interviews
router.post('/', flexibleAuth, async (req, res) => {
  try {
    const { applicationId, scheduledAt, duration, location, meetingLink } = req.body;
    
    const result = await query(
      `INSERT INTO interviews (user_id, application_id, scheduled_at, duration_minutes, location, meeting_link, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'scheduled')
       RETURNING *`,
      [req.userId, applicationId, scheduledAt, duration || 60, location, meetingLink]
    );
    
    res.status(201).json({ interview: result.rows[0] });
  } catch (error) {
    logger.error('Create interview error:', error);
    res.status(500).json({ error: 'Failed to create interview' });
  }
});

// PUT /api/interviews/:id
router.put('/:id', flexibleAuth, async (req, res) => {
  try {
    const { scheduledAt, location, meetingLink, notes } = req.body;

    const result = await query(
      `UPDATE interviews
       SET scheduled_at = COALESCE($1, scheduled_at),
           location = COALESCE($2, location),
           meeting_link = COALESCE($3, meeting_link),
           notes = COALESCE($4, notes),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5 AND user_id = $6
       RETURNING *`,
      [scheduledAt, location, meetingLink, notes, req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    res.json({ interview: result.rows[0] });
  } catch (error) {
    logger.error('Update interview error:', error);
    res.status(500).json({ error: 'Failed to update interview' });
  }
});

// DELETE /api/interviews/:id
router.delete('/:id', flexibleAuth, async (req, res) => {
  try {
    const result = await query(
      `UPDATE interviews
       SET status = 'cancelled'
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Interview not found' });
    }

    res.json({ message: 'Interview cancelled' });
  } catch (error) {
    logger.error('Cancel interview error:', error);
    res.status(500).json({ error: 'Failed to cancel interview' });
  }
});

module.exports = router;