ALTER TABLE users
ADD COLUMN IF NOT EXISTS pro_expires_at TIMESTAMPTZ NULL;

CREATE TABLE IF NOT EXISTS prepaid_pro_grants (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_checkout_session_id TEXT NOT NULL UNIQUE,
  stripe_payment_intent_id TEXT,
  entitlement_months INTEGER NOT NULL CHECK (entitlement_months > 0),
  granted_until TIMESTAMPTZ NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prepaid_pro_grants_user_id
  ON prepaid_pro_grants (user_id);
