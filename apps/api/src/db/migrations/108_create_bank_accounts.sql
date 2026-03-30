CREATE TABLE IF NOT EXISTS bank_accounts (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT            NOT NULL,
  bank_name     TEXT,
  balance       NUMERIC(12, 2)  NOT NULL DEFAULT 0,
  limit_total   NUMERIC(12, 2)  NOT NULL DEFAULT 0 CHECK (limit_total >= 0),
  is_active     BOOLEAN         NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_user_id ON bank_accounts(user_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS bank_accounts_set_updated_at ON bank_accounts;
CREATE TRIGGER bank_accounts_set_updated_at
  BEFORE UPDATE ON bank_accounts
  FOR EACH ROW
  EXECUTE PROCEDURE set_updated_at();
