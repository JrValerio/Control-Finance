CREATE TABLE income_sources (
  id               SERIAL PRIMARY KEY,
  user_id          INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  category_id      INT REFERENCES categories(id) ON DELETE SET NULL,
  default_day      SMALLINT CHECK (default_day BETWEEN 1 AND 31),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_income_sources_user_id ON income_sources(user_id);

CREATE TABLE income_deductions (
  id               SERIAL PRIMARY KEY,
  income_source_id INT NOT NULL REFERENCES income_sources(id) ON DELETE CASCADE,
  label            TEXT NOT NULL,
  amount           NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  is_variable      BOOLEAN NOT NULL DEFAULT FALSE,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order       SMALLINT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_income_deductions_source ON income_deductions(income_source_id);

CREATE TABLE income_statements (
  id                     SERIAL PRIMARY KEY,
  income_source_id       INT NOT NULL REFERENCES income_sources(id) ON DELETE CASCADE,
  reference_month        CHAR(7) NOT NULL,
  net_amount             NUMERIC(12,2) NOT NULL CHECK (net_amount > 0),
  total_deductions       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_deductions >= 0),
  payment_date           DATE,
  status                 TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted')),
  posted_transaction_id  INT REFERENCES transactions(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX uidx_income_statements_source_month
  ON income_statements(income_source_id, reference_month);

CREATE INDEX idx_income_statements_source ON income_statements(income_source_id);

CREATE TABLE income_statement_deductions (
  id           SERIAL PRIMARY KEY,
  statement_id INT NOT NULL REFERENCES income_statements(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  amount       NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  is_variable  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX idx_income_stmt_deductions ON income_statement_deductions(statement_id);
