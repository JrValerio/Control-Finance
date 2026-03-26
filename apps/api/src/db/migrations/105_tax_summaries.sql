CREATE TABLE IF NOT EXISTS tax_summaries (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL CHECK (tax_year >= 2000 AND tax_year <= 2100),
  snapshot_version INTEGER NOT NULL DEFAULT 1 CHECK (snapshot_version > 0),
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_counts_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_summaries_user_year_version
  ON tax_summaries(user_id, tax_year, snapshot_version);

CREATE INDEX IF NOT EXISTS idx_tax_summaries_user_year
  ON tax_summaries(user_id, tax_year);
