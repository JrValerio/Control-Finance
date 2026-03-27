ALTER TABLE salary_profiles
ADD COLUMN IF NOT EXISTS active_statement_reference_month CHAR(7);

ALTER TABLE salary_profiles
ADD COLUMN IF NOT EXISTS active_statement_payment_date DATE;
