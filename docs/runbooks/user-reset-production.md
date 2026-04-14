# User Reset Production Runbook

## Scope
Operational runbook to reset a single user to a clean in-app state in production for controlled testing.

This runbook is intended for support, QA, or launch validation when a user needs to restart from zero without changing entitlements, subscriptions, or application code.

## When To Use
- Resetting a test user before a new smoke test pass.
- Removing seeded or manually created card/profile/income data for a single user.
- Replaying onboarding from the beginning for one known account.

## Do Not Use For
- Stripe or billing state changes.
- Entitlement or trial state changes.
- Multi-user bulk cleanup.
- General account deletion or LGPD erasure workflows.

## What This Reset Affects
For the target user only, this runbook removes:
- Credit card invoice bills (`bills.bill_type = 'credit_card_invoice'`)
- Credit cards
- Salary profile / imported INSS benefit state
- Income statements linked to the user's income sources
- Income sources

## What This Reset Does Not Affect
- Other users
- Auth account / user row
- Subscription / Stripe state
- Other transaction history not covered by the SQL below
- Application code, deploys, or migrations

## Preconditions
1. Confirm the target email is correct.
2. Run the script in two passes:
   - Pass 1: `ROLLBACK` only
   - Pass 2: replace `ROLLBACK` with `COMMIT`
3. Validate the `AFTER` counts are all zero before committing.

## Preferred Execution Path
Use one of:
- Render SQL console
- `psql`
- local `Node + pg` wrapper if `psql` is unavailable

## SQL Script
Replace `seu@email.com` with the target account email.

```sql
-- 0. Confirm the target user
SELECT id, email FROM users WHERE email = 'seu@email.com';

-- ============================================================
-- PASS 1: inspect + ROLLBACK
-- ============================================================
BEGIN;

-- BEFORE
SELECT 'bills_invoice'     AS tabela, COUNT(*) FROM bills
  WHERE user_id = (SELECT id FROM users WHERE email = 'seu@email.com')
    AND bill_type = 'credit_card_invoice'
UNION ALL
SELECT 'credit_cards',               COUNT(*) FROM credit_cards
  WHERE user_id = (SELECT id FROM users WHERE email = 'seu@email.com')
UNION ALL
SELECT 'salary_profiles',            COUNT(*) FROM salary_profiles
  WHERE user_id = (SELECT id FROM users WHERE email = 'seu@email.com')
UNION ALL
SELECT 'income_statements',          COUNT(*) FROM income_statements
  WHERE income_source_id IN (
    SELECT id FROM income_sources
    WHERE user_id = (SELECT id FROM users WHERE email = 'seu@email.com')
  )
UNION ALL
SELECT 'income_sources',             COUNT(*) FROM income_sources
  WHERE user_id = (SELECT id FROM users WHERE email = 'seu@email.com');

-- DELETES
WITH u AS (SELECT id FROM users WHERE email = 'seu@email.com')
DELETE FROM bills
  WHERE user_id IN (SELECT id FROM u) AND bill_type = 'credit_card_invoice';

WITH u AS (SELECT id FROM users WHERE email = 'seu@email.com')
DELETE FROM credit_cards
  WHERE user_id IN (SELECT id FROM u);

WITH u AS (SELECT id FROM users WHERE email = 'seu@email.com')
DELETE FROM salary_profiles
  WHERE user_id IN (SELECT id FROM u);

WITH u AS (SELECT id FROM users WHERE email = 'seu@email.com')
DELETE FROM income_statements
  WHERE income_source_id IN (
    SELECT id FROM income_sources WHERE user_id IN (SELECT id FROM u)
  );

WITH u AS (SELECT id FROM users WHERE email = 'seu@email.com')
DELETE FROM income_sources
  WHERE user_id IN (SELECT id FROM u);

-- AFTER (must return zeroes on every line)
SELECT 'bills_invoice'     AS tabela, COUNT(*) FROM bills
  WHERE user_id = (SELECT id FROM users WHERE email = 'seu@email.com')
    AND bill_type = 'credit_card_invoice'
UNION ALL
SELECT 'credit_cards',               COUNT(*) FROM credit_cards
  WHERE user_id = (SELECT id FROM users WHERE email = 'seu@email.com')
UNION ALL
SELECT 'salary_profiles',            COUNT(*) FROM salary_profiles
  WHERE user_id = (SELECT id FROM users WHERE email = 'seu@email.com')
UNION ALL
SELECT 'income_statements',          COUNT(*) FROM income_statements
  WHERE income_source_id IN (
    SELECT id FROM income_sources
    WHERE user_id = (SELECT id FROM users WHERE email = 'seu@email.com')
  )
UNION ALL
SELECT 'income_sources',             COUNT(*) FROM income_sources
  WHERE user_id = (SELECT id FROM users WHERE email = 'seu@email.com');

ROLLBACK;

-- ============================================================
-- PASS 2: replace ROLLBACK with COMMIT and run again
-- ============================================================
```

## Optional Node + pg Wrapper
If `psql` is not available locally, run the SQL from `apps/api` using the existing `pg` dependency.

Required environment variables:
- `DATABASE_URL`
- `TARGET_EMAIL`

Recommended workflow:
1. Run the wrapper with `ROLLBACK`.
2. Check the `AFTER` table counts.
3. Change the final transaction command to `COMMIT`.
4. Run the wrapper again.

## Approval Criteria
The reset is approved only if the `AFTER` result shows:
- `bills_invoice = 0`
- `credit_cards = 0`
- `salary_profiles = 0`
- `income_statements = 0`
- `income_sources = 0`

## Post-Reset UI Validation
For the target account, confirm visually:
- no active credit card
- no INSS benefit / salary profile state
- no income source state
- onboarding returns to the initial empty-state flow

## Notes
- This is an operational workaround, not a product feature.
- If user reset becomes recurring support work, move it into a safer audited admin workflow instead of running manual SQL repeatedly.
