CREATE TABLE IF NOT EXISTS user_goals (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  target_amount  NUMERIC(15,2) NOT NULL,
  current_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  target_date    DATE NOT NULL,
  icon           TEXT NOT NULL DEFAULT 'target',
  notes          TEXT,
  deleted_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_goals_user_deleted
  ON user_goals (user_id, deleted_at);
