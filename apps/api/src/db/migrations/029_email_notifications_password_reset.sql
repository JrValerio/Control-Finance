-- Extend email_notifications for password reset tracking.
-- Adds 'password_reset' to the type constraint and a status column
-- so failed delivery attempts can be persisted for audit and retry.

ALTER TABLE email_notifications
  DROP CONSTRAINT IF EXISTS chk_email_notifications_type;

ALTER TABLE email_notifications
  ADD CONSTRAINT chk_email_notifications_type
    CHECK (type IN ('flip_neg', 'payday_reminder', 'password_reset'));

ALTER TABLE email_notifications
  ADD COLUMN IF NOT EXISTS status VARCHAR(10) NOT NULL DEFAULT 'sent';

ALTER TABLE email_notifications
  ADD CONSTRAINT chk_email_notifications_status
    CHECK (status IN ('sent', 'failed'));
