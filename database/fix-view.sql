DROP VIEW IF EXISTS user_dashboard;

CREATE VIEW user_dashboard AS
SELECT 
    u.id as user_id,
    u.email,
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
GROUP BY u.id, u.email, u.is_guest, u.tracking_token;