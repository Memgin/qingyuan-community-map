-- 导航点击统计（2026-11-08）：统计用户点击「导航」跳转高德的次数，
-- 与点赞、点评一起构成综合热度（likes + reviews×2 + nav×2），热度高的地点靠前显示。
-- 执行：npx wrangler d1 execute qingyuan-community-map --remote --file=migration-nav-stats.sql
-- 注意：SQLite 不支持 IF NOT EXISTS，重复执行报 duplicate column 可忽略。
ALTER TABLE spots ADD COLUMN nav_count INTEGER NOT NULL DEFAULT 0;
