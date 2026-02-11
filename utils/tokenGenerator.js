const crypto = require('crypto');

/**
 * Generate a secure random tracking token
 */
function generateTrackingToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a UUID v4
 */
function generateUUID() {
  return crypto.randomUUID();
}

/**
 * Validate tracking token format
 */
function isValidTrackingToken(token) {
  return /^[a-f0-9]{64}$/.test(token);
}

/**
 * Validate UUID format
 */
function isValidUUID(uuid) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);
}

module.exports = {
  generateTrackingToken,
  generateUUID,
  isValidTrackingToken,
  isValidUUID
};