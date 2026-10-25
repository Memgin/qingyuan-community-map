-- 位置纠偏：登录用户对点位坐标的修正建议，管理员确认后生效
CREATE TABLE IF NOT EXISTS spot_corrections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spot_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_corrections_spot_user ON spot_corrections(spot_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_corrections_pending ON spot_corrections(status, id);
