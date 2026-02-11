const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { query } = require('../config/database');
const logger = require('../utils/logger');

puppeteer.use(StealthPlugin());

class JobScraperService {
  constructor() {
    this.browser = null;
  }

  /**
   * Initialize browser
   */
  async initBrowser() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu'
        ]
      });
    }
    return this.browser;
  }

  /**
   * Close browser
   */
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Scrape LinkedIn jobs
   */
  async scrapeLinkedIn(keywords, location = '', limit = 50) {
    const jobs = [];
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      const searchUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(keywords)}&location=${encodeURIComponent(location)}`;
      
      logger.info(`Scraping LinkedIn: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for job cards to load
      await page.waitForSelector('.jobs-search__results-list', { timeout: 10000 });

      // Scroll to load more jobs
      await this.autoScroll(page);

      // Extract job data
      const jobElements = await page.$$('.base-card');
      
      for (let i = 0; i < Math.min(jobElements.length, limit); i++) {
        try {
          const job = await page.evaluate((el) => {
            const titleEl = el.querySelector('.base-search-card__title');
            const companyEl = el.querySelector('.base-search-card__subtitle');
            const locationEl = el.querySelector('.job-search-card__location');
            const linkEl = el.querySelector('a.base-card__full-link');
            const timeEl = el.querySelector('time');

            return {
              title: titleEl?.innerText?.trim() || '',
              company: companyEl?.innerText?.trim() || '',
              location: locationEl?.innerText?.trim() || '',
              url: linkEl?.href || '',
              postedAt: timeEl?.getAttribute('datetime') || new Date().toISOString(),
              externalId: linkEl?.href?.match(/\/(\d+)\//)?.[1] || ''
            };
          }, jobElements[i]);

          if (job.title && job.company && job.externalId) {
            jobs.push({
              ...job,
              source: 'linkedin',
              description: '', // Would need to visit individual job page
              remote: job.location.toLowerCase().includes('remote')
            });
          }
        } catch (error) {
          logger.error(`Error extracting LinkedIn job ${i}:`, error);
        }
      }

      logger.info(`Scraped ${jobs.length} jobs from LinkedIn`);
    } catch (error) {
      logger.error('LinkedIn scraping error:', error);
    } finally {
      await page.close();
    }

    return jobs;
  }

  /**
   * Scrape Indeed jobs
   */
  async scrapeIndeed(keywords, location = '', limit = 50) {
    const jobs = [];
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      const searchUrl = `https://www.indeed.com/jobs?q=${encodeURIComponent(keywords)}&l=${encodeURIComponent(location)}`;
      
      logger.info(`Scraping Indeed: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for job cards
      await page.waitForSelector('.job_seen_beacon', { timeout: 10000 });

      // Extract job data
      const jobElements = await page.$$('.job_seen_beacon');
      
      for (let i = 0; i < Math.min(jobElements.length, limit); i++) {
        try {
          const job = await page.evaluate((el) => {
            const titleEl = el.querySelector('h2.jobTitle span');
            const companyEl = el.querySelector('[data-testid="company-name"]');
            const locationEl = el.querySelector('[data-testid="text-location"]');
            const linkEl = el.querySelector('h2.jobTitle a');
            const snippetEl = el.querySelector('.job-snippet');

            return {
              title: titleEl?.innerText?.trim() || '',
              company: companyEl?.innerText?.trim() || '',
              location: locationEl?.innerText?.trim() || '',
              url: linkEl?.href ? `https://www.indeed.com${linkEl.href}` : '',
              description: snippetEl?.innerText?.trim() || '',
              externalId: linkEl?.id?.replace('job_', '') || ''
            };
          }, jobElements[i]);

          if (job.title && job.company && job.externalId) {
            jobs.push({
              ...job,
              source: 'indeed',
              postedAt: new Date().toISOString(),
              remote: job.location.toLowerCase().includes('remote')
            });
          }
        } catch (error) {
          logger.error(`Error extracting Indeed job ${i}:`, error);
        }
      }

      logger.info(`Scraped ${jobs.length} jobs from Indeed`);
    } catch (error) {
      logger.error('Indeed scraping error:', error);
    } finally {
      await page.close();
    }

    return jobs;
  }

  /**
   * Scrape AngelList/Wellfound jobs
   */
  async scrapeAngelList(keywords, limit = 50) {
    const jobs = [];
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      const searchUrl = `https://wellfound.com/jobs?q=${encodeURIComponent(keywords)}`;
      
      logger.info(`Scraping AngelList: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for results
      await page.waitForSelector('[data-test="JobSearchResults"]', { timeout: 10000 });

      // Scroll to load more
      await this.autoScroll(page);

      // Extract job data
      const jobData = await page.evaluate(() => {
        const jobCards = document.querySelectorAll('[data-test="StartupResult"]');
        const results = [];

        jobCards.forEach((card) => {
          const titleEl = card.querySelector('[data-test="StartupResult-title"]');
          const companyEl = card.querySelector('[data-test="StartupResult-startupName"]');
          const locationEl = card.querySelector('[data-test="StartupResult-location"]');
          const linkEl = card.querySelector('a[data-test="StartupResult-link"]');

          results.push({
            title: titleEl?.innerText?.trim() || '',
            company: companyEl?.innerText?.trim() || '',
            location: locationEl?.innerText?.trim() || '',
            url: linkEl?.href || '',
            externalId: linkEl?.href?.split('/').pop() || ''
          });
        });

        return results;
      });

      jobs.push(...jobData.slice(0, limit).map(job => ({
        ...job,
        source: 'angellist',
        description: '',
        postedAt: new Date().toISOString(),
        remote: job.location.toLowerCase().includes('remote')
      })));

      logger.info(`Scraped ${jobs.length} jobs from AngelList`);
    } catch (error) {
      logger.error('AngelList scraping error:', error);
    } finally {
      await page.close();
    }

    return jobs;
  }

  /**
   * Auto-scroll page to load more content
   */
  async autoScroll(page) {
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight || totalHeight >= 3000) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
  }

  /**
   * Save jobs to database
   */
  async saveJobs(jobs) {
    let savedCount = 0;
    
    for (const job of jobs) {
      try {
        await query(
          `INSERT INTO job_listings 
           (source, external_id, title, company, location, description, url, remote, posted_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (source, external_id) DO NOTHING`,
          [
            job.source,
            job.externalId,
            job.title,
            job.company,
            job.location,
            job.description,
            job.url,
            job.remote,
            job.postedAt
          ]
        );
        savedCount++;
      } catch (error) {
        logger.error(`Error saving job ${job.title}:`, error);
      }
    }

    logger.info(`Saved ${savedCount} new jobs to database`);
    return savedCount;
  }

  /**
   * Run full scraping job
   */
  async scrapeAll(keywords = 'software engineer', location = '') {
    try {
      logger.info('Starting job scraping...');

      const [linkedInJobs, indeedJobs, angelListJobs] = await Promise.all([
        this.scrapeLinkedIn(keywords, location, 50),
        this.scrapeIndeed(keywords, location, 50),
        this.scrapeAngelList(keywords, 50)
      ]);

      const allJobs = [...linkedInJobs, ...indeedJobs, ...angelListJobs];
      const savedCount = await this.saveJobs(allJobs);

      await this.closeBrowser();

      logger.info(`Scraping complete. Total: ${allJobs.length}, Saved: ${savedCount}`);
      
      return { total: allJobs.length, saved: savedCount };
    } catch (error) {
      logger.error('Scraping error:', error);
      await this.closeBrowser();
      throw error;
    }
  }
}

module.exports = new JobScraperService();