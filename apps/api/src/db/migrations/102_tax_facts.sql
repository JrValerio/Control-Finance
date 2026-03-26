CREATE TABLE IF NOT EXISTS tax_facts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL CHECK (tax_year >= 2000 AND tax_year <= 2100),
  source_document_id INTEGER REFERENCES tax_documents(id) ON DELETE SET NULL,
  fact_type TEXT NOT NULL CHECK (
    fact_type IN (
      'taxable_income',
      'exclusive_tax_income',
      'exempt_income',
      'withheld_tax',
      'asset_balance',
      'debt_balance',
      'medical_deduction',
      'education_deduction',
      'other'
    )
  ),
  category TEXT NOT NULL DEFAULT '',
  subcategory TEXT NOT NULL DEFAULT '',
  payer_name TEXT NOT NULL DEFAULT '',
  payer_document TEXT NOT NULL DEFAULT '',
  reference_period TEXT NOT NULL DEFAULT '',
  currency CHAR(3) NOT NULL DEFAULT 'BRL',
  amount NUMERIC(14,2) NOT NULL,
  confidence_score NUMERIC(5,4) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  dedupe_key TEXT,
  dedupe_strength TEXT NOT NULL DEFAULT 'strong' CHECK (
    dedupe_strength IN ('strong', 'weak')
  ),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    review_status IN ('pending', 'approved', 'corrected', 'rejected')
  ),
  conflict_code TEXT,
  conflict_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_facts_user_year
  ON tax_facts(user_id, tax_year);

CREATE INDEX IF NOT EXISTS idx_tax_facts_user_review_status
  ON tax_facts(user_id, review_status);

CREATE INDEX IF NOT EXISTS idx_tax_facts_source_document
  ON tax_facts(source_document_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_facts_user_dedupe_key_strong
  ON tax_facts(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND dedupe_strength = 'strong';
