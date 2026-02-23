CREATE TABLE IF NOT EXISTS bills (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title           TEXT          NOT NULL,
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  due_date        DATE          NOT NULL,
  status          TEXT          NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'paid')),
  category_id     INTEGER       REFERENCES categories(id) ON DELETE SET NULL,
  paid_at         TIMESTAMPTZ,
  notes           TEXT,
  provider        TEXT,
  reference_month TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bills_user_status_due
  ON bills (user_id, status, due_date);
