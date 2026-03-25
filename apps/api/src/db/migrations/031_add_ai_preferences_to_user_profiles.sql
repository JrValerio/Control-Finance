-- Sprint B: Copilot preferences — ai_tone and ai_insight_frequency
-- Two separate ALTER TABLE statements for pg-mem compatibility (no multi-column ADD COLUMN).

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS ai_tone TEXT NOT NULL DEFAULT 'pragmatic';

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS ai_insight_frequency TEXT NOT NULL DEFAULT 'always';
