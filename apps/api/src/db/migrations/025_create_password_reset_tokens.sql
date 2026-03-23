-- Stores single-use tokens for password recovery.
-- token_hash: SHA-256 hex of the raw token sent to the user (never stored in clear).
-- used_at: set on first successful use — prevents replay.
-- A new request invalidates previous active tokens for the same user (done in service).
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          SERIAL      PRIMARY KEY,
  user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  VARCHAR(64) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
  ON password_reset_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at
  ON password_reset_tokens (expires_at);
