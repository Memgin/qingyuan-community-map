CREATE TABLE IF NOT EXISTS spot_likes (
  spot_id INTEGER NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  actor_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (spot_id, actor_key)
);
CREATE TABLE IF NOT EXISTS spot_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spot_id INTEGER NOT NULL REFERENCES spots(id) ON DELETE CASCADE,
  reporter_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'dismissed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_spot_reports_status ON spot_reports(status);
CREATE INDEX IF NOT EXISTS idx_spot_reports_spot_id ON spot_reports(spot_id);
