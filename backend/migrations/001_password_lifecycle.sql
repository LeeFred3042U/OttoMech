-- 001_password_lifecycle.sql

-- 1. Add password_deadline column
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_deadline TIMESTAMPTZ NULL;

-- 2. Modify the default of the status column
ALTER TABLE users ALTER COLUMN status SET DEFAULT 'PENDING_PASSWORD';

-- 3. Update existing users to PENDING_PASSWORD if active but without password
UPDATE users SET status = 'PENDING_PASSWORD', password_deadline = NOW() + INTERVAL '24 hours' WHERE status = 'active' AND password_hash IS NULL;

-- 4. Create the password_setup_tokens table
CREATE TABLE IF NOT EXISTS password_setup_tokens (
    token       TEXT PRIMARY KEY,
    user_id     UUID REFERENCES users(user_id),
    created_at  TIMESTAMPTZ DEFAULT now(),
    expires_at  TIMESTAMPTZ,
    used_at     TIMESTAMPTZ NULL
);
