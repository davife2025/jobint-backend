// services/emailServices.js - FIXED WITH BETTER DEV MODE

const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    this.enabled = false;
    
    if (process.env.NODE_ENV === 'production' && process.env.EMAIL_USER && process.env.EMAIL_PASSWORD) {
      // Production mode with real SMTP
      this.transporter = nodemailer.createTransporter({
        service: process.env.EMAIL_SERVICE || 'gmail',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        }
      });
      this.enabled = true;
      logger.info('✅ Email service enabled (Production mode)');
    } else {
      // Development mode - log emails instead of sending
      this.transporter = {
        sendMail: async (mailOptions) => {
          logger.info('📧 ========== EMAIL (DEV MODE) ==========');
          logger.info(`To: ${mailOptions.to}`);
          logger.info(`Subject: ${mailOptions.subject}`);
          logger.info(`---`);
          logger.info(mailOptions.text || 'No text content');
          logger.info('=========================================');
          
          // Also log HTML version for debugging
          if (mailOptions.html) {
            logger.debug('HTML version:', mailOptions.html.substring(0, 200) + '...');
          }
          
          return { 
            messageId: 'dev-' + Date.now(),
            accepted: [mailOptions.to]
          };
        }
      };
      this.enabled = true; // Still "enabled" but just logs
      logger.info('⚠️  Email service in DEV mode (will log instead of send)');
    }
  }

  /**
   * Send welcome email with tracking link
   */
  async sendWelcomeEmail(user) {
    if (!this.enabled) {
      logger.warn('Email service not enabled');
      return { success: false };
    }

    const trackingUrl = `${process.env.CLIENT_URL}/dashboard`;
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@jobint.com',
      to: user.email,
      subject: '🎉 Welcome to JobClaw - Your Job Search Starts Now!',
      text: `
Hi ${user.first_name || 'there'}!

Welcome to JobClaw! We're excited to help you land your dream job.

Your application has been submitted successfully, and our AI is already analyzing your CV to find the best job matches.

Access your dashboard:
${trackingUrl}

What happens next:
1. ✅ CV Analysis (30-60 seconds)
2. 🎯 Job Matching (we'll find 5-20 jobs that match your profile)
3. 📧 You'll receive match notifications via email
4. ✓ Review and approve jobs you want to apply to
5. 🚀 We'll handle the applications automatically

Your tracking link:
${trackingUrl}

Bookmark this link to check your application status anytime!

Questions? Just reply to this email.

Best regards,
The JobClaw Team

---
JobClaw - AI-Powered Job Applications
      `.trim(),
      html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: white; padding: 30px; border: 1px solid #e0e0e0; }
    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .steps { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
    .step { margin: 10px 0; padding-left: 25px; position: relative; }
    .step:before { content: "✓"; position: absolute; left: 0; color: #667eea; font-weight: bold; }
    .footer { text-align: center; color: #888; padding: 20px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">🎉 Welcome to JobClaw!</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">Your AI-Powered Job Search Assistant</p>
    </div>
    
    <div class="content">
      <p>Hi <strong>${user.first_name || 'there'}</strong>!</p>
      
      <p>Welcome to JobClaw! We're excited to help you land your dream job.</p>
      
      <p>Your application has been submitted successfully, and our AI is already analyzing your CV to find the best job matches.</p>
      
      <div style="text-align: center;">
        <a href="${trackingUrl}" class="button">Access Your Dashboard</a>
      </div>
      
      <div class="steps">
        <h3 style="margin-top: 0;">What happens next:</h3>
        <div class="step">CV Analysis (30-60 seconds)</div>
        <div class="step">Job Matching (we'll find 5-20 jobs that match your profile)</div>
        <div class="step">You'll receive match notifications via email</div>
        <div class="step">Review and approve jobs you want to apply to</div>
        <div class="step">We'll handle the applications automatically</div>
      </div>
      
      <p><strong>Your tracking link:</strong><br>
      <a href="${trackingUrl}">${trackingUrl}</a></p>
      
      <p style="background: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0;">
        💡 <strong>Tip:</strong> Bookmark this link to check your application status anytime!
      </p>
      
      <p>Questions? Just reply to this email.</p>
      
      <p>Best regards,<br>
      <strong>The JobClaw Team</strong></p>
    </div>
    
    <div class="footer">
      <p>JobClaw - AI-Powered Job Applications</p>
      <p>You're receiving this because you submitted a job application through JobClaw.</p>
    </div>
  </div>
</body>
</html>
      `.trim()
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`✅ Welcome email sent to ${user.email}${process.env.NODE_ENV !== 'production' ? ' (dev mode)' : ''}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error('❌ Failed to send welcome email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send matches found notification
   */
  async sendMatchesFoundEmail(user, matchCount, matches = []) {
    if (!this.enabled) {
      logger.warn('Email service not enabled');
      return { success: false };
    }

    const trackingUrl = `${process.env.CLIENT_URL}/dashboard`;
    
    // Prepare top matches for email
    const topMatches = matches.slice(0, 5).map(m => 
      `- ${m.title} at ${m.company} (${m.match_score || m.matchScore}% match)`
    ).join('\n');

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@jobint.com',
      to: user.email,
      subject: `🎯 Found ${matchCount} Job Matches for You!`,
      text: `
Hi ${user.first_name || 'there'}!

Great news! We've found ${matchCount} jobs that match your profile.

Top matches:
${topMatches}

View all matches and start applying:
${trackingUrl}

These jobs match your skills, experience, and preferences. Review them and let us know which ones to apply to!

Best regards,
The JobClaw Team
      `.trim(),
      html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: white; padding: 30px; border: 1px solid #e0e0e0; }
    .button { display: inline-block; padding: 12px 30px; background: #10b981; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .match { background: #f0fdf4; padding: 15px; margin: 10px 0; border-left: 4px solid #10b981; border-radius: 5px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">🎯 Jobs Found!</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9;">We found ${matchCount} matches for you</p>
    </div>
    
    <div class="content">
      <p>Hi <strong>${user.first_name || 'there'}</strong>!</p>
      
      <p>Great news! We've found <strong>${matchCount} jobs</strong> that match your profile.</p>
      
      <h3>Top Matches:</h3>
      ${matches.slice(0, 5).map(m => `
        <div class="match">
          <strong>${m.title}</strong> at ${m.company}<br>
          <span style="color: #10b981;">✓ ${m.match_score || m.matchScore}% match</span>
        </div>
      `).join('')}
      
      <div style="text-align: center;">
        <a href="${trackingUrl}" class="button">View All Matches</a>
      </div>
      
      <p>These jobs match your skills, experience, and preferences. Review them and let us know which ones to apply to!</p>
      
      <p>Best regards,<br>
      <strong>The JobClaw Team</strong></p>
    </div>
  </div>
</body>
</html>
      `.trim()
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`✅ Matches email sent to ${user.email}${process.env.NODE_ENV !== 'production' ? ' (dev mode)' : ''}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error('❌ Failed to send matches email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send application status update
   */
  async sendApplicationStatusEmail(user, application) {
    if (!this.enabled) {
      logger.warn('Email service not enabled');
      return { success: false };
    }

    const trackingUrl = `${process.env.CLIENT_URL}/dashboard`;

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@jobint.com',
      to: user.email,
      subject: `📬 Application Status Update: ${application.job_title}`,
      text: `
Hi ${user.first_name || 'there'}!

Your application status has been updated:

Job: ${application.job_title}
Company: ${application.company}
Status: ${application.status}

View details:
${trackingUrl}

Best regards,
The JobClaw Team
      `.trim()
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`✅ Status email sent to ${user.email}${process.env.NODE_ENV !== 'production' ? ' (dev mode)' : ''}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error('❌ Failed to send status email:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();