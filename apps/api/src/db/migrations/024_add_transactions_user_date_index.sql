-- Partial index optimised for the default list query: WHERE deleted_at IS NULL
-- ordered by (user_id, date DESC, id DESC).  Postgres can also use this index
-- in forward direction for ascending sorts, so it supersedes the ASC variant
-- from migration 007 for the active-only path.

CREATE INDEX IF NOT EXISTS idx_transactions_user_date_desc_active
  ON transactions (user_id, date DESC, id DESC)
  WHERE deleted_at IS NULL;
