const express = require('express');
const auth = require('../middleware/auth');
const { validateUpdateProfile, validateAddSkill } = require('../middleware/validation');
const { query } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/users/profile - Get user profile
router.get('/profile', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT id, email, first_name, last_name, phone, location,
              resume_url, wallet_address, onboarding_step, profile_completed,
              preferences, created_at
       FROM users WHERE id = $1`,
      [req.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get skills
    const skillsResult = await query(
      'SELECT * FROM user_skills WHERE user_id = $1',
      [req.userId]
    );

    res.json({
      profile: result.rows[0],
      skills: skillsResult.rows
    });
  } catch (error) {
    logger.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /api/users/profile - Update profile
router.put('/profile', auth, validateUpdateProfile, async (req, res) => {
  try {
    const { firstName, lastName, phone, location, preferences } = req.body;

    const result = await query(
      `UPDATE users 
       SET first_name = COALESCE($1, first_name),
           last_name = COALESCE($2, last_name),
           phone = COALESCE($3, phone),
           location = COALESCE($4, location),
           preferences = COALESCE($5, preferences),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [firstName, lastName, phone, location, preferences ? JSON.stringify(preferences) : null, req.userId]
    );

    res.json({ profile: result.rows[0] });
  } catch (error) {
    logger.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /api/users/skills - Add skill
router.post('/skills', auth, validateAddSkill, async (req, res) => {
  try {
    const { skillName, yearsExperience, proficiency } = req.body;

    const result = await query(
      `INSERT INTO user_skills (user_id, skill_name, years_experience, proficiency)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, skill_name) 
       DO UPDATE SET years_experience = $3, proficiency = $4
       RETURNING *`,
      [req.userId, skillName, yearsExperience, proficiency]
    );

    res.status(201).json({ skill: result.rows[0] });
  } catch (error) {
    logger.error('Add skill error:', error);
    res.status(500).json({ error: 'Failed to add skill' });
  }
});

// DELETE /api/users/skills/:skillId - Remove skill
router.delete('/skills/:skillId', auth, async (req, res) => {
  try {
    await query(
      'DELETE FROM user_skills WHERE id = $1 AND user_id = $2',
      [req.params.skillId, req.userId]
    );

    res.json({ message: 'Skill removed' });
  } catch (error) {
    logger.error('Remove skill error:', error);
    res.status(500).json({ error: 'Failed to remove skill' });
  }
});

// PUT /api/users/wallet - Connect wallet
router.put('/wallet', auth, async (req, res) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress || !/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return res.status(400).json({ error: 'Invalid wallet address' });
    }

    const result = await query(
      'UPDATE users SET wallet_address = $1 WHERE id = $2 RETURNING wallet_address',
      [walletAddress, req.userId]
    );

    res.json({ walletAddress: result.rows[0].wallet_address });
  } catch (error) {
    logger.error('Connect wallet error:', error);
    res.status(500).json({ error: 'Failed to connect wallet' });
  }
});

// GET /api/users/stats - Get user dashboard stats
router.get('/stats', auth, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM user_stats WHERE user_id = $1',
      [req.userId]
    );

    res.json({ stats: result.rows[0] || {} });
  } catch (error) {
    logger.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

module.exports = router;