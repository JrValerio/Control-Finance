CREATE TABLE IF NOT EXISTS user_forecasts (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month                 DATE          NOT NULL, -- first day of the forecast month (e.g. 2025-06-01)
  engine_version        VARCHAR(10)   NOT NULL DEFAULT 'v1',
  -- Core output
  projected_balance     NUMERIC(12, 2),         -- estimated end-of-month balance
  income_expected       NUMERIC(12, 2),          -- salary (from profile) or null
  spending_to_date      NUMERIC(12, 2),          -- actual spending so far this month
  daily_avg_spending    NUMERIC(10, 4),          -- avg daily spend (last 60 days)
  days_remaining        SMALLINT,                -- days left until end of month
  flip_detected         BOOLEAN       NOT NULL DEFAULT false,
  flip_direction        VARCHAR(16),             -- 'pos_to_neg' | 'neg_to_pos' | null
  -- Meta
  generated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_user_forecasts_flip_direction
    CHECK (flip_direction IN ('pos_to_neg', 'neg_to_pos') OR flip_direction IS NULL)
);

-- One forecast row per user per month (upsert target)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_forecasts_user_month
  ON user_forecasts (user_id, month);

CREATE INDEX IF NOT EXISTS idx_user_forecasts_user_id
  ON user_forecasts (user_id);
