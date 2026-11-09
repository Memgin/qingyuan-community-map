-- 点位子标签（2026-11-09）：在六大分类下再细分自定义标签（如美食类：早茶/烧烤/火锅），
-- 存 JSON 数组字符串，最多 5 个、每个 ≤10 字；所有分类通用，标签集合由用户自定义。
-- 执行：npx wrangler d1 execute qingyuan-community-map --remote --file=migration-spots-tags.sql
-- 注意：SQLite 不支持 IF NOT EXISTS，重复执行报 duplicate column 可忽略。
ALTER TABLE spots ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
