ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS taxpayer_cpf VARCHAR(11);
