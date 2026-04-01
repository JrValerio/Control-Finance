CREATE TABLE IF NOT EXISTS tax_documents (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL CHECK (tax_year >= 2000 AND tax_year <= 2100),
  original_file_name TEXT NOT NULL,
  stored_file_name TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  sha256 CHAR(64) NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'unknown' CHECK (
    document_type IN (
      'unknown',
      'income_report_bank',
      'income_report_employer',
      'clt_payslip',
      'income_report_inss',
      'medical_statement',
      'education_receipt',
      'loan_statement',
      'bank_statement_support'
    )
  ),
  source_label TEXT NOT NULL DEFAULT '',
  source_hint TEXT NOT NULL DEFAULT '',
  upload_origin TEXT NOT NULL DEFAULT 'manual' CHECK (
    upload_origin IN ('manual', 'future_integration')
  ),
  processing_status TEXT NOT NULL DEFAULT 'uploaded' CHECK (
    processing_status IN (
      'uploaded',
      'classified',
      'extracted',
      'normalized',
      'failed'
    )
  ),
  error_code TEXT,
  error_message TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  classified_at TIMESTAMPTZ,
  extracted_at TIMESTAMPTZ,
  normalized_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_documents_user_sha256
  ON tax_documents(user_id, sha256);

CREATE INDEX IF NOT EXISTS idx_tax_documents_user_year
  ON tax_documents(user_id, tax_year);

CREATE INDEX IF NOT EXISTS idx_tax_documents_user_status
  ON tax_documents(user_id, processing_status);
