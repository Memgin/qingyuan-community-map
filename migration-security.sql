-- 登录安全加固（2026-10-25）：暴力破解防护
-- 执行：npx wrangler d1 execute qingyuan-community-map --remote --file=migration-security.sql

-- 登录失败计数：同一用户名 15 分钟内失败 5 次临时锁定
CREATE TABLE IF NOT EXISTS login_attempts (
  username TEXT PRIMARY KEY,
  failed_count INTEGER DEFAULT 0,
  locked_until TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
