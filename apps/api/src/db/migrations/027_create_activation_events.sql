CREATE TABLE IF NOT EXISTS activation_events (
  id         SERIAL        PRIMARY KEY,
  user_id    INTEGER       NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event      VARCHAR(100)  NOT NULL,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activation_events_user_id
  ON activation_events(user_id);

CREATE INDEX IF NOT EXISTS idx_activation_events_event
  ON activation_events(event);
