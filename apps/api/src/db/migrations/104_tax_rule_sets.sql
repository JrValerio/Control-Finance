CREATE TABLE IF NOT EXISTS tax_rule_sets (
  id SERIAL PRIMARY KEY,
  tax_year INTEGER NOT NULL CHECK (tax_year >= 2000 AND tax_year <= 2100),
  exercise_year INTEGER NOT NULL CHECK (exercise_year >= 2000 AND exercise_year <= 2100),
  rule_family TEXT NOT NULL CHECK (
    rule_family IN (
      'obligation',
      'annual_table',
      'monthly_table',
      'deduction_limits',
      'comparison_logic',
      'warning_rules'
    )
  ),
  version INTEGER NOT NULL CHECK (version > 0),
  source_url TEXT NOT NULL DEFAULT '',
  source_label TEXT NOT NULL DEFAULT '',
  effective_from DATE NOT NULL,
  effective_to DATE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  rules_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  checksum_sha256 CHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_rule_sets_unique_version
  ON tax_rule_sets(tax_year, exercise_year, rule_family, version);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_rule_sets_single_active
  ON tax_rule_sets(tax_year, exercise_year, rule_family)
  WHERE is_active = true;
