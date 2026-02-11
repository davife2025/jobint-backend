const express = require('express');
const auth = require('../middleware/auth');
const { query } = require('../config/database');
const blockchainService = require('../services/blockchainService');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/blockchain/records - Get user's blockchain records
router.get('/records', auth, async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM blockchain_records 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [req.userId]
    );

    res.json({ records: result.rows });
  } catch (error) {
    logger.error('Get blockchain records error:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

// GET /api/blockchain/verify/:txHash - Verify transaction
router.get('/verify/:txHash', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM blockchain_records WHERE tx_hash = $1',
      [req.params.txHash]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Record not found' });
    }

    res.json({
      verified: true,
      record: result.rows[0],
      explorerUrl: blockchainService.getTransactionUrl(req.params.txHash)
    });
  } catch (error) {
    logger.error('Verify transaction error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// GET /api/blockchain/stats - Get blockchain stats for user
router.get('/stats', auth, async (req, res) => {
  try {
    const userResult = await query(
      'SELECT wallet_address FROM users WHERE id = $1',
      [req.userId]
    );

    if (!userResult.rows[0]?.wallet_address) {
      return res.json({ connected: false });
    }

    const stats = await blockchainService.getUserStats(
      userResult.rows[0].wallet_address
    );

    res.json({
      connected: true,
      walletAddress: userResult.rows[0].wallet_address,
      ...stats
    });
  } catch (error) {
    logger.error('Get blockchain stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/blockchain/gas-estimate - Get gas price estimate
router.get('/gas-estimate', async (req, res) => {
  try {
    const gasPrice = await blockchainService.getGasPrice();
    const cost = await blockchainService.estimateApplicationCost();

    res.json({
      gasPrice: `${gasPrice} gwei`,
      estimatedCost: cost
    });
  } catch (error) {
    logger.error('Get gas estimate error:', error);
    res.status(500).json({ error: 'Failed to estimate gas' });
  }
});

module.exports = router;