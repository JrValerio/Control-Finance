-- Add trial_ends_at to users; new users get 14 days from signup.
-- Existing rows are backfilled using their created_at for historical accuracy.
-- The application sets trial_ends_at explicitly on INSERT (no column DEFAULT needed).

ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;

UPDATE users
SET trial_ends_at = created_at + INTERVAL '14 days'
WHERE trial_ends_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_trial_ends_at ON users (trial_ends_at);
