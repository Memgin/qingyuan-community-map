# 清远社区共享地图

一个面向清远本地生活的**社区共建地图**：居民可以提交身边的好去处，系统自动核验地址，其他人可以在地图上发现、收藏、点赞，也可以用自然语言问 AI「附近有什么好玩的」。

- 在线地址：https://qymap.pages.dev
- 管理后台：https://qymap.pages.dev/admin.html

---

## 功能特性

### 浏览与发现
- **地图浏览**：高德地图展示全部点位，分类筛选、点击定位、一键导航
- **热门地点榜**：主页列表按**综合热度**排序（点赞×1 + 点评×2 + 导航×2），卡片显示 🔥 热度分；封面图缺失时用分类色渐变占位
- **最近加入页**：`recent.html` 按时间倒序展示全部点位，带分类筛选与评分入口
- **全部地点页**：`all.html` 网格展示所有点位，支持分类筛选，点击卡片跳回地图自动定位
- **后端真分页**：列表按页取数据，翻页不卡顿
- **后端搜索**：关键词由 SQL 匹配名称与简介，输入有 250ms 防抖
- **分类筛选**：景点 / 美食 / 商圈 / 医疗 / 校园 / 交通，筛选交由后端完成
- **详情就地面板**：点击详情不再弹窗，左侧 hero 区域就地切换为详情页（评分、点评、发表表单），**右侧地图保留**定位显示，对应图钉高亮区分
- **导航点击统计**：跳转高德前 `sendBeacon` 上报（不阻塞跳转），导航次数计入综合热度，导航多的地点更靠前

### 提交与核验
- **提交点位**：填写名称、地址、简介，支持地图选点与**多图上传**（最多 10 张、总共 20MB；第一张作封面，其余进照片墙）
- **高德自动核验**：名称命中高德 POI 即**自动上线**，无需人工审核；坐标由高德结果自动校正，用户不必精确点选
- **重复拦截**：同名同分类、或坐标距离小于 0.001 度会被判为重复提交

### 互动
- **点赞 / 举报**：登录用户按账号记录，网页端与 App 状态一致
- **私人地图收藏**：把喜欢的点位收进自己的地图
- **我的提交**：查看自己提交的点位及其审核状态
- **位置纠偏**：发现点位坐标偏了？登录后在地图弹窗点「位置纠偏」，把蓝色标记拖到正确位置提交，管理员确认后全端生效
- **社区照片墙**：图钉弹窗内展示社区成员补充的照片，任何登录用户可「补图」

### 大众点评与评分
- **评分展示**：列表卡片、地图弹窗、全部地点页均显示星级 + 均分 + 点评条数（列表接口子查询聚合，无二次请求）
- **地点详情弹窗**：封面图 + 评分摘要 + 全部点评列表 + 发表/修改点评
- **一人一店一条**：再次提交即修改原点评，可随时切换匿名 / 实名；作者本人可删除
- **匿名点评**：显示「匿名用户」+ 模糊头像；后端对该条记录**不返回任何作者字段**（无 user_id / 昵称 / 头像），无法反查账号
- **实名点评**：展示昵称 + 头像，点击头像进入该用户公开主页（只聚合非匿名点评）
- **个人资料**：顶栏「⚙ 我的资料」设置昵称（2-24 字）与头像（≤2MB，复用上传接口），实名点评同步展示
- **写入限流**：每账号每小时 20 条

### 账号与安全
- **注册 / 登录**：用户名 + 密码，PBKDF2 加盐哈希存储；注册在独立页 `register.html` 完成，需通过 Turnstile 人机验证（其脚本注入的 CSP 会干扰地图渲染，故与主页隔离）；App 原生注册走免验证限额（同 IP 每天 1 个）
- **密码策略**：仅注册和设置新密码时校验（8 位以上含字母数字），登录只做比对，不追溯旧密码
- **找回密码全流程**（全自动闭环）：
  1. 用户提交重置申请（防用户名枚举：无论账号是否存在返回相同文案）
  2. 管理员后台审批 → 密码重置为 `12345` 并**踢掉该用户所有登录会话**
  3. Push Kit 推送临时密码到用户手机（App 未打开也能收到）
  4. 用户用临时密码登录 → **强制弹出改密窗**，未改密前所有写操作（点赞/提交/收藏等）一律 403 拦截
  5. 设置新密码后立即恢复全部功能
- **设备送达预检（防账号接管）**：临时密码是公开值，因此审批时先检查账号是否有绑定的推送设备——没有则拒绝自动重置，转人工核验；确保密码永远只回到失主本人登录过的设备上

### 消息推送
- **华为 Push Kit**：审核结果（通过/驳回）、密码重置通知实时推送到用户所有设备
- 设备在登录时上报 Push Token（`POST /api/push-token`），退出登录时自动注销

### AI 智能推荐
- 用自然语言提问（如「周末带孩子去哪玩」），返回中文推荐文案并**在地图上高亮对应点位**
- 向导区下方内嵌**路线小地图**：推荐点位按最近邻贪心排序，蓝色虚线连成游览路线 + 序号标记（后续路线编辑的载体）
- **季节推荐**：按当前月份把应季主题（春赏花 / 夏避暑 / 秋登高 / 冬食补）排最前并高亮，一键触发推荐
- **结果缓存**：相同需求 + 相近视野（约 1km 精度）24 小时内直接复用缓存结果，不调模型、不计限流额度——热门问题零配额消耗
- 接入智谱 `glm-4.7-flash`，主模型限流时自动降级到备用模型，25 秒超时保护

### 管理后台
标签页布局，六个板块，密钥在会话内自动记忆：
- **① 待审核点位**：通过 / 拒绝
- **② 全部点位**：表格化布局，按名称/地址搜索、**彩色圆点分类筛选**、状态筛选、**行内修改分类**（选择即保存并触发增量同步）、删除违规内容（级联清理点评 / 点赞 / 举报 / 收藏）
- **③ 举报处理**
- **④ 账号与密码**：密码重置申请审批（一键同意并推送临时密码；无法安全送达的可删除转人工）、手动重置密码
- **⑤ 位置纠偏**：审批用户提交的坐标修正（新旧坐标对照，同意即移动点位）
- **⑥ 诊断工具**：高德接口自检（不暴露 Key）

### 界面
- **液态玻璃**：顶栏接入 [simple-liquid-glass](https://github.com/lucaperullo/simple-liquid-glass)（CDN 锁定 5.6.0，Web Component 纯视觉层，`pointer-events: none` 不拦截交互，CDN 失败自动降级为半透明底色）
- **地点卡片**：封面锚点（无图用分类色渐变占位）+ 评分元信息行 + 聚合互动行；次要操作（收藏/补图/编辑/举报/删除）收进「⋯」菜单

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
              │ 华为 Push Kit 消息推送     │
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
npx wrangler pages secret put PUSH_APP_ID        # 华为推送 App ID（可选，不配则推送静默关闭）
npx wrangler pages secret put PUSH_CLIENT_ID     # 华为推送 Client ID
npx wrangler pages secret put PUSH_CLIENT_SECRET # 华为推送 Client Secret
```

> ⚠️ 高德 Key 必须选 **Web服务** 类型。「Web端（JS API）」类型无法调用 REST 接口，会导致自动核验永远失败。

### 3. 初始化数据库

```bash
npx wrangler d1 execute qingyuan-community-map --remote --file=worker/schema.sql
```

按 `worker/` 下的迁移脚本顺序依次执行（auth → owner → moderation → quotas → category-school …）。根目录迁移脚本按文件名时间顺序执行，最新一批：`migration-security.sql`（登录防护/会话）、`migration-registration.sql`（注册限额）、`migration-pwd-flow.sql`（密码重置申请与强制改密）、`migration-push.sql`（推送 Token）、`migration-photos.sql`（点位配图）、`migration-correction.sql`（位置纠偏）、`migration-reviews.sql`（大众点评与评分、用户昵称头像）、`migration-ai-cache.sql`（AI 推荐结果缓存）、`migration-nav-stats.sql`（导航点击统计）。

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
| GET | `/spots?page=&limit=&category=&q=&since=&sort=&fields=` | 点位列表（附带 `avg_rating` / `review_count` / `hot_score`，未迁移旧库自动降级）；`sort=hot` 综合热度、`sort=likes` 点赞、默认时间序；`fields=map` 返回图钉轻量字段 |
| POST | `/spots` | 提交点位（需登录 + `X-Owner-Token`），支持 `client_token` 幂等 |
| DELETE | `/spots/:id` | 删除自己提交的点位 |
| POST | `/spots/:id/like` | 点赞（登录时按账号记录） |
| POST | `/spots/:id/report` | 举报 |
| POST | `/spots/:id/correction` | 位置纠偏（需登录，提交坐标修正建议） |
| POST | `/spots/:id/navigate` | 导航点击埋点（公开，`sendBeacon` 上报；IP 限流 60 次/小时，计入综合热度） |
| GET / POST | `/spots/:id/reviews` | 点评列表 + 评分统计 / 发表或修改点评（UPSERT，一人一店一条，需登录） |
| DELETE | `/reviews/:id` | 删除自己的点评（匿名点评仅作者可删） |
| GET | `/my-spots` | 我提交的点位 |

### 用户

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/auth/register` `/auth/login` `/auth/logout` | 注册（网页端强制 Turnstile）/ 登录 / 退出 |
| POST | `/auth/profile` | 设置昵称与头像（需登录） |
| GET | `/users/:id/profile` | 用户公开主页（仅聚合非匿名点评，匿名内容无法反查） |
| GET | `/auth/me` | 当前用户（含 `mustChangePassword` 标志、昵称头像） |
| POST | `/auth/change-password` | 设置新密码（临时密码登录后强制调用） |
| POST | `/auth/reset-request` | 提交找回密码申请（无需登录） |
| POST / DELETE | `/push-token` | 上报 / 注销设备推送 Token（需登录） |

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
| POST | `/admin/spots/:id/category` | 管理：修改点位分类（更新 `updated_at` 触发增量同步） |
| GET | `/admin/amap-check` | 管理：高德接口自检 |
| GET | `/admin/reset-requests` | 管理：待审批密码重置申请 |
| POST | `/admin/reset-requests/:id/handle` | 管理：同意申请（重置 + 推送临时密码 + 踢会话） |
| DELETE | `/admin/reset-requests/:id` | 管理：驳回/删除申请（软删除留痕） |
| POST | `/admin/users/reset-password` | 管理：手动重置指定用户密码为 12345 |
| GET | `/admin/corrections` | 管理：待审核位置纠偏列表 |
| POST | `/admin/corrections/:id/handle` | 管理：同意（移动点位）/ 驳回纠偏 |

管理类接口需请求头 `Authorization: Bearer <ADMIN_TOKEN>`。

---

## 项目结构

```
.
├── index.html          前端主页
├── register.html       独立注册页（Turnstile 与主页隔离）
├── recent.html         最近加入页（时间倒序 + 分类筛选）
├── all.html            全部地点页（网格浏览 + 评分入口）
├── app.js              前端逻辑（地图、列表、点评、提交、同步）
├── all.js              全部地点页 / 最近加入页共用逻辑
├── demo-data.js        本地演示数据兜底（仅 localhost 无后端时启用）
├── admin.html          管理后台页面
├── admin.js            管理后台逻辑
├── favicon.svg         网站图标（清远山水）
├── style.css           样式（含大众点评与液态玻璃样式块）
├── functions/          Cloudflare Pages Functions
│   ├── api/[[path]].js 路由入口
│   └── _lib/api.js     全部接口实现
├── worker/             数据库 schema 与迁移脚本
├── *_*.sql             根目录迁移脚本（点评、AI 缓存、设施导入、同步等）
├── wrangler.toml       Cloudflare 配置
└── *.md                项目文档
```

---

## 安全说明

- 所有密钥（高德 Key、AI 密钥、管理员口令、推送密钥）均以 **Pages secrets** 形式存放，代码中只以 `env.XXX` 引用，不入库
- 用户密码使用 **PBKDF2 + 随机盐** 哈希存储，不存明文
- **临时密码安全模型**：重置密码统一为公开值 `12345`，但必须满足「该账号有已绑定的推送设备」才允许自动重置——保证公开密码只会被推送到失主本人的历史登录设备，攻击者无法凭用户名接管账号；无设备的账号走管理员人工核验 + 线下告知
- **登录防护**：连续失败锁定、按 IP 的注册频率限制、登录尝试记录
- `index.html` 中的高德 **Web端 JS Key** 是前端必需的公开值，**请在高德控制台为其配置 referer 域名白名单与每日配额上限**，避免被他人盗用产生费用

---

## 文档

| 文档 | 内容 |
| --- | --- |
| `清远社区共享地图项目 · 完整实施规划文档.md` | 需求、功能清单、实现记录、历史问题与排查结论 |
| `鸿蒙期末项目可行性评估.md` | 将本项目改造为 HarmonyOS（DevEco Studio）应用的可行性评估与完整任务清单 |
| `功能总结-点评与评分.md` | 地点评分 + 大众点评功能的实现细节、接口清单与验证记录 |
| `修复记录-向导区地图不显示.md` | 向导区小地图空白问题的根因（flex 收缩）与修复过程 |
| `aiguide-待完成功能.md` | AI 向导地图未完成功能清单（路线编辑、持久化等） |

---

## 待办

- AI 推荐体验优化：限流时的排队重试提示（热门问题缓存已完成）
- 推荐路线编辑：在向导区小地图上拖拽排序 / 增删站点 / 指定起终点（`aiguide-待完成功能.md`）
- AI 推荐结构化返回点位 id（替代当前的名称字符串匹配，消除漏匹配）
- HarmonyOS 客户端：找回密码申请入口、登录后 `mustChangePassword` 检测与强制改密页（与网页端对齐）
- 推送通知的鸿蒙端点击跳转深链
