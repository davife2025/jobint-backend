const { Worker, Queue } = require('bullmq');
const { redisClient } = require('../config/redis');
const { query } = require('./config/database');
const applicationService = require('../services/applicationService');
const logger = require('../utils/logger');

// Create queue
const applicationQueue = new Queue('applications', {
  connection: {
    host: process.env.REDIS_URL?.split(':')[0] || 'localhost',
    port: parseInt(process.env.REDIS_URL?.split(':')[1]) || 6379
  }
});

// Create worker
const applicationWorker = new Worker('applications', async (job) => {
  const { userId, jobListingId, matchId } = job.data;

  try {
    logger.info(`Processing application: User ${userId}, Job ${jobListingId}`);

    // Update queue status
    await query(
      'UPDATE application_queue SET status = $1 WHERE id = $2',
      ['processing', job.id]
    );

    // Apply to job
    const result = await applicationService.applyToJob(userId, jobListingId);

    if (result.success) {
      // Mark as completed
      await query(
        'UPDATE application_queue SET status = $1, processed_at = CURRENT_TIMESTAMP WHERE id = $2',
        ['completed', job.id]
      );

      // Create notification
      await query(
        `INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          userId,
          'application_sent',
          'Application Submitted',
          `Your application was successfully submitted`,
          'application',
          result.applicationId
        ]
      );

      logger.info(`Application completed: ${result.applicationId}`);
      return { success: true, applicationId: result.applicationId };
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    logger.error(`Application processing failed:`, error);

    // Update queue with error
    await query(
      `UPDATE application_queue 
       SET status = $1, error_message = $2, retry_count = retry_count + 1
       WHERE id = $3`,
      ['failed', error.message, job.id]
    );

    // Retry up to 3 times
    if (job.attemptsMade < 3) {
      throw error; // BullMQ will retry
    }

    return { success: false, error: error.message };
  }
}, {
  connection: {
    host: process.env.REDIS_URL?.split(':')[0] || 'localhost',
    port: parseInt(process.env.REDIS_URL?.split(':')[1]) || 6379
  },
  concurrency: 5, // Process 5 applications concurrently
  limiter: {
    max: 10, // Max 10 jobs per minute
    duration: 60000
  }
});

// Event listeners
applicationWorker.on('completed', (job, result) => {
  logger.info(`Job ${job.id} completed:`, result);
});

applicationWorker.on('failed', (job, error) => {
  logger.error(`Job ${job.id} failed:`, error);
});

// Function to add job to queue
async function queueApplication(userId, jobListingId, matchId) {
  try {
    const job = await applicationQueue.add('apply', {
      userId,
      jobListingId,
      matchId
    }, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000
      }
    });

    // Create queue record
    await query(
      `INSERT INTO application_queue (job_match_id, status)
       VALUES ($1, 'pending')`,
      [matchId]
    );

    logger.info(`Application queued: Job ${job.id}`);
    return job;
  } catch (error) {
    logger.error('Queue application error:', error);
    throw error;
  }
}

module.exports = {
  applicationQueue,
  applicationWorker,
  queueApplication
};