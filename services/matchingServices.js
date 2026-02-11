const OpenAI = require('openai');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class MatchingService {
  /**
   * Generate embeddings for text
   */
  async generateEmbedding(text) {
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text
      });
      return response.data[0].embedding;
    } catch (error) {
      logger.error('Embedding generation error:', error);
      throw error;
    }
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  cosineSimilarity(vecA, vecB) {
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Build user profile text for matching
   */
  async buildUserProfile(userId) {
    try {
      // Get user data
      const userResult = await query(
        `SELECT first_name, last_name, location, preferences 
         FROM users WHERE id = $1`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = userResult.rows[0];

      // Get user skills
      const skillsResult = await query(
        `SELECT skill_name, years_experience, proficiency 
         FROM user_skills WHERE user_id = $1`,
        [userId]
      );

      const skills = skillsResult.rows
        .map(s => `${s.skill_name} (${s.proficiency || 'intermediate'}, ${s.years_experience || 0} years)`)
        .join(', ');

      const preferences = user.preferences || {};
      
      const profileText = `
        Professional Profile:
        Name: ${user.first_name} ${user.last_name}
        Location: ${user.location || 'Not specified'}
        Skills: ${skills}
        Preferred Job Titles: ${preferences.jobTitles?.join(', ') || 'Any'}
        Preferred Locations: ${preferences.locations?.join(', ') || 'Any'}
        Remote Work: ${preferences.remote ? 'Yes' : 'No'}
        Salary Range: ${preferences.minSalary ? `$${preferences.minSalary}+` : 'Not specified'}
        Employment Types: ${preferences.employmentTypes?.join(', ') || 'Full-time'}
      `.trim();

      return profileText;
    } catch (error) {
      logger.error('Build user profile error:', error);
      throw error;
    }
  }

  /**
   * Match jobs to user using AI
   */
  async matchJobsForUser(userId, limit = 10) {
    try {
      logger.info(`Matching jobs for user ${userId}`);

      // Build user profile
      const userProfile = await this.buildUserProfile(userId);

      // Get user preferences
      const userResult = await query(
        'SELECT preferences FROM users WHERE id = $1',
        [userId]
      );
      const preferences = userResult.rows[0]?.preferences || {};

      // Get recent jobs (last 7 days)
      const jobsResult = await query(
        `SELECT id, title, company, location, description, salary, remote, job_type
         FROM job_listings 
         WHERE is_active = TRUE 
         AND scraped_at > NOW() - INTERVAL '7 days'
         AND id NOT IN (
           SELECT job_listing_id FROM job_matches 
           WHERE user_id = $1
         )
         ORDER BY scraped_at DESC
         LIMIT 100`,
        [userId]
      );

      const jobs = jobsResult.rows;
      logger.info(`Found ${jobs.length} unmatched jobs`);

      const matches = [];

      for (const job of jobs) {
        // Calculate match score
        const score = await this.calculateMatchScore(
          userProfile,
          job,
          preferences
        );

        if (score.total >= 0.6) { // Minimum 60% match
          // Save match
          await query(
            `INSERT INTO job_matches 
             (user_id, job_listing_id, match_score, match_reasons)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, job_listing_id) DO NOTHING`,
            [userId, job.id, score.total, JSON.stringify(score.reasons)]
          );

          matches.push({
            jobId: job.id,
            title: job.title,
            company: job.company,
            matchScore: score.total,
            reasons: score.reasons
          });
        }

        // Limit matches
        if (matches.length >= limit) break;
      }

      logger.info(`Created ${matches.length} job matches for user ${userId}`);
      return matches;
    } catch (error) {
      logger.error('Job matching error:', error);
      throw error;
    }
  }

  /**
   * Calculate comprehensive match score
   */
  async calculateMatchScore(userProfile, job, preferences) {
    const reasons = [];
    let skillScore = 0;
    let locationScore = 0;
    let salaryScore = 0;
    let titleScore = 0;
    let typeScore = 0;

    // 1. Skills matching (40%)
    const jobText = `${job.title} ${job.description || ''}`;
    const skillMatch = await this.matchSkills(userProfile, jobText);
    skillScore = skillMatch.score * 0.4;
    if (skillMatch.matched.length > 0) {
      reasons.push({
        type: 'skill',
        description: `Skills match: ${skillMatch.matched.join(', ')}`,
        weight: skillScore
      });
    }

    // 2. Location matching (25%)
    if (preferences.remote && job.remote) {
      locationScore = 0.25;
      reasons.push({
        type: 'location',
        description: 'Remote work preference match',
        weight: 0.25
      });
    } else if (preferences.locations?.some(loc => 
      job.location?.toLowerCase().includes(loc.toLowerCase())
    )) {
      locationScore = 0.25;
      reasons.push({
        type: 'location',
        description: `Location match: ${job.location}`,
        weight: 0.25
      });
    } else if (job.location) {
      locationScore = 0.1;
    }

    // 3. Salary matching (15%)
    if (job.salary && preferences.minSalary) {
      const salaryMatch = this.parseSalary(job.salary);
      if (salaryMatch >= preferences.minSalary) {
        salaryScore = 0.15;
        reasons.push({
          type: 'salary',
          description: 'Salary meets minimum requirement',
          weight: 0.15
        });
      } else {
        salaryScore = 0.05;
      }
    } else {
      salaryScore = 0.08; // Neutral if no salary info
    }

    // 4. Title matching (15%)
    if (preferences.jobTitles?.some(title => 
      job.title.toLowerCase().includes(title.toLowerCase())
    )) {
      titleScore = 0.15;
      reasons.push({
        type: 'title',
        description: `Title matches preference: ${job.title}`,
        weight: 0.15
      });
    } else {
      titleScore = 0.05;
    }

    // 5. Employment type matching (5%)
    if (preferences.employmentTypes?.includes(job.job_type)) {
      typeScore = 0.05;
      reasons.push({
        type: 'type',
        description: `Employment type match: ${job.job_type}`,
        weight: 0.05
      });
    }

    const total = Math.min(1.0, skillScore + locationScore + salaryScore + titleScore + typeScore);

    return {
      total: parseFloat(total.toFixed(2)),
      reasons,
      breakdown: {
        skills: skillScore,
        location: locationScore,
        salary: salaryScore,
        title: titleScore,
        type: typeScore
      }
    };
  }

  /**
   * Match skills using AI
   */
  async matchSkills(userProfile, jobDescription) {
    try {
      const prompt = `
Given this professional profile:
${userProfile}

And this job description:
${jobDescription}

List the skills from the profile that match the job requirements. 
Return only a JSON object with this format:
{
  "matched": ["skill1", "skill2"],
  "score": 0.8
}

The score should be 0-1 representing how well the skills match.
`;

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a job matching expert. Return only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3
      });

      const result = JSON.parse(response.choices[0].message.content);
      return {
        matched: result.matched || [],
        score: result.score || 0.5
      };
    } catch (error) {
      logger.error('Skill matching error:', error);
      return { matched: [], score: 0.5 };
    }
  }

  /**
   * Parse salary string to number
   */
  parseSalary(salaryString) {
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
           jl.url,
           jl.salary,
           jl.remote,
           jl.posted_at
         FROM job_matches jm
         JOIN job_listings jl ON jm.job_listing_id = jl.id
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