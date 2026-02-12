-- seed-jobs.sql - Sample Job Listings for Testing

-- Clear existing jobs (optional - remove if you want to keep existing data)
-- DELETE FROM job_listings WHERE source = 'seed';

-- Insert sample tech jobs
INSERT INTO job_listings (
  external_id, source, title, company, location, job_type, remote_type,
  description, required_skills, salary_range, application_url, posted_date, is_active
) VALUES
  -- Remote Software Engineering Jobs
  (
    'SEED-001',
    'seed',
    'Senior Full Stack Engineer',
    'Google',
    'Remote',
    'full_time',
    'remote',
    'Join our team to build scalable web applications using React, Node.js, and cloud technologies. You will work on high-impact projects serving millions of users.',
    '["JavaScript", "React", "Node.js", "TypeScript", "AWS", "Docker"]',
    '$150,000 - $200,000',
    'https://careers.google.com/jobs/results/123456/',
    NOW() - INTERVAL '2 days',
    true
  ),
  (
    'SEED-002',
    'seed',
    'Senior Software Engineer',
    'Netflix',
    'Remote',
    'full_time',
    'remote',
    'Build streaming infrastructure and content delivery systems. Work with React, Java, Python, and AWS at scale.',
    '["Java", "Python", "React", "AWS", "Kubernetes", "Microservices"]',
    '$160,000 - $210,000',
    'https://jobs.netflix.com/jobs/234567',
    NOW() - INTERVAL '1 day',
    true
  ),
  (
    'SEED-003',
    'seed',
    'Full Stack Developer',
    'Spotify',
    'Remote',
    'full_time',
    'remote',
    'Create music streaming features using React, Node.js, and GraphQL. Join a team passionate about music and technology.',
    '["React", "Node.js", "GraphQL", "TypeScript", "PostgreSQL"]',
    '$130,000 - $180,000',
    'https://www.spotifyjobs.com/345678',
    NOW() - INTERVAL '3 days',
    true
  ),

  -- Hybrid/San Francisco Jobs
  (
    'SEED-004',
    'seed',
    'Senior Backend Engineer',
    'Stripe',
    'San Francisco, CA',
    'full_time',
    'hybrid',
    'Build payment infrastructure that powers internet commerce. Work with Ruby, Go, and distributed systems.',
    '["Ruby", "Go", "PostgreSQL", "Redis", "Distributed Systems"]',
    '$170,000 - $220,000',
    'https://stripe.com/jobs/456789',
    NOW() - INTERVAL '4 days',
    true
  ),
  (
    'SEED-005',
    'seed',
    'Frontend Engineer',
    'Airbnb',
    'San Francisco, CA',
    'full_time',
    'hybrid',
    'Create beautiful user experiences for travelers worldwide. Use React, TypeScript, and modern web technologies.',
    '["React", "TypeScript", "CSS", "HTML", "Testing", "A11y"]',
    '$140,000 - $190,000',
    'https://careers.airbnb.com/positions/567890',
    NOW() - INTERVAL '5 days',
    true
  ),

  -- DevOps/Cloud Jobs
  (
    'SEED-006',
    'seed',
    'DevOps Engineer',
    'Amazon Web Services',
    'Seattle, WA',
    'full_time',
    'hybrid',
    'Manage cloud infrastructure and CI/CD pipelines. Work with AWS, Terraform, Kubernetes, and Python automation.',
    '["AWS", "Kubernetes", "Terraform", "Python", "Docker", "CI/CD"]',
    '$145,000 - $195,000',
    'https://www.amazon.jobs/en/jobs/678901',
    NOW() - INTERVAL '6 days',
    true
  ),
  (
    'SEED-007',
    'seed',
    'Cloud Infrastructure Engineer',
    'Microsoft Azure',
    'Redmond, WA',
    'full_time',
    'hybrid',
    'Build and maintain Azure cloud services. Work with C#, Go, and cloud-native technologies.',
    '["Azure", "C#", "Go", "Kubernetes", "Terraform", "Monitoring"]',
    '$155,000 - $205,000',
    'https://careers.microsoft.com/us/en/job/789012',
    NOW() - INTERVAL '7 days',
    true
  ),

  -- Mid-level Jobs
  (
    'SEED-008',
    'seed',
    'Software Engineer II',
    'Meta',
    'Menlo Park, CA',
    'full_time',
    'onsite',
    'Build social features and infrastructure at massive scale. Use React, Python, and distributed systems.',
    '["React", "Python", "JavaScript", "MySQL", "GraphQL"]',
    '$130,000 - $170,000',
    'https://www.metacareers.com/jobs/890123',
    NOW() - INTERVAL '8 days',
    true
  ),
  (
    'SEED-009',
    'seed',
    'Full Stack Engineer',
    'Shopify',
    'Remote',
    'full_time',
    'remote',
    'Help merchants build their businesses online. Work with Ruby on Rails, React, and e-commerce at scale.',
    '["Ruby on Rails", "React", "JavaScript", "MySQL", "Redis"]',
    '$120,000 - $160,000',
    'https://www.shopify.com/careers/901234',
    NOW() - INTERVAL '9 days',
    true
  ),

  -- Startup Jobs
  (
    'SEED-010',
    'seed',
    'Senior Frontend Developer',
    'Notion',
    'San Francisco, CA',
    'full_time',
    'hybrid',
    'Build collaborative productivity tools. Work with React, TypeScript, and real-time collaboration tech.',
    '["React", "TypeScript", "WebSockets", "Real-time Systems"]',
    '$140,000 - $180,000',
    'https://www.notion.so/careers/012345',
    NOW() - INTERVAL '10 days',
    true
  ),
  (
    'SEED-011',
    'seed',
    'Backend Engineer',
    'Discord',
    'Remote',
    'full_time',
    'remote',
    'Scale real-time communication for millions of users. Work with Elixir, Rust, and distributed systems.',
    '["Elixir", "Rust", "PostgreSQL", "Distributed Systems", "WebSockets"]',
    '$135,000 - $175,000',
    'https://discord.com/jobs/123456',
    NOW() - INTERVAL '11 days',
    true
  ),

  -- Data/ML Jobs
  (
    'SEED-012',
    'seed',
    'Machine Learning Engineer',
    'OpenAI',
    'San Francisco, CA',
    'full_time',
    'hybrid',
    'Train and deploy large language models. Work with Python, PyTorch, and distributed training systems.',
    '["Python", "PyTorch", "TensorFlow", "ML", "Deep Learning"]',
    '$180,000 - $250,000',
    'https://openai.com/careers/234567',
    NOW() - INTERVAL '12 days',
    true
  ),
  (
    'SEED-013',
    'seed',
    'Data Engineer',
    'Databricks',
    'Remote',
    'full_time',
    'remote',
    'Build data pipelines and analytics infrastructure. Work with Spark, Python, and cloud data platforms.',
    '["Python", "Spark", "SQL", "AWS", "Data Pipelines"]',
    '$140,000 - $190,000',
    'https://databricks.com/company/careers/345678',
    NOW() - INTERVAL '13 days',
    true
  ),

  -- Mobile Jobs
  (
    'SEED-014',
    'seed',
    'Senior iOS Engineer',
    'Apple',
    'Cupertino, CA',
    'full_time',
    'onsite',
    'Build the next generation of iOS features. Work with Swift, UIKit, and SwiftUI.',
    '["Swift", "iOS", "UIKit", "SwiftUI", "Xcode"]',
    '$165,000 - $215,000',
    'https://jobs.apple.com/en-us/details/456789',
    NOW() - INTERVAL '14 days',
    true
  ),
  (
    'SEED-015',
    'seed',
    'React Native Developer',
    'Uber',
    'San Francisco, CA',
    'full_time',
    'hybrid',
    'Build cross-platform mobile apps for riders and drivers. Work with React Native, TypeScript, and GraphQL.',
    '["React Native", "TypeScript", "GraphQL", "Mobile Development"]',
    '$135,000 - $185,000',
    'https://www.uber.com/us/en/careers/list/567890',
    NOW() - INTERVAL '15 days',
    true
  ),

  -- Entry-level/Junior Jobs
  (
    'SEED-016',
    'seed',
    'Junior Software Engineer',
    'GitHub',
    'Remote',
    'full_time',
    'remote',
    'Start your career building developer tools used by millions. Work with Ruby, JavaScript, and Git.',
    '["JavaScript", "Ruby", "Git", "Web Development"]',
    '$90,000 - $120,000',
    'https://github.com/about/careers/678901',
    NOW() - INTERVAL '16 days',
    true
  ),
  (
    'SEED-017',
    'seed',
    'Associate Software Engineer',
    'Atlassian',
    'Remote',
    'full_time',
    'remote',
    'Build collaboration tools for teams. Work with Java, React, and cloud technologies.',
    '["Java", "React", "Spring Boot", "AWS"]',
    '$95,000 - $125,000',
    'https://www.atlassian.com/company/careers/789012',
    NOW() - INTERVAL '17 days',
    true
  ),

  -- Contract/Part-time
  (
    'SEED-018',
    'seed',
    'Freelance Web Developer',
    'Toptal',
    'Remote',
    'contract',
    'remote',
    'Take on client projects building modern web applications. Flexible hours and remote work.',
    '["HTML", "CSS", "JavaScript", "React", "Node.js"]',
    '$80 - $150/hour',
    'https://www.toptal.com/developers/890123',
    NOW() - INTERVAL '18 days',
    true
  ),
  (
    'SEED-019',
    'seed',
    'Part-time Frontend Developer',
    'Local Startup',
    'San Francisco, CA',
    'part_time',
    'hybrid',
    'Help build an early-stage product. Flexible hours, equity compensation.',
    '["React", "TypeScript", "Tailwind CSS"]',
    '$60,000 - $80,000 (pro-rated)',
    'https://example.com/jobs/901234',
    NOW() - INTERVAL '19 days',
    true
  ),

  -- Specialized Roles
  (
    'SEED-020',
    'seed',
    'Principal Engineer',
    'Coinbase',
    'Remote',
    'full_time',
    'remote',
    'Lead technical architecture for cryptocurrency exchange. Work with distributed systems, security, and blockchain.',
    '["Distributed Systems", "Security", "Blockchain", "Go", "Rust"]',
    '$200,000 - $280,000',
    'https://www.coinbase.com/careers/positions/012345',
    NOW() - INTERVAL '20 days',
    true
  );

-- Verify insertion
SELECT COUNT(*) as total_jobs, COUNT(DISTINCT company) as total_companies 
FROM job_listings 
WHERE source = 'seed';

-- Show sample of jobs
SELECT title, company, remote_type, salary_range 
FROM job_listings 
WHERE source = 'seed' 
ORDER BY posted_date DESC 
LIMIT 10;