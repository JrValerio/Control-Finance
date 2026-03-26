CREATE TABLE IF NOT EXISTS tax_document_extractions (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL REFERENCES tax_documents(id) ON DELETE CASCADE,
  extractor_name TEXT NOT NULL,
  extractor_version TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT 'unknown',
  confidence_score NUMERIC(5,4) CHECK (confidence_score >= 0 AND confidence_score <= 1),
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  warnings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_document_extractions_document_id
  ON tax_document_extractions(document_id);

CREATE INDEX IF NOT EXISTS idx_tax_document_extractions_classification
  ON tax_document_extractions(classification);
