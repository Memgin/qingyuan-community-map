-- 大众点评与评分（2026-11-02）：每个地点可被登录用户点评（1-5 星 + 文字），
-- 点评可选匿名：匿名点评在任何公开接口都不返回 user_id / 昵称 / 头像，无法反查作者；
-- 非匿名点评展示用户昵称与头像，可跳转到用户公开主页。
-- users 表补充昵称与头像字段，用于个人资料展示。
-- 执行：npx wrangler d1 execute qingyuan-community-map --remote --file=migration-reviews.sql
-- 注意：下面两条 ALTER 语句 SQLite 不支持 IF NOT EXISTS，重复执行会报 duplicate column，
--       报该错误说明列已存在，忽略即可。

CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spot_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  content TEXT NOT NULL,
  anonymous INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT,
  UNIQUE (spot_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_spot ON reviews(spot_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);

ALTER TABLE users ADD COLUMN nickname TEXT;
ALTER TABLE users ADD COLUMN avatar_url TEXT;
