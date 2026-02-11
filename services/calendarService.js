// Simplified Calendar Service - Make Google APIs optional
const logger = require('../utils/logger');

class CalendarService {
  constructor() {
    // Make Google Calendar optional
    this.enabled = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    
    if (!this.enabled) {
      console.log('⚠️  Calendar service disabled: Google credentials not configured');
      console.log('   App will work normally without calendar integration');
      return;
    }

    try {
      // Only require googleapis if credentials are present
      const { google } = require('googleapis');
      
      this.oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
      
      console.log('✅ Calendar service initialized');
    } catch (error) {
      console.log('Failed to initialize calendar service:', error.message);
      this.enabled = false;
    }
  }

  isEnabled() {
    return this.enabled || false;
  }

  getAuthUrl() {
    if (!this.enabled) {
      return null;
    }
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/gmail.readonly'
      ]
    });
  }

  async getTokens(code) {
    if (!this.enabled) {
      throw new Error('Calendar service not enabled');
    }
    const { tokens } = await this.oauth2Client.getToken(code);
    return tokens;
  }

  async getEvents(userId, timeMin, timeMax) {
    if (!this.enabled) {
      return [];
    }
    // Implementation when enabled
    return [];
  }

  async findFreeSlots(userId, durationMinutes = 60, daysAhead = 14) {
    if (!this.enabled) {
      return [];
    }
    return [];
  }

  async createInterviewEvent(userId, interviewData) {
    if (!this.enabled) {
      console.log('Calendar disabled - skipping event creation');
      return { skipped: true };
    }
    return { skipped: true };
  }

  async updateEvent(userId, eventId, updates) {
    if (!this.enabled) {
      return null;
    }
    return null;
  }

  async deleteEvent(userId, eventId) {
    if (!this.enabled) {
      return true;
    }
    return true;
  }

  async monitorGmail(userId) {
    if (!this.enabled) {
      return [];
    }
    return [];
  }

  parseInterviewEmail(emailData) {
    return null;
  }
}

module.exports = new CalendarService();