const express = require('express');
const router = express.Router();




// Get unread notification count
router.get('/unread-count', async (req, res) => {
  try {
    res.json({ count: 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Get all notifications
router.get('/', async (req, res) => {
  try {
    res.json({ notifications: [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


// Mark all as read
router.patch('/mark-all-read', async (req, res) => {
  try {
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark notification as read
router.patch('/:id/read', async (req, res) => {
  try {
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});



module.exports = router;