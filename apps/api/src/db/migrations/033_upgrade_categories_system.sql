-- Make user_id nullable so system (shared) categories have NULL user_id
ALTER TABLE categories ALTER COLUMN user_id DROP NOT NULL;

-- Add type column: 'income' | 'expense' (NULL = uncategorized / user decides)
ALTER TABLE categories
ADD COLUMN IF NOT EXISTS type TEXT;

-- Add system flag: TRUE for seed categories shipped with the platform
ALTER TABLE categories
ADD COLUMN IF NOT EXISTS system BOOLEAN NOT NULL DEFAULT FALSE;

-- Add partial unique index for system categories (user_id IS NULL)
-- The existing idx_categories_user_normalized_active_unique handles user rows fine
-- because NULL != NULL in Postgres indexes (so system rows don't conflict with it).
-- We need a separate index to prevent duplicate system category names.
CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_system_normalized_unique
  ON categories (normalized_name)
  WHERE user_id IS NULL AND deleted_at IS NULL;

-- System categories — income
INSERT INTO categories (user_id, name, normalized_name, type, system) VALUES
  (NULL, 'Salário CLT',       'salario clt',       'income',  TRUE),
  (NULL, 'Benefício INSS',    'beneficio inss',     'income',  TRUE),
  (NULL, 'Freelancer',        'freelancer',         'income',  TRUE),
  (NULL, '13º Salário',       '13o salario',        'income',  TRUE),
  (NULL, 'Reembolso',         'reembolso',          'income',  TRUE);

-- System categories — expense
INSERT INTO categories (user_id, name, normalized_name, type, system) VALUES
  (NULL, 'Moradia',           'moradia',            'expense', TRUE),
  (NULL, 'Energia',           'energia',            'expense', TRUE),
  (NULL, 'Água',              'agua',               'expense', TRUE),
  (NULL, 'Gás',               'gas',                'expense', TRUE),
  (NULL, 'Internet',          'internet',           'expense', TRUE),
  (NULL, 'Mercado',           'mercado',            'expense', TRUE),
  (NULL, 'Farmácia',          'farmacia',           'expense', TRUE),
  (NULL, 'Transporte',        'transporte',         'expense', TRUE),
  (NULL, 'Saúde',             'saude',              'expense', TRUE),
  (NULL, 'Educação',          'educacao',           'expense', TRUE),
  (NULL, 'Empréstimos',       'emprestimos',        'expense', TRUE),
  (NULL, 'Lazer',             'lazer',              'expense', TRUE);
