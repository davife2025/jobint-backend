const { query } = require('../config/database');
const logger = require('../utils/logger');

// ✅ FIX: Properly initialize OpenAI only if available
let openai = null;

if (process.env.OPENAI_API_KEY) {
  try {
    const { OpenAI } = require('openai');
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    logger.info('✅ OpenAI initialized for job matching');
  } catch (error) {
    logger.warn('⚠️  OpenAI not available for matching:', error.message);
  }
}

class MatchingService {
  /**
   * Match jobs to user using AI or basic matching
   */
  async matchJobsForUser(userId, limit = 10) {
    try {
      logger.info(`🎯 Matching jobs for user ${userId}`);

      // Get user profile from database
      const profileResult = await query(
        `SELECT * FROM user_profiles WHERE user_id = $1`,
        [userId]
      );

      if (profileResult.rows.length === 0) {
        logger.warn(`No profile found for user ${userId}`);
        return [];
      }

      const profile = profileResult.rows[0];
      const skills = profile.skills ? JSON.parse(profile.skills) : [];
      const desiredTitles = profile.desired_job_titles ? JSON.parse(profile.desired_job_titles) : [];

      // Get recent jobs (last 30 days)
      const jobsResult = await query(
        `SELECT id, title, company, location, description, salary_range, remote_type, job_type
         FROM job_listings 
         WHERE is_active = TRUE 
         AND scraped_at > NOW() - INTERVAL '30 days'
         AND id NOT IN (
           SELECT job_id FROM job_matches 
           WHERE user_id = $1
         )
         ORDER BY scraped_at DESC
         LIMIT 100`,
        [userId]
      );

      const jobs = jobsResult.rows;
      logger.info(`📋 Found ${jobs.length} unmatched jobs`);

      if (jobs.length === 0) {
        return [];
      }

      const matches = [];

      for (const job of jobs) {
        // Calculate match score
        const score = await this.calculateMatchScore(profile, skills, desiredTitles, job);

        if (score.total >= 60) { // Minimum 60% match
          // Save match to database
          try {
            await query(
              `INSERT INTO job_matches 
               (user_id, job_id, match_score, match_reasons)
               VALUES ($1, $2, $3, $4)
               ON CONFLICT (user_id, job_id) DO NOTHING`,
              [userId, job.id, score.total, JSON.stringify(score.reasons)]
            );

            matches.push({
              jobId: job.id,
              title: job.title,
              company: job.company,
              location: job.location,
              match_score: score.total,
              match_reasons: score.reasons
            });
          } catch (dbError) {
            logger.error(`Error saving match for job ${job.id}:`, dbError);
          }
        }

        // Limit matches
        if (matches.length >= limit) break;
      }

      logger.info(`✅ Created ${matches.length} job matches for user ${userId}`);
      return matches;
    } catch (error) {
      logger.error('❌ Job matching error:', error);
      return []; // Return empty array instead of throwing
    }
  }

  /**
   * Calculate comprehensive match score
   */
  async calculateMatchScore(profile, skills, desiredTitles, job) {
    const reasons = [];
    let totalScore = 0;

    // 1. Skills matching (40 points)
    const skillScore = this.matchSkills(skills, job.description || job.title);
    totalScore += skillScore;
    if (skillScore > 0) {
      reasons.push({
        type: 'skill',
        description: `Skills match: ${skillScore}/40 points`,
        weight: skillScore
      });
    }

    // 2. Title matching (25 points)
    const titleScore = this.matchTitle(desiredTitles, job.title);
    totalScore += titleScore;
    if (titleScore > 0) {
      reasons.push({
        type: 'title',
        description: `Title match: ${titleScore}/25 points`,
        weight: titleScore
      });
    }

    // 3. Location/Remote matching (20 points)
    const locationScore = this.matchLocation(profile, job);
    totalScore += locationScore;
    if (locationScore > 0) {
      reasons.push({
        type: 'location',
        description: `Location match: ${locationScore}/20 points`,
        weight: locationScore
      });
    }

    // 4. Salary matching (10 points) - optional
    const salaryScore = this.matchSalary(profile, job.salary_range);
    totalScore += salaryScore;
    if (salaryScore > 0) {
      reasons.push({
        type: 'salary',
        description: `Salary match: ${salaryScore}/10 points`,
        weight: salaryScore
      });
    }

    // 5. Job type matching (5 points)
    const typeScore = this.matchJobType(profile, job.job_type);
    totalScore += typeScore;
    if (typeScore > 0) {
      reasons.push({
        type: 'type',
        description: `Job type match: ${typeScore}/5 points`,
        weight: typeScore
      });
    }

    return {
      total: Math.min(100, Math.round(totalScore)),
      reasons
    };
  }

  /**
   * Match skills (basic keyword matching)
   */
  matchSkills(userSkills, jobText) {
    if (!userSkills || userSkills.length === 0 || !jobText) return 0;

    const jobTextLower = jobText.toLowerCase();
    const matchedSkills = userSkills.filter(skill => 
      jobTextLower.includes(skill.toLowerCase())
    );

    const matchPercentage = matchedSkills.length / userSkills.length;
    return Math.round(matchPercentage * 40); // Max 40 points
  }

  /**
   * Match job title
   */
  matchTitle(desiredTitles, jobTitle) {
    if (!desiredTitles || desiredTitles.length === 0 || !jobTitle) return 5; // Default points

    const jobTitleLower = jobTitle.toLowerCase();
    const hasMatch = desiredTitles.some(title => 
      jobTitleLower.includes(title.toLowerCase()) || 
      title.toLowerCase().includes(jobTitleLower)
    );

    return hasMatch ? 25 : 5; // Full points if match, minimal if not
  }

  /**
   * Match location/remote preference
   */
  matchLocation(profile, job) {
    const remotePreference = profile.remote_preference;
    const jobRemoteType = job.remote_type;

    // Perfect match
    if (remotePreference === 'any') return 20;
    if (remotePreference === jobRemoteType) return 20;
    
    // Partial match
    if (remotePreference === 'hybrid' && (jobRemoteType === 'remote' || jobRemoteType === 'onsite')) {
      return 10;
    }

    // No match
    return 5;
  }

  /**
   * Match salary
   */
  matchSalary(profile, salaryRange) {
    if (!profile.salary_min || !salaryRange) return 5; // Neutral

    const salaryMatch = this.parseSalary(salaryRange);
    if (salaryMatch >= profile.salary_min) {
      return 10; // Meets requirement
    }

    return 0; // Below requirement
  }

  /**
   * Match job type
   */
  matchJobType(profile, jobType) {
    // Most people prefer full-time, so default match
    if (!jobType) return 3;
    if (jobType === 'full_time' || jobType === 'full-time') return 5;
    return 3;
  }

  /**
   * Parse salary string to number
   */
  parseSalary(salaryString) {
    if (!salaryString) return 0;
    
    const match = salaryString.match(/\$?(\d{1,3}(?:,?\d{3})*(?:\.\d+)?)/);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }
    return 0;
  }

  /**
   * Get matched jobs for user
   */
  async getMatchedJobs(userId, reviewed = false) {
    try {
      const result = await query(
        `SELECT 
           jm.id,
           jm.match_score,
           jm.match_reasons,
           jm.reviewed,
           jm.approved,
           jm.created_at,
           jl.id as job_id,
           jl.title,
           jl.company,
           jl.location,
           jl.description,
           jl.application_url as url,
           jl.salary_range,
           jl.remote_type,
           jl.posted_date
         FROM job_matches jm
         JOIN job_listings jl ON jm.job_id = jl.id
         WHERE jm.user_id = $1 AND jm.reviewed = $2
         ORDER BY jm.match_score DESC, jm.created_at DESC
         LIMIT 50`,
        [userId, reviewed]
      );

      return result.rows;
    } catch (error) {
      logger.error('Get matched jobs error:', error);
      throw error;
    }
  }

  /**
   * Update match review status
   */
  async reviewMatch(userId, matchId, approved) {
    try {
      const result = await query(
        `UPDATE job_matches 
         SET reviewed = TRUE, approved = $1
         WHERE id = $2 AND user_id = $3
         RETURNING *`,
        [approved, matchId, userId]
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Review match error:', error);
      throw error;
    }
  }
}

module.exports = new MatchingService();