const { query } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Interview reminders job
 * Runs every hour
 */
async function interviewReminders() {
  try {
    logger.info('Checking for interview reminders...');

    // Get interviews in next 24 hours
    const interviews24h = await query(
      `SELECT i.id, i.scheduled_at, i.meeting_link, i.location,
              a.user_id, u.email, u.first_name,
              jl.title as job_title, jl.company
       FROM interviews i
       JOIN applications a ON i.application_id = a.id
       JOIN users u ON a.user_id = u.id
       JOIN job_listings jl ON a.job_listing_id = jl.id
       WHERE i.status = 'scheduled'
       AND i.scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '24 hours'
       AND NOT EXISTS (
         SELECT 1 FROM reminders r 
         WHERE r.interview_id = i.id 
         AND r.reminder_type = '24h' 
         AND r.sent = TRUE
       )`
    );

    for (const interview of interviews24h.rows) {
      try {
        // Create notification
        await query(
          `INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            interview.user_id,
            'interview_reminder',
            'Interview Tomorrow',
            `Your interview for ${interview.job_title} at ${interview.company} is scheduled for tomorrow at ${new Date(interview.scheduled_at).toLocaleString()}`,
            'interview',
            interview.id
          ]
        );

        // Mark reminder as sent
        await query(
          `INSERT INTO reminders (interview_id, reminder_type, sent, sent_at)
           VALUES ($1, '24h', TRUE, CURRENT_TIMESTAMP)`,
          [interview.id]
        );

        logger.info(`24h reminder sent for interview ${interview.id}`);
      } catch (error) {
        logger.error(`Failed to send 24h reminder for interview ${interview.id}:`, error);
      }
    }

    // Get interviews in next 1 hour
    const interviews1h = await query(
      `SELECT i.id, i.scheduled_at, i.meeting_link, i.location,
              a.user_id, u.email, u.first_name,
              jl.title as job_title, jl.company
       FROM interviews i
       JOIN applications a ON i.application_id = a.id
       JOIN users u ON a.user_id = u.id
       JOIN job_listings jl ON a.job_listing_id = jl.id
       WHERE i.status = 'scheduled'
       AND i.scheduled_at BETWEEN NOW() AND NOW() + INTERVAL '1 hour'
       AND NOT EXISTS (
         SELECT 1 FROM reminders r 
         WHERE r.interview_id = i.id 
         AND r.reminder_type = '1h' 
         AND r.sent = TRUE
       )`
    );

    for (const interview of interviews1h.rows) {
      try {
        // Create urgent notification
        await query(
          `INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            interview.user_id,
            'interview_reminder',
            'Interview Starting Soon!',
            `Your interview for ${interview.job_title} at ${interview.company} starts in 1 hour. ${interview.meeting_link ? 'Link: ' + interview.meeting_link : 'Location: ' + interview.location}`,
            'interview',
            interview.id
          ]
        );

        // Mark reminder as sent
        await query(
          `INSERT INTO reminders (interview_id, reminder_type, sent, sent_at)
           VALUES ($1, '1h', TRUE, CURRENT_TIMESTAMP)`,
          [interview.id]
        );

        logger.info(`1h reminder sent for interview ${interview.id}`);
      } catch (error) {
        logger.error(`Failed to send 1h reminder for interview ${interview.id}:`, error);
      }
    }

    logger.info(`Sent ${interviews24h.rows.length} 24h reminders and ${interviews1h.rows.length} 1h reminders`);
  } catch (error) {
    logger.error('Interview reminders error:', error);
  }
}

module.exports = interviewReminders;