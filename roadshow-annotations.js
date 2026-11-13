/* 路演批注系统（仅本地生效，绝不影响线上）
 * 生效条件：hostname 为 localhost / 127.0.0.1 且未带 ?roadshow=0；
 * 部署到 Cloudflare 后此脚本自动静默，无任何 DOM 操作。
 *
 * 功能：
 *  - 四色批注：功能【蓝】架构【绿】技术【橙】路演【红】，锚定到页面元素，默认折叠成小号牌，
 *    悬停/点击展开详情卡，不遮挡主体内容
 *  - 12 分钟时间轴面板：10 段切片 + 倒计时计时器，自动高亮当前段落
 *  - 架构图弹窗：简易分层逻辑图 + 设计优势
 *  - 演示工具坞：批注显隐、分类过滤、演示数据重置
 *  - 快捷键：A 批注显隐 / T 时间轴 / G 架构图
 */
(function () {
  "use strict";

  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  if (new URLSearchParams(location.search).get("roadshow") === "0") return;

  /* ================= 类型配色 ================= */
  const TYPE = {
    feature: { label: "功能", color: "#1d4ed8", bg: "#eff6ff", border: "#bfdbfe" },
    arch:    { label: "架构", color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
    tech:    { label: "技术", color: "#c2410c", bg: "#fff7ed", border: "#fed7aa" },
    tip:     { label: "路演", color: "#dc2626", bg: "#fef2f2", border: "#fecaca" }
  };

  /* ================= 12 分钟时间轴（与 docs/路演脚本-12分钟.md 一一对应） ================= */
  const TIMELINE = [
    { no: 1, t: "0:00–0:40", secs: 40, title: "开场与项目定位", page: "主页品牌区", level: "主线",
      steps: ["指品牌区「清远 · 社区共享地图」", "念统计数字：已收录点位 / 6 大分类"],
      talk: ["痛点：本地好去处散在群聊、朋友圈，看完就沉底，没有一张能沉淀、能搜索的社区地图。",
             "一句话定位：居民随手提交，系统自动核验，所有人共享的清远私藏地图。"] },
    { no: 2, t: "0:40–2:00", secs: 80, title: "整体架构总览", page: "顶栏 → 架构图弹窗", level: "主线",
      steps: ["点工具坞「架构图」按钮", "按 前端 → 服务层 → 数据/AI层 顺序指讲"],
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
      steps: ["再点工具坞「架构图」，指三条链路收束"],
      talk: ["三件套：① 离线队列 + 幂等重发，弱网不丢数据；② 匿名点评数据层脱敏；③ AI 结果缓存与降级，限流不白屏。",
             "自研本地完整后端模拟器：线上同一套 API 代码跑在 Node 上，D1/R2 全仿真——开发即测试。"] },
    { no: 10, t: "11:30–12:00", secs: 30, title: "收尾与愿景", page: "回到品牌区", level: "主线",
      steps: ["滚回页面顶部收尾"],
      talk: ["下一步：推荐结果结构化返回、路线跨端同步、鸿蒙 App 与网页端同源同 API。",
             "谢谢各位评委，欢迎体验线上版。"] }
  ];
  const OPTIONAL_NOTE = {
    title: "备选补充（超时直接跳过）",
    items: ["管理后台：六大板块 + Chart.js 数据概览（约 2 分钟）",
            "注册页：手机号实时查重、三档强度条、人机验证双模",
            "位置纠偏：拖动标记修正坐标 → 管理员确认",
            "最近加入页 / 全部地点页、离线队列实机断网演示"]
  };

  /* ================= 批注配置（按页面） ================= */
  const IS_ADMIN = Boolean(document.querySelector(".admin-shell"));

  const INDEX_ANNOTATIONS = [
    { no: "S1", type: "feature", anchor: ".intro-panel", side: "right", title: "开场：项目定位",
      lines: ["痛点：清远的好去处散在群聊、朋友圈，没有一张能沉淀、能搜索的社区地图。",
              "特色：居民共建 + 高德自动核验 + AI 推荐，三位一体。基础必选=浏览/提交/审核；亮点=AI 向导/匿名点评/应急地图；拓展=私人地图协作分享、多端离线同步。"],
      talk: ["「大家共建、AI 把关、人人共享」——这句开场定住全篇基调。"] },
    { no: "S1", type: "tip", anchor: ".intro-panel", side: "left", title: "0:40 前切架构",
      lines: ["必讲主线：指品牌区 → 念统计 → 一句定位。"],
      steps: ["开场 40 秒内完成", "随即点工具坞「架构图」进入 S2"] },
    { no: "S2", type: "arch", anchor: ".topbar", side: "left", title: "整体架构总览",
      lines: ["前端：原生 HTML/CSS/JS（零框架），液态玻璃为纯视觉 Web Component，失败自动降级。",
              "后端：Cloudflare Pages Functions 无框架路由，70+ REST 接口一套代码同源服务网页端与鸿蒙 App。",
              "存储：D1(SQLite) 26 个迁移脚本管演进；R2 存图片；高德 REST / 智谱 AI / 华为 Push 即插即用。"],
      talk: ["为什么这么设计：Serverless 零运维零成本起步；前后端同构一套接口，多端同步天然成立。"] },
    { no: "S3", type: "feature", anchor: ".map-panel", side: "left", title: "地图浏览与分类筛选",
      lines: ["六大分类莫兰迪色系图钉（Google Maps 风格水滴形 + 高亮脉冲光环），点击图钉出弹窗、一键导航。",
              "分类筛选即点即筛，筛选逻辑交给后端 SQL，前端零运算。"] },
    { no: "S3", type: "tech", anchor: ".map-legend", side: "left", title: "地图技术点",
      lines: ["高德 JS API 2.0；图钉为自绘 SVG（分类色圆头 + 白图标 + 落地投影）。",
              "fields=map 轻量字段一次拉全量坐标，列表分页不影响地图完整展示。",
              "向导区小地图强制 Canvas2D 渲染，绕开 Windows Chrome WebGPU 二次调用失败导致的空白画布。"] },
    { no: "S3", type: "feature", anchor: ".recent-panel", side: "left", title: "热门地点榜 + 后端搜索",
      lines: ["综合热度 = 点赞×1 + 点评×2 + 导航×2，导航多的地点自动靠前，把「用得多的」推给新用户。",
              "后端真分页翻页不卡顿；关键词 SQL 匹配名称与简介，输入 250ms 防抖。",
              "卡片：封面锚点（无图用分类色渐变占位）+ 星级均分 + 子标签行，视觉信息一眼读完。"] },
    { no: "S3", type: "tip", anchor: ".recent-panel", side: "right", title: "演示操作顺序",
      steps: ["① 点分类筛选「美食」", "② 搜索框输入「鸡」", "③ 点第一张卡进详情（接 S4）"],
      lines: ["必讲主线；此段约 100 秒，超时砍掉搜索演示只留筛选。"] },
    { no: "S4", type: "feature", anchor: "#detailPanel", side: "right", title: "详情就地面板",
      lines: ["点详情不弹窗：左侧 hero 就地切换，右侧地图保留定位、图钉高亮——浏览动线不中断。",
              "评分摘要（星级 + 均分 + 条数）来自列表接口子查询聚合，无二次请求。",
              "点评一人一店一条，再次提交即修改；社区照片墙自动轮播 + 灯箱放大，任何人可补图。"] },
    { no: "S4", type: "tech", anchor: "#detailPanel", side: "left", title: "匿名点评的隐私设计",
      lines: ["核心亮点：匿名点评后端不返回任何作者字段（无 user_id / 昵称 / 头像），数据层面无法反查账号。",
              "配套：公开主页只聚合非匿名点评；对外一律展示「昵称 + 用户 ID」，username 不出接口。",
              "写入限流每账号 20 条/小时防刷。"] },
    { no: "S5", type: "feature", anchor: "#addSpotButton", side: "right", title: "提交点位：自动核验",
      lines: ["填写名称/地址/简介，多图上传（10 张 / 20MB，第一张作封面）。",
              "高德自动核验：名称命中 POI 即自动上线免人工审核，坐标由高德结果自动校正。",
              "子标签创建即沉淀：建议来自该分类现存标签聚合 + 预设 + 自定义，用得越多标签体系越准。"],
      talk: ["这是「社区共建」的关键设计：把审核成本从人转到机器，UGC 门槛降到最低。"] },
    { no: "S5", type: "tech", anchor: "#modalBackdrop .modal", side: "left", title: "提交链路的三道保险",
      lines: ["重复拦截：同名同分类或坐标距离 < 0.001 度判重。",
              "client_token 幂等：同一条提交重复发送只写一次。",
              "断网队列：离线提交先入队，联网自动重发；列表数据本地缓存兜底，断网不白屏。"] },
    { no: "S6", type: "feature", anchor: ".recommend-panel", side: "right", title: "AI 向导 Lumina",
      lines: ["自然语言提问（智谱 glm）→ 中文推荐文案 + 地图高亮对应点位。",
              "路线小地图：推荐点按最近邻贪心排序，蓝色虚线连成游览路线 + 序号标记。",
              "「编辑路线」面板：↑↓ 调序 / 移除 / 添加，右侧大地图橙色路线实时重画，暂存后刷新可恢复。"] },
    { no: "S6", type: "tech", anchor: ".recommend-panel", side: "left", title: "AI 工程化三件套",
      lines: ["结果缓存：相同需求 + 约 1km 精度视野 24h 内复用，热门问题零模型配额、秒回。",
              "季节推荐：按当前月份把应季主题排最前并高亮，一键触发。",
              "稳定性：主模型限流自动降级备用模型，25 秒超时保护。"] },
    { no: "S6", type: "tip", anchor: ".recommend-panel", side: "right", title: "⚠ 本段最容易卡壳",
      lines: ["AI 首次调用约 3–8 秒：等待期主动讲「模型正在整理游览路线」+ 顺带讲季节推荐。",
              "若限流/超时：改讲结果缓存与暂存恢复机制，或直接点季节按钮走缓存结果。"],
      steps: ["上台前 10 分钟用演示问题调一次预热缓存", "提前把推荐结果暂存，刷新可自动恢复兜底"] },
    { no: "S7", type: "feature", anchor: "#privatePanel", side: "right", title: "私人地图体系",
      lines: ["多主题地图 + 收藏多图选择器（可当场新建，重复收藏有提示）。",
              "地图详情：就地改名、点位清单、顺路规划（收藏点串成路线画在小地图）。",
              "多人协作：按用户名/昵称添加，撞名出候选；协作者不能删图/分享/管理成员。",
              "只读分享：令牌链接不含个人信息，撤销即失效；回收站软删除 30 天可恢复。",
              "AI 建图：输入主题，AI 从已上线点位挑 2–8 个自动建图。"] },
    { no: "S7", type: "tip", anchor: "#privatePanel", side: "left", title: "前置条件提醒",
      steps: ["上台前用演示账号登录好", "预先建一张地图并收藏 3–4 个点位", "收藏操作要在热门卡片的「⋯」菜单里找"] },
    { no: "S8", type: "feature", anchor: "#emergencyButton", side: "left", title: "应急地图（亮点）",
      lines: ["一键定位附近 3 公里警察局/医院/消防/避难所，彩色标记 + 导航。",
              "求救信息自带定位链接，可复制发送；110/120/119 一键拨号；联系人只存本机不上传。",
              "应急分类刻意用高饱和安全色，与莫兰迪内容色系区分——设计即语义。"] },
    { no: "S8", type: "tip", anchor: "#emergencyButton", side: "right", title: "60 秒讲完即走",
      lines: ["亮点段：讲「灾难场景 + 隐私自持」两点即可，设施搜索过程一笔带过。"] }
  ];

  const ADMIN_ANNOTATIONS = [
    { no: "备", type: "feature", anchor: ".admin-tabs", side: "right", title: "管理后台六大板块",
      lines: ["待审核 / 全部点位 / 举报 / 账号密码 / 位置纠偏 / 诊断工具，管理闭环。",
              "全部点位页：Chart.js 分类分布 + 热度 Top10 三段堆叠图；行内修改分类与子标签，失焦即保存并触发增量同步。"] },
    { no: "备", type: "tech", anchor: "#panel-spots", side: "right", title: "后台数据能力",
      lines: ["热度公式与前台一致（点赞×1 + 点评×2 + 导航×2）；子标签总览点击即筛。",
              "删除违规内容级联清理点评/点赞/举报/收藏，不留孤儿数据。"] },
    { no: "备", type: "tip", anchor: ".token-bar", side: "left", title: "备选演示（超时跳过）",
      lines: ["本地演示密钥：local-admin（本地模拟环境默认值）。",
              "建议只展示「② 全部点位」的图表 30 秒；时间紧张整段跳过。"] }
  ];

  const ANNOTATIONS = IS_ADMIN ? ADMIN_ANNOTATIONS : INDEX_ANNOTATIONS;

  /* ================= 样式注入 ================= */
  const CSS = `
#rsDock, #rsDock * , .rs-badge, .rs-card, .rs-timeline, .rs-arch, .rs-arch * { box-sizing: border-box; font-family: "PingFang SC","Microsoft YaHei",system-ui,sans-serif; }
.rs-badge { position: fixed; z-index: 99998; display: flex; align-items: center; gap: 4px; height: 24px; padding: 0 9px 0 5px; border-radius: 999px; border: 1.5px solid; font-size: 12px; font-weight: 700; cursor: pointer; user-select: none; background: rgba(255,255,255,.92); box-shadow: 0 2px 8px rgba(0,0,0,.14); transition: transform .12s ease; }
.rs-badge:hover { transform: scale(1.06); }
.rs-badge .rs-no { font-size: 10px; font-weight: 800; padding: 1px 5px; border-radius: 999px; color: #fff; }
.rs-badge.rs-hidden { display: none; }
.rs-card { position: fixed; z-index: 100000; max-width: 380px; background: #fff; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,.22); border: 1px solid #e5e7eb; padding: 14px 16px; font-size: 12.5px; line-height: 1.75; color: #1f2937; }
.rs-card h4 { margin: 0 0 6px; font-size: 14px; display: flex; align-items: center; gap: 8px; }
.rs-card .rs-tag { font-size: 10px; font-weight: 800; color: #fff; padding: 2px 8px; border-radius: 999px; }
.rs-card .rs-seg { font-size: 10px; color: #6b7280; font-weight: 600; }
.rs-card ul { margin: 4px 0; padding-left: 18px; }
.rs-card li { margin: 2px 0; }
.rs-card .rs-talk { background: #f9fafb; border-left: 3px solid #9ca3af; padding: 6px 10px; border-radius: 6px; margin-top: 8px; color: #374151; }
.rs-card .rs-talk b { color: #111827; }
.rs-pin-close { position: absolute; top: 6px; right: 10px; cursor: pointer; color: #9ca3af; font-size: 14px; }
#rsDock { position: fixed; right: 16px; bottom: 16px; z-index: 100001; }
#rsDockBtn { display: flex; align-items: center; gap: 6px; border: none; cursor: pointer; background: #111827; color: #fff; font-size: 13px; font-weight: 700; padding: 10px 16px; border-radius: 999px; box-shadow: 0 6px 20px rgba(0,0,0,.28); }
#rsDockBtn .rs-timer { font-variant-numeric: tabular-nums; background: #dc2626; padding: 1px 8px; border-radius: 999px; font-size: 12px; }
#rsDockBtn .rs-timer.running { background: #059669; }
#rsPanel { display: none; position: absolute; right: 0; bottom: 46px; width: 360px; max-height: 74vh; overflow: auto; background: #fff; border-radius: 14px; border: 1px solid #e5e7eb; box-shadow: 0 14px 50px rgba(0,0,0,.25); padding: 14px; }
#rsPanel.open { display: block; }
#rsPanel h3 { margin: 0 0 10px; font-size: 15px; }
.rs-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.rs-chip { border: 1.5px solid #d1d5db; background: #fff; color: #374151; font-size: 11.5px; font-weight: 700; padding: 4px 10px; border-radius: 999px; cursor: pointer; }
.rs-chip.off { opacity: .35; }
.rs-actions { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.rs-btn { border: none; cursor: pointer; font-size: 12px; font-weight: 700; padding: 7px 12px; border-radius: 8px; background: #111827; color: #fff; }
.rs-btn.green { background: #059669; } .rs-btn.red { background: #dc2626; } .rs-btn.gray { background: #6b7280; }
.rs-segitem { border: 1px solid #e5e7eb; border-radius: 10px; padding: 9px 11px; margin-bottom: 8px; background: #fafafa; }
.rs-segitem.current { border-color: #dc2626; background: #fef2f2; box-shadow: 0 0 0 2px rgba(220,38,38,.12); }
.rs-segitem .rs-seghead { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
.rs-segitem .rs-segtitle { font-size: 12.5px; font-weight: 800; color: #111827; }
.rs-segitem .rs-segtime { font-size: 11px; color: #6b7280; font-variant-numeric: tabular-nums; }
.rs-lv { font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 999px; color: #fff; background: #6b7280; }
.rs-lv.hot { background: #dc2626; }
.rs-segitem ul { margin: 5px 0 0; padding-left: 17px; font-size: 11.5px; color: #374151; line-height: 1.65; }
.rs-opt { background: #f3f4f6; border-radius: 8px; padding: 8px 10px; font-size: 11.5px; color: #4b5563; line-height: 1.7; }
.rs-backdrop { position: fixed; inset: 0; z-index: 100002; background: rgba(17,24,39,.55); display: flex; align-items: center; justify-content: center; }
.rs-arch { background: #fff; border-radius: 16px; max-width: 860px; width: 92vw; max-height: 88vh; overflow: auto; padding: 22px 26px; }
.rs-arch h3 { margin: 0 0 4px; font-size: 18px; }
.rs-arch .sub { color: #6b7280; font-size: 12px; margin-bottom: 14px; }
.rs-arch svg { width: 100%; height: auto; display: block; }
.rs-arch .adv { margin-top: 14px; border-top: 1px dashed #d1d5db; padding-top: 12px; font-size: 12.5px; line-height: 1.8; color: #374151; }
.rs-arch .adv b { color: #15803d; }
.rs-close-x { float: right; border: none; background: none; font-size: 20px; cursor: pointer; color: #6b7280; }
`;
  const styleEl = document.createElement("style");
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  /* ================= 状态 ================= */
  const visibleTypes = { feature: true, arch: true, tech: true, tip: true };
  let annotationsOn = true;
  let pinnedCard = null;      // 被点击固定的批注
  let hoverCard = null;       // 悬停临时显示的批注

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
      el.addEventListener("mouseleave", () => { if (!pinnedCard || pinnedCard.ann !== ann) hideCard(); });
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (pinnedCard && pinnedCard.ann === ann) { hideCard(); }
        else { showCard(ann, el, true); }
      });
      document.body.appendChild(el);
      badgeEls.push({ ann, el });
    });
    document.addEventListener("click", (ev) => {
      if (pinnedCard && !pinnedCard.cardEl.contains(ev.target)) hideCard();
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
    if (right) { x = Math.min(r.right + 6, window.innerWidth - 260); y = r.top + 2; }
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

  /* ================= 详情卡 ================= */
  function showCard(ann, badgeEl, pin) {
    hideCard();
    const t = TYPE[ann.type];
    const card = document.createElement("div");
    card.className = "rs-card";
    let html = `<span class="rs-pin-close" data-close>✕</span><h4><span class="rs-tag" style="background:${t.color}">${t.label}</span>${ann.title}<span class="rs-seg">${ann.no}</span></h4>`;
    if (ann.lines) html += `<ul>${ann.lines.map((l) => `<li>${l}</li>`).join("")}</ul>`;
    if (ann.steps) html += `<div class="rs-talk"><b>操作步骤</b><ul>${ann.steps.map((s) => `<li>${s}</li>`).join("")}</ul></div>`;
    if (ann.talk) html += `<div class="rs-talk"><b>话术要点</b><ul>${ann.talk.map((s) => `<li>${s}</li>`).join("")}</ul></div>`;
    card.innerHTML = html;
    card.querySelector("[data-close]").addEventListener("click", hideCard);
    document.body.appendChild(card);
    const r = badgeEl.getBoundingClientRect();
    let x = r.left, y = r.bottom + 6;
    if (x + 390 > window.innerWidth) x = window.innerWidth - 396;
    if (y + card.offsetHeight > window.innerHeight - 8) y = Math.max(8, r.top - card.offsetHeight - 6);
    card.style.left = `${Math.round(Math.max(8, x))}px`;
    card.style.top = `${Math.round(y)}px`;
    if (pin) pinnedCard = { ann, cardEl: card }; else hoverCard = card;
  }
  function hideCard() {
    if (hoverCard) { hoverCard.remove(); hoverCard = null; }
    if (pinnedCard) { pinnedCard.cardEl.remove(); pinnedCard = null; }
  }

  /* ================= 工具坞 ================= */
  const dock = document.createElement("div");
  dock.id = "rsDock";
  dock.innerHTML = `
    <div id="rsPanel">
      <h3>🎬 路演助手 <span style="font-size:11px;color:#6b7280;font-weight:600">12 分钟 · 10 段主线 + 备选</span></h3>
      <div class="rs-actions">
        <button class="rs-btn" id="rsArchBtn">📐 架构图</button>
        <button class="rs-btn" id="rsStartBtn">▶ 计时</button>
        <button class="rs-btn gray" id="rsResetTimerBtn">⟲ 归零</button>
        <button class="rs-btn red" id="rsResetDataBtn">🗑 重置演示数据</button>
      </div>
      <div class="rs-row" id="rsTypeChips"></div>
      <div id="rsTimeline"></div>
      <div class="rs-opt" id="rsOptional"><b>${OPTIONAL_NOTE.title}</b><br>${OPTIONAL_NOTE.items.join("<br>")}</div>
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

  // 时间轴
  const tlBox = dock.querySelector("#rsTimeline");
  TIMELINE.forEach((seg) => {
    const item = document.createElement("div");
    item.className = "rs-segitem";
    item.dataset.secs = TIMELINE.slice(0, TIMELINE.indexOf(seg)).reduce((a, s) => a + s.secs, 0);
    const hot = seg.level.includes("重点") || seg.level.includes("亮点");
    item.innerHTML = `
      <div class="rs-seghead">
        <span class="rs-segtitle">S${seg.no} ${seg.title}</span>
        <span class="rs-segtime">${seg.t}</span>
        <span class="rs-lv ${hot ? "hot" : ""}">${seg.level}</span>
      </div>
      <ul><li>页面：${seg.page}</li>${seg.steps.map((s) => `<li>▸ ${s}</li>`).join("")}</ul>
      <ul>${seg.talk.map((s) => `<li>💬 ${s}</li>`).join("")}</ul>`;
    tlBox.appendChild(item);
  });

  // 面板开合
  const panel = dock.querySelector("#rsPanel");
  dock.querySelector("#rsDockBtn").addEventListener("click", () => panel.classList.toggle("open"));

  /* ================= 倒计时 ================= */
  const TOTAL = 720; // 12 分钟
  let remain = TOTAL, timerId = null;
  const timerEl = dock.querySelector("#rsTimer");
  const startBtn = dock.querySelector("#rsStartBtn");
  function renderTimer() {
    const m = Math.floor(remain / 60), s = remain % 60;
    timerEl.textContent = `${m}:${String(s).padStart(2, "0")}`;
  }
  // 高亮当前段：按已用时间匹配
  function highlightCurrent() {
    const elapsed = TOTAL - remain;
    const items = tlBox.querySelectorAll(".rs-segitem");
    let currentIdx = -1;
    let acc = 0;
    TIMELINE.forEach((seg, i) => { if (elapsed >= acc && elapsed < acc + seg.secs) currentIdx = i; acc += seg.secs; });
    items.forEach((item, i) => item.classList.toggle("current", timerId !== null && i === currentIdx));
  }
  function renderAll() { renderTimer(); highlightCurrent(); }
  renderTimer();
  startBtn.addEventListener("click", () => {
    if (timerId) { clearInterval(timerId); timerId = null; startBtn.textContent = "▶ 计时"; timerEl.classList.remove("running"); }
    else {
      timerId = setInterval(() => {
        remain = Math.max(0, remain - 1); renderAll();
        if (remain === 0) { clearInterval(timerId); timerId = null; startBtn.textContent = "▶ 计时"; timerEl.classList.remove("running"); }
      }, 1000);
      startBtn.textContent = "⏸ 暂停"; timerEl.classList.add("running");
    }
    highlightCurrent();
  });
  dock.querySelector("#rsResetTimerBtn").addEventListener("click", () => {
    if (timerId) { clearInterval(timerId); timerId = null; startBtn.textContent = "▶ 计时"; timerEl.classList.remove("running"); }
    remain = TOTAL; renderAll();
  });

  /* ================= 架构图弹窗 ================= */
  const ARCH_SVG = `
  <svg viewBox="0 0 800 430" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L7,3 L0,6 Z" fill="#6b7280"/></marker>
    </defs>
    <text x="400" y="22" text-anchor="middle" font-size="14" font-weight="800" fill="#111827">清远社区共享地图 · 系统架构</text>
    <!-- 三端 -->
    <g font-size="12" font-weight="700">
      <rect x="80" y="42" width="180" height="52" rx="10" fill="#eff6ff" stroke="#1d4ed8" stroke-width="1.5"/>
      <text x="170" y="64" text-anchor="middle" fill="#1d4ed8">网页端（演示主体）</text>
      <text x="170" y="82" text-anchor="middle" font-size="10" fill="#4b5563">原生 HTML/JS · 零框架</text>
      <rect x="310" y="42" width="180" height="52" rx="10" fill="#f9fafb" stroke="#9ca3af" stroke-dasharray="4 3"/>
      <text x="400" y="64" text-anchor="middle" fill="#4b5563">HarmonyOS App</text>
      <text x="400" y="82" text-anchor="middle" font-size="10" fill="#9ca3af">同源同 API（规划中）</text>
      <rect x="540" y="42" width="180" height="52" rx="10" fill="#eff6ff" stroke="#1d4ed8" stroke-width="1.5"/>
      <text x="630" y="64" text-anchor="middle" fill="#1d4ed8">管理后台 admin.html</text>
      <text x="630" y="82" text-anchor="middle" font-size="10" fill="#4b5563">六板块 · Chart.js 概览</text>
    </g>
    <line x1="400" y1="94" x2="400" y2="126" stroke="#6b7280" stroke-width="1.6" marker-end="url(#arr)"/>
    <text x="412" y="114" font-size="10" fill="#6b7280">HTTPS / JSON（密钥全走 secrets，不入代码）</text>
    <!-- 服务层 -->
    <rect x="140" y="130" width="520" height="56" rx="10" fill="#f0fdf4" stroke="#15803d" stroke-width="1.5"/>
    <text x="400" y="152" text-anchor="middle" font-size="12.5" font-weight="800" fill="#15803d">Cloudflare Pages Functions（Serverless · 无框架路由）</text>
    <text x="400" y="172" text-anchor="middle" font-size="10" fill="#374151">70+ REST 接口一套代码 · 增量同步 since · 写入限流 · client_token 幂等</text>
    <line x1="400" y1="186" x2="400" y2="212" stroke="#6b7280" stroke-width="1.6" marker-end="url(#arr)"/>
    <!-- 数据与外部能力 -->
    <g font-size="11" font-weight="700">
      <rect x="52" y="216" width="158" height="58" rx="10" fill="#fff7ed" stroke="#c2410c" stroke-width="1.4"/>
      <text x="131" y="240" text-anchor="middle" fill="#c2410c">D1 · SQLite</text>
      <text x="131" y="258" text-anchor="middle" font-size="9.5" fill="#6b7280">26 个迁移脚本演进</text>
      <rect x="222" y="216" width="130" height="58" rx="10" fill="#fff7ed" stroke="#c2410c" stroke-width="1.4"/>
      <text x="287" y="240" text-anchor="middle" fill="#c2410c">R2 · 图片存储</text>
      <text x="287" y="258" text-anchor="middle" font-size="9.5" fill="#6b7280">多图 / 头像校验</text>
      <rect x="364" y="216" width="130" height="58" rx="10" fill="#fff" stroke="#6b7280" stroke-width="1.4"/>
      <text x="429" y="240" text-anchor="middle" fill="#374151">高德 REST</text>
      <text x="429" y="258" text-anchor="middle" font-size="9.5" fill="#6b7280">POI 自动核验</text>
      <rect x="506" y="216" width="130" height="58" rx="10" fill="#fff" stroke="#6b7280" stroke-width="1.4"/>
      <text x="571" y="240" text-anchor="middle" fill="#374151">智谱 GLM</text>
      <text x="571" y="258" text-anchor="middle" font-size="9.5" fill="#6b7280">AI 推荐 / 建图</text>
      <rect x="648" y="216" width="110" height="58" rx="10" fill="#fff" stroke="#6b7280" stroke-width="1.4"/>
      <text x="703" y="240" text-anchor="middle" fill="#374151">华为 Push Kit</text>
      <text x="703" y="258" text-anchor="middle" font-size="9.5" fill="#6b7280">审核 / 改密通知</text>
    </g>
    <line x1="400" y1="274" x2="400" y2="300" stroke="#6b7280" stroke-width="1.6" marker-end="url(#arr)"/>
    <!-- 前端亮点 -->
    <rect x="52" y="304" width="706" height="54" rx="10" fill="#fef2f2" stroke="#dc2626" stroke-width="1.4"/>
    <text x="400" y="326" text-anchor="middle" font-size="12" font-weight="800" fill="#dc2626">前端可靠性三件套（自研）</text>
    <text x="400" y="346" text-anchor="middle" font-size="10.5" fill="#7f1d1d">离线队列 + 幂等重发　·　本地缓存兜底断网不白屏　·　AI 结果缓存与模型降级</text>
    <!-- 本地模拟 -->
    <rect x="52" y="372" width="706" height="44" rx="10" fill="#f3f4f6" stroke="#9ca3af" stroke-dasharray="5 3"/>
    <text x="400" y="392" text-anchor="middle" font-size="11" font-weight="700" fill="#4b5563">本地模拟环境（本次路演）：serve_local.py 静态服务 + demo-data.js 兜底</text>
    <text x="400" y="408" text-anchor="middle" font-size="9.5" fill="#9ca3af">另有 local_backend_server.mjs：线上同一套 API 代码跑在 Node（node:sqlite 模拟 D1 / 文件系统模拟 R2）</text>
  </svg>`;
  function openArch() {
    let bd = document.querySelector(".rs-backdrop");
    if (bd) { bd.remove(); return; }
    bd = document.createElement("div");
    bd.className = "rs-backdrop";
    bd.innerHTML = `<div class="rs-arch">
      <button class="rs-close-x">✕</button>
      <h3>📐 整体架构 · 一图讲清</h3>
      <p class="sub">自上而下：多端入口 → Serverless 服务层 → 数据与外部能力 → 前端可靠性。讲架构时按箭头顺序指。</p>
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
