-- 找回密码流程（2026-10-25）：申请-审批-临时密码-强制改密
-- 执行：npx wrangler d1 execute qingyuan-community-map --remote --file=migration-pwd-flow.sql

-- 强制改密标志：管理员重置后置 1，用户改密后清 0
ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0;

-- 密码重置申请：未登录用户提交，管理员审批后重置为固定临时密码
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL,
  note TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_pwd_reset_status ON password_reset_requests(status, created_at);
