-- 审核结果推送支持（2026-10-25）：设备推送令牌
-- 执行：npx wrangler d1 execute qingyuan-community-map --remote --file=migration-push.sql

-- 设备推送令牌：一个账号可有多个设备（手机 + 平板），按 (user_id, platform, token) 唯一
CREATE TABLE IF NOT EXISTS push_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  platform TEXT NOT NULL DEFAULT 'harmony',
  token TEXT NOT NULL,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_tokens_user_platform ON push_tokens(user_id, platform, token);
