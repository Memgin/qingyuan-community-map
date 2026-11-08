-- 迁移：新增通用限流计数表
-- 背景：AI 推荐 / 点位提交 / 密码重置申请 / 高德代理等接口此前没有任何频率限制，
--      匿名即可循环调用，存在刷爆模型账单与高德日配额的风险。
-- 说明：表缺失时 consumeRateLimit 会降级放行，不影响主流程，但限流会失效，
--      因此部署后请务必执行本文件。
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window ON rate_limits(window_start);
