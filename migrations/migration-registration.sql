-- 注册防护（2026-10-25）：IP 注册频控（配合 Turnstile 双保险）
-- 执行：npx wrangler d1 execute qingyuan-community-map --remote --file=migration-registration.sql

CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  has_token INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_registrations_ip ON registrations(ip, created_at);
