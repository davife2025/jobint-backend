const { createClient } = require('redis');
const logger = require('../utils/logger');

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        logger.error('Redis reconnection limit reached');
        return new Error('Redis reconnection failed');
      }
      return retries * 500; // Exponential backoff
    }
  }
});

redisClient.on('error', (err) => {
  logger.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  logger.info('Redis client connected');
});

redisClient.on('reconnecting', () => {
  logger.warn('Redis client reconnecting...');
});

// Helper functions
const cacheHelpers = {
  // Set with expiration
  setEx: async (key, value, ttl = 3600) => {
    try {
      await redisClient.setEx(key, ttl, JSON.stringify(value));
    } catch (error) {
      logger.error('Redis setEx error:', error);
    }
  },

  // Get and parse JSON
  get: async (key) => {
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.error('Redis get error:', error);
      return null;
    }
  },

  // Delete key
  del: async (key) => {
    try {
      await redisClient.del(key);
    } catch (error) {
      logger.error('Redis del error:', error);
    }
  },

  // Check if key exists
  exists: async (key) => {
    try {
      return await redisClient.exists(key);
    } catch (error) {
      logger.error('Redis exists error:', error);
      return false;
    }
  }
};

module.exports = {
  redisClient,
  ...cacheHelpers
};