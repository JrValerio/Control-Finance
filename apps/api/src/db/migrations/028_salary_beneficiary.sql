-- Add profile_type and birth_year to salary_profiles
ALTER TABLE salary_profiles
  ADD COLUMN profile_type VARCHAR(20) NOT NULL DEFAULT 'clt';

ALTER TABLE salary_profiles
  ADD COLUMN birth_year SMALLINT;

-- Consignações descontadas diretamente no benefício INSS
-- (empréstimos consignados, cartão consignado, outros)
CREATE TABLE salary_consignacoes (
  id                SERIAL PRIMARY KEY,
  salary_profile_id INTEGER        NOT NULL REFERENCES salary_profiles(id) ON DELETE CASCADE,
  description       VARCHAR(100)   NOT NULL,
  amount            NUMERIC(12,2)  NOT NULL CHECK (amount > 0),
  consignacao_type  VARCHAR(20)    NOT NULL,
  created_at        TIMESTAMPTZ    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salary_consignacoes_profile
  ON salary_consignacoes (salary_profile_id);
