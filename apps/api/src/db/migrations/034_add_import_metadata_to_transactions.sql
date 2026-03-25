-- Track which import session each transaction came from, enabling bulk undo
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS import_session_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS import_file_name TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS import_document_type TEXT;

-- Index to quickly find all transactions from one import session
CREATE INDEX IF NOT EXISTS idx_transactions_user_import_session
  ON transactions (user_id, import_session_id)
  WHERE import_session_id IS NOT NULL AND deleted_at IS NULL;
