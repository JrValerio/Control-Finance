ALTER TABLE user_profiles
ADD COLUMN IF NOT EXISTS bank_limit_total NUMERIC(12, 2);

ALTER TABLE user_profiles
ADD CONSTRAINT chk_user_profiles_bank_limit_total
CHECK (bank_limit_total IS NULL OR bank_limit_total >= 0);
