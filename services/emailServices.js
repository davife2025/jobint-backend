const nodemailer = require('nodemailer');
const { query } = require('../config/database');
const logger = require('../utils/logger');

class EmailService {
  constructor() {
    // Create transporter based on environment
    if (process.env.NODE_ENV === 'production') {
      // Production: Use real SMTP service (e.g., SendGrid, AWS SES, etc.)
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        }
      });
    } else {
      // Development: Log emails to console instead of sending
      this.transporter = {
        sendMail: async (mailOptions) => {
          console.log('\n📧 EMAIL WOULD BE SENT:');
          console.log('─────────────────────────────');
          console.log('To:', mailOptions.to);
          console.log('Subject:', mailOptions.subject);
          console.log('Body:', mailOptions.text || mailOptions.html);
          console.log('─────────────────────────────\n');
          return { messageId: 'dev-' + Date.now() };
        }
      };
    }

    this.fromEmail = process.env.FROM_EMAIL || 'noreply@jobint.com';
    this.fromName = process.env.FROM_NAME || 'JobInt';
    this.baseUrl = process.env.CLIENT_URL || 'http://localhost:3000';
  }

  /**
   * Send welcome email with tracking link
   */
  async sendWelcomeEmail(user) {
    const trackingUrl = `${this.baseUrl}/track/${user.tracking_token}`;

    const subject = 'Welcome to JobInt - Your Job Search is Starting! 🚀';
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #4F46E5; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; padding: 14px 28px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
    .tracking-token { background: #e5e7eb; padding: 15px; border-radius: 6px; font-family: monospace; margin: 15px 0; }
    .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to JobInt! 🎉</h1>
    </div>
    <div class="content">
      <p>Hi ${user.first_name || 'there'},</p>
      
      <p>Thank you for submitting your profile! We're excited to help you find your dream job.</p>
      
      <h3>What's happening now:</h3>
      <ul>
        <li>🤖 Our AI is analyzing your CV and extracting your skills</li>
        <li>🔍 We're searching thousands of jobs to find the best matches</li>
        <li>📊 We'll calculate match scores based on your preferences</li>
      </ul>
      
      <p><strong>This process typically takes 5-10 minutes.</strong></p>
      
      <p>We'll send you another email when we've found job matches for you!</p>
      
      <h3>Track Your Applications:</h3>
      <p>Use this link anytime to check your application status:</p>
      
      <a href="${trackingUrl}" class="button">View My Dashboard</a>
      
      <div class="tracking-token">
        <strong>Your Tracking Link:</strong><br>
        <a href="${trackingUrl}">${trackingUrl}</a>
      </div>
      
      <p><small>💡 <strong>Pro Tip:</strong> Bookmark this link! You can access your dashboard anytime without a password.</small></p>
    </div>
    
    <div class="footer">
      <p>JobInt - Automated Job Applications Powered by AI</p>
      <p>Questions? Reply to this email or visit our help center.</p>
    </div>
  </div>
</body>
</html>
    `;

    const text = `
Welcome to JobInt!

Hi ${user.first_name || 'there'},

Thank you for submitting your profile! We're excited to help you find your dream job.

What's happening now:
- Our AI is analyzing your CV and extracting your skills
- We're searching thousands of jobs to find the best matches
- We'll calculate match scores based on your preferences

This process typically takes 5-10 minutes.

We'll send you another email when we've found job matches for you!

Track Your Applications:
${trackingUrl}

Pro Tip: Bookmark this link! You can access your dashboard anytime without a password.

---
JobInt - Automated Job Applications Powered by AI
    `;

    return await this.sendEmail(user.email, subject, text, html, user.id, 'welcome');
  }

  /**
   * Send matches found email
   */
  async sendMatchesFoundEmail(user, matchCount, topMatches) {
    const trackingUrl = `${this.baseUrl}/track/${user.tracking_token}`;

    const subject = `We Found ${matchCount} Jobs for You! 🎯`;
    
    const matchesHtml = topMatches.slice(0, 3).map(match => `
      <div style="border: 1px solid #e5e7eb; padding: 15px; margin: 10px 0; border-radius: 6px; background: white;">
        <h4 style="margin: 0 0 10px 0; color: #1f2937;">${match.title}</h4>
        <p style="margin: 5px 0; color: #6b7280;"><strong>${match.company}</strong> • ${match.location}</p>
        <p style="margin: 5px 0; color: #10b981; font-weight: bold;">Match Score: ${match.match_score}%</p>
      </div>
    `).join('');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #10b981; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; padding: 14px 28px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
    .footer { text-align: center; margin-top: 30px; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Great News! 🎉</h1>
      <h2>We Found ${matchCount} Jobs for You</h2>
    </div>
    <div class="content">
      <p>Hi ${user.first_name || 'there'},</p>
      
      <p>Our AI has finished analyzing your profile and we've found <strong>${matchCount} job opportunities</strong> that match your skills and preferences!</p>
      
      <h3>Your Top Matches:</h3>
      ${matchesHtml}
      
      ${matchCount > 3 ? `<p><em>...and ${matchCount - 3} more opportunities waiting for you!</em></p>` : ''}
      
      <h3>What's Next?</h3>
      <p>Click the button below to review your matches and approve the jobs you want to apply to:</p>
      
      <a href="${trackingUrl}" class="button">Review My Matches</a>
      
      <p><strong>How it works:</strong></p>
      <ol>
        <li>Review each job match and see why it's a good fit</li>
        <li>Approve the jobs you want to apply to</li>
        <li>We'll automatically submit your applications</li>
        <li>Track everything from your dashboard</li>
      </ol>
    </div>
    
    <div class="footer">
      <p>JobInt - Automated Job Applications Powered by AI</p>
    </div>
  </div>
</body>
</html>
    `;

    const text = `
Great News! We Found ${matchCount} Jobs for You

Hi ${user.first_name || 'there'},

Our AI has finished analyzing your profile and we've found ${matchCount} job opportunities that match your skills and preferences!

Your Top Matches:
${topMatches.slice(0, 3).map((m, i) => `
${i + 1}. ${m.title} at ${m.company}
   Location: ${m.location}
   Match Score: ${m.match_score}%
`).join('\n')}

What's Next?
Review your matches and approve the jobs you want to apply to:
${trackingUrl}

How it works:
1. Review each job match and see why it's a good fit
2. Approve the jobs you want to apply to
3. We'll automatically submit your applications
4. Track everything from your dashboard

---
JobInt - Automated Job Applications Powered by AI
    `;

    return await this.sendEmail(user.email, subject, text, html, user.id, 'matches_found');
  }

  /**
   * Send application status update
   */
  async sendApplicationStatusEmail(user, application, job) {
    const trackingUrl = `${this.baseUrl}/track/${user.tracking_token}`;
    const statusMessages = {
      submitted: { emoji: '✅', title: 'Application Submitted', color: '#10b981' },
      reviewing: { emoji: '👀', title: 'Application Under Review', color: '#3b82f6' },
      interview_scheduled: { emoji: '🎤', title: 'Interview Scheduled!', color: '#8b5cf6' },
      rejected: { emoji: '❌', title: 'Application Update', color: '#ef4444' },
      offered: { emoji: '🎉', title: 'Job Offer Received!', color: '#f59e0b' }
    };

    const status = statusMessages[application.status] || statusMessages.submitted;

    const subject = `${status.emoji} ${status.title} - ${job.title}`;
    
    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${status.color}; color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
    .button { display: inline-block; padding: 14px 28px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; }
    .job-details { background: white; padding: 20px; border-radius: 6px; margin: 15px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${status.emoji} ${status.title}</h1>
    </div>
    <div class="content">
      <p>Hi ${user.first_name || 'there'},</p>
      
      <div class="job-details">
        <h3 style="margin: 0 0 10px 0;">${job.title}</h3>
        <p style="margin: 5px 0;"><strong>Company:</strong> ${job.company}</p>
        <p style="margin: 5px 0;"><strong>Location:</strong> ${job.location}</p>
        <p style="margin: 5px 0;"><strong>Status:</strong> ${application.status.replace('_', ' ').toUpperCase()}</p>
      </div>
      
      <p>View all your applications and track their progress:</p>
      <a href="${trackingUrl}" class="button">View Dashboard</a>
    </div>
  </div>
</body>
</html>
    `;

    const text = `${status.title} - ${job.title}\n\nHi ${user.first_name},\n\nYour application for ${job.title} at ${job.company} is now: ${application.status}\n\nView dashboard: ${trackingUrl}`;

    return await this.sendEmail(user.email, subject, text, html, user.id, 'application_status');
  }

  /**
   * Core email sending function
   */
  async sendEmail(to, subject, text, html, userId = null, emailType = 'generic') {
    try {
      const mailOptions = {
        from: `${this.fromName} <${this.fromEmail}>`,
        to,
        subject,
        text,
        html
      };

      const info = await this.transporter.sendMail(mailOptions);

      // Log email in database
      await query(
        `INSERT INTO email_log (user_id, email_to, email_type, subject, sent, sent_at)
         VALUES ($1, $2, $3, $4, TRUE, CURRENT_TIMESTAMP)`,
        [userId, to, emailType, subject]
      );

      logger.info(`Email sent: ${emailType} to ${to}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error('Email sending error:', error);

      // Log failed email
      if (userId) {
        await query(
          `INSERT INTO email_log (user_id, email_to, email_type, subject, sent, error_message)
           VALUES ($1, $2, $3, $4, FALSE, $5)`,
          [userId, to, emailType, subject, error.message]
        );
      }

      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();