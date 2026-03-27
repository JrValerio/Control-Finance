ALTER TABLE credit_card_purchases
  ADD COLUMN IF NOT EXISTS installment_group_id TEXT;

ALTER TABLE credit_card_purchases
  ADD COLUMN IF NOT EXISTS installment_number INTEGER
  CHECK (installment_number IS NULL OR installment_number >= 1);

ALTER TABLE credit_card_purchases
  ADD COLUMN IF NOT EXISTS installment_count INTEGER
  CHECK (
    installment_count IS NULL
    OR (installment_count >= 2 AND installment_count <= 24)
  );

CREATE INDEX IF NOT EXISTS idx_credit_card_purchases_installment_group
  ON credit_card_purchases (user_id, installment_group_id);
