-- 私人地图只读分享：为 private_maps 增加分享令牌列
-- 执行方式（线上）：npx wrangler d1 execute qingyuan-community-map --remote --file=worker/migration-share.sql
ALTER TABLE private_maps ADD COLUMN share_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_private_maps_share_token ON private_maps(share_token);
