ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS import_fingerprint TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_user_fingerprint
  ON transactions (user_id, import_fingerprint)
  WHERE import_fingerprint IS NOT NULL AND deleted_at IS NULL;
