-- 私人地图多人协作：地图主人可按用户名添加协作者，协作者可编辑点位
-- 执行方式（线上）：npx wrangler d1 execute qingyuan-community-map --remote --file=worker/migration-collab.sql
CREATE TABLE IF NOT EXISTS private_map_collaborators (
  map_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (map_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_private_map_collaborators_user ON private_map_collaborators(user_id);
