CREATE TABLE IF NOT EXISTS credit_cards (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT          NOT NULL,
  limit_total  NUMERIC(12,2) NOT NULL CHECK (limit_total > 0),
  closing_day  INTEGER       NOT NULL CHECK (closing_day BETWEEN 1 AND 31),
  due_day      INTEGER       NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  is_active    BOOLEAN       NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_cards_user_active
  ON credit_cards (user_id, is_active, id);

ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS credit_card_id INTEGER REFERENCES credit_cards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bills_credit_card_status
  ON bills (user_id, credit_card_id, status, due_date);

CREATE TABLE IF NOT EXISTS credit_card_purchases (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credit_card_id INTEGER       NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
  bill_id        INTEGER       REFERENCES bills(id) ON DELETE SET NULL,
  title          TEXT          NOT NULL,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  purchase_date  DATE          NOT NULL,
  status         TEXT          NOT NULL DEFAULT 'open'
                               CHECK (status IN ('open', 'billed')),
  statement_month TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_card_purchases_user_card_status
  ON credit_card_purchases (user_id, credit_card_id, status, purchase_date);

CREATE INDEX IF NOT EXISTS idx_credit_card_purchases_bill_id
  ON credit_card_purchases (bill_id);
