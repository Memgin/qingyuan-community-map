-- 点位照片墙（2026-10-25）：社区成员可为任意点位补充照片，每张记录上传者
-- 执行：npx wrangler d1 execute qingyuan-community-map --remote --file=migration-photos.sql

CREATE TABLE IF NOT EXISTS spot_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  spot_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_spot_photos_spot ON spot_photos(spot_id);
