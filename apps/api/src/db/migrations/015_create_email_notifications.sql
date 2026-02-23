-- Tracks sent notifications for rate-limiting and deduplication.
-- type: 'flip_neg' | 'payday_reminder'
CREATE TABLE IF NOT EXISTS email_notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(30)   NOT NULL,
  sent_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  metadata    JSONB         NOT NULL DEFAULT '{}',
  CONSTRAINT chk_email_notifications_type
    CHECK (type IN ('flip_neg', 'payday_reminder'))
);

CREATE INDEX IF NOT EXISTS idx_email_notifications_user_type_sent
  ON email_notifications (user_id, type, sent_at DESC);
