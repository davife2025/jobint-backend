-- Migration Script: v1 to v2 (Guest Application Mode)
-- Run this if you're migrating from the old backend

-- Step 1: Add new columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS tracking_token UUID UNIQUE DEFAULT uuid_generate_v4();
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_guest BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS guest_created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Step 2: Add indexes for tracking token
CREATE INDEX IF NOT EXISTS idx_users_tracking_token ON users(tracking_token);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Step 3: Update existing users to have tracking tokens
UPDATE users SET tracking_token = uuid_generate_v4() WHERE tracking_token IS NULL;

-- Step 4: Mark existing users as non-guests (they have passwords)
UPDATE users SET is_guest = FALSE WHERE password_hash IS NOT NULL;

-- Step 5: Add new columns to user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS resume_filename VARCHAR(255);
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS cv_parsed BOOLEAN DEFAULT FALSE;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE;

-- Step 6: Add reviewed and approved columns to job_matches
ALTER TABLE job_matches ADD COLUMN IF NOT EXISTS reviewed BOOLEAN DEFAULT FALSE;
ALTER TABLE job_matches ADD COLUMN IF NOT EXISTS approved BOOLEAN DEFAULT FALSE;

-- Create index
CREATE INDEX IF NOT EXISTS idx_job_matches_reviewed ON job_matches(user_id, reviewed);

-- Step 7: Create email_log table
CREATE TABLE IF NOT EXISTS email_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    email_to VARCHAR(255) NOT NULL,
    email_type VARCHAR(50) NOT NULL,
    subject VARCHAR(255),
    sent BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_log_user ON email_log(user_id);
CREATE INDEX IF NOT EXISTS idx_email_log_type ON email_log(email_type);

-- Step 8: Create reminders table
CREATE TABLE IF NOT EXISTS reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    interview_id UUID REFERENCES interviews(id) ON DELETE CASCADE,
    reminder_type VARCHAR(10) NOT NULL,
    sent BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(interview_id, reminder_type)
);

-- Step 9: Add match_id to application_queue
ALTER TABLE application_queue ADD COLUMN IF NOT EXISTS match_id UUID REFERENCES job_matches(id) ON DELETE SET NULL;
ALTER TABLE application_queue ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

-- Step 10: Add entity fields to notifications
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_type VARCHAR(50);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS entity_id UUID;

-- Step 11: Add unique constraint to job_listings to prevent duplicates
-- This may fail if you have duplicates - clean them first
-- ALTER TABLE job_listings ADD CONSTRAINT job_listings_source_external_id_key UNIQUE (source, external_id);

-- Step 12: Update user_dashboard view
DROP VIEW IF EXISTS user_dashboard;
CREATE VIEW user_dashboard AS
SELECT 
    u.id as user_id,
    u.email,
    u.first_name,
    u.last_name,
    u.is_guest,
    u.tracking_token,
    COUNT(DISTINCT a.id) as total_applications,
    COUNT(DISTINCT CASE WHEN a.status = 'interview_scheduled' THEN a.id END) as interviews_scheduled,
    COUNT(DISTINCT CASE WHEN a.status = 'offered' THEN a.id END) as offers_received,
    COUNT(DISTINCT i.id) as total_interviews,
    COUNT(DISTINCT CASE WHEN jm.reviewed = FALSE THEN jm.id END) as pending_matches,
    MAX(a.applied_at) as last_application_date
FROM users u
LEFT JOIN applications a ON u.id = a.user_id
LEFT JOIN interviews i ON u.id = i.user_id
LEFT JOIN job_matches jm ON u.id = jm.user_id
GROUP BY u.id, u.email, u.first_name, u.last_name, u.is_guest, u.tracking_token;

-- Migration complete!
-- Verify with: SELECT COUNT(*) FROM users WHERE tracking_token IS NOT NULL;