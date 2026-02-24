-- Add salary_annual feature flag to billing plans.
-- free  → false (monthly breakdown free, annual projection is Pro)
-- pro   → true  (full access)
-- Replace the full features JSON to avoid JSONB || operator (pg-mem compat).

UPDATE plans
  SET features = '{"csv_import":false,"csv_export":false,"analytics_months_max":3,"budget_tracking":true,"salary_annual":false}'
  WHERE name = 'free';

UPDATE plans
  SET features = '{"csv_import":true,"csv_export":true,"analytics_months_max":24,"budget_tracking":true,"salary_annual":true}'
  WHERE name = 'pro';
