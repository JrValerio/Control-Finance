CREATE TABLE IF NOT EXISTS paywall_events (
  id         SERIAL       PRIMARY KEY,
  user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature    VARCHAR(50)  NOT NULL,
  action     VARCHAR(50)  NOT NULL,
  context    VARCHAR(50)  NOT NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_paywall_events_user_id
  ON paywall_events(user_id);

CREATE INDEX IF NOT EXISTS idx_paywall_events_feature_action
  ON paywall_events(feature, action);
