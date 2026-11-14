# 清远社区共享地图

一个面向清远本地生活的**社区共建地图**：居民可以提交身边的好去处，系统自动核验地址，其他人可以在地图上发现、收藏、点赞，也可以用自然语言问 AI「附近有什么好玩的」。

- 在线地址：https://qymap.pages.dev
- 管理后台：https://qymap.pages.dev/admin.html

---

## 功能特性

### 浏览与发现
- **地图浏览**：高德地图展示全部点位，分类筛选、点击定位、一键导航
- **后端真分页**：列表按页取数据，翻页不卡顿
- **后端搜索**：关键词由 SQL 匹配名称与简介，输入有 250ms 防抖
- **分类筛选**：景点 / 美食 / 商圈 / 医疗 / 车站 / 学校，筛选交由后端完成

### 提交与核验
- **提交点位**：填写名称、地址、简介，支持地图选点与配图（JPG / PNG / WebP，≤2MB）
- **高德自动核验**：名称命中高德 POI 即**自动上线**，无需人工审核；坐标由高德结果自动校正，用户不必精确点选
- **重复拦截**：同名同分类、或坐标距离小于 0.001 度会被判为重复提交

### 互动
- **点赞 / 举报**：登录用户按账号记录，网页端与 App 状态一致
- **私人地图收藏**：把喜欢的点位收进自己的地图
- **我的提交**：查看自己提交的点位及其审核状态

### AI 智能推荐
- 用自然语言提问（如「周末带孩子去哪玩」），返回中文推荐文案并**在地图上高亮对应点位**
- 接入智谱 `glm-4.7-flash`，主模型限流时自动降级到备用模型，25 秒超时保护

### 管理后台
- 待审核点位通过 / 拒绝 / 删除
- 点位管理：按名称搜索、按状态筛选、删除违规内容（级联清理点赞 / 举报 / 收藏）
- 举报处理
- **高德接口自检**：一键查看高德 REST 调用状态（不暴露 Key）

### 多端同步与离线能力
| 能力 | 说明 |
| --- | --- |
| 增量同步 | `GET /api/spots?since=<时间>` 只返回该时间点之后新增或变更的点位 |
| 离线提交幂等 | 请求体带 `client_token`，同一条提交重复发送只写入一次 |
| 离线提交队列 | 断网提交先入队，联网或下次启动自动重发 |
| 离线缓存兜底 | 列表与地图数据缓存到本地，断网时展示缓存而非空白 |
| 新点位提示 | 定时增量轮询，发现新点位提示刷新，不打断当前浏览 |

---

## 技术架构

```
┌──────────────┐   ┌─────────────────┐   ┌──────────────┐
│   网页端      │   │  HarmonyOS App  │   │   管理后台    │
│ 原生 HTML/JS │   │   （规划中）     │   │  admin.html  │
└──────┬───────┘   └────────┬────────┘   └──────┬───────┘
       └────────────────────┼───────────────────┘
                            │ HTTPS / JSON
              ┌─────────────▼──────────────┐
              │ Cloudflare Pages Functions │
              ├────────────────────────────┤
              │ D1（SQLite） 点位 / 用户    │
              │ R2           图片存储       │
              │ 高德 REST    地址核验       │
              │ 智谱 API     AI 推荐        │
              └────────────────────────────┘
```

| 层 | 技术 |
| --- | --- |
| 前端 | 原生 HTML / CSS / JavaScript，高德地图 JS API |
| 后端 | Cloudflare Pages Functions（无框架，原生 `Request` / `Response`） |
| 数据库 | Cloudflare D1（SQLite） |
| 图片 | Cloudflare R2 |
| 地址核验 | 高德 Web 服务 REST（逆地理编码 + 关键词检索） |
| AI | 智谱 `glm-4.7-flash`（OpenAI 兼容格式） |
| 部署 | Wrangler CLI |

---

## 本地运行与部署

### 1. 安装依赖

```bash
npm install
```

### 2. 配置密钥（全部存为 Pages secrets，不写入代码）

```bash
npx wrangler pages secret put ADMIN_TOKEN    # 管理后台口令
npx wrangler pages secret put AMAP_WEB_KEY   # 高德「Web服务」类型 Key（非 Web端/JS）
npx wrangler pages secret put AI_API_URL     # AI 接口地址（可选）
npx wrangler pages secret put AI_API_KEY     # AI 接口密钥（可选）
npx wrangler pages secret put AI_MODEL       # 模型名（可选，默认 glm-4.7-flash）
```

> ⚠️ 高德 Key 必须选 **Web服务** 类型。「Web端（JS API）」类型无法调用 REST 接口，会导致自动核验永远失败。

### 3. 初始化数据库

```bash
npx wrangler d1 execute qingyuan-community-map --remote --file=worker/schema.sql
```

按 `worker/` 下的迁移脚本顺序依次执行（auth → owner → moderation → quotas → category-school …），根目录另有 `migration-sync.sql`（增量同步与离线幂等所需字段）。

### 4. 部署

```bash
npx wrangler pages deploy . --project-name qymap --branch main
```

---

## API 接口

基础路径：`https://qymap.pages.dev/api`

### 点位

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/spots?page=&limit=&category=&q=&since=&fields=` | 点位列表，返回 `data` 与 `total`；`fields=map` 只返回坐标等轻量字段 |
| POST | `/spots` | 提交点位（需登录 + `X-Owner-Token`），支持 `client_token` 幂等 |
| DELETE | `/spots/:id` | 删除自己提交的点位 |
| POST | `/spots/:id/like` | 点赞（登录时按账号记录） |
| POST | `/spots/:id/report` | 举报 |
| GET | `/my-spots` | 我提交的点位 |

### 用户

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/auth/register` `/auth/login` `/auth/logout` | 注册 / 登录 / 退出 |
| GET | `/auth/me` | 当前用户 |

### 其他

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/uploads` | 图片上传（二进制，返回 URL） |
| GET | `/images/:key` | 读取图片 |
| GET / POST | `/maps`、`/maps/:id/spots` | 私人地图收藏 |
| POST | `/recommend` | AI 智能推荐 |
| GET / PATCH | `/admin/spots`、`/admin/spots/:id/status` | 管理：待审核列表、审核 |
| GET | `/admin/spots/all?status=&q=` | 管理：任意状态点位列表 |
| DELETE | `/admin/spots/:id` | 管理：删除点位（级联清理） |
| GET | `/admin/amap-check` | 管理：高德接口自检 |

管理类接口需请求头 `Authorization: Bearer <ADMIN_TOKEN>`。

---

## 项目结构

```
.
├── index.html          前端主页
├── app.js              前端逻辑（地图、列表、提交、同步）
├── admin.html          管理后台页面
├── admin.js            管理后台逻辑
├── style.css           样式
├── functions/          Cloudflare Pages Functions
│   ├── api/[[path]].js 路由入口
│   └── _lib/api.js     全部接口实现
├── worker/             数据库 schema 与迁移脚本
├── *_*.sql             根目录迁移脚本（设施导入、清理、同步）
├── wrangler.toml       Cloudflare 配置
└── *.md                项目文档
```

---

## 安全说明

- 所有密钥（高德 Key、AI 密钥、管理员口令）均以 **Pages secrets** 形式存放，代码中只以 `env.XXX` 引用，不入库
- 用户密码使用 **PBKDF2 + 随机盐** 哈希存储，不存明文
- `index.html` 中的高德 **Web端 JS Key** 是前端必需的公开值，**请在高德控制台为其配置 referer 域名白名单与每日配额上限**，避免被他人盗用产生费用

---

## 文档

| 文档 | 内容 |
| --- | --- |
| `清远社区共享地图项目 · 完整实施规划文档.md` | 需求、功能清单、实现记录、历史问题与排查结论 |
| `鸿蒙期末项目可行性评估.md` | 将本项目改造为 HarmonyOS（DevEco Studio）应用的可行性评估与完整任务清单 |

---

## 待办

- AI 推荐体验优化：热门问题缓存、限流时的排队重试提示
- HarmonyOS 客户端开发（参见可行性评估文档中的分阶段任务清单）
