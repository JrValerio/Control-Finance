ALTER TABLE bills
  ADD COLUMN IF NOT EXISTS linked_transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS match_status          TEXT NOT NULL DEFAULT 'unmatched'
                                                 CHECK (match_status IN ('unmatched', 'matched')),
  ADD COLUMN IF NOT EXISTS matched_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS match_confidence      NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS match_metadata        JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Prevent the same transaction from being linked to more than one bill
CREATE UNIQUE INDEX IF NOT EXISTS idx_bills_unique_linked_transaction
  ON bills (linked_transaction_id)
  WHERE linked_transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bills_match_status ON bills (match_status);
