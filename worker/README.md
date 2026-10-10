# 清远社区共享地图 Worker

## 初始化

```powershell
cd worker
wrangler d1 create qingyuan-community-map
```

把命令返回的 database_id 写入 `wrangler.toml`，然后初始化表：

```powershell
wrangler d1 execute qingyuan-community-map --remote --file=schema.sql
wrangler d1 execute qingyuan-community-map --remote --file=migration-owner.sql
wrangler secret put ADMIN_TOKEN
wrangler secret put AMAP_WEB_KEY
wrangler deploy
```

## API

- `GET /api/spots?q=关键词&category=food&page=1&limit=20`：公开审核通过点位
- `POST /api/spots`：提交地点，默认 `pending`
- 提交时 Worker 会使用 `AMAP_WEB_KEY` 调用高德 Web 服务复核名称、地址和坐标；完全匹配且误差不超过 300 米时自动通过，否则进入人工审核。
- `POST /api/spots/:id/like`：给已审核地点点赞
- `GET /api/my-spots`：查看当前浏览器提交的地点
- `DELETE /api/spots/:id`：删除当前登录用户自己提交的地点
- `GET /api/admin/spots`：查看待审核地点，需要 `Authorization: Bearer ADMIN_TOKEN`
- `PATCH /api/admin/spots/:id/status`：状态为 `approved`、`rejected` 或 `pending`
- `POST /api/recommend`：AI 推荐代理，需要配置 `AI_API_URL` 和 `AI_API_KEY`
- `POST /api/uploads`：登录用户上传图片到 R2，返回图片 URL

项目图片配额为全项目累计硬上限，不按月重置：R2 存储累计最多 10 GB，Class A 最多 1,000,000 次，Class B 最多 10,000,000 次。所有用户共享这三个额度，任一额度达到上限后对应请求返回 HTTP 429。

生产环境请把 `ALLOWED_ORIGIN` 改成 Pages 的实际域名，并在高德控制台配置域名白名单。
