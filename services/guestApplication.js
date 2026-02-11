const express = require('express');
const { query } = require('../config/database');
const { uploadCV, handleUploadError } = require('../middleware/fileUpload');
const cvParserService = require('../services/cvParserService');
const emailService = require('../services/emailService');
const matchingService = require('../services/matchingServices');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/guest/submit
 * Guest application submission - NO authentication required
 */
router.post('/submit', uploadCV, handleUploadError, async (req, res) => {
  try {
    const { firstName, lastName, email, phone, location, jobTitles, remotePreference } = req.body;

    // Validate required fields
    if (!firstName || !email || !req.file) {
      return res.status(400).json({ 
        error: 'Missing required fields. Please provide: firstName, email, and CV file' 
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    logger.info(`Guest application received: ${email}`);

    // Check if user already exists
    const existingUser = await query(
      'SELECT id, tracking_token, is_guest FROM users WHERE email = $1',
      [email]
    );

    let userId;
    let trackingToken;
    let isNewUser = false;

    if (existingUser.rows.length > 0) {
      // User exists - update their info
      userId = existingUser.rows[0].id;
      trackingToken = existingUser.rows[0].tracking_token;
      
      await query(
        `UPDATE users 
         SET first_name = $1, last_name = $2, phone = $3, location = $4, 
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [firstName, lastName || null, phone || null, location || null, userId]
      );

      logger.info(`Updated existing user: ${userId}`);
    } else {
      // Create new guest user
      const userResult = await query(
        `INSERT INTO users (email, first_name, last_name, phone, location, is_guest, password_hash)
         VALUES ($1, $2, $3, $4, $5, TRUE, NULL)
         RETURNING id, tracking_token`,
        [email, firstName, lastName || null, phone || null, location || null]
      );

      userId = userResult.rows[0].id;
      trackingToken = userResult.rows[0].tracking_token;
      isNewUser = true;

      logger.info(`Created new guest user: ${userId}`);
    }

    // Parse job titles from string or array
    let jobTitlesArray = [];
    if (jobTitles) {
      if (typeof jobTitles === 'string') {
        jobTitlesArray = jobTitles.split(',').map(t => t.trim()).filter(Boolean);
      } else if (Array.isArray(jobTitles)) {
        jobTitlesArray = jobTitles;
      }
    }

    // Get CV file path
    const cvFilePath = req.file.path;
    const cvUrl = `/uploads/resumes/${req.file.filename}`;

    // Process CV in background (don't wait)
    processCVAsync(userId, cvFilePath, cvUrl, jobTitlesArray, remotePreference || 'any', email, firstName, trackingToken);

    // Log activity
    await query(
      `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
       VALUES ($1, 'guest_signup', 'user', $2, $3)`,
      [userId, userId, JSON.stringify({ 
        email, 
        cvFilename: req.file.filename,
        jobTitles: jobTitlesArray 
      })]
    );

    // Send immediate welcome email
    await emailService.sendWelcomeEmail({
      id: userId,
      email,
      first_name: firstName,
      tracking_token: trackingToken
    });

    // Return success response
    res.status(201).json({
      message: 'Application submitted successfully! Check your email for your tracking link.',
      trackingToken,
      trackingUrl: `${process.env.CLIENT_URL}/track/${trackingToken}`,
      userId,
      isNewUser
    });

  } catch (error) {
    logger.error('Guest application error:', error);
    res.status(500).json({ 
      error: 'Failed to submit application. Please try again.' 
    });
  }
});

/**
 * GET /api/guest/track/:token
 * Track application status using token - NO authentication required
 */
router.get('/track/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Get user by tracking token
    const userResult = await query(
      `SELECT id, email, first_name, last_name, created_at, is_guest
       FROM users WHERE tracking_token = $1`,
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid tracking token' });
    }

    const user = userResult.rows[0];

    // Get user profile
    const profileResult = await query(
      'SELECT * FROM user_profiles WHERE user_id = $1',
      [user.id]
    );

    // Get applications
    const applicationsResult = await query(
      `SELECT 
         a.id,
         a.status,
         a.applied_at,
         jl.title as job_title,
         jl.company,
         jl.location,
         jl.url as job_url,
         jl.remote_type
       FROM applications a
       JOIN job_listings jl ON a.job_id = jl.id
       WHERE a.user_id = $1
       ORDER BY a.applied_at DESC`,
      [user.id]
    );

    // Get pending matches
    const matchesResult = await query(
      `SELECT 
         jm.id,
         jm.match_score,
         jm.match_reasons,
         jm.reviewed,
         jm.approved,
         jl.id as job_id,
         jl.title,
         jl.company,
         jl.location,
         jl.description,
         jl.url,
         jl.salary_range,
         jl.remote_type
       FROM job_matches jm
       JOIN job_listings jl ON jm.job_id = jl.id
       WHERE jm.user_id = $1 AND jm.reviewed = FALSE
       ORDER BY jm.match_score DESC
       LIMIT 20`,
      [user.id]
    );

    // Get interviews
    const interviewsResult = await query(
      `SELECT 
         i.*,
         jl.title as job_title,
         jl.company
       FROM interviews i
       JOIN applications a ON i.application_id = a.id
       JOIN job_listings jl ON a.job_id = jl.id
       WHERE i.user_id = $1
       ORDER BY i.scheduled_at DESC`,
      [user.id]
    );

    // Get stats
    const statsResult = await query(
      `SELECT 
         COUNT(DISTINCT a.id) as total_applications,
         COUNT(DISTINCT CASE WHEN a.status = 'interview_scheduled' THEN a.id END) as interviews_scheduled,
         COUNT(DISTINCT CASE WHEN a.status = 'offered' THEN a.id END) as offers_received,
         COUNT(DISTINCT jm.id) FILTER (WHERE jm.reviewed = FALSE) as pending_matches
       FROM users u
       LEFT JOIN applications a ON u.id = a.user_id
       LEFT JOIN job_matches jm ON u.id = jm.user_id
       WHERE u.id = $1
       GROUP BY u.id`,
      [user.id]
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        createdAt: user.created_at,
        isGuest: user.is_guest
      },
      profile: profileResult.rows[0] || null,
      applications: applicationsResult.rows,
      pendingMatches: matchesResult.rows,
      interviews: interviewsResult.rows,
      stats: statsResult.rows[0] || {
        total_applications: 0,
        interviews_scheduled: 0,
        offers_received: 0,
        pending_matches: 0
      }
    });

  } catch (error) {
    logger.error('Track application error:', error);
    res.status(500).json({ error: 'Failed to fetch tracking data' });
  }
});

/**
 * PUT /api/guest/track/:token/review-match/:matchId
 * Review a job match (approve/reject) - NO authentication required
 */
router.put('/track/:token/review-match/:matchId', async (req, res) => {
  try {
    const { token, matchId } = req.params;
    const { approved } = req.body;

    if (typeof approved !== 'boolean') {
      return res.status(400).json({ error: 'approved must be boolean' });
    }

    // Get user by tracking token
    const userResult = await query(
      'SELECT id FROM users WHERE tracking_token = $1',
      [token]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid tracking token' });
    }

    const userId = userResult.rows[0].id;

    // Update match
    const updateResult = await query(
      `UPDATE job_matches 
       SET reviewed = TRUE, approved = $1, status = $2
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [approved, approved ? 'approved' : 'rejected', matchId, userId]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // If approved, queue for application
    if (approved) {
      await query(
        `INSERT INTO application_queue (user_id, job_id, match_id, status)
         VALUES ($1, (SELECT job_id FROM job_matches WHERE id = $2), $2, 'pending')`,
        [userId, matchId]
      );

      logger.info(`Match approved and queued: ${matchId}`);
    }

    res.json({
      message: approved ? 'Match approved - application queued' : 'Match rejected',
      match: updateResult.rows[0]
    });

  } catch (error) {
    logger.error('Review match error:', error);
    res.status(500).json({ error: 'Failed to review match' });
  }
});

/**
 * Background CV processing function
 */
async function processCVAsync(userId, cvFilePath, cvUrl, jobTitles, remotePreference, email, firstName, trackingToken) {
  try {
    logger.info(`Starting background CV processing for user ${userId}`);

    // Process CV
    const cvResult = await cvParserService.processCV(cvFilePath);

    if (cvResult.success) {
      // Infer preferences
      const preferences = cvParserService.inferJobPreferences(
        cvResult.parsedData,
        { jobTitles, remotePreference }
      );

      // Create or update user profile
      await query(
        `INSERT INTO user_profiles 
         (user_id, resume_url, resume_text, resume_filename, skills, experience, education, 
          certifications, desired_job_titles, remote_preference, cv_parsed, profile_completed)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE, TRUE)
         ON CONFLICT (user_id) 
         DO UPDATE SET 
           resume_url = $2, resume_text = $3, resume_filename = $4, 
           skills = $5, experience = $6, education = $7, certifications = $8,
           desired_job_titles = $9, remote_preference = $10, 
           cv_parsed = TRUE, profile_completed = TRUE, updated_at = CURRENT_TIMESTAMP`,
        [
          userId,
          cvUrl,
          cvResult.cvText,
          cvFilePath.split('/').pop(),
          JSON.stringify(cvResult.parsedData.skills),
          JSON.stringify(cvResult.parsedData.experience),
          JSON.stringify(cvResult.parsedData.education),
          JSON.stringify(cvResult.parsedData.certifications),
          JSON.stringify(preferences.desiredJobTitles),
          remotePreference
        ]
      );

      logger.info(`Profile created for user ${userId}`);

      // Run job matching
      const matches = await matchingService.matchJobsForUser(userId, 20);

      logger.info(`Found ${matches.length} job matches for user ${userId}`);

      // Send matches found email if matches exist
      if (matches.length > 0) {
        await emailService.sendMatchesFoundEmail(
          { id: userId, email, first_name: firstName, tracking_token: trackingToken },
          matches.length,
          matches
        );
      }

      // Log activity
      await query(
        `INSERT INTO activity_logs (user_id, action, entity_type, details)
         VALUES ($1, 'cv_processed', 'profile', $2)`,
        [userId, JSON.stringify({ 
          skillsFound: cvResult.parsedData.skills.length,
          matchesFound: matches.length 
        })]
      );

    } else {
      logger.error(`CV processing failed for user ${userId}: ${cvResult.error}`);
      
      // Still create basic profile
      await query(
        `INSERT INTO user_profiles 
         (user_id, resume_url, resume_filename, desired_job_titles, remote_preference, cv_parsed, profile_completed)
         VALUES ($1, $2, $3, $4, $5, FALSE, FALSE)
         ON CONFLICT (user_id) DO NOTHING`,
        [userId, cvUrl, cvFilePath.split('/').pop(), JSON.stringify(jobTitles), remotePreference]
      );
    }

  } catch (error) {
    logger.error(`Background CV processing error for user ${userId}:`, error);
  }
}

module.exports = { router, processCVAsync };