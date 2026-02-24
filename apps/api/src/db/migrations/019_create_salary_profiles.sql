CREATE TABLE salary_profiles (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gross_salary NUMERIC(12,2)  NOT NULL CHECK (gross_salary > 0),
  dependents   SMALLINT       NOT NULL DEFAULT 0 CHECK (dependents >= 0),
  payment_day  SMALLINT       NOT NULL DEFAULT 5 CHECK (payment_day BETWEEN 1 AND 31),
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (user_id)
);

CREATE INDEX idx_salary_profiles_user ON salary_profiles(user_id);
