CREATE TABLE IF NOT EXISTS tax_reviews (
  id SERIAL PRIMARY KEY,
  tax_fact_id INTEGER NOT NULL REFERENCES tax_facts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  review_action TEXT NOT NULL CHECK (
    review_action IN ('approve', 'correct', 'reject', 'bulk_approve')
  ),
  previous_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  corrected_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_reviews_fact_id
  ON tax_reviews(tax_fact_id);

CREATE INDEX IF NOT EXISTS idx_tax_reviews_user_id
  ON tax_reviews(user_id);
