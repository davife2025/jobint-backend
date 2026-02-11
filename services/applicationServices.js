const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { query } = require('../config/database');
const blockchainService = require('./blockchainService');
const logger = require('../utils/logger');

puppeteer.use(StealthPlugin());

class ApplicationService {
  constructor() {
    this.browser = null;
  }

  async initBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage'
        ]
      });
    }
    return this.browser;
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Apply to a job automatically
   */
  async applyToJob(userId, jobListingId) {
    let page;
    try {
      logger.info(`Starting application for user ${userId} to job ${jobListingId}`);

      // Get job and user data
      const jobResult = await query(
        'SELECT * FROM job_listings WHERE id = $1',
        [jobListingId]
      );

      const userResult = await query(
        `SELECT u.*, STRING_AGG(us.skill_name, ', ') as skills
         FROM users u
         LEFT JOIN user_skills us ON u.id = us.user_id
         WHERE u.id = $1
         GROUP BY u.id`,
        [userId]
      );

      if (jobResult.rows.length === 0 || userResult.rows.length === 0) {
        throw new Error('Job or user not found');
      }

      const job = jobResult.rows[0];
      const user = userResult.rows[0];

      // Determine platform and apply
      const browser = await this.initBrowser();
      page = await browser.newPage();

      let success = false;
      let errorMessage = null;

      switch (job.source) {
        case 'linkedin':
          success = await this.applyLinkedIn(page, job, user);
          break;
        case 'indeed':
          success = await this.applyIndeed(page, job, user);
          break;
        case 'angellist':
          success = await this.applyAngelList(page, job, user);
          break;
        default:
          throw new Error(`Unsupported job source: ${job.source}`);
      }

      if (success) {
        // Create application record
        const appResult = await query(
          `INSERT INTO applications (user_id, job_listing_id, status)
           VALUES ($1, $2, 'applied')
           RETURNING id`,
          [userId, jobListingId]
        );

        const applicationId = appResult.rows[0].id;

        // Record on blockchain (async, don't wait)
        blockchainService.recordApplication(userId, jobListingId)
          .then(result => {
            query(
              'UPDATE applications SET blockchain_tx_hash = $1 WHERE id = $2',
              [result.txHash, applicationId]
            );
            logger.info(`Application recorded on blockchain: ${result.txHash}`);
          })
          .catch(err => {
            logger.error('Blockchain recording failed:', err);
          });

        logger.info(`Successfully applied to ${job.title} at ${job.company}`);
        return { success: true, applicationId };
      } else {
        throw new Error('Application submission failed');
      }
    } catch (error) {
      logger.error('Application error:', error);
      
      // Record failed application
      await query(
        `INSERT INTO application_queue (job_match_id, status, error_message)
         VALUES (
           (SELECT id FROM job_matches WHERE user_id = $1 AND job_listing_id = $2 LIMIT 1),
           'failed',
           $3
         )`,
        [userId, jobListingId, error.message]
      );

      return { success: false, error: error.message };
    } finally {
      if (page) await page.close();
    }
  }

  /**
   * Apply to LinkedIn job
   */
  async applyLinkedIn(page, job, user) {
    try {
      await page.goto(job.url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Look for Easy Apply button
      const easyApplyButton = await page.$('button.jobs-apply-button');
      if (!easyApplyButton) {
        logger.warn('LinkedIn Easy Apply not available for this job');
        return false;
      }

      await easyApplyButton.click();
      await page.waitForTimeout(2000);

      // Fill application form (this is simplified - LinkedIn forms vary)
      const phoneSelector = 'input[id*="phone"]';
      if (await page.$(phoneSelector)) {
        await page.type(phoneSelector, user.phone || '555-0000');
      }

      // Resume upload (if needed)
      const resumeSelector = 'input[type="file"]';
      if (await page.$(resumeSelector) && user.resume_url) {
        // Download and upload resume
        // This would need additional logic to handle S3 URLs
        logger.info('Resume upload detected but skipping for now');
      }

      // Click through multi-step form
      let submitAttempts = 0;
      while (submitAttempts < 5) {
        const nextButton = await page.$('button[aria-label*="Continue"]');
        const submitButton = await page.$('button[aria-label*="Submit"]');
        const reviewButton = await page.$('button[aria-label*="Review"]');

        if (submitButton) {
          await submitButton.click();
          await page.waitForTimeout(2000);
          logger.info('LinkedIn application submitted');
          return true;
        } else if (reviewButton) {
          await reviewButton.click();
          await page.waitForTimeout(1000);
        } else if (nextButton) {
          await nextButton.click();
          await page.waitForTimeout(1000);
        } else {
          break;
        }
        
        submitAttempts++;
      }

      return false;
    } catch (error) {
      logger.error('LinkedIn application error:', error);
      return false;
    }
  }

  /**
   * Apply to Indeed job
   */
  async applyIndeed(page, job, user) {
    try {
      await page.goto(job.url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Click Apply button
      const applyButton = await page.$('button[id*="apply"]');
      if (!applyButton) {
        logger.warn('Indeed Apply button not found');
        return false;
      }

      await applyButton.click();
      await page.waitForTimeout(2000);

      // Fill form fields
      const formFields = await page.$$('input[type="text"], input[type="email"], input[type="tel"]');
      
      for (const field of formFields) {
        const name = await field.evaluate(el => el.name || el.id);
        
        if (name?.toLowerCase().includes('email')) {
          await field.type(user.email);
        } else if (name?.toLowerCase().includes('phone')) {
          await field.type(user.phone || '555-0000');
        } else if (name?.toLowerCase().includes('name')) {
          await field.type(`${user.first_name} ${user.last_name}`);
        }
      }

      // Submit
      const submitButton = await page.$('button[type="submit"]');
      if (submitButton) {
        await submitButton.click();
        await page.waitForTimeout(2000);
        logger.info('Indeed application submitted');
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Indeed application error:', error);
      return false;
    }
  }

  /**
   * Apply to AngelList/Wellfound job
   */
  async applyAngelList(page, job, user) {
    try {
      await page.goto(job.url, { waitUntil: 'networkidle2', timeout: 30000 });

      // AngelList usually requires login
      logger.warn('AngelList applications require authentication - skipping');
      return false;
    } catch (error) {
      logger.error('AngelList application error:', error);
      return false;
    }
  }

  /**
   * Generate cover letter using AI
   */
  async generateCoverLetter(user, job) {
    try {
      const OpenAI = require('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const prompt = `
Write a professional cover letter for this job application:

Job Title: ${job.title}
Company: ${job.company}
Job Description: ${job.description?.substring(0, 500)}

Applicant:
Name: ${user.first_name} ${user.last_name}
Skills: ${user.skills}
Location: ${user.location}

Write a concise, professional cover letter (200-250 words) that highlights relevant skills and shows enthusiasm for the role.
`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a professional resume writer.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 400
      });

      const coverLetter = response.choices[0].message.content;
      
      // Save cover letter
      await query(
        `UPDATE applications 
         SET cover_letter = $1 
         WHERE user_id = $2 AND job_listing_id = $3`,
        [coverLetter, user.id, job.id]
      );

      return coverLetter;
    } catch (error) {
      logger.error('Cover letter generation error:', error);
      return null;
    }
  }

  /**
   * Get application statistics
   */
  async getApplicationStats(userId) {
    try {
      const result = await query(
        `SELECT 
           COUNT(*) as total,
           COUNT(CASE WHEN status = 'applied' THEN 1 END) as applied,
           COUNT(CASE WHEN status = 'interview_requested' THEN 1 END) as interview_requested,
           COUNT(CASE WHEN status = 'interview_scheduled' THEN 1 END) as interview_scheduled,
           COUNT(CASE WHEN status = 'offered' THEN 1 END) as offered,
           COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
         FROM applications
         WHERE user_id = $1`,
        [userId]
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Get application stats error:', error);
      throw error;
    }
  }
}

module.exports = new ApplicationService();