CREATE TABLE IF NOT EXISTS import_files (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL,
  file_sha256 TEXT NOT NULL,
  original_filename TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT import_files_user_source_hash_key UNIQUE (user_id, source_kind, file_sha256)
);

CREATE INDEX IF NOT EXISTS idx_import_files_user_id
  ON import_files (user_id);

CREATE INDEX IF NOT EXISTS idx_import_files_created_at_desc
  ON import_files (created_at DESC);

ALTER TABLE transaction_import_sessions
  ADD COLUMN IF NOT EXISTS file_sha256 TEXT;
