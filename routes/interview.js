const express = require('express');
const auth = require('../middleware/auth');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/interviews
router.get('/', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT i.*, a.job_listing_id, jl.title as job_title, jl.company
       FROM interviews i
       JOIN applications a ON i.application_id = a.id
       JOIN job_listings jl ON a.job_listing_id = jl.id
       WHERE a.user_id = $1
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
router.post('/', auth, async (req, res) => {
  try {
    const { applicationId, scheduledAt, duration, location, meetingLink } = req.body;
    
    const result = await query(
      `INSERT INTO interviews (application_id, scheduled_at, duration, location, meeting_link)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [applicationId, scheduledAt, duration || 60, location, meetingLink]
    );
    
    res.status(201).json({ interview: result.rows[0] });
  } catch (error) {
    logger.error('Create interview error:', error);
    res.status(500).json({ error: 'Failed to create interview' });
  }
});

// PUT /api/interviews/:id
router.put('/:id', auth, async (req, res) => {
  try {
    const { scheduledAt, location, meetingLink, notes } = req.body;

    const result = await query(
      `UPDATE interviews i
       SET scheduled_at = COALESCE($1, scheduled_at),
           location = COALESCE($2, location),
           meeting_link = COALESCE($3, meeting_link),
           notes = COALESCE($4, notes),
           updated_at = CURRENT_TIMESTAMP
       FROM applications a
       WHERE i.application_id = a.id
       AND i.id = $5
       AND a.user_id = $6
       RETURNING i.*`,
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
router.delete('/:id', auth, async (req, res) => {
  try {
    const result = await query(
      `UPDATE interviews i
       SET status = 'cancelled'
       FROM applications a
       WHERE i.application_id = a.id
       AND i.id = $1
       AND a.user_id = $2
       RETURNING i.*`,
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