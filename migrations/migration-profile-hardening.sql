-- 个人资料链路加固迁移（2026-11）
-- 配合 functions/_lib/api.js 中 updateProfile 的昵称修改留痕功能。
-- 未执行迁移时主流程不受影响：INSERT 失败会被 .catch(() => null) 静默跳过。

-- 昵称修改记录：旧值 / 新值 / 修改时间。
-- 昵称即时生效并同步到历史点评，出现冒充或违规改名时管理员可据此追溯
CREATE TABLE IF NOT EXISTS profile_name_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  field TEXT NOT NULL DEFAULT 'nickname',
  old_value TEXT,
  new_value TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_profile_name_history_user_id ON profile_name_history(user_id);

-- 说明：昵称唯一性目前由应用层检查（updateProfile 内查重后返回 409），
-- 未直接建 UNIQUE 索引——存量数据可能已有重复昵称，建索引会导致迁移失败。
-- 确认存量昵称无重复后，可手动执行：
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_users_nickname_unique ON users(nickname) WHERE nickname IS NOT NULL;
