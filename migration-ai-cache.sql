-- AI 推荐结果缓存（2026-11-03）：相同需求 + 相近视野的推荐 24 小时内直接复用，
-- 不再调用模型，也不计入用户限流额度——热门问题零配额消耗。
-- 缓存键 = 净化后的需求文本 + 视野中心（约 1km 精度）；spot_ids 随结果一并缓存。
-- 执行：npx wrangler d1 execute qingyuan-community-map --remote --file=migration-ai-cache.sql
CREATE TABLE IF NOT EXISTS ai_cache (
  cache_key TEXT PRIMARY KEY,
  recommendation TEXT NOT NULL,
  spot_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
