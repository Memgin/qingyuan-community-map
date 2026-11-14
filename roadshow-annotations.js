/* 路演批注系统（仅本地生效，绝不影响线上）
 * 生效条件：hostname 为 localhost / 127.0.0.1 且未带 ?roadshow=0；
 * 部署到 Cloudflare 后此脚本自动静默，无任何 DOM 操作。
 *
 * 定位：页面批注是给评委看的「产品说明牌」——标清这是什么功能、什么架构、什么技术实现；
 *       演讲顺序 / 操作步骤 / 话术 / 计时只出现在右下角「路演助手」面板（演讲者专用）。
 *
 * 功能：
 *  - 三色批注：功能【蓝】架构【绿】技术实现【橙】，锚定到页面元素，默认折叠成号牌，
 *    悬停/点击展开说明卡，不遮挡主体内容
 *  - 12 分钟时间轴面板（演讲者用）：10 段切片 + 倒计时计时器，自动高亮当前段落
 *  - 架构图弹窗：分层逻辑图 + 设计优势
 *  - 演示工具坞：批注显隐、分类过滤、演示数据重置
 *  - 快捷键：A 批注显隐 / T 时间轴 / G 架构图
 */
(function () {
  "use strict";

  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  if (new URLSearchParams(location.search).get("roadshow") === "0") return;

  /* ================= 类型配色（页面批注 = 评委可见的产品说明） ================= */
  const TYPE = {
    feature: { label: "功能", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
    arch:    { label: "架构", color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
    tech:    { label: "技术实现", color: "#c2410c", bg: "#fff7ed", border: "#fed7aa" }
  };

  /* ================= 12 分钟时间轴（演讲者用，与 docs/路演脚本-12分钟.md 一一对应） ================= */
  const TIMELINE = [
    { no: 1, t: "0:00–0:40", secs: 40, title: "开场与项目定位", page: "主页品牌区", level: "主线",
      steps: ["指品牌区「清远 · 社区共享地图」", "念统计数字：58 个点位 / 6 大分类", "点 S1 打开「灵感来源 · 社会痛点」配合讲"],
      talk: ["痛点：本地好去处散在群聊、朋友圈，看完就沉底，没有一张能沉淀、能搜索的社区地图。",
             "一句话定位：居民随手提交，系统自动核验，所有人共享的清远私藏地图。"] },
    { no: 2, t: "0:40–2:00", secs: 80, title: "整体架构总览", page: "顶栏 → 架构图弹窗", level: "主线",
      steps: ["点 S2 打开「架构图」", "按 前端 → 服务层 → 数据/AI层 顺序指讲"],
      talk: ["前端零框架原生 JS；后端 Cloudflare Pages Functions + D1/R2 全 Serverless，零运维、零成本起步。",
             "外部能力即插即用：高德地址核验、智谱 AI、华为推送；所有密钥走 secrets 不入代码库。"] },
    { no: 3, t: "2:00–3:40", secs: 100, title: "地图浏览与热门榜", page: "地图 + 热门地点列表", level: "主线",
      steps: ["点一个分类筛选（如「美食」）", "搜索框输入「鸡」看后端搜索", "点列表第一张卡进详情"],
      talk: ["筛选、搜索、分页全部在后端 SQL 完成，前端只管渲染——弱手机也不卡。",
             "热门榜不是拍脑袋：点赞×1 + 点评×2 + 导航×2，互动越多越靠前，形成用户回流正向循环。"] },
    { no: 4, t: "3:40–5:00", secs: 80, title: "详情面板与匿名点评", page: "详情就地面板", level: "主线",
      steps: ["展示评分摘要与点评列表", "勾选匿名发一条点评（提前登录、内容可提前想好）"],
      talk: ["详情就地面板不弹窗，右侧地图保留、图钉高亮，浏览不中断。",
             "匿名点评从数据层防反查：接口不返回任何作者字段；一人一店一条防刷屏。"] },
    { no: 5, t: "5:00–6:20", secs: 80, title: "提交点位与自动核验", page: "提交弹窗", level: "主线",
      steps: ["点「添加一个地点」", "地址框输入「飞来湖」点「搜索并定位」", "展示子标签建议与多图上传"],
      talk: ["名称命中高德 POI 即自动上线、坐标自动校正——审核成本从人工降到机器。",
             "重复拦截 + client_token 幂等 + 断网队列自动重发：脏数据进不来，提交不丢失。"] },
    { no: 6, t: "6:20–8:10", secs: 110, title: "AI 向导 Lumina 与路线编辑", page: "AI 向导区", level: "主线·重点",
      steps: ["点季节按钮或输入「周末带孩子去哪玩」", "等结果时先讲季节推荐与缓存机制", "结果出来指地图高亮与路线小地图", "点「编辑路线」调一次顺序"],
      talk: ["自然语言 → 推荐文案 → 地图高亮 → 最近邻贪心连成游览路线，闭环到路线编辑器。",
             "相同需求 24 小时内直接复用缓存：热门问题零模型配额、秒回不冷场。"] },
    { no: 7, t: "8:10–9:40", secs: 90, title: "私人地图：收藏·协作·分享", page: "私人地图面板", level: "主线",
      steps: ["提前登录演示账号", "在热门卡点「收藏」→ 弹出多图选择器", "展开一张地图：改名 / 顺路规划 / 分享"],
      talk: ["收藏选择器支持当场新建；协作者按昵称添加，撞名自动出候选列表。",
             "只读分享用一次性令牌生成链接，不含任何个人信息，撤销即失效；删除进回收站 30 天可恢复。"] },
    { no: 8, t: "9:40–10:40", secs: 60, title: "应急地图", page: "右下角「应急」按钮", level: "主线·亮点",
      steps: ["点应急按钮", "点「医院」看 3 公里彩色标记", "指求救信息与 110/120/119 一键拨号"],
      talk: ["灾害与夜间场景：3 公里内警·医·消·避难所一键定位导航，求救信息自带定位链接可发短信。",
             "紧急联系人只存本机不上传——应急功能也不拿隐私换便利。"] },
    { no: 9, t: "10:40–11:30", secs: 50, title: "技术亮点总结", page: "架构图收束", level: "主线",
      steps: ["点 S9 打开「技术亮点」六个亮点页", "按 01→06 顺序收束，最后停在结论条"],
      talk: ["三件套：① 离线队列 + 幂等重发，弱网不丢数据；② 匿名点评数据层脱敏；③ AI 结果缓存与降级，限流不白屏。",
             "自研本地完整后端模拟器：线上同一套 API 代码跑在 Node 上，D1/R2 全仿真——开发即测试。"] },
    { no: 10, t: "11:30–12:00", secs: 30, title: "收尾与愿景", page: "回到品牌区 → 创作团队页", level: "主线",
      steps: ["滚回页面顶部收尾", "点 S10「收尾与愿景」打开「现在的样子，下一步」", "需要时再点「👥 创作团队」亮分工"],
      talk: ["下一步：推荐结果结构化返回、路线跨端同步、鸿蒙 App 与网页端同源同 API（正好衔接鸿蒙端两位成员）。",
             "谢谢各位评委，欢迎体验线上版。"] }
  ];

  /* ================= 页面批注（评委可见的产品说明牌：是什么 / 解决什么 / 怎么实现） ================= */
  const IS_ADMIN = Boolean(document.querySelector(".admin-shell"));
  const IS_REGISTER = Boolean(document.querySelector(".register-card"));

  const INDEX_ANNOTATIONS = [
    { no: "S1", type: "feature", anchor: ".intro-panel", side: "right", title: "社区共建地图 · 项目定位",
      lines: ["模块内容：品牌区 + 核心动作「添加一个地点」+ 已收录点位数，是评委进入后的第一屏。",
              "功能分层：基础必选＝浏览/提交/点评/收藏/审核；亮点创新＝AI 向导、应急地图、私人地图协作分享；拓展实验＝鸿蒙端、离线同步。",
              "数据来源：spotCount 由 /api/spots 返回的 total 实时渲染，不是写死的数字。",
              "设计意图：把「这是什么产品、现在多大规模、从哪进入」压进一屏，评委 10 秒建立认知。"] },
    { no: "S2", type: "arch", anchor: ".topbar", side: "left", title: "整体架构：三端一云",
      lines: ["前端分层：静态 HTML 骨架 → app.js 集中状态机（state + render 三件套）→ apiFetch 统一网络层 → demo-data.js 本地兜底。",
              "服务端：functions/api/[[path]].js 单入口路由 → _lib/api.js 实现 70+ REST，原生 Request/Response，无框架。",
              "数据层：D1(SQLite) 以 26 个迁移脚本管理演进；R2 存图片；高德/智谱/华为推送全部 REST 封装。",
              "鉴权：Bearer Token（用户）+ X-Owner-Token（提交归属）+ X-Actor-Token（设备匿名身份）三类身份分开。",
              "设计理由：全 Serverless 零运维零成本；同源同 API，网页端与鸿蒙端同步只差一个 since 增量参数。"] },
    { no: "S3", type: "feature", anchor: ".map-panel", side: "left", title: "地图浏览与分类筛选",
      lines: ["数据流：GET /api/spots?fields=map 拉全量轻量坐标 → renderMarkers 生成高德 Marker → 点击出弹窗或进详情。",
              "六大分类（景点/美食/商圈/医疗/校园/交通）莫兰迪色系图钉，颜色即分类语义，高亮态换珊瑚色脉冲光环。",
              "分类筛选：切换即带 category 参数请求后端，地图与列表同步刷新，前端不做本地过滤。",
              "点击图钉定位，弹窗内可直接导航；跳转前 sendBeacon 上报，埋点不阻塞跳转。"] },
    { no: "S3", type: "tech", anchor: ".map-legend", side: "left", title: "地图层技术实现",
      lines: ["高德 JS API 2.0，viewMode 2D；向导区小地图强制 Canvas2D 渲染，规避 Windows Chrome WebGPU 二次申请失败的空白画布。",
              "图钉自绘 SVG：分类色圆头 + 白图标 + 落地投影 + 高亮光环，统一由 markerIcon(category, highlighted) 生成。",
              "fields=map 只取坐标/名称/分类等轻量字段——列表分页时地图仍展示全部点位，不只剩当前页。",
              "marker 实例统一存 state.markers，筛选/搜索时批量重建，避免实例泄漏。"] },
    { no: "S3", type: "feature", anchor: ".recent-panel", side: "left", title: "热门地点榜 · 综合热度算法",
      lines: ["热度 = 点赞×1 + 点评×2 + 导航×2，后端 SQL 计算 hot_score，sort=hot 直接按热度排序。",
              "真分页（page/limit）+ 关键词搜索（q 匹配名称与简介），输入 250ms 防抖后才发请求。",
              "卡片信息：封面（无图用分类色渐变占位）+ 星级均分 + 子标签 + 互动行，一屏读完。",
              "加载体验：微光骨架屏占位；断网时读本地缓存兜底，不会出现空白列表。"] },
    { no: "S4", type: "feature", anchor: "#detailPanel", side: "right", title: "详情就地面板 · 社区点评", open: "#spotList .spot-card",
      lines: ["交互：点卡片 → 左侧 intro 区就地切换为详情面板，右侧地图保留并高亮对应图钉，返回一键还原。",
              "数据：GET /api/spots/:id/reviews 一次返回点评列表 + 均分/条数统计，无二次请求。",
              "点评规则：一人一店一条（UPSERT，再提交即修改），可随时切换匿名/实名，作者本人可删。",
              "照片墙：/api/spots/:id/photos，Carousel 4 秒自动轮播 + 触摸滑动 + 灯箱放大，登录用户可补图。"] },
    { no: "S4", type: "tech", anchor: "#detailPanel", side: "left", title: "匿名点评的隐私实现", open: "#spotList .spot-card",
      lines: ["隐私核心：匿名点评在接口层就不返回任何作者字段（无 user_id / 昵称 / 头像），前端拿到也无法反查账号。",
              "对外脱敏：只暴露「昵称 + 用户 ID」；公开主页只聚合非匿名点评，注册时间只到日期。",
              "防滥用：每账号 20 条/小时写入限流；匿名点评仅作者本人可删。",
              "聚合：avg_rating / review_count 以子查询随列表返回，避免 N+1 请求。"] },
    { no: "S5", type: "feature", anchor: "#addSpotButton", side: "right", title: "提交点位 · 自动核验",
      lines: ["表单内容：名称、地址（高德搜索定位）、分类、子标签（最多 5 个）、一句话简介、多图。",
              "自动核验：POST /api/spots 后端调高德 POI 检索，名称命中即置 approved 直接上线，坐标以 POI 结果校正。",
              "子标签：建议来自 /api/tags 按使用次数聚合 + 预设 + 自定义，输入即创建、点击即筛选。",
              "图片：/api/uploads 上传至 R2，首页图作封面，其余进详情照片墙。"] },
    { no: "S5", type: "tech", anchor: "#modalBackdrop .modal", side: "left", title: "提交链路的三道保险", open: "#addSpotButton",
      lines: ["判重：同名同分类，或坐标距离 < 0.001 度，直接拒绝，防止重复点位。",
              "幂等：请求体带 client_token，同一条提交重复发送只入库一次。",
              "离线：断网提交进 outbox 队列，联网自动重发；列表与地图数据本地缓存兜底。",
              "归属与安全：X-Owner-Token 标记提交者；图片校验文件头与大小，拒绝外链 URL。"] },
    { no: "S6", type: "feature", anchor: ".recommend-panel", side: "right", title: "AI 向导 Lumina · 智能路线",
      lines: ["流程：输入自然语言需求 → POST /api/recommend → 中文推荐文案 + 命中点位 → 地图高亮 + 路线小地图。",
              "路线：orderRouteSpots 最近邻贪心排序，AMap.Driving 取真实道路折线，蓝虚线 + 序号标记。",
              "编辑器：↑↓ 调序 / 移除 / 添加后保存，右侧主地图实时重画橙色路线。",
              "季节推荐：SEASON_THEMES 按当前月份把应季主题排最前，一键触发推荐。"] },
    { no: "S6", type: "tech", anchor: ".recommend-panel", side: "left", title: "AI 工程化实现",
      lines: ["模型：智谱 GLM（OpenAI 兼容格式）；主模型限流自动降级备用模型，AbortController 25 秒超时保护。",
              "缓存：key = 需求文本 + 约 1km 精度视野，24 小时内直接复用，热门问题零配额、秒回。",
              "暂存：推荐结果写 localStorage，强制刷新后自动恢复文字 + 高亮 + 路线。",
              "降级路径：模型失败时仍保留上次结果与季节入口，页面不出现空白区。"] },
    { no: "S7", type: "feature", anchor: "#privatePanel", side: "right", title: "私人地图 · 协作与分享",
      lines: ["多地图：/api/maps 增删改查，owner / editor 两种角色，列表含协作地图。",
              "收藏：卡片「⋯」→ 多图选择器（可当场新建），重复收藏有提示，卡片显示「已收藏 ✓」。",
              "协作：按用户名/昵称添加，撞名自动出候选；协作者可编辑点位，但不能删图/分享/管理成员。",
              "分享与回收站：16 字节令牌生成只读链接，撤销即失效；删除为软删除，30 天内可恢复。",
              "AI 建图：输入主题，AI 从已上线点位中挑 2–8 个自动建图。"] },
    { no: "S7", type: "tech", anchor: "#privatePanel", side: "left", title: "分享令牌的安全设计",
      lines: ["令牌：crypto.getRandomValues(16) 生成 32 位十六进制；取消分享清空令牌，链接立即失效。",
              "只读接口只返回地图名与点位清单，不含任何个人信息；协作者接口一律不返回 username。",
              "软删除：deleted_at 标记，读取回收站时顺带清理超过 30 天的记录。",
              "权限在服务端逐接口校验（主人/协作者），不依赖前端隐藏按钮。"] },
    { no: "S8", type: "feature", anchor: "#emergencyButton", side: "left", title: "应急地图 · 一键求助",
      lines: ["定位与检索：AMap.Geolocation 取当前位置，半径 3 公里内检索警察局/医院/消防/避难所四类设施。",
              "展示：高饱和安全色标记 + 距离 + 一键导航，结果列表与地图联动。",
              "求助：sosText 自动附带定位链接，可复制发送；110/120/119 用 tel: 一键拨号。",
              "隐私：紧急联系人只存本机 localStorage，不上传服务器。"] }
  ];

  const ADMIN_ANNOTATIONS = [
    { no: "A1", type: "feature", anchor: ".admin-tabs", side: "right", title: "管理后台 · 六大板块",
      lines: ["待审核点位 / 全部点位 / 举报处理 / 账号与密码 / 位置纠偏 / 诊断工具，内容管理闭环。",
              "密钥会话内自动记忆，切换标签无需重复输入。"] },
    { no: "A2", type: "tech", anchor: "#panel-spots", side: "right", title: "后台数据能力", open: '[data-tab="spots"]',
      lines: ["Chart.js 数据概览：分类分布 + 热度 Top 10 三段堆叠（点赞 / 点评×2 / 导航×2）。",
              "点位行内编辑分类与子标签，失焦即保存并触发增量同步，App 端自动更新。",
              "删除违规内容级联清理点评/点赞/举报/收藏，不留孤儿数据。"] }
  ];

  const REGISTER_ANNOTATIONS = [
    { no: "R1", type: "feature", anchor: ".register-card h1", side: "right", title: "独立注册页 · 全字段即时校验",
      lines: ["注册从登录弹窗独立成页：用户名、手机号、密码、确认密码四个字段全部即时校验，错误当场指出、绝不留到提交后。",
              "手机号必填：一个手机号只能绑定一个账号，是忘记密码时自助找回的唯一凭证。",
              "提交即同意社区公约，昵称/头像规范前置告知。"] },
    { no: "R1", type: "tech", anchor: "#regUsername", side: "right", title: "用户名实时查重",
      lines: ["输入第一个字符就开始校验：格式不符（如只有 1 个字）立即标红说明原因。",
              "格式通过后 600ms 防抖调用 /api/auth/check-username 查重，提示「✓ 该用户名可用 / ⚠ 已被注册」。",
              "双保险：前端即时提示 + 提交时后端终审；用户名统一转小写保存，兼容历史大写账号登录。"] },
    { no: "R2", type: "tech", anchor: "#regPhone", side: "right", title: "手机号即时查重",
      lines: ["归一化处理（自动去空格/横线/+86 前缀）后再校验 11 位大陆号段。",
              "防抖调用 /api/auth/check-phone 全库查重，「已绑定其他账号」时直接提示可去登录。",
              "安全配套：按 IP 限频注册（同 IP 24 小时 3 个账号），防止批量刷号。"] },
    { no: "R3", type: "feature", anchor: ".strength", side: "right", title: "密码强度与一致性",
      lines: ["三档强度条：按长度（≥8 / ≥12 位）+ 字符类别（字母数字混合 / 特殊符号）综合评分，红黄绿渐进配色。",
              "密码可见性一键切换（👁/🙈），两次输入一致性即时提示「✓ 两次输入一致」。",
              "密码策略只在注册和设置新密码时校验（8 位以上含字母数字），登录只比对不追溯。"] },
    { no: "R4", type: "tech", anchor: "#turnstileBox", side: "right", title: "人机验证双模设计",
      lines: ["服务端配置密钥时自动渲染 Cloudflare Turnstile 人机验证组件，注册须先通过。",
              "未配置密钥的环境自动降级为轻量验证，两种模式共用按 IP 的注册频控。",
              "配合 PBKDF2+随机盐 密码哈希、登录失败锁定，注册入口即可拦住机器批量攻击。"] }
  ];

  const ANNOTATIONS = IS_ADMIN ? ADMIN_ANNOTATIONS : (IS_REGISTER ? REGISTER_ANNOTATIONS : INDEX_ANNOTATIONS);

  /* ================= 样式注入 ================= */
  const CSS = `
#rsDock, #rsDock * , .rs-badge, .rs-card, .rs-timeline, .rs-arch, .rs-arch * { box-sizing: border-box; font-family: "PingFang SC","Microsoft YaHei",system-ui,sans-serif; }
.rs-badge { position: fixed; z-index: 99998; display: flex; align-items: center; gap: 5px; height: 30px; padding: 0 12px 0 7px; border-radius: 999px; border: 1.5px solid; font-size: 14.5px; font-weight: 700; cursor: pointer; user-select: none; background: rgba(255,255,255,.94); box-shadow: 0 2px 10px rgba(0,0,0,.16); transition: transform .12s ease; }
.rs-badge:hover { transform: scale(1.05); }
.rs-badge .rs-no { font-size: 11.5px; font-weight: 800; padding: 2px 7px; border-radius: 999px; color: #fff; }
.rs-badge.rs-hidden { display: none; }
.rs-card { position: fixed; z-index: 100000; max-width: 460px; background: #fff; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,.22); border: 1px solid #e5e7eb; padding: 16px 18px; font-size: 15.5px; line-height: 1.7; color: #1f2937; }
.rs-card h4 { margin: 0 0 8px; font-size: 17px; display: flex; align-items: center; gap: 9px; }
.rs-card .rs-tag { font-size: 11.5px; font-weight: 800; color: #fff; padding: 2px 9px; border-radius: 999px; }
.rs-card .rs-seg { font-size: 11.5px; color: #6b7280; font-weight: 600; }
.rs-card ul { margin: 4px 0; padding-left: 20px; }
.rs-card li { margin: 4px 0; }
.rs-pin-close { position: absolute; top: 6px; right: 10px; cursor: pointer; color: #9ca3af; font-size: 14px; }
#rsDock { position: fixed; right: 16px; bottom: 72px; z-index: 100001; }
#rsDockBtn { display: flex; align-items: center; gap: 6px; border: none; cursor: pointer; background: #111827; color: #fff; font-size: 13px; font-weight: 700; padding: 10px 16px; border-radius: 999px; box-shadow: 0 6px 20px rgba(0,0,0,.28); }
#rsDockBtn .rs-timer { font-variant-numeric: tabular-nums; background: #dc2626; padding: 1px 8px; border-radius: 999px; font-size: 12px; }
#rsDockBtn .rs-timer.running { background: #059669; }
#rsPanel { display: none; position: absolute; right: 0; bottom: 52px; width: 392px; max-height: 74vh; overflow: auto; background: #fff; border-radius: 14px; border: 1px solid #e5e7eb; box-shadow: 0 14px 50px rgba(0,0,0,.25); padding: 14px; }
#rsPanel.open { display: block; }
#rsPanel.below { bottom: auto; top: 46px; }
#rsDockBtn { cursor: grab; }
#rsDockBtn:active { cursor: grabbing; }
#rsPanel h3 { margin: 0 0 10px; font-size: 16px; }
.rs-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.rs-chip { border: 1.5px solid #d1d5db; background: #fff; color: #374151; font-size: 11.5px; font-weight: 700; padding: 4px 10px; border-radius: 999px; cursor: pointer; }
.rs-chip.off { opacity: .35; }
.rs-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.rs-btn { border: none; cursor: pointer; font-size: 12px; font-weight: 700; padding: 7px 12px; border-radius: 8px; background: #111827; color: #fff; }
.rs-btn.green { background: #059669; } .rs-btn.red { background: #dc2626; } .rs-btn.gray { background: #6b7280; }
.rs-segitem { border: 1px solid #e5e7eb; border-radius: 10px; padding: 9px 11px; margin-bottom: 8px; background: #fafafa; }
.rs-segitem.current { border-color: #dc2626; background: #fef2f2; box-shadow: 0 0 0 2px rgba(220,38,38,.12); }
.rs-segitem .rs-seghead { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
.rs-segitem .rs-segtitle { font-size: 13.5px; font-weight: 800; color: #111827; }
.rs-segitem .rs-segtime { font-size: 12px; color: #6b7280; font-variant-numeric: tabular-nums; }
.rs-lv { font-size: 11px; font-weight: 800; padding: 1px 7px; border-radius: 999px; color: #fff; background: #6b7280; }
.rs-lv.hot { background: #dc2626; }
.rs-segitem ul { margin: 5px 0 0; padding-left: 18px; font-size: 12.5px; color: #374151; line-height: 1.65; }
.rs-opt { background: #f3f4f6; border-radius: 8px; padding: 8px 10px; font-size: 12.5px; color: #4b5563; line-height: 1.7; }
.rs-seg-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
.rs-seg-chip { border: 1.5px solid #d1d5db; background: #fff; color: #374151; font-size: 12px; font-weight: 700; padding: 5px 10px; border-radius: 999px; cursor: pointer; }
.rs-seg-chip b { color: #111827; margin-right: 4px; }
.rs-seg-chip.open { background: #111827; color: #fff; border-color: #111827; }
.rs-seg-chip.open b { color: #f9fafb; }
.rs-seg-chip.current { border-color: #dc2626; color: #b91c1c; box-shadow: 0 0 0 2px rgba(220,38,38,.16); }
.rs-seg-chip.current.open { background: #dc2626; color: #fff; border-color: #dc2626; }
.rs-seg-chip.current.open b { color: #fff; }
.rs-seg-chip .rs-cyc { margin-left: 6px; font-size: 10.5px; background: rgba(17,24,39,.08); border-radius: 999px; padding: 1px 6px; font-variant-numeric: tabular-nums; }
.rs-seg-chip.open .rs-cyc { background: rgba(255,255,255,.28); color: #fff; }
a.rs-btn { text-decoration: none; display: inline-flex; align-items: center; }
.rs-seg-detail { display: none; margin-bottom: 8px; }
.rs-seg-detail.open { display: block; }
.rs-backdrop { position: fixed; inset: 0; z-index: 100002; background: rgba(17,24,39,.55); display: flex; align-items: center; justify-content: center; }
.rs-arch { background: #fff; border-radius: 16px; max-width: 920px; width: 92vw; max-height: 88vh; overflow: auto; padding: 24px 28px; }
.rs-arch h3 { margin: 0 0 4px; font-size: 21px; }
.rs-arch .sub { color: #6b7280; font-size: 13px; margin-bottom: 14px; }
.rs-arch svg { width: 100%; height: auto; display: block; }
.rs-arch .adv { margin-top: 14px; border-top: 1px dashed #d1d5db; padding-top: 12px; font-size: 14px; line-height: 1.85; color: #374151; }
.rs-arch .adv b { color: #15803d; }
.rs-close-x { float: right; border: none; background: none; font-size: 20px; cursor: pointer; color: #6b7280; }
.rs-team { background: #fff; border-radius: 16px; max-width: 680px; width: 92vw; max-height: 88vh; overflow: auto; padding: 26px 30px; }
.rs-team h3 { margin: 0 0 2px; font-size: 22px; text-align: center; }
.rs-team .sub { color: #6b7280; font-size: 13px; text-align: center; margin: 0 0 18px; }
.rs-team-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.rs-member { border: 1px solid #e5e7eb; border-radius: 12px; padding: 13px 15px; background: #fafafa; }
.rs-member.lead { grid-column: 1 / -1; background: #f0fdf4; border-color: #bbf7d0; }
.rs-member .rs-mname { font-size: 17px; font-weight: 800; color: #111827; }
.rs-member .rs-mid { font-size: 12px; color: #6b7280; margin-left: 8px; font-variant-numeric: tabular-nums; }
.rs-member .rs-mrole { margin-top: 6px; font-size: 13.5px; color: #374151; line-height: 1.65; }
.rs-member .rs-mrole b { color: #15803d; }
.rs-insp { background: #F4F3ED; border: 1px solid #DCE1D9; border-radius: 18px; max-width: 1000px; width: 94vw; max-height: 88vh; overflow: auto; padding: 26px 34px 18px; }
.rs-insp .rs-eyebrow { color: #6b7f76; letter-spacing: .35em; font-size: 12.5px; font-weight: 700; margin: 0 0 8px; }
.rs-insp h3 { margin: 0 0 12px; font-family: "Noto Serif SC","PingFang SC",serif; font-size: 34px; color: #1f3d33; letter-spacing: 1px; }
.rs-insp-sub { color: #5c6b62; font-size: 16.5px; line-height: 1.75; margin: 0 0 10px; }
.rs-insp-origin { color: #3f4f45; font-size: 16.5px; line-height: 1.8; margin: 0 0 12px; }
.rs-insp-quote-line { margin: 0 0 10px; padding-left: 12px; border-left: 3px solid #d9c9a6; color: #46564b; font-size: 16px; line-height: 1.8; font-weight: 600; }
.rs-insp-soil { margin: 0 0 12px; color: #7d8d83; font-size: 15px; line-height: 1.8; }
.rs-insp-top { display: grid; grid-template-columns: 1fr 414px; gap: 24px; align-items: center; margin-bottom: 16px; }
@media (max-width: 820px) { .rs-insp-top { grid-template-columns: 1fr; } }
.rs-insp-figure { margin: 0; }
.rs-insp-figure img { display: block; width: 100%; height: auto; border-radius: 10px; border: 1px solid #d8ddd2; box-shadow: 0 6px 18px rgba(31,61,51,.12); }
img.rs-insp-map { cursor: zoom-in; transition: transform .15s ease, box-shadow .15s ease; }
img.rs-insp-map:hover { transform: scale(1.012); box-shadow: 0 10px 26px rgba(31,61,51,.2); }
.rs-zoom { position: fixed; inset: 0; z-index: 100004; background: rgba(17,24,39,.88); display: flex; align-items: center; justify-content: center; cursor: zoom-out; }
.rs-zoom img { max-width: 94vw; max-height: 90vh; border-radius: 10px; box-shadow: 0 24px 70px rgba(0,0,0,.55); }
.rs-insp-figure figcaption { margin-top: 7px; font-size: 11.5px; color: #8a9a8f; text-align: center; letter-spacing: .5px; }
.rs-insp-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 4px; }
.rs-insp-chips span { background: #E7EDE4; color: #2f6d5a; font-weight: 700; font-size: 15px; padding: 6px 15px; border-radius: 8px; }
.rs-insp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
@media (max-width: 760px) { .rs-insp-grid { grid-template-columns: 1fr; } }
.rs-insp-card { background: rgba(255,255,255,.6); border: 1px solid #dfe4d8; border-radius: 12px; padding: 16px 17px 15px; }
.rs-insp-num { display: block; color: #C96F5E; font-weight: 800; font-size: 15.5px; letter-spacing: 1.5px; margin-bottom: 6px; }
.rs-insp-card b { display: block; font-size: 18.5px; color: #1f3d33; margin-bottom: 6px; }
.rs-insp-card p { margin: 0; font-size: 15.5px; color: #5c6b62; line-height: 1.72; }
.rs-insp-final { margin-top: 14px; background: #DCE8DC; border-left: 4px solid #2f6d5a; border-radius: 8px; padding: 13px 18px; color: #1f3d33; font-size: 17.5px; font-weight: 700; line-height: 1.8; }
.rs-insp-foot { margin-top: 12px; color: #a5b0a6; font-size: 11.5px; }
.rs-now { background: #F4F3ED; border: 1px solid #DCE1D9; border-radius: 18px; max-width: 1020px; width: 94vw; max-height: 88vh; overflow: auto; padding: 32px 38px 22px; }
.rs-now .rs-eyebrow { color: #6b7f76; letter-spacing: .35em; font-size: 13.5px; font-weight: 700; margin: 0 0 8px; }
.rs-now h3 { margin: 0 0 20px; font-family: "Noto Serif SC","PingFang SC",serif; font-size: 38px; color: #1f3d33; letter-spacing: 1px; }
.rs-now-grid { display: grid; grid-template-columns: 1fr 0.9fr; gap: 30px; }
@media (max-width: 760px) { .rs-now-grid { grid-template-columns: 1fr; } }
.rs-now-label { font-size: 17px; font-weight: 800; margin: 0 0 14px; display: flex; align-items: center; gap: 8px; color: #1f3d33; }
.rs-now-label::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: #2f6d5a; }
.rs-now-label.next::before { background: #d05c45; }
.rs-now-item { display: flex; gap: 13px; background: rgba(255,255,255,.6); border: 1px solid #dfe4d8; border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; }
.rs-now-tag { flex: none; width: 82px; font-weight: 800; color: #2f6d5a; font-size: 17px; line-height: 1.5; }
.rs-now-item p { margin: 0; font-size: 16px; color: #3f4f45; line-height: 1.75; }
.rs-now-card { border-left: 2px solid #e3c3b7; padding-left: 15px; margin-bottom: 16px; }
.rs-now-card b { display: block; font-size: 18px; color: #1f3d33; margin-bottom: 5px; }
.rs-now-card span { font-size: 15px; color: #6b7a70; line-height: 1.8; }
.rs-now-foot { margin-top: 14px; color: #a5b0a6; font-size: 12px; }
.rs-tech { background: #F4F3ED; border: 1px solid #DCE1D9; border-radius: 18px; max-width: 1080px; width: 94vw; max-height: 88vh; overflow: auto; padding: 32px 38px 22px; }
.rs-tech .rs-eyebrow { color: #6b7f76; letter-spacing: .35em; font-size: 13.5px; font-weight: 700; margin: 0 0 8px; }
.rs-tech h3 { margin: 0 0 6px; font-family: "Noto Serif SC","PingFang SC",serif; font-size: 38px; color: #1f3d33; letter-spacing: 1px; }
.rs-tech .rs-sub2 { color: #7b8b81; font-size: 15.5px; margin: 0 0 20px; }
.rs-tech-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
@media (max-width: 860px) { .rs-tech-grid { grid-template-columns: repeat(2, 1fr); } }
.rs-tech-card { background: rgba(255,255,255,.62); border: 1px solid #dfe4d8; border-radius: 12px; padding: 16px 17px; }
.rs-tech-card .rs-tnum { font-weight: 800; color: #C96F5E; font-size: 15px; letter-spacing: 1.5px; }
.rs-tech-card b { display: block; margin: 4px 0 7px; font-size: 18.5px; color: #1f3d33; }
.rs-tech-card p { margin: 0 0 10px; font-size: 15px; color: #54655b; line-height: 1.78; }
.rs-tech-card .rs-ttag { display: inline-block; font-size: 12px; font-weight: 700; color: #2f6d5a; background: #E7EDE4; border-radius: 999px; padding: 2px 9px; }
.rs-tech-final { margin-top: 16px; background: #DCE8DC; border-left: 4px solid #2f6d5a; border-radius: 8px; padding: 15px 18px; color: #1f3d33; font-size: 17px; font-weight: 700; line-height: 1.8; }
.rs-tech-foot { margin-top: 12px; color: #a5b0a6; font-size: 12px; }
`;
  const styleEl = document.createElement("style");
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  /* ================= 状态 ================= */
  const visibleTypes = { feature: true, arch: true, tech: true };
  let annotationsOn = true;
  let pinnedCards = [];       // 点击固定 / 自动展开的说明卡（可多张）
  let hoverCard = null;       // 悬停临时显示的批注 {ann, cardEl}

  /* ================= 批注号牌 ================= */
  const badgeEls = [];
  function buildBadges() {
    ANNOTATIONS.forEach((ann) => {
      const t = TYPE[ann.type];
      const el = document.createElement("div");
      el.className = "rs-badge";
      el.style.borderColor = t.color;
      el.style.color = t.color;
      el.innerHTML = `<span class="rs-no" style="background:${t.color}">${ann.no}</span>${t.label}·${ann.title}`;
      el.addEventListener("mouseenter", () => showCard(ann, el, false));
      el.addEventListener("mouseleave", () => { if (hoverCard && hoverCard.ann === ann) { hoverCard.cardEl.remove(); hoverCard = null; } });
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const existed = pinnedCards.find((p) => p.ann === ann);
        if (existed) { existed.cardEl.remove(); pinnedCards = pinnedCards.filter((p) => p !== existed); }
        else showCard(ann, el, true);
      });
      document.body.appendChild(el);
      badgeEls.push({ ann, el });
    });
    document.addEventListener("click", (ev) => {
      if (ev.target.closest && ev.target.closest("#rsDock")) return; // 助手面板内的点击不关闭批注卡
      if (pinnedCards.length && !pinnedCards.some((p) => p.cardEl.contains(ev.target))) hideCard();
    });
  }

  function positionBadge(item) {
    const anchor = document.querySelector(item.ann.anchor);
    const el = item.el;
    if (!anchor || anchor.offsetParent === null || anchor.getClientRects().length === 0) {
      el.classList.add("rs-hidden");
      return;
    }
    el.classList.remove("rs-hidden");
    if (!annotationsOn || !visibleTypes[item.ann.type]) { el.classList.add("rs-hidden"); return; }
    const r = anchor.getBoundingClientRect();
    const right = item.ann.side !== "left";
    let x, y;
    if (right) { x = Math.min(r.right + 6, window.innerWidth - 320); y = r.top + 2; }
    else { x = Math.max(r.left - 6 - el.offsetWidth, 8); y = r.top + 2; }
    y = Math.max(8, Math.min(y, window.innerHeight - 34));
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
  }

  const repositionAll = () => badgeEls.forEach(positionBadge);
  let rafPending = false;
  function scheduleReposition() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => { rafPending = false; repositionAll(); });
  }
  window.addEventListener("scroll", scheduleReposition, true);
  window.addEventListener("resize", scheduleReposition);
  setInterval(repositionAll, 700); // 兜底：处理 hidden 面板/弹窗动态出现

  /* ================= 说明卡 ================= */
  function showCard(ann, badgeEl, pin) {
    if (pin) {
      pinnedCards.forEach((p) => p.cardEl.remove());
      pinnedCards = [];
    } else if (hoverCard) {
      hoverCard.cardEl.remove();
      hoverCard = null;
    }
    const t = TYPE[ann.type];
    const card = document.createElement("div");
    card.className = "rs-card";
    let html = `<span class="rs-pin-close" data-close>✕</span><h4><span class="rs-tag" style="background:${t.color}">${t.label}</span>${ann.title}<span class="rs-seg">${ann.no}</span></h4>`;
    if (ann.lines) html += `<ul>${ann.lines.map((l) => `<li>${l}</li>`).join("")}</ul>`;
    card.innerHTML = html;
    card.querySelector("[data-close]").addEventListener("click", () => {
      if (pin) { card.remove(); pinnedCards = pinnedCards.filter((p) => p.cardEl !== card); }
      else { card.remove(); if (hoverCard && hoverCard.cardEl === card) hoverCard = null; }
    });
    document.body.appendChild(card);
    const r = badgeEl.getBoundingClientRect();
    const off = r.width === 0 && r.height === 0; // 号牌隐藏（面板未打开）：卡片退居右上角展示
    let x = off ? Math.max(8, window.innerWidth - 476) : r.left;
    let y = off ? 96 : r.bottom + 6;
    if (!off) {
      if (x + 470 > window.innerWidth) x = window.innerWidth - 476;
      if (y + card.offsetHeight > window.innerHeight - 8) y = Math.max(8, r.top - card.offsetHeight - 6);
    }
    card.style.left = `${Math.round(Math.max(8, x))}px`;
    card.style.top = `${Math.round(Math.max(8, y))}px`;
    if (pin) pinnedCards.push({ ann, cardEl: card });
    else hoverCard = { ann, cardEl: card };
  }
  function hideCard() {
    if (hoverCard) { hoverCard.cardEl.remove(); hoverCard = null; }
    pinnedCards.forEach((p) => p.cardEl.remove());
    pinnedCards = [];
    if (activeSeg !== null) { activeSeg = null; activeCycle = 0; renderTimelineState(); }
  }

  /* ================= 工具坞 ================= */
  const dock = document.createElement("div");
  dock.id = "rsDock";
  dock.innerHTML = `
    <div id="rsPanel">
      <h3>🎬 路演助手</h3>
      <div class="rs-actions">
        <button class="rs-btn" id="rsArchBtn">📐 架构图</button>
        <button class="rs-btn" id="rsTeamBtn">👥 创作团队</button>
        <button class="rs-btn" id="rsInspBtn">💡 灵感来源</button>
        <a class="rs-btn green" href="https://qymap.pages.dev/" target="_blank" rel="noopener">🌐 线上演示</a>
        <a class="rs-btn gray" href="https://qymap.pages.dev/admin" target="_blank" rel="noopener">🛠 线上后台</a>
        <button class="rs-btn" id="rsStartBtn">▶ 计时</button>
        <button class="rs-btn gray" id="rsResetTimerBtn">⟲ 归零</button>
        <button class="rs-btn red" id="rsResetDataBtn">🗑 重置演示数据</button>
      </div>
      <div class="rs-row" id="rsTypeChips"></div>
      <div id="rsTimeline"></div>
      <div style="margin-top:10px;font-size:10.5px;color:#9ca3af">快捷键：A 批注开关 · T 时间轴 · G 架构图 · 仅本地生效</div>
    </div>
    <button id="rsDockBtn"><span>🎬</span><span>路演助手</span><span class="rs-timer" id="rsTimer">12:00</span></button>
  `;
  document.body.appendChild(dock);

  // 类型过滤 chips
  const chipsBox = dock.querySelector("#rsTypeChips");
  Object.entries(TYPE).forEach(([key, t]) => {
    const chip = document.createElement("button");
    chip.className = "rs-chip";
    chip.style.borderColor = t.color; chip.style.color = t.color;
    chip.textContent = `${t.label}`;
    chip.addEventListener("click", () => {
      visibleTypes[key] = !visibleTypes[key];
      chip.classList.toggle("off", !visibleTypes[key]);
      repositionAll();
    });
    chipsBox.appendChild(chip);
  });
  const allChip = document.createElement("button");
  allChip.className = "rs-chip";
  allChip.textContent = "批注全开/全关";
  allChip.addEventListener("click", () => {
    annotationsOn = !annotationsOn;
    allChip.classList.toggle("off", !annotationsOn);
    if (!annotationsOn) hideCard();
    repositionAll();
  });
  chipsBox.appendChild(allChip);

  // 批注遥控按钮：按页面显示对应批注编号 —— 主页 S1–S10、注册页 R1–R4、后台 A1–A2
  // 点击即展开页面上的对应批注卡（手风琴：打开新的自动关闭旧的；多条批注依次轮播）
  const tlBox = dock.querySelector("#rsTimeline");
  tlBox.innerHTML = `<div class="rs-seg-chips" id="rsSegChips"></div>`;
  const segChipsRow = tlBox.querySelector("#rsSegChips");
  const segChips = [];
  const segAnns = {};
  ANNOTATIONS.forEach((ann, idx) => {
    const m = /^([SRA])(\d+)$/.exec(ann.no);
    if (m) (segAnns[`${m[1]}${m[2]}`] = segAnns[`${m[1]}${m[2]}`] || []).push(idx);
  });
  let activeSeg = null;  // 当前展开批注的按钮 key（S1…/R1…/A1…）
  let activeCycle = 0;   // 该按钮下当前展示到第几条批注
  const chipDefs = [];
  if (!IS_ADMIN && !IS_REGISTER) {
    TIMELINE.forEach((seg) => chipDefs.push({ key: `S${seg.no}`, title: seg.title, seg }));
    // S1→灵感来源、S2/S9→架构图、S10→现在与下一步：直接打开对应整页，与页面批注互补
    chipDefs.forEach((def) => {
      const no = def.seg.no;
      if (no === 1) def.action = openInsp;
      else if (no === 2) def.action = openArch;
      else if (no === 9) def.action = openTech;
      else if (no === 10) def.action = openNow;
      else if (!(segAnns[def.key] || []).length) def.action = openNow; // 兜底：无批注段打开收尾页
    });
  }
  if (IS_REGISTER) {
    const rLabels = { R1: "注册页定位与查重", R2: "手机号查重", R3: "密码强度体验", R4: "人机验证" };
    Object.keys(rLabels).forEach((key) => chipDefs.push({ key, title: rLabels[key], seg: null }));
  }
  if (IS_ADMIN) {
    chipDefs.push({ key: "A1", title: "六大板块", seg: null }, { key: "A2", title: "数据能力", seg: null });
  }
  chipDefs.forEach((def) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "rs-seg-chip";
    chip.innerHTML = `<b>${def.key}</b>${def.title}<span class="rs-cyc"></span>`;
    chip.addEventListener("click", (ev) => {
      ev.stopPropagation(); // 阻止冒泡到「点击空白关闭批注」的全局监听，否则卡片刚展开就被关掉
      if (def.action) { hideCard(); def.action(); renderTimelineState(); return; }
      const anns = segAnns[def.key] || [];
      if (!anns.length) return;
      if (activeSeg === def.key) { // 再次点击：轮播该段下一条批注，最后一条后关闭
        activeCycle += 1;
        if (activeCycle >= anns.length) hideCard();
        else showSegAnn(def.key, activeCycle);
      } else { // 打开新的段：自动关闭已展开的批注
        hideCard();
        activeSeg = def.key;
        activeCycle = 0;
        showSegAnn(def.key, 0);
      }
      renderTimelineState();
    });
    segChipsRow.appendChild(chip);
    segChips.push(chip);
  });
  function renderTimelineState() {
    chipDefs.forEach((def, i) => {
      const segOpen = activeSeg === def.key;
      segChips[i].classList.toggle("open", segOpen);
      const anns = segAnns[def.key] || [];
      const cyc = segChips[i].querySelector(".rs-cyc");
      if (cyc) cyc.textContent = segOpen && anns.length > 1 ? `${activeCycle + 1}/${anns.length}` : "";
    });
  }
  // 展示某段的批注卡：锚点不在视口内时先滚到中间再展开；
  // 面板未打开且配置了 open 选择器（如提交弹窗/详情面板）时，先自动打开对应界面
  function showSegAnn(segNo, cycle) {
    const anns = segAnns[segNo] || [];
    const ann = ANNOTATIONS[anns[cycle]];
    if (!ann) return;
    const item = badgeEls.find((b) => b.ann === ann);
    if (!item) return;
    const hiddenBadge = item.el.classList.contains("rs-hidden");
    if (hiddenBadge && ann.open) {
      const opener = document.querySelector(ann.open);
      if (opener) {
        opener.click();
        setTimeout(() => { repositionAll(); showCard(ann, item.el, true); }, 600);
        return;
      }
    }
    let offscreen = false;
    const anchor = document.querySelector(ann.anchor);
    if (anchor) {
      const r = anchor.getBoundingClientRect();
      offscreen = r.top < 60 || r.bottom > window.innerHeight - 60;
    }
    if (hiddenBadge || offscreen) {
      if (anchor) anchor.scrollIntoView({ block: "center" });
      setTimeout(() => { repositionAll(); showCard(ann, item.el, true); }, 380);
      return;
    }
    showCard(ann, item.el, true);
  }
  // 面板开合：工具坞在屏幕上半部时面板向下弹出
  const panel = dock.querySelector("#rsPanel");
  function togglePanel() {
    panel.classList.toggle("open");
    const r = dock.getBoundingClientRect();
    panel.classList.toggle("below", r.top < window.innerHeight / 2);
  }

  /* ================= 工具坞拖动 ================= */
  const dockBtn = dock.querySelector("#rsDockBtn");
  let dragState = null;
  dockBtn.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    const rect = dock.getBoundingClientRect();
    dragState = { startX: ev.clientX, startY: ev.clientY, origLeft: rect.left, origTop: rect.top, moved: false };
    try { dockBtn.setPointerCapture(ev.pointerId); } catch { /* 忽略 */ }
  });
  dockBtn.addEventListener("pointermove", (ev) => {
    if (!dragState) return;
    const dx = ev.clientX - dragState.startX, dy = ev.clientY - dragState.startY;
    if (!dragState.moved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    dragState.moved = true;
    dock.style.right = "auto";
    dock.style.bottom = "auto";
    const x = Math.min(Math.max(6, dragState.origLeft + dx), window.innerWidth - dock.offsetWidth - 6);
    const y = Math.min(Math.max(6, dragState.origTop + dy), window.innerHeight - dock.offsetHeight - 6);
    dock.style.left = `${Math.round(x)}px`;
    dock.style.top = `${Math.round(y)}px`;
    panel.classList.toggle("below", y < window.innerHeight / 2);
  });
  dockBtn.addEventListener("pointerup", () => {
    if (dragState && dragState.moved) dock.dataset.dragged = "1"; // 拖动结束后吞掉本次 click，不弹面板
    dragState = null;
  });
  dockBtn.addEventListener("click", (ev) => {
    if (dock.dataset.dragged) { delete dock.dataset.dragged; ev.stopImmediatePropagation(); return; }
    togglePanel();
  });

  /* ================= 倒计时（状态持久化：刷新页面后计时继续，不归零） ================= */
  const TOTAL = 720; // 12 分钟
  const TIMER_START_KEY = "rs-timer-start-at";   // 计时中：开始时刻时间戳（ms）
  const TIMER_PAUSED_KEY = "rs-timer-paused-at"; // 暂停中：暂停那一刻的剩余秒数
  let timerId = null;
  let remain = TOTAL;
  let running = false;
  const timerEl = dock.querySelector("#rsTimer");
  const startBtn = dock.querySelector("#rsStartBtn");
  function renderTimer() {
    const m = Math.floor(remain / 60), s = remain % 60;
    timerEl.textContent = `${m}:${String(s).padStart(2, "0")}`;
  }
  // 高亮当前段：按已用时间匹配（只给对应按钮亮红框，不自动展开详情）
  function highlightCurrent() {
    const elapsed = TOTAL - remain;
    let currentIdx = -1;
    let acc = 0;
    TIMELINE.forEach((seg, i) => { if (elapsed >= acc && elapsed < acc + seg.secs) currentIdx = i; acc += seg.secs; });
    segChips.forEach((chip, i) => chip.classList.toggle("current", running && i === currentIdx));
  }
  function renderAll() { renderTimer(); highlightCurrent(); }
  function syncButton() { startBtn.textContent = running ? "⏸ 暂停" : "▶ 计时"; timerEl.classList.toggle("running", running); }
  // 由持久化状态推导剩余秒数：计时中按开始时刻换算（无累积误差），暂停中读暂停值
  function computeRemain() {
    const startAt = Number(localStorage.getItem(TIMER_START_KEY));
    if (Number.isFinite(startAt) && startAt > 0) return Math.max(0, TOTAL - Math.floor((Date.now() - startAt) / 1000));
    const paused = Number(localStorage.getItem(TIMER_PAUSED_KEY));
    return Number.isFinite(paused) && paused >= 0 ? paused : TOTAL;
  }
  function tick() {
    remain = computeRemain();
    if (remain <= 0) { // 计时结束：清状态、停止
      localStorage.removeItem(TIMER_START_KEY);
      localStorage.removeItem(TIMER_PAUSED_KEY);
      if (timerId) { clearInterval(timerId); timerId = null; }
      running = false; syncButton();
    }
    renderAll();
  }
  function startTimer() {
    localStorage.setItem(TIMER_START_KEY, String(Date.now() - (TOTAL - remain) * 1000));
    localStorage.removeItem(TIMER_PAUSED_KEY);
    running = true; syncButton();
    if (!timerId) timerId = setInterval(tick, 500);
    renderAll();
  }
  function pauseTimer() {
    localStorage.removeItem(TIMER_START_KEY);
    localStorage.setItem(TIMER_PAUSED_KEY, String(remain));
    running = false; syncButton();
    if (timerId) { clearInterval(timerId); timerId = null; }
  }
  startBtn.addEventListener("click", () => { running ? pauseTimer() : startTimer(); });
  dock.querySelector("#rsResetTimerBtn").addEventListener("click", () => {
    if (timerId) { clearInterval(timerId); timerId = null; }
    localStorage.removeItem(TIMER_START_KEY);
    localStorage.removeItem(TIMER_PAUSED_KEY);
    running = false; remain = TOTAL; syncButton(); renderAll();
  });
  // 页面加载时恢复持久化的计时状态：计时中→自动继续倒计时；暂停中→恢复剩余时间
  (function restoreTimer() {
    remain = computeRemain();
    running = Number(localStorage.getItem(TIMER_START_KEY)) > 0 && remain > 0;
    if (remain <= 0) {
      localStorage.removeItem(TIMER_START_KEY);
      localStorage.removeItem(TIMER_PAUSED_KEY);
      running = false; remain = 0;
    }
    syncButton(); renderAll();
    if (running) timerId = setInterval(tick, 500);
  })();
  // 后台持续运行：剩余时间由开始时刻换算，后台标签页即使被浏览器节流也不丢秒；
  // 切回页面/窗口时立即重新校准显示，跨页面（主页↔注册页↔后台）共用同一份计时状态
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tick(); });
  window.addEventListener("pageshow", (ev) => { if (ev.persisted) tick(); });

  /* ================= 架构图弹窗 ================= */
  const ARCH_SVG = `
  <svg viewBox="0 0 800 372" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#6b7280"/></marker>
    </defs>
    <text x="400" y="22" text-anchor="middle" font-size="17" font-weight="800" fill="#111827">清远社区共享地图 · 系统架构</text>
    <!-- 三端 -->
    <g font-size="14" font-weight="700">
      <rect x="80" y="42" width="180" height="52" rx="10" fill="#eff6ff" stroke="#1d4ed8" stroke-width="1.5"/>
      <text x="170" y="64" text-anchor="middle" fill="#1d4ed8">网页端（演示主体）</text>
      <text x="170" y="82" text-anchor="middle" font-size="11.5" fill="#4b5563">原生 HTML/JS · 零框架</text>
      <rect x="310" y="42" width="180" height="52" rx="10" fill="#f9fafb" stroke="#9ca3af" stroke-dasharray="4 3"/>
      <text x="400" y="64" text-anchor="middle" fill="#4b5563">HarmonyOS App</text>
      <text x="400" y="82" text-anchor="middle" font-size="11.5" fill="#9ca3af">同源同 API（待上线）</text>
      <rect x="540" y="42" width="180" height="52" rx="10" fill="#eff6ff" stroke="#1d4ed8" stroke-width="1.5"/>
      <text x="630" y="64" text-anchor="middle" fill="#1d4ed8">管理后台 admin.html</text>
      <text x="630" y="82" text-anchor="middle" font-size="11.5" fill="#4b5563">六板块 · Chart.js 概览</text>
    </g>
    <line x1="400" y1="94" x2="400" y2="126" stroke="#6b7280" stroke-width="1.6" marker-end="url(#arr)"/>
    <text x="412" y="114" font-size="11.5" fill="#6b7280">HTTPS / JSON（密钥全走 secrets，不入代码）</text>
    <!-- 服务层 -->
    <rect x="140" y="130" width="520" height="56" rx="10" fill="#f0fdf4" stroke="#15803d" stroke-width="1.5"/>
    <text x="400" y="152" text-anchor="middle" font-size="12.5" font-weight="800" fill="#15803d">Cloudflare Pages Functions（Serverless · 无框架路由）</text>
    <text x="400" y="172" text-anchor="middle" font-size="11.5" fill="#374151">70+ REST 接口一套代码 · 增量同步 since · 写入限流 · client_token 幂等</text>
    <line x1="400" y1="186" x2="400" y2="212" stroke="#6b7280" stroke-width="1.6" marker-end="url(#arr)"/>
    <!-- 数据与外部能力 -->
    <g font-size="13" font-weight="700">
      <rect x="52" y="216" width="158" height="58" rx="10" fill="#fff7ed" stroke="#c2410c" stroke-width="1.4"/>
      <text x="131" y="240" text-anchor="middle" fill="#c2410c">D1 · SQLite</text>
      <text x="131" y="258" text-anchor="middle" font-size="11" fill="#6b7280">26 个迁移脚本演进</text>
      <rect x="222" y="216" width="130" height="58" rx="10" fill="#fff7ed" stroke="#c2410c" stroke-width="1.4"/>
      <text x="287" y="240" text-anchor="middle" fill="#c2410c">R2 · 图片存储</text>
      <text x="287" y="258" text-anchor="middle" font-size="11" fill="#6b7280">多图 / 头像校验</text>
      <rect x="364" y="216" width="130" height="58" rx="10" fill="#fff" stroke="#6b7280" stroke-width="1.4"/>
      <text x="429" y="240" text-anchor="middle" fill="#374151">高德 REST</text>
      <text x="429" y="258" text-anchor="middle" font-size="11" fill="#6b7280">POI 自动核验</text>
      <rect x="506" y="216" width="130" height="58" rx="10" fill="#fff" stroke="#6b7280" stroke-width="1.4"/>
      <text x="571" y="240" text-anchor="middle" fill="#374151">智谱 GLM</text>
      <text x="571" y="258" text-anchor="middle" font-size="11" fill="#6b7280">AI 推荐 / 建图</text>
      <rect x="648" y="216" width="110" height="58" rx="10" fill="#fff" stroke="#6b7280" stroke-width="1.4"/>
      <text x="703" y="240" text-anchor="middle" fill="#374151">华为 Push Kit</text>
      <text x="703" y="258" text-anchor="middle" font-size="11" fill="#6b7280">审核 / 改密通知</text>
    </g>
    <line x1="400" y1="274" x2="400" y2="300" stroke="#6b7280" stroke-width="1.6" marker-end="url(#arr)"/>
    <!-- 前端亮点 -->
    <rect x="52" y="304" width="706" height="54" rx="10" fill="#fef2f2" stroke="#dc2626" stroke-width="1.4"/>
    <text x="400" y="326" text-anchor="middle" font-size="14" font-weight="800" fill="#dc2626">前端可靠性三件套（自研）</text>
    <text x="400" y="346" text-anchor="middle" font-size="12" fill="#7f1d1d">离线队列 + 幂等重发　·　本地缓存兜底断网不白屏　·　AI 结果缓存与模型降级</text>
  </svg>`;
  function openArch() {
    const existing = document.querySelector(".rs-backdrop");
    if (existing && existing.querySelector(".rs-arch")) { existing.remove(); return; }
    if (existing) existing.remove();
    const bd = document.createElement("div");
    bd.className = "rs-backdrop";
    bd.innerHTML = `<div class="rs-arch">
      <button class="rs-close-x">✕</button>
      <h3>📐 整体架构 · 一图讲清</h3>
      <p class="sub">自上而下：多端入口 → Serverless 服务层 → 数据与外部能力 → 前端可靠性。</p>
      ${ARCH_SVG}
      <div class="adv">
        <b>为什么这么设计：</b>
        ① <b>全 Serverless</b>——Pages Functions + D1/R2 零运维、零固定成本，学生项目可长期免费运行；
        ② <b>同源同 API</b>——网页端与鸿蒙 App 走同一套接口，多端同步只需一个 since 增量参数；
        ③ <b>能力即插即用</b>——高德/智谱/推送全部 REST 化封装，任一外部服务故障都有降级路径，不阻塞主流程。
      </div>
    </div>`;
    bd.addEventListener("click", (ev) => { if (ev.target === bd) bd.remove(); });
    bd.querySelector(".rs-close-x").addEventListener("click", () => bd.remove());
    document.body.appendChild(bd);
  }
  dock.querySelector("#rsArchBtn").addEventListener("click", openArch);

  /* ================= 创作团队弹窗 ================= */
  function openTeam() {
    const existing = document.querySelector(".rs-backdrop");
    if (existing && existing.querySelector(".rs-team")) { existing.remove(); return; }
    if (existing) existing.remove();
    const bd = document.createElement("div");
    bd.className = "rs-backdrop";
    bd.innerHTML = `<div class="rs-team">
      <button class="rs-close-x">✕</button>
      <h3>Lumina 团队</h3>
      <p class="sub">清远社区共享地图 · 创作团队与分工</p>
      <div class="rs-team-grid">
        <div class="rs-member lead">
          <span class="rs-mname">林铭坚</span><span class="rs-mid">241733520</span>
          <div class="rs-mrole"><b>项目统筹 · 网页端与云端架构 · AI 向导设计</b><br>项目整体规划与推进，网页端全栈与 Serverless 后端实现，AI 推荐与路线功能设计</div>
        </div>
        <div class="rs-member">
          <span class="rs-mname">林丹苗</span><span class="rs-mid">251733118</span>
          <div class="rs-mrole"><b>私人地图模块</b><br>收藏 / 多人协作 / 只读分享 / 回收站</div>
        </div>
        <div class="rs-member">
          <span class="rs-mname">罗金怡</span><span class="rs-mid">251733104</span>
          <div class="rs-mrole"><b>AI GUIDE 优化训练</b><br>推荐语料与提示词调优、应季推荐策略</div>
        </div>
        <div class="rs-member">
          <span class="rs-mname">王嘉镇</span><span class="rs-mid">241733518</span>
          <div class="rs-mrole"><b>HarmonyOS 鸿蒙端</b><br>移动端开发（待上线）</div>
        </div>
        <div class="rs-member">
          <span class="rs-mname">欧阳浩轩</span><span class="rs-mid">251733533</span>
          <div class="rs-mrole"><b>HarmonyOS 鸿蒙端</b><br>移动端开发（待上线）</div>
        </div>
      </div>
    </div>`;
    bd.addEventListener("click", (ev) => { if (ev.target === bd) bd.remove(); });
    bd.querySelector(".rs-close-x").addEventListener("click", () => bd.remove());
    document.body.appendChild(bd);
  }
  dock.querySelector("#rsTeamBtn").addEventListener("click", openTeam);

  /* ================= 灵感来源弹窗（配色对齐页面奶油底 + 莫兰迪绿 + 珊瑚红点缀） ================= */
  function openInsp() {
    const existing = document.querySelector(".rs-backdrop");
    if (existing && existing.querySelector(".rs-insp")) { existing.remove(); return; }
    if (existing) existing.remove();
    const bd = document.createElement("div");
    bd.className = "rs-backdrop";
    bd.innerHTML = `<div class="rs-insp">
      <button class="rs-close-x">✕</button>
      <p class="rs-eyebrow">INSPIRATION</p>
      <h3>灵感来源 · 三个社会痛点</h3>
      <div class="rs-insp-top">
        <div>
          <p class="rs-insp-sub">本地好去处散在聊天记录、短视频评论和个人收藏里——能看见，却留不住。</p>
          <p class="rs-insp-origin">最初的想法来自当助班的那段日子：想把自己摸出来的吃喝玩乐分享给刚入学的新同学，也希望他们接着往下更新——一张能长大的地图。</p>
          <p class="rs-insp-quote-line">真正有价值的，不是一份静态的商家名单，而是一张由大家共同补充、核验和使用的生活地图。</p>
          <p class="rs-insp-soil">清远恰好提供了这样的土壤：山水景观、地方美食、商业设施、校园与公共服务资源，丰富而分散。</p>
          <div class="rs-insp-chips"><span>聊天记录</span><span>短视频评论</span><span>个人收藏</span></div>
        </div>
        <figure class="rs-insp-figure">
          <img class="rs-insp-map" src="assets/first-map-v1.jpg" alt="2025 年 8 月第一版清远社区地图（易制地图手工标注）">
          <figcaption>2025.08 · 第一版地图（易制地图手工标注）· 点击图片放大</figcaption>
        </figure>
      </div>
      <div class="rs-insp-grid">
        <div class="rs-insp-card"><span class="rs-insp-num">01</span><b>怎么集中呈现</b><p>分散的信息无法按位置和类别组织，找起来只能靠翻记录、碰运气。</p></div>
        <div class="rs-insp-card"><span class="rs-insp-num">02</span><b>怎么低门槛维护</b><p>平台地图只读，居民经验写不进去；写进去的也没人核验、没人纠偏。</p></div>
        <div class="rs-insp-card"><span class="rs-insp-num">03</span><b>怎么快速选到</b><p>信息一多反而更难选，需要的不是更多结果，而是符合当下的那几个。</p></div>
      </div>
      <div class="rs-insp-final">不是在地图上再加几个点，而是让本地信息被 发现 · 补充 · 核验 · 按需重组。</div>
      <p class="rs-insp-foot">清远社区共享地图 · 参赛路演</p>
    </div>`;
    bd.addEventListener("click", (ev) => { if (ev.target === bd) bd.remove(); });
    bd.querySelector(".rs-close-x").addEventListener("click", () => bd.remove());
    document.body.appendChild(bd);
    // 第一版地图：点击放大查看（再点任意处或 Esc 关闭）
    const mapImg = bd.querySelector(".rs-insp-map");
    if (mapImg) {
      mapImg.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const zoom = document.createElement("div");
        zoom.className = "rs-zoom";
        const big = document.createElement("img");
        big.src = mapImg.src;
        big.alt = mapImg.alt;
        zoom.appendChild(big);
        const close = () => { zoom.remove(); document.removeEventListener("keydown", onKey); };
        const onKey = (e) => { if (e.key === "Escape") close(); };
        zoom.addEventListener("click", close);
        document.addEventListener("keydown", onKey);
        document.body.appendChild(zoom);
      });
    }
  }
  dock.querySelector("#rsInspBtn").addEventListener("click", openInsp);

  /* ================= 现在与下一步（S10 收尾页，配色对齐原页面） ================= */
  function openNow() {
    const existing = document.querySelector(".rs-backdrop");
    if (existing && existing.querySelector(".rs-now")) { existing.remove(); return; }
    if (existing) existing.remove();
    const bd = document.createElement("div");
    bd.className = "rs-backdrop";
    bd.innerHTML = `<div class="rs-now">
      <button class="rs-close-x">✕</button>
      <p class="rs-eyebrow">NOW &amp; NEXT</p>
      <h3>现在的样子，下一步</h3>
      <div class="rs-now-grid">
        <div>
          <p class="rs-now-label">已经跑起来的</p>
          <div class="rs-now-item"><span class="rs-now-tag">58 / 6</span><p>58 个居民提交的点位、6 大分类，高德核验命中即自动上线</p></div>
          <div class="rs-now-item"><span class="rs-now-tag">Web 端</span><p>参赛主体是可直接访问的 Web 端；鸿蒙工程已入库，作为原生端扩展的基础</p></div>
          <div class="rs-now-item"><span class="rs-now-tag">全套</span><p>AI 向导、顺路规划、应急地图、离线队列已上线；私人地图的协作与分享仍在完善</p></div>
        </div>
        <div>
          <p class="rs-now-label next">接着要做的</p>
          <div class="rs-now-card"><b>本地数据继续积累</b><span>58 个点位是起点，下一步按街区补全，让地图从「有点」走到「够用」。</span></div>
          <div class="rs-now-card"><b>推荐效果可评价</b><span>目前靠命中情况与人工观察，下一步记录点击与采纳，用数据调推荐。</span></div>
          <div class="rs-now-card"><b>无障碍与移动端</b><span>补键盘操作、对比度与读屏标签；移动端离线与消息推送持续验证。</span></div>
        </div>
      </div>
      <p class="rs-now-foot">清远社区共享地图 · 参赛路演</p>
    </div>`;
    bd.addEventListener("click", (ev) => { if (ev.target === bd) bd.remove(); });
    bd.querySelector(".rs-close-x").addEventListener("click", () => bd.remove());
    document.body.appendChild(bd);
  }

  /* ================= 技术亮点（S9 总结页，每条都有落地实现） ================= */
  function openTech() {
    const existing = document.querySelector(".rs-backdrop");
    if (existing && existing.querySelector(".rs-tech")) { existing.remove(); return; }
    if (existing) existing.remove();
    const bd = document.createElement("div");
    bd.className = "rs-backdrop";
    bd.innerHTML = `<div class="rs-tech">
      <button class="rs-close-x">✕</button>
      <p class="rs-eyebrow">TECHNICAL HIGHLIGHTS</p>
      <h3>技术亮点</h3>
      <p class="rs-sub2">不是演示效果，而是已经写进线上代码的工程约束</p>
      <div class="rs-tech-grid">
        <div class="rs-tech-card">
          <span class="rs-tnum">01</span><b>高德 POI 自动核验</b>
          <p>名称命中高德即自动上线，坐标由 POI 结果自动校正；同名同分类或距离小于 0.001 度直接判重。审核成本从人工逐条转为机器。</p>
          <span class="rs-ttag">自研业务链路</span>
        </div>
        <div class="rs-tech-card">
          <span class="rs-tnum">02</span><b>匿名点评数据层脱敏</b>
          <p>匿名记录在接口层就不返回任何作者字段（无 user_id / 昵称 / 头像），前端拿不到、也无法反查账号；一人一店一条，重复提交即修改。</p>
          <span class="rs-ttag">隐私设计</span>
        </div>
        <div class="rs-tech-card">
          <span class="rs-tnum">03</span><b>弱网不丢数据</b>
          <p>client_token 幂等防重复入库，断网提交进本地队列、联网自动重发；since 增量同步 + 本地缓存兜底，断网展示缓存而不是白屏。</p>
          <span class="rs-ttag">可靠性</span>
        </div>
        <div class="rs-tech-card">
          <span class="rs-tnum">04</span><b>AI 推荐工程化</b>
          <p>相同需求 + 约 1km 视野 24 小时复用缓存，热门问题零模型配额；主模型限流自动降级备用模型，25 秒超时保护，结果暂存刷新可恢复。</p>
          <span class="rs-ttag">AI 工程</span>
        </div>
        <div class="rs-tech-card">
          <span class="rs-tnum">05</span><b>导航埋点与热度闭环</b>
          <p>跳转高德前用 sendBeacon 上报，不阻塞跳转；热度 = 点赞×1 + 点评×2 + 导航×2，真实使用行为直接决定榜单排序。</p>
          <span class="rs-ttag">数据闭环</span>
        </div>
        <div class="rs-tech-card">
          <span class="rs-tnum">06</span><b>自研本地后端模拟器</b>
          <p>线上同一套 API 代码直接跑在 Node：node:sqlite 仿真 D1、文件系统仿真 R2、26 个迁移脚本自动初始化——没有云账号也能全链路调试。</p>
          <span class="rs-ttag">工程效率</span>
        </div>
      </div>
      <div class="rs-tech-final">同样的功能，常规做法要人工审核、二次请求、断网丢单；我们把它们变成规则、缓存和队列——这是这个项目真正的手艺。</div>
      <p class="rs-tech-foot">清远社区共享地图 · 参赛路演</p>
    </div>`;
    bd.addEventListener("click", (ev) => { if (ev.target === bd) bd.remove(); });
    bd.querySelector(".rs-close-x").addEventListener("click", () => bd.remove());
    document.body.appendChild(bd);
  }

  /* ================= 重置演示数据 ================= */
  dock.querySelector("#rsResetDataBtn").addEventListener("click", () => {
    if (!confirm("将清除本地演示数据与登录状态（qingyuan-* 全部本地缓存），并刷新页面。确定？")) return;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("qingyuan-")) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
    location.reload();
  });

  /* ================= 演示账号自动填充（登录弹窗） ================= */
  // 账号取本地演示数据里的演示账号，密码直接读自演示存储，保证与数据一致；仅本地生效。
  // 8788（真实后端模拟）等其它环境若没有对应演示账号缓存，则不填充。
  let demoLogin = null;
  try {
    const rawStore = JSON.parse(localStorage.getItem("qingyuan-demo-store") || "null");
    const cand = rawStore && Array.isArray(rawStore.users) && rawStore.users.find((u) => u.username === "chen_foodie");
    if (window.QYDemo && cand && typeof cand.password === "string" && cand.password) {
      demoLogin = { username: "chen_foodie", password: cand.password };
    }
  } catch { /* 忽略 */ }
  if (demoLogin) {
    setInterval(() => {
      const backdrop = document.querySelector("#authBackdrop");
      if (!backdrop || backdrop.hidden) return;
      const submitText = document.querySelector("#authSubmitText");
      if (submitText && !submitText.textContent.includes("登录")) return; // 注册模式不自动填充
      const userField = document.querySelector("#authForm input[name=username]");
      const passField = document.querySelector("#authPassword");
      if (userField && passField && !userField.value && !passField.value) {
        userField.value = demoLogin.username;
        passField.value = demoLogin.password;
      }
    }, 400);
  }

  /* ================= 快捷键 ================= */
  document.addEventListener("keydown", (ev) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) return;
    const k = ev.key.toLowerCase();
    if (k === "a") { annotationsOn = !annotationsOn; allChip.classList.toggle("off", !annotationsOn); if (!annotationsOn) hideCard(); repositionAll(); }
    if (k === "t") panel.classList.toggle("open");
    if (k === "g") openArch();
  });

  buildBadges();
  repositionAll();
})();
