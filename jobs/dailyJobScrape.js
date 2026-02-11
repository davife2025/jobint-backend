const jobScraperService = require('../services/jobScraperServices');
const matchingService = require('../services/matchingServices');
const { query } = require('../config/database');
const logger = require('../utils/logger');

/**
 * Daily job scraping job
 * Runs at 6:00 AM daily
 */
async function dailyJobScrape() {
  try {
    logger.info('Starting daily job scraping...');

    // Scrape jobs from all sources
    const result = await jobScraperService.scrapeAll();
    
    logger.info(`Scraped ${result.total} jobs, saved ${result.saved} new jobs`);

    // Get all active users
    const usersResult = await query(
      'SELECT id FROM users WHERE profile_completed = TRUE'
    );

    logger.info(`Matching jobs for ${usersResult.rows.length} users`);

    // Match jobs for each user
    let totalMatches = 0;
    for (const user of usersResult.rows) {
      try {
        const matches = await matchingService.matchJobsForUser(user.id, 10);
        totalMatches += matches.length;
      } catch (error) {
        logger.error(`Matching failed for user ${user.id}:`, error);
      }
    }

    logger.info(`Job scraping complete. Total matches: ${totalMatches}`);
    
    return { 
      jobsScraped: result.total, 
      jobsSaved: result.saved,
      matchesCreated: totalMatches
    };
  } catch (error) {
    logger.error('Daily job scrape error:', error);
    throw error;
  }
}

module.exports = dailyJobScrape;