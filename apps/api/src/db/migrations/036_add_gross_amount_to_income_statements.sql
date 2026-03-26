-- Follow-up B: add gross_amount and details_json to income_statements.
-- gross_amount is a first-class column (like net_amount) because it is
-- core financial data used for projection and IRPF — not a subtype detail.
-- details_json stores subtype-specific fields (INSS benefit_kind, CLT payroll
-- items, etc.) without requiring schema changes per subtype.
-- Both columns are nullable; existing drafts stay unaffected.

ALTER TABLE income_statements
  ADD COLUMN IF NOT EXISTS gross_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS details_json JSONB;
