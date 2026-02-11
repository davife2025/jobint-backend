const express = require('express');
const auth = require('../middleware/auth');
const { query } = require('../config/database');
const matchingService = require('../services/matchingServices');
const logger = require('../utils/logger');

const router = express.Router();



/**
 * GET /api/jobs/matches/pending
 * Get unreviewed job matches for user
 */
router.get('/matches/pending', auth, async (req, res) => {
  try {
    const matches = await matchingService.getMatchedJobs(req.userId, false);
    res.json({ matches });
  } catch (error) {
    logger.error('Get pending matches error:', error);
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

/**
 * GET /api/jobs/matches/reviewed
 * Get reviewed job matches
 */
router.get('/matches/reviewed', auth, async (req, res) => {
  try {
    const matches = await matchingService.getMatchedJobs(req.userId, true);
    res.json({ matches });
  } catch (error) {
    logger.error('Get reviewed matches error:', error);
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

/**
 * POST /api/jobs/matches/trigger
 * Manually trigger job matching for user
 */
router.post('/matches/trigger', auth, async (req, res) => {
  try {
    const matches = await matchingService.matchJobsForUser(req.userId);
    
    res.json({
      message: 'Job matching completed',
      matchCount: matches.length,
      matches
    });
  } catch (error) {
    logger.error('Trigger matching error:', error);
    res.status(500).json({ error: 'Failed to match jobs' });
  }
});

/**
 * PUT /api/jobs/matches/:matchId/review
 * Review a job match (approve or reject)
 */
router.put('/matches/:matchId/review', auth, async (req, res) => {
  try {
    const { approved } = req.body;

    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'approved must be boolean' });
    }

    const match = await matchingService.reviewMatch(
      req.userId,
      req.params.matchId,
      approved
    );

    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // If approved, queue for application
    if (approved) {
      await query(
        `INSERT INTO application_queue (job_match_id, status)
         VALUES ($1, 'pending')`,
        [req.params.matchId]
      );
    }

    res.json({
      message: approved ? 'Match approved - queued for application' : 'Match rejected',
      match
    });
  } catch (error) {
    logger.error('Review match error:', error);
    res.status(500).json({ error: 'Failed to review match' });
  }
});

/**
 * GET /api/jobs/stats
 * Get job statistics
 */
router.get('/stats/overview', auth, async (req, res) => {
  try {
    const stats = await query(`
      SELECT 
        COUNT(*) FILTER (WHERE scraped_at > NOW() - INTERVAL '24 hours') as new_today,
        COUNT(*) FILTER (WHERE scraped_at > NOW() - INTERVAL '7 days') as new_this_week,
        COUNT(DISTINCT company) as total_companies,
        COUNT(*) FILTER (WHERE remote = TRUE) as remote_jobs,
        COUNT(*) as total_active
      FROM job_listings
      WHERE is_active = TRUE
    `);

    const userMatchStats = await query(`
      SELECT 
        COUNT(*) as total_matches,
        COUNT(*) FILTER (WHERE reviewed = FALSE) as pending_review,
        COUNT(*) FILTER (WHERE approved = TRUE) as approved
      FROM job_matches
      WHERE user_id = $1
    `, [req.userId]);

    res.json({
      global: stats.rows[0],
      user: userMatchStats.rows[0]
    });
  } catch (error) {
    logger.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});



/**
 * GET /api/jobs
 * Get available jobs with filters
 */
router.get('/', auth, async (req, res) => {
  try {
    const {
      search,
      location,
      remote,
      source,
      page = 1,
      limit = 20
    } = req.query;

    const offset = (page - 1) * limit;

    let sql = `
      SELECT id, source, title, company, location, description, 
             url, salary, job_type, remote, posted_at, scraped_at
      FROM job_listings
      WHERE is_active = TRUE
    `;
    const params = [];
    let paramIndex = 1;

    if (search) {
      sql += ` AND (title ILIKE $${paramIndex} OR company ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (location) {
      sql += ` AND location ILIKE $${paramIndex}`;
      params.push(`%${location}%`);
      paramIndex++;
    }

    if (remote === 'true') {
      sql += ` AND remote = TRUE`;
    }

    if (source) {
      sql += ` AND source = $${paramIndex}`;
      params.push(source);
      paramIndex++;
    }

    sql += ` ORDER BY scraped_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await query(sql, params);

    // Get total count
    const countResult = await query(
      'SELECT COUNT(*) FROM job_listings WHERE is_active = TRUE'
    );
    const total = parseInt(countResult.rows[0].count);

    res.json({
      jobs: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logger.error('Get jobs error:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

/**
 * GET /api/jobs/:id
 * Get single job details
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM job_listings WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({ job: result.rows[0] });
  } catch (error) {
    logger.error('Get job error:', error);
    res.status(500).json({ error: 'Failed to fetch job' });
  }
});


module.exports = router;