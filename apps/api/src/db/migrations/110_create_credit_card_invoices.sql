CREATE TABLE IF NOT EXISTS credit_card_invoices (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credit_card_id    INTEGER        NOT NULL REFERENCES credit_cards(id) ON DELETE CASCADE,
  issuer            TEXT           NOT NULL,
  card_last4        TEXT,
  period_start      DATE           NOT NULL,
  period_end        DATE           NOT NULL,
  due_date          DATE           NOT NULL,
  total_amount      NUMERIC(12,2)  NOT NULL CHECK (total_amount > 0),
  minimum_payment   NUMERIC(12,2),
  financed_balance  NUMERIC(12,2),
  parse_confidence  TEXT           NOT NULL DEFAULT 'high'
                                   CHECK (parse_confidence IN ('high', 'low')),
  parse_metadata    JSONB          NOT NULL DEFAULT '{}'::jsonb,
  linked_bill_id    INTEGER        REFERENCES bills(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  CONSTRAINT credit_card_invoices_unique_invoice UNIQUE (credit_card_id, due_date, total_amount)
);

CREATE INDEX IF NOT EXISTS idx_credit_card_invoices_user_card
  ON credit_card_invoices (user_id, credit_card_id, period_start DESC);
