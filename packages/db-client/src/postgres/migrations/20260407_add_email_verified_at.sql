ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

UPDATE users
SET email_verified_at = NOW()
WHERE email_verified = true AND email_verified_at IS NULL;