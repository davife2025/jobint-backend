// routes/applications.js - FIXED for guest mode
const express = require('express');
const { query } = require('../config/database');
const applicationService = require('../services/applicationServices');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * Flexible auth middleware
 */
async function flexibleAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const jwt = require('jsonwebtoken');
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        return next();
      } catch (jwtError) {}
    }
    
    const trackingToken = req.headers['x-tracking-token'] || req.query.token;
    if (trackingToken) {
      const result = await query('SELECT id FROM users WHERE tracking_token = $1', [trackingToken]);
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

// GET /api/applications/stats
router.get('/stats/overview', flexibleAuth, async (req, res) => {
  try {
    const stats = await applicationService.getApplicationStats(req.userId);
    const trendResult = await query(
      `SELECT DATE_TRUNC('week', applied_at) as week, COUNT(*) as count
       FROM applications WHERE user_id = $1 AND applied_at > NOW() - INTERVAL '8 weeks'
       GROUP BY week ORDER BY week DESC`,
      [req.userId]
    );
    res.json({ summary: stats, weeklyTrend: trendResult.rows });
  } catch (error) {
    logger.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// GET /api/applications
router.get('/', flexibleAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let sql = `SELECT a.id, a.status, a.blockchain_tx_hash, a.applied_at, a.updated_at,
                      jl.title as job_title, jl.company, jl.location, jl.application_url as job_url, jl.remote_type,
                      i.id as interview_id, i.scheduled_at as interview_date
               FROM applications a
               JOIN job_listings jl ON a.job_id = jl.id
               LEFT JOIN interviews i ON a.id = i.application_id
               WHERE a.user_id = $1`;
    const params = [req.userId];
    let paramIndex = 2;

    if (status) {
      sql += ` AND a.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    sql += ` ORDER BY a.applied_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);
    const countSql = status ? 'SELECT COUNT(*) FROM applications WHERE user_id = $1 AND status = $2' : 'SELECT COUNT(*) FROM applications WHERE user_id = $1';
    const countParams = status ? [req.userId, status] : [req.userId];
    const countResult = await query(countSql, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      applications: result.rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    logger.error('Get applications error:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// GET /api/applications/:id
router.get('/:id', flexibleAuth, async (req, res) => {
  try {
    const result = await query(
      `SELECT a.*, jl.title as job_title, jl.company, jl.location, jl.description as job_description, jl.application_url as job_url,
              i.scheduled_at as interview_date, i.meeting_link, i.location as interview_location
       FROM applications a
       JOIN job_listings jl ON a.job_id = jl.id
       LEFT JOIN interviews i ON a.id = i.application_id
       WHERE a.id = $1 AND a.user_id = $2`,
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Application not found' });
    res.json({ application: result.rows[0] });
  } catch (error) {
    logger.error('Get application error:', error);
    res.status(500).json({ error: 'Failed to fetch application' });
  }
});

// POST /api/applications
router.post('/', flexibleAuth, async (req, res) => {
  try {
    const { jobListingId } = req.body;
    if (!jobListingId) return res.status(400).json({ error: 'jobListingId is required' });

    const existing = await query('SELECT id FROM applications WHERE user_id = $1 AND job_id = $2', [req.userId, jobListingId]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Already applied to this job' });

    const result = await applicationService.applyToJob(req.userId, jobListingId);
    if (result.success) {
      res.status(201).json({ message: 'Application submitted successfully', applicationId: result.applicationId });
    } else {
      res.status(500).json({ error: 'Application submission failed', details: result.error });
    }
  } catch (error) {
    logger.error('Submit application error:', error);
    res.status(500).json({ error: 'Failed to submit application' });
  }
});

// PUT /api/applications/:id/status
router.put('/:id/status', flexibleAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['applied', 'interview_requested', 'interview_scheduled', 'rejected', 'offered'];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const result = await query(
      `UPDATE applications SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND user_id = $3 RETURNING *`,
      [status, req.params.id, req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Application not found' });
    res.json({ message: 'Status updated', application: result.rows[0] });
  } catch (error) {
    logger.error('Update status error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// DELETE /api/applications/:id
router.delete('/:id', flexibleAuth, async (req, res) => {
  try {
    const result = await query(`UPDATE applications SET status = 'withdrawn' WHERE id = $1 AND user_id = $2 RETURNING id`, [req.params.id, req.userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Application not found' });
    res.json({ message: 'Application withdrawn' });
  } catch (error) {
    logger.error('Delete application error:', error);
    res.status(500).json({ error: 'Failed to withdraw application' });
  }
});

module.exports = router;