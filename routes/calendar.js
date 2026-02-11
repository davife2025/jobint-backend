const express = require('express');
const auth = require('../middleware/auth');
const { query } = require('../config/database');
const calendarService = require('../services/calendarService');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/calendar/connect - Get OAuth URL
router.get('/connect', auth, (req, res) => {
  try {
    const authUrl = calendarService.getAuthUrl();
    res.json({ authUrl });
  } catch (error) {
    logger.error('Get auth URL error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// GET /api/calendar/callback - OAuth callback
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code) {
      return res.status(400).json({ error: 'No authorization code provided' });
    }

    // Get tokens
    const tokens = await calendarService.getTokens(code);

    // Store tokens (state should contain userId - implement proper state management)
    // For now, redirect to frontend with code
    res.redirect(`${process.env.CLIENT_URL}/settings/calendar?code=${code}`);
  } catch (error) {
    logger.error('Calendar callback error:', error);
    res.redirect(`${process.env.CLIENT_URL}/settings/calendar?error=auth_failed`);
  }
});

// POST /api/calendar/save-tokens - Save calendar tokens
router.post('/save-tokens', auth, async (req, res) => {
  try {
    const { code } = req.body;

    const tokens = await calendarService.getTokens(code);

    await query(
      'UPDATE users SET calendar_token = $1 WHERE id = $2',
      [JSON.stringify(tokens), req.userId]
    );

    res.json({ message: 'Calendar connected successfully' });
  } catch (error) {
    logger.error('Save tokens error:', error);
    res.status(500).json({ error: 'Failed to save tokens' });
  }
});

// GET /api/calendar/events - Get calendar events
router.get('/events', auth, async (req, res) => {
  try {
    const { start, end } = req.query;

    const events = await calendarService.getEvents(
      req.userId,
      start,
      end
    );

    res.json({ events });
  } catch (error) {
    logger.error('Get events error:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

// GET /api/calendar/free-slots - Get free time slots
router.get('/free-slots', auth, async (req, res) => {
  try {
    const { duration = 60, days = 14 } = req.query;

    const slots = await calendarService.findFreeSlots(
      req.userId,
      parseInt(duration),
      parseInt(days)
    );

    res.json({ slots });
  } catch (error) {
    logger.error('Get free slots error:', error);
    res.status(500).json({ error: 'Failed to find free slots' });
  }
});

// POST /api/calendar/disconnect - Disconnect calendar
router.post('/disconnect', auth, async (req, res) => {
  try {
    await query(
      'UPDATE users SET calendar_token = NULL WHERE id = $1',
      [req.userId]
    );

    res.json({ message: 'Calendar disconnected' });
  } catch (error) {
    logger.error('Disconnect calendar error:', error);
    res.status(500).json({ error: 'Failed to disconnect calendar' });
  }
});

module.exports = router;