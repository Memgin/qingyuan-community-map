-- 私人地图回收站：软删除用。删除的地图保留 30 天内可恢复
-- 执行方式（线上）：npx wrangler d1 execute qingyuan-community-map --remote --file=worker/migration-trash.sql
ALTER TABLE private_maps ADD COLUMN deleted_at DATETIME;
CREATE INDEX IF NOT EXISTS idx_private_maps_deleted_at ON private_maps(deleted_at);
