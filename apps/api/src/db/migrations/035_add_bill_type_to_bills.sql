-- Migration 035: bill_type + source_import_session_id on bills
-- Supports import → bills bridge: tracks document type and originating import session

ALTER TABLE bills ADD COLUMN IF NOT EXISTS bill_type TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS source_import_session_id TEXT;
