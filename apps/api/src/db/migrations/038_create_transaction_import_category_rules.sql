CREATE TABLE IF NOT EXISTS transaction_import_category_rules (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id BIGINT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  match_text TEXT NOT NULL,
  normalized_match_text TEXT NOT NULL,
  transaction_type TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_transaction_import_category_rules_transaction_type
    CHECK (transaction_type IN ('', 'Entrada', 'Saida'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transaction_import_category_rules_user_match_type_unique
  ON transaction_import_category_rules (user_id, normalized_match_text, transaction_type);

CREATE INDEX IF NOT EXISTS idx_transaction_import_category_rules_user_created_at_desc
  ON transaction_import_category_rules (user_id, created_at DESC);
