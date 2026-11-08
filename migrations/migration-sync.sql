-- 多端同步支持（2026-10-10）：增量同步字段 + 离线提交幂等
-- 执行：npx wrangler d1 execute qingyuan-community-map --remote --file=migration-sync.sql

-- 1) updated_at：记录点位最后变更时间（审核通过、删除前状态变更都会更新），供 /api/spots?since= 增量同步使用
ALTER TABLE spots ADD COLUMN updated_at TEXT;
UPDATE spots SET updated_at = created_at WHERE updated_at IS NULL;

-- 2) client_token：客户端（含鸿蒙 App 离线队列）生成的提交唯一标识，保证同一条提交重复发送只写入一次
ALTER TABLE spots ADD COLUMN client_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_spots_client_token ON spots(client_token) WHERE client_token IS NOT NULL;
