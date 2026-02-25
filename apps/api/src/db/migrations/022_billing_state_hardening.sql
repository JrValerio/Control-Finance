-- 022_billing_state_hardening.sql
-- Entitlement cache + subscriptions hardening + webhook idempotency.

-- 1) Optional cache on users. Source of truth remains subscriptions/plans.
ALTER TABLE users
ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

ALTER TABLE users
DROP CONSTRAINT IF EXISTS chk_users_plan;

ALTER TABLE users
ADD CONSTRAINT chk_users_plan
CHECK (plan IN ('free', 'trial', 'pro'));

-- Backfill users.plan cache from existing billing state.
-- Precedence:
--  1) active recurring subscription
--  2) active prepaid entitlement (pro_expires_at)
--  3) active trial
--  4) free
UPDATE users
SET plan = CASE
  WHEN id IN (
    SELECT user_id
    FROM subscriptions
    WHERE status IN ('active', 'trialing', 'past_due')
  ) THEN 'pro'
  WHEN pro_expires_at IS NOT NULL AND pro_expires_at > NOW() THEN 'pro'
  WHEN trial_ends_at IS NOT NULL AND trial_ends_at > NOW() THEN 'trial'
  ELSE 'free'
END;

CREATE INDEX IF NOT EXISTS idx_users_plan ON users (plan);
CREATE INDEX IF NOT EXISTS idx_users_trial_ends_at ON users (trial_ends_at);
CREATE INDEX IF NOT EXISTS idx_users_pro_expires_at ON users (pro_expires_at);

-- 2) Subscription status hardening.
-- NOTE: prepaid is not a Stripe subscription status and should not be stored here.
ALTER TABLE subscriptions
DROP CONSTRAINT IF EXISTS chk_subscriptions_status;

ALTER TABLE subscriptions
ADD CONSTRAINT chk_subscriptions_status
CHECK (
  status IN (
    'active',
    'trialing',
    'past_due',
    'canceled',
    'incomplete',
    'incomplete_expired',
    'unpaid'
  )
);

-- 3) Stripe webhook idempotency registry.
CREATE TABLE IF NOT EXISTS stripe_events (
  id SERIAL PRIMARY KEY,
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_processed_at
  ON stripe_events (processed_at);
