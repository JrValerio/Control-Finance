ALTER TABLE tax_summaries
ADD COLUMN IF NOT EXISTS facts_json JSONB NOT NULL DEFAULT '[]'::jsonb;
