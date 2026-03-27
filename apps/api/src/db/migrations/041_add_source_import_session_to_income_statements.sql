-- Migration 041: source_import_session_id on income_statements
-- Supports import -> income history bridge and operationally safe undo

ALTER TABLE income_statements
  ADD COLUMN IF NOT EXISTS source_import_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_income_statements_source_import_session_id
  ON income_statements(source_import_session_id)
  WHERE source_import_session_id IS NOT NULL;
