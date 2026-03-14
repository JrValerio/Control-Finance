-- Refresh token table for httpOnly cookie session management.
-- token_hash: SHA-256 of the opaque raw token (only the cookie holds the raw value).
-- family_id:  UUID shared across all rotations of one login session.
--             If a revoked token is replayed, the entire family is revoked (theft detection).

CREATE TABLE refresh_tokens (
  id           SERIAL PRIMARY KEY,
  token_hash   TEXT        NOT NULL UNIQUE,
  user_id      INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id    UUID        NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  revoked_at   TIMESTAMPTZ,
  replaced_by  TEXT,
  ip_address   TEXT,
  user_agent   TEXT,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_family  ON refresh_tokens(family_id);
