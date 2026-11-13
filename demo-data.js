/* 本地预览演示数据：当 /api 后端不可达（例如用 serve_local.py / python -m http.server 做
 * 纯静态预览）时，app.js 的 apiFetch 会自动切换到本模块，让评分、大众点评（匿名 / 实名）、
 * 用户主页、资料设置等功能在没有 Cloudflare 后端的情况下也能完整体验。
 * 线上环境后端正常时本模块不会被触发，不影响生产逻辑。
 * 演示数据保存在 localStorage（key: qingyuan-demo-store），刷新不丢失。 */
(function () {
  "use strict";

  const STORE_KEY = "qingyuan-demo-store";
  const DEMO_TOKEN = "demo-token";
  // 演示数据版本号：变更种子数据时同步更新，本地缓存旧版本会自动重置为新种子（保留登录用户）
  const SEED_VERSION = "2026-11-13-r2";

  /* ---------------- 演示数据种子 ---------------- */
  // 演示账号统一密码（仅存在于本地演示环境，线上不使用）：
  const DEMO_PASSWORD = "demo123456";
  // 手机号归一化与脱敏：与真实后端规则一致
  function normalizePhone(value) {
    let phone = String(value ?? "").replace(/[\s-]/g, "");
    if (/^\+?86(?=\d{11}$)/.test(phone)) phone = phone.replace(/^\+?86/, "");
    return /^1[3-9]\d{9}$/.test(phone) ? phone : null;
  }
  function maskPhone(phone) { return phone ? `${String(phone).slice(0, 3)}****${String(phone).slice(-4)}` : null; }
  const seedUsers = [
    { id: 1, username: "chen_foodie", nickname: "北江食客", avatar_url: null, password: DEMO_PASSWORD, phone: "13812340001", created_at: "2026-08-12 09:20:00" },
    { id: 2, username: "lq_local", nickname: "清远小灵通", avatar_url: null, password: DEMO_PASSWORD, phone: "13812340002", created_at: "2026-08-30 21:04:00" },
    { id: 3, username: "may_eats", nickname: "阿May食记", avatar_url: null, password: DEMO_PASSWORD, phone: "13812340003", created_at: "2026-09-05 12:40:00" },
    { id: 4, username: "hiker_lin", nickname: "山系少年", avatar_url: null, password: DEMO_PASSWORD, phone: "13812340004", created_at: "2026-09-18 08:15:00" },
    { id: 5, username: "laoqingyuan", nickname: "老清远", avatar_url: null, password: DEMO_PASSWORD, phone: "13812340005", created_at: "2026-09-26 17:32:00" },
    { id: 6, username: "zhouxin_gm", nickname: "洲心阿婆", avatar_url: null, password: DEMO_PASSWORD, phone: "13812340006", created_at: "2026-10-02 10:10:00" }
  ];

  const seedSpots = [
    { id: 1, name: "老桥饭店", address: "清远市清城区下廓一街", category: "food", tags: ["白切鸡", "老字号", "饭堂"], description: "招牌白切清远鸡，皮爽肉滑，蘸姜葱蓉一流，本地人的饭堂。", lat: 23.6815, lng: 113.0562, image_url: null, likes: 46, user_id: 1, created_at: "2026-10-12 11:30:00" },
    { id: 2, name: "洲心大眼球烧肉粽", address: "清远市清城区洲心街", category: "food", tags: ["烧肉粽", "早餐"], description: "烧肉粽糯米油润，肥肉入口即化，早晨出摊即排队。", lat: 23.6602, lng: 113.0841, image_url: null, likes: 38, user_id: 6, created_at: "2026-10-13 08:05:00" },
    { id: 3, name: "北江河鲜舫", address: "清远市清城区北江一路", category: "food", tags: ["河鲜", "江景"], description: "江景河鲜，边吃边看北江，黄骨鱼和河虾是必点。", lat: 23.6905, lng: 113.0502, image_url: null, likes: 31, user_id: 2, created_at: "2026-10-15 18:40:00" },
    { id: 4, name: "龙塘豆豉鸡大排档", address: "清远市清城区龙塘镇", category: "food", tags: ["大排档", "小炒"], description: "豆豉炒鸡镬气十足，人均 40 吃到扶墙。", lat: 23.6310, lng: 113.1015, image_url: null, likes: 27, user_id: 5, created_at: "2026-10-18 19:12:00" },
    { id: 5, name: "笔架山森林公园", address: "清远市清城区笔架山林场", category: "scenic", tags: ["登山", "亲子"], description: "市区边的登山步道，山顶可俯瞰全城，适合半天轻徒步。", lat: 23.7305, lng: 113.0710, image_url: null, likes: 52, user_id: 4, created_at: "2026-10-20 09:00:00" },
    { id: 6, name: "飞来湖公园", address: "清远市清城区飞来湖", category: "scenic", tags: ["日落", "散步"], description: "环湖绿道加湿地栈道，傍晚看日落的人最多。", lat: 23.6930, lng: 113.0298, image_url: null, likes: 44, user_id: 2, created_at: "2026-10-22 16:20:00" },
    { id: 7, name: "城市广场", address: "清远市清城区先锋中路", category: "shopping", tags: ["老牌商圈"], description: "老牌商圈，吃饭看电影一站解决，周末人多。", lat: 23.6820, lng: 113.0610, image_url: null, likes: 19, user_id: 3, created_at: "2026-10-25 14:45:00" },
    { id: 8, name: "太和古洞", address: "清远市清新区太和古洞旅游区", category: "scenic", tags: ["登山", "避暑"], description: "清幽山谷里的古道观，溪水台阶一路向上，夏天避暑首选。", lat: 23.7120, lng: 113.0180, image_url: null, likes: 35, user_id: 4, created_at: "2026-10-28 10:30:00" },
    { id: 9, name: "清远市人民医院", address: "清远市清城区曙光一路", category: "medical", tags: ["三甲", "急诊"], description: "市区最主要的三甲医院，急诊 24 小时接诊，楼层指引清晰，停车方便。", lat: 23.6902, lng: 113.0451, image_url: null, likes: 41, user_id: 5, created_at: "2026-10-30 09:10:00" },
    { id: 10, name: "清远市第一中学", address: "清远市清城区西门塘", category: "school", tags: ["百年老校", "书香"], description: "百年老校，红砖教学楼与老榕树是几代清远人的共同记忆。", lat: 23.6848, lng: 113.0402, image_url: null, likes: 23, user_id: 2, created_at: "2026-11-01 15:20:00" },
    { id: 11, name: "清远站（高铁）", address: "清远市清城区洲心街", category: "transit", tags: ["高铁", "京广线"], description: "京广高铁清远站，广州 40 分钟直达，站前广场换乘公交出租车都方便。", lat: 23.6520, lng: 113.0910, image_url: null, likes: 34, user_id: 3, created_at: "2026-11-03 11:35:00" },
    { id: 12, name: "黄腾峡漂流", address: "清远市清城区东城街道黄腾峡生态旅游区", category: "scenic", tags: ["漂流", "夏日", "刺激"], description: "华南知名峡谷漂流，落差大水量足，夏天来清远的第一理由。", lat: 23.7610, lng: 113.1020, image_url: null, likes: 61, user_id: 4, created_at: "2026-11-05 10:05:00" },
    { id: 13, name: "清远万达广场", address: "清远市清城区人民二路", category: "shopping", tags: ["新商圈", "亲子", "电影"], description: "新商圈，餐饮影院亲子配套齐全，晚上灯光街好出片。", lat: 23.6880, lng: 113.0628, image_url: null, likes: 28, user_id: 1, created_at: "2026-11-07 19:40:00" },
    { id: 14, name: "连江路宵夜猪杂粥", address: "清远市清城区连江路", category: "food", tags: ["宵夜", "猪杂粥", "镬气"], description: "凌晨两点还坐满街坊，猪杂现切现滚粥，镬气小炒同样在线。", lat: 23.6790, lng: 113.0530, image_url: null, likes: 22, user_id: 6, created_at: "2026-11-09 21:50:00" }
  ];

  // 点评种子：anonymous 为 true 的条目在任何接口都不带作者信息
  const seedReviews = [
    { id: 11, spot_id: 1, user_id: 1, rating: 5, content: "白切鸡皮爽肉滑，鸡味浓，蘸姜葱蓉正到不得了。饭点人多，建议五点半前到。", anonymous: false, created_at: "2026-10-13 12:10:00" },
    { id: 12, spot_id: 1, user_id: 3, rating: 4, content: "鸡是好鸡，环境就是普通大排档，胜在性价比高，人均 50 左右。", anonymous: false, created_at: "2026-10-16 18:55:00" },
    { id: 13, spot_id: 1, user_id: 5, rating: 5, content: "从细食到大嘅味道，葱油鸡也都好食，熟客都知点叫菜。", anonymous: true, created_at: "2026-10-19 19:30:00" },
    { id: 14, spot_id: 1, user_id: 2, rating: 4, content: "周末去要排队，出品稳定，鸡杂粥也值得一试。", anonymous: false, created_at: "2026-10-24 12:40:00" },
    { id: 15, spot_id: 2, user_id: 6, rating: 5, content: "烧肉粽糯米油润，肥肉入口即化，加蛋加绿豆都好食，一个顶饱。", anonymous: false, created_at: "2026-10-14 08:20:00" },
    { id: 16, spot_id: 2, user_id: 4, rating: 4, content: "路过买了一个当早餐，份量扎实，就是排队的人有点多。", anonymous: true, created_at: "2026-10-21 08:15:00" },
    { id: 17, spot_id: 3, user_id: 1, rating: 4, content: "河鲜够新鲜，黄骨鱼豆腐汤鲜甜。坐在江边位要早点去，价格略贵但值。", anonymous: false, created_at: "2026-10-17 19:05:00" },
    { id: 18, spot_id: 3, user_id: 2, rating: 3, content: "风景是真的好，出品看运气，上次河虾不够生猛。", anonymous: true, created_at: "2026-10-23 20:10:00" },
    { id: 19, spot_id: 4, user_id: 5, rating: 5, content: "豆豉香到舔手指，鸡件炒得够镬气，送饭一流。", anonymous: false, created_at: "2026-10-19 20:00:00" },
    { id: 20, spot_id: 4, user_id: 3, rating: 4, content: "大排档环境一般，但味道没得弹，人均 40 仔饱到行唔郁。", anonymous: false, created_at: "2026-10-26 19:25:00" },
    { id: 21, spot_id: 5, user_id: 4, rating: 5, content: "市区就能登山，来回两个半小时，山顶视野一流，记得带水。", anonymous: false, created_at: "2026-10-21 09:40:00" },
    { id: 22, spot_id: 6, user_id: 2, rating: 4, content: "环湖绿道好行，傍晚日落位好出片，周末人多要早点去。", anonymous: false, created_at: "2026-10-23 17:30:00" },
    { id: 23, spot_id: 6, user_id: 1, rating: 5, content: "带小朋友喂鸽子的好地方，晚上湖边吹风好舒服。", anonymous: true, created_at: "2026-10-27 18:20:00" },
    { id: 24, spot_id: 7, user_id: 3, rating: 4, content: "老商圈配套齐全，吃饭选择多，停车周末比较紧张。", anonymous: false, created_at: "2026-10-26 15:10:00" },
    { id: 25, spot_id: 8, user_id: 4, rating: 4, content: "溪水清凉，古道幽静，夏天去最舒服，注意防蚊。", anonymous: false, created_at: "2026-10-29 11:00:00" },
    { id: 26, spot_id: 9, user_id: 2, rating: 5, content: "儿科夜诊效率高，指示牌清楚，全家看病都来这里。", anonymous: false, created_at: "2026-11-02 09:15:00" },
    { id: 27, spot_id: 9, user_id: 4, rating: 4, content: "急诊很快，就是饭点停车场紧张，建议打车来。", anonymous: true, created_at: "2026-11-06 20:30:00" },
    { id: 28, spot_id: 10, user_id: 5, rating: 4, content: "母校，老榕树还在，运动场翻新了，傍晚散步很舒服。", anonymous: false, created_at: "2026-11-03 18:00:00" },
    { id: 29, spot_id: 11, user_id: 3, rating: 4, content: "从广州回来 40 分钟，出站打车进市区十来分钟，很顺。", anonymous: false, created_at: "2026-11-04 14:20:00" },
    { id: 30, spot_id: 12, user_id: 4, rating: 5, content: "全程尖叫，终点池水仗超解压，记得带换洗衣物和手机防水袋。", anonymous: false, created_at: "2026-11-06 17:45:00" },
    { id: 31, spot_id: 12, user_id: 6, rating: 4, content: "刺激是真刺激，排队也真长，建议工作日去。", anonymous: true, created_at: "2026-11-08 12:10:00" },
    { id: 32, spot_id: 13, user_id: 1, rating: 4, content: "周末遛娃首选，四楼餐饮选择多，就是车位紧张。", anonymous: false, created_at: "2026-11-09 13:30:00" },
    { id: 33, spot_id: 14, user_id: 6, rating: 5, content: "猪杂粥鲜到眉毛掉下来，深夜的清远就靠这一口续命。", anonymous: false, created_at: "2026-11-10 23:40:00" }
  ];

  /* ---------------- 存取 ---------------- */
  function defaultStore() {
    return {
      seed_version: SEED_VERSION,
      users: JSON.parse(JSON.stringify(seedUsers)),
      spots: JSON.parse(JSON.stringify(seedSpots)),
      reviews: JSON.parse(JSON.stringify(seedReviews)),
      likedBy: {},
      currentUser: null,
      nextReviewId: 100,
      maps: [],
      mapSpots: {},
      nextMapId: 1,
      collab: {},
      nextUserId: 1000
    };
  }
  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const store = JSON.parse(raw);
        if (store && store.seed_version === SEED_VERSION && Array.isArray(store.spots) && Array.isArray(store.reviews)) {
          // 旧版本演示数据没有私人地图字段，补默认值避免报错
          if (!Array.isArray(store.maps)) store.maps = [];
          if (!store.mapSpots || typeof store.mapSpots !== "object") store.mapSpots = {};
          if (!store.nextMapId) store.nextMapId = 1;
          if (!store.collab || typeof store.collab !== "object") store.collab = {};
          if (!store.nextUserId) store.nextUserId = 1000;
          // 旧版本演示数据没有密码字段，统一补默认密码，保证「登录必须密码正确」对存量数据也生效
          store.users.forEach((user) => { if (typeof user.password !== "string") user.password = DEMO_PASSWORD; });
          return store;
        }
        // 种子数据版本升级：重置为最新演示数据，但保留登录用户（用户名仍存在时）
        const fresh = defaultStore();
        if (store && store.currentUser && store.currentUser.username) {
          const kept = fresh.users.find((u) => u.username === store.currentUser.username);
          if (kept) fresh.currentUser = kept;
        }
        store = fresh;
        persistStore(store);
        return store;
      }
    } catch { /* 存储不可用时回到内存种子 */ }
    return defaultStore();
  }
  let store = loadStore();
  function persistStore(target) { try { localStorage.setItem(STORE_KEY, JSON.stringify(target || store)); } catch { /* 忽略 */ } }
  function persist() { persistStore(); }

  function json(body, status) {
    return new Response(JSON.stringify(body), { status: status || 200, headers: { "Content-Type": "application/json" } });
  }

  // 当前演示登录用户：由 Authorization: Bearer demo-token 识别
  function viewerOf(options) {
    const header = (options && options.headers && (options.headers.Authorization || options.headers.authorization)) || "";
    if (!String(header).includes(DEMO_TOKEN) || !store.currentUser) return null;
    return store.currentUser;
  }

  function spotRating(spotId) {
    const ratings = store.reviews.filter((review) => review.spot_id === spotId).map((review) => review.rating);
    if (!ratings.length) return { avg_rating: null, review_count: 0 };
    const sum = ratings.reduce((total, value) => total + value, 0);
    return { avg_rating: Math.round((sum / ratings.length) * 10) / 10, review_count: ratings.length };
  }

  function withRating(spot) {
    return { ...spot, ...spotRating(spot.id) };
  }

  function userById(id) { return store.users.find((user) => user.id === Number(id)) || null; }

  // 与后端 reviewPublicFields 保持一致：匿名评论不带任何作者信息
  function publicReview(review, viewer) {
    const mine = Boolean(viewer) && review.user_id === viewer.id;
    if (review.anonymous) {
      return { id: review.id, rating: review.rating, content: review.content, anonymous: true, created_at: review.created_at, user: null, mine };
    }
    const author = userById(review.user_id) || { username: "社区成员" };
    return {
      id: review.id,
      rating: review.rating,
      content: review.content,
      anonymous: false,
      created_at: review.created_at,
      user: { id: review.user_id, nickname: author.nickname || author.username, avatar_url: author.avatar_url || null },
      mine
    };
  }

  function parseBody(raw) {
    if (typeof raw !== "string" || !raw) return {};
    try { return JSON.parse(raw); } catch { return {}; }
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("读取图片失败"));
      reader.readAsDataURL(file);
    });
  }

  /* ---------------- 路由 ---------------- */
  async function route(url, method, body, options, viewer) {
    const path = url.pathname;
    // 子标签聚合：与真实后端一致，按分类聚合已上线点位的 tags 并按使用次数排序
    if (path === "/api/tags" && method === "GET") {
      const category = url.searchParams.get("category");
      const counts = {};
      for (const spot of store.spots) {
        if (spot.category !== category || spot.status === "rejected") continue;
        for (const tag of Array.isArray(spot.tags) ? spot.tags : []) counts[tag] = (counts[tag] || 0) + 1;
      }
      return json({ data: Object.entries(counts).map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count) });
    }
    // 子标签筛选：列表接口支持 tag 参数（JSON 数组字符串的精确匹配）
    if (path === "/api/spots" && method === "GET" && url.searchParams.get("tag")) {
      const tag = url.searchParams.get("tag");
      const filtered = store.spots.filter((spot) => spot.status === "approved" && Array.isArray(spot.tags) && spot.tags.includes(tag));
      return json({ data: filtered, total: filtered.length });
    }
    const spotReviews = path.match(/^\/api\/spots\/(\d+)\/reviews$/);
    if (spotReviews && method === "GET") {
      const reviews = store.reviews.filter((review) => review.spot_id === Number(spotReviews[1]))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const stats = spotRating(Number(spotReviews[1]));
      return json({ data: reviews.map((review) => publicReview(review, viewer)), stats: { average: stats.avg_rating, count: stats.review_count } });
    }
    if (spotReviews && method === "POST") {
      if (!viewer) return json({ error: "请先登录后再点评" }, 401);
      const rating = Math.round(Number(body.rating));
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json({ error: "评分需为 1-5 星" }, 400);
      const content = String(body.content || "").trim().slice(0, 500);
      if (content.length < 2) return json({ error: "点评内容至少 2 个字" }, 400);
      const spot = store.spots.find((item) => item.id === Number(spotReviews[1]));
      if (!spot) return json({ error: "地点不存在" }, 404);
      const anonymous = body.anonymous === true || body.anonymous === 1;
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      const existing = store.reviews.find((review) => review.spot_id === spot.id && review.user_id === viewer.id);
      let saved;
      if (existing) {
        existing.rating = rating; existing.content = content; existing.anonymous = anonymous; existing.updated_at = now;
        saved = existing;
      } else {
        saved = { id: store.nextReviewId++, spot_id: spot.id, user_id: viewer.id, rating, content, anonymous, created_at: now, updated_at: null };
        store.reviews.push(saved);
      }
      persist();
      return json({ data: publicReview(saved, viewer), updated: Boolean(saved.updated_at) }, 201);
    }
    const reviewDelete = path.match(/^\/api\/reviews\/(\d+)$/);
    if (reviewDelete && method === "DELETE") {
      if (!viewer) return json({ error: "请先登录" }, 401);
      const index = store.reviews.findIndex((review) => review.id === Number(reviewDelete[1]) && review.user_id === viewer.id);
      if (index < 0) return json({ error: "只能删除自己的点评" }, 403);
      store.reviews.splice(index, 1);
      persist();
      return json({ id: Number(reviewDelete[1]), deleted: true });
    }
    const profile = path.match(/^\/api\/users\/(\d+)\/profile$/);
    if (profile && method === "GET") {
      const user = userById(profile[1]);
      if (!user) return json({ error: "用户不存在" }, 404);
      const publicReviews = store.reviews
        .filter((review) => review.user_id === user.id && !review.anonymous)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return json({
        user: { id: user.id, nickname: user.nickname || user.username, avatar_url: user.avatar_url || null, created_at: user.created_at },
        stats: {
          public_reviews: publicReviews.length,
          spots: store.spots.filter((spot) => spot.user_id === user.id).length
        },
        reviews: publicReviews.slice(0, 10).map((review) => ({
          id: review.id,
          spot_id: review.spot_id,
          rating: review.rating,
          content: review.content,
          created_at: review.created_at,
          spot_name: (store.spots.find((spot) => spot.id === review.spot_id) || {}).name || "已删除的地点"
        }))
      });
    }
    if (path === "/api/auth/profile" && method === "POST") {
      if (!viewer) return json({ error: "请先登录" }, 401);
      const updates = {};
      if (body.nickname !== undefined) {
        const nickname = String(body.nickname || "").trim();
        if (nickname && (nickname.length < 2 || nickname.length > 24)) return json({ error: "昵称需为 2-24 个字符" }, 400);
        updates.nickname = nickname || null;
      }
      if (body.avatar_url !== undefined) updates.avatar_url = String(body.avatar_url || "") || null;
      if (body.phone !== undefined) {
        const phone = normalizePhone(body.phone);
        if (!phone) return json({ error: "手机号格式不正确：请输入 11 位大陆手机号" }, 400);
        if (store.users.some((u) => u.phone === phone && u.id !== viewer.id)) return json({ error: "该手机号已绑定其他账号" }, 409);
        updates.phone = phone;
      }
      Object.assign(viewer, updates);
      const record = userById(viewer.id);
      if (record) Object.assign(record, updates);
      persist();
      return json({ user: { id: viewer.id, username: viewer.username, nickname: viewer.nickname || null, avatar_url: viewer.avatar_url || null, phone: maskPhone(viewer.phone) } });
    }
    if (path === "/api/auth/me" && method === "GET") {
      return json({ user: viewer ? { id: viewer.id, username: viewer.username, nickname: viewer.nickname || null, avatar_url: viewer.avatar_url || null, phone: maskPhone(viewer.phone) } : null });
    }
    if (path === "/api/auth/register" && method === "POST") {
      const username = String(body.username || "").trim().toLowerCase();
      if (!username || !/^[\w\u4e00-\u9fff-]{2,24}$/.test(username)) return json({ error: "用户名需为 2-24 个字符（支持中文、字母、数字、下划线、连字符）" }, 400);
      if (typeof body.password !== "string" || body.password.length < 8 || !/[A-Za-z]/.test(body.password) || !/\d/.test(body.password)) return json({ error: "密码至少 8 位，需同时包含字母和数字" }, 400);
      // 手机号：与真实后端一致，网页端注册必填，用于忘记密码自助找回
      const phone = normalizePhone(body.phone);
      if (!phone) return json({ error: "请填写 11 位大陆手机号（用于忘记密码时找回账号）" }, 400);
      // 用户名唯一：已存在的用户名不可重复注册；手机号同样唯一
      if (store.users.some((u) => u.username === username && u.id !== 999)) return json({ error: "用户名已存在" }, 409);
      if (store.users.some((u) => u.phone === phone)) return json({ error: "该手机号已绑定其他账号" }, 409);
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      const user = { id: store.nextUserId++, username, nickname: null, avatar_url: null, password: body.password, phone, created_at: now };
      store.users.push(user);
      store.currentUser = user;
      persist();
      return json({ token: DEMO_TOKEN, user: { id: user.id, username: user.username, nickname: null, avatar_url: null, phone: maskPhone(phone) } }, 201);
    }
    if (path === "/api/auth/check-username" && method === "GET") {
      const username = String(url.searchParams.get("username") || "").trim().toLowerCase();
      if (!/^[\w\u4e00-\u9fff-]{2,24}$/.test(username)) return json({ available: false, reason: "格式不符" });
      const exists = store.users.some((u) => u.username === username && u.id !== 999);
      return json({ available: !exists, reason: exists ? "已存在" : null });
    }
    if (path === "/api/auth/check-phone" && method === "GET") {
      const phone = normalizePhone(url.searchParams.get("phone"));
      if (!phone) return json({ available: false, reason: "格式不符" });
      const taken = store.users.some((u) => u.phone === phone);
      return json({ available: !taken, reason: taken ? "已绑定" : null });
    }
    if (path === "/api/auth/reset-password" && method === "POST") {
      // 与真实后端一致：用户名 + 手机号核验通过后重设密码
      const username = String(body.username || "").trim().toLowerCase();
      const phone = normalizePhone(body.phone);
      if (!username) return json({ error: "请输入注册时的用户名" }, 400);
      if (!phone) return json({ error: "请输入注册时绑定的手机号" }, 400);
      if (typeof body.newPassword !== "string" || body.newPassword.length < 8 || !/[A-Za-z]/.test(body.newPassword) || !/\d/.test(body.newPassword)) return json({ error: "新密码至少 8 位，需同时包含字母和数字" }, 400);
      const user = store.users.find((u) => u.username === username && u.id !== 999);
      if (!user || user.phone !== phone) return json({ error: "用户名或手机号不匹配，无法重置密码" }, 400);
      user.password = body.newPassword;
      persist();
      return json({ ok: true });
    }
    if (path === "/api/auth/login" && method === "POST") {
      // 与真实后端一致：账号必须真实存在，密码必须正确；不再「任意用户名自动建号」
      const username = String(body.username || "").trim().toLowerCase();
      const password = typeof body.password === "string" ? body.password : "";
      if (!username || username.length < 2) return json({ error: "请输入用户名" }, 400);
      const user = store.users.find((u) => u.username === username && u.id !== 999);
      if (!user || user.password !== password) return json({ error: "用户名或密码错误。演示环境可用体验账号 chen_foodie（密码 demo123456）" }, 401);
      store.currentUser = user;
      persist();
      return json({ token: DEMO_TOKEN, user: { id: user.id, username: user.username, nickname: user.nickname || null, avatar_url: user.avatar_url || null } }, 201);
    }
    if (path === "/api/auth/logout" && method === "POST") {
      store.currentUser = null;
      persist();
      return json({ loggedOut: true });
    }
    if (path === "/api/uploads" && method === "POST") {
      if (!viewer) return json({ error: "请先登录" }, 401);
      const file = options && options.body;
      if (!(file instanceof Blob) || !file.size) return json({ error: "请选择图片文件" }, 400);
      if (file.size > 2 * 1024 * 1024) return json({ error: "图片不能超过 2MB" }, 400);
      const dataUrl = await readFileAsDataURL(file);
      return json({ url: dataUrl }, 201);
    }
    const photos = path.match(/^\/api\/spots\/(\d+)\/photos$/);
    if (photos && method === "GET") return json({ data: [] });
    const like = path.match(/^\/api\/spots\/(\d+)\/like$/);
    if (like && method === "POST") {
      const spotId = Number(like[1]);
      const spot = store.spots.find((item) => item.id === spotId);
      if (!spot) return json({ error: "地点不存在" }, 404);
      const actor = viewer ? `user:${viewer.id}` : "guest";
      store.likedBy[spotId] = store.likedBy[spotId] || [];
      if (store.likedBy[spotId].includes(actor)) {
        return json({ id: spotId, likes: spot.likes + store.likedBy[spotId].length, liked: false, message: "你已经点过赞了" }, 200);
      }
      store.likedBy[spotId].push(actor);
      persist();
      return json({ id: spotId, likes: spot.likes + store.likedBy[spotId].length, liked: true }, 201);
    }
    if (path === "/api/spots" && method === "GET") {
      let spots = store.spots.slice();
      const category = url.searchParams.get("category");
      if (category) spots = spots.filter((spot) => spot.category === category);
      const q = (url.searchParams.get("q") || "").trim().toLowerCase();
      if (q) spots = spots.filter((spot) => `${spot.name} ${spot.description}`.toLowerCase().includes(q));
      spots.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      const page = Math.max(1, Number(url.searchParams.get("page") || 1));
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || 20)));
      const slice = spots.slice((page - 1) * limit, page * limit);
      return json({ data: slice.map(withRating), page, limit, total: spots.length });
    }
    /* ---------------- 私人地图（演示） ---------------- */
    if (path === "/api/maps" && method === "GET") {
      if (!viewer) return json({ error: "请先登录" }, 401);
      store.maps = store.maps || [];
      const visible = store.maps.filter((m) => !m.deleted_at && (m.user_id === viewer.id || (store.collab[m.id] || []).includes(viewer.id)));
      return json({ data: visible.map((m) => ({ id: m.id, name: m.name, description: m.description, created_at: m.created_at, spot_ids: (store.mapSpots[m.id] || []).slice(), shared: !!m.share_token, role: m.user_id === viewer.id ? "owner" : "editor" })) });
    }
    if (path === "/api/maps" && method === "POST") {
      if (!viewer) return json({ error: "请先登录" }, 401);
      const name = String(body.name || "").trim();
      if (name.length < 2 || name.length > 40) return json({ error: "私人地图名称需为 2-40 个字符" }, 400);
      const id = store.nextMapId++;
      store.maps.push({ id, user_id: viewer.id, name, description: String(body.description || "").slice(0, 120), created_at: new Date().toISOString().slice(0, 19).replace("T", " ") });
      store.mapSpots[id] = [];
      persist();
      return json({ id, name }, 201);
    }
    const mapSpotAdd = path.match(/^\/api\/maps\/(\d+)\/spots$/);
    if (mapSpotAdd && method === "POST") {
      if (!viewer) return json({ error: "请先登录" }, 401);
      const mapId = Number(mapSpotAdd[1]);
      const map = (store.maps || []).find((m) => m.id === mapId && !m.deleted_at && (m.user_id === viewer.id || (store.collab[m.id] || []).includes(viewer.id)));
      if (!map) return json({ error: "私人地图不存在" }, 404);
      const spotId = Number(body.spot_id);
      if (!store.spots.some((s) => s.id === spotId)) return json({ error: "公共地点不存在" }, 404);
      store.mapSpots[mapId] = store.mapSpots[mapId] || [];
      const existed = store.mapSpots[mapId].includes(spotId);
      if (!existed) { store.mapSpots[mapId].push(spotId); persist(); }
      return json({ map_id: mapId, spot_id: spotId, added: !existed }, existed ? 200 : 201);
    }
    if (mapSpotAdd && method === "GET") {
      if (!viewer) return json({ error: "请先登录" }, 401);
      const mapId = Number(mapSpotAdd[1]);
      const map = (store.maps || []).find((m) => m.id === mapId && !m.deleted_at && (m.user_id === viewer.id || (store.collab[m.id] || []).includes(viewer.id)));
      if (!map) return json({ error: "私人地图不存在" }, 404);
      const ids = store.mapSpots[mapId] || [];
      return json({ data: ids.map((id) => store.spots.find((s) => s.id === id)).filter(Boolean).map(withRating) });
    }
    const mapSpotRemove = path.match(/^\/api\/maps\/(\d+)\/spots\/(\d+)$/);
    if (mapSpotRemove && method === "DELETE") {
      if (!viewer) return json({ error: "请先登录" }, 401);
      const mapId = Number(mapSpotRemove[1]);
      const spotId = Number(mapSpotRemove[2]);
      const map = (store.maps || []).find((m) => m.id === mapId && !m.deleted_at && (m.user_id === viewer.id || (store.collab[m.id] || []).includes(viewer.id)));
      if (!map) return json({ error: "私人地图不存在" }, 404);
      const list = store.mapSpots[mapId] || [];
      const index = list.indexOf(spotId);
      if (index === -1) return json({ error: "该点位不在此地图中" }, 404);
      list.splice(index, 1);
      persist();
      return json({ map_id: mapId, spot_id: spotId, removed: true });
    }
    const mapIdOnly = path.match(/^\/api\/maps\/(\d+)$/);
    if (mapIdOnly && method === "PATCH") {
      if (!viewer) return json({ error: "请先登录" }, 401);
      const map = (store.maps || []).find((m) => m.id === Number(mapIdOnly[1]) && !m.deleted_at && (m.user_id === viewer.id || (store.collab[m.id] || []).includes(viewer.id)));
      if (!map) return json({ error: "私人地图不存在" }, 404);
      if (body.name !== undefined) {
        const name = String(body.name || "").trim();
        if (name.length < 2 || name.length > 40) return json({ error: "私人地图名称需为 2-40 个字符" }, 400);
        map.name = name;
      }
      if (body.description !== undefined) map.description = String(body.description || "").slice(0, 120);
      persist();
      return json({ id: map.id, name: map.name });
    }
    if (mapIdOnly && method === "DELETE") {
      if (!viewer) return json({ error: "请先登录" }, 401);
      const index = (store.maps || []).findIndex((m) => m.id === Number(mapIdOnly[1]) && m.user_id === viewer.id);
      if (index === -1) return json({ error: "私人地图不存在" }, 404);
      const map = store.maps[index];
      if (url.searchParams.get("permanent") === "1") {
        // 彻底删除：从回收站清掉，不可恢复
        store.maps.splice(index, 1);
        delete store.mapSpots[map.id];
        delete store.collab[map.id];
        persist();
        return json({ removed: true, id: map.id, permanent: true });
      }
      // 软删除：打上删除时间戳进回收站，30 天内可恢复
      map.deleted_at = new Date().toISOString().slice(0, 19).replace("T", " ");
      persist();
      return json({ removed: true, id: map.id, trash: true });
    }
    if (path === "/api/maps/trash" && method === "GET") {
      if (!viewer) return json({ error: "请先登录" }, 401);
      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
      // 顺带清理超过 30 天的回收站地图
      (store.maps || []).filter((m) => m.deleted_at && new Date(m.deleted_at.replace(" ", "T")).getTime() < cutoff).forEach((m) => {
        delete store.mapSpots[m.id];
        delete store.collab[m.id];
      });
      store.maps = store.maps.filter((m) => !(m.deleted_at && new Date(m.deleted_at.replace(" ", "T")).getTime() < cutoff));
      persist();
      const rows = store.maps.filter((m) => m.user_id === viewer.id && m.deleted_at)
        .sort((a, b) => String(b.deleted_at).localeCompare(String(a.deleted_at)))
        .map((m) => ({ id: m.id, name: m.name, deleted_at: m.deleted_at, spot_count: (store.mapSpots[m.id] || []).length }));
      return json({ data: rows });
    }
    const mapRestore = path.match(/^\/api\/maps\/(\d+)\/restore$/);
    if (mapRestore && method === "POST") {
      if (!viewer) return json({ error: "请先登录" }, 401);
      const map = (store.maps || []).find((m) => m.id === Number(mapRestore[1]) && m.user_id === viewer.id && m.deleted_at);
      if (!map) return json({ error: "地图不在回收站中" }, 404);
      delete map.deleted_at;
      persist();
      return json({ restored: true, id: map.id });
    }
    const mapCollab = path.match(/^\/api\/maps\/(\d+)\/collaborators$/);
    if (mapCollab && method === "GET") {
      if (!viewer) return json({ error: "请先登录" }, 401);
      const mapId = Number(mapCollab[1]);
      const map = (store.maps || []).find((m) => m.id === mapId && !m.deleted_at && (m.user_id === viewer.id || (store.collab[m.id] || []).includes(viewer.id)));
      if (!map) return json({ error: "私人地图不存在" }, 404);
      const members = (store.collab[mapId] || []).map((id) => store.users.find((u) => u.id === id)).filter(Boolean)
        .map((u) => ({ id: u.id, username: u.username, nickname: u.nickname, avatar_url: u.avatar_url }));
      return json({ data: members, isOwner: map.user_id === viewer.id });
    }
    if (mapCollab && method === "POST") {
      if (!viewer) return json({ error: "请先登录" }, 401);
      const mapId = Number(mapCollab[1]);
      const map = (store.maps || []).find((m) => m.id === mapId && m.user_id === viewer.id && !m.deleted_at);
      if (!map) return json({ error: "只有地图主人可以管理协作者" }, map ? 403 : 404);
      // 重名消歧：先按用户名精确匹配，再按昵称；昵称撞名时返回候选列表
      let target = null;
      if (body.user_id) {
        target = store.users.find((u) => u.id === Number(body.user_id));
        if (!target) return json({ error: "用户不存在" }, 404);
      } else {
        const username = String(body.username || "").trim();
        if (username.length < 2) return json({ error: "请输入对方的用户名" }, 400);
        target = store.users.find((u) => u.username === username);
        if (!target) {
          const matches = store.users.filter((u) => u.nickname === username).slice(0, 6);
          if (!matches.length) return json({ error: "用户不存在，请确认对方已注册" }, 404);
          if (matches.length === 1) target = matches[0];
          else return json({ error: `有 ${matches.length} 位用户昵称相同，请选择具体用户`, candidates: matches.map((u) => ({ id: u.id, username: u.username, nickname: u.nickname, avatar_url: u.avatar_url })) }, 409);
        }
      }
      if (target.id === viewer.id) return json({ error: "不需要添加自己" }, 400);
      store.collab[mapId] = store.collab[mapId] || [];
      const existed = store.collab[mapId].includes(target.id);
      if (!existed) { store.collab[mapId].push(target.id); persist(); }
      return json({ added: !existed, user: { id: target.id, username: target.username, nickname: target.nickname, avatar_url: target.avatar_url } }, existed ? 200 : 201);
    }
    const mapCollabRemove = path.match(/^\/api\/maps\/(\d+)\/collaborators\/(\d+)$/);
    if (mapCollabRemove && method === "DELETE") {
      if (!viewer) return json({ error: "请先登录" }, 401);
      const mapId = Number(mapCollabRemove[1]);
      const map = (store.maps || []).find((m) => m.id === mapId && m.user_id === viewer.id && !m.deleted_at);
      if (!map) return json({ error: "只有地图主人可以管理协作者" }, map ? 403 : 404);
      const list = store.collab[mapId] || [];
      const index = list.indexOf(Number(mapCollabRemove[2]));
      if (index === -1) return json({ error: "该用户不是这张地图的协作者" }, 404);
      list.splice(index, 1);
      persist();
      return json({ removed: true, id: mapId, user_id: Number(mapCollabRemove[2]) });
    }
    const mapShare = path.match(/^\/api\/maps\/(\d+)\/share$/);
    if (mapShare && method === "POST") {
      if (!viewer) return json({ error: "请先登录" }, 401);
      const map = (store.maps || []).find((m) => m.id === Number(mapShare[1]) && m.user_id === viewer.id && !m.deleted_at);
      if (!map) return json({ error: "私人地图不存在" }, 404);
      if (!map.share_token) {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        map.share_token = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
        persist();
      }
      return json({ share_token: map.share_token });
    }
    if (mapShare && method === "DELETE") {
      if (!viewer) return json({ error: "请先登录" }, 401);
      const map = (store.maps || []).find((m) => m.id === Number(mapShare[1]) && m.user_id === viewer.id);
      if (!map) return json({ error: "私人地图不存在" }, 404);
      map.share_token = null;
      persist();
      return json({ revoked: true, id: map.id });
    }
    const sharedMap = path.match(/^\/api\/shared\/([a-f0-9]{16,64})$/);
    if (sharedMap && method === "GET") {
      const map = (store.maps || []).find((m) => m.share_token === sharedMap[1] && !m.deleted_at);
      if (!map) return json({ error: "分享链接无效" }, 404);
      const ids = store.mapSpots[map.id] || [];
      return json({ map: { name: map.name, description: map.description }, spots: ids.map((id) => store.spots.find((s) => s.id === id)).filter(Boolean) });
    }
    if (path === "/api/maps/auto" && method === "POST") {
      if (!viewer) return json({ error: "请先登录后再使用 AI 功能" }, 401);
      const theme = String(body.theme || "").trim();
      if (theme.length < 2 || theme.length > 200) return json({ error: "请输入 2-200 字的主题" }, 400);
      // 演示环境没有模型：按主题关键词在点位名称/简介里打分挑选，最多 5 个
      const keywords = theme.split(/[，。！？、\s,!?]+/).filter((word) => word.length >= 2);
      const scored = store.spots
        .map((spot) => {
          const text = `${spot.name}${spot.description}${spot.category}`;
          const score = keywords.reduce((total, word) => total + (text.includes(word) ? 1 : 0), 0);
          return { spot, score };
        })
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      const picked = (scored.length >= 2 ? scored : store.spots.slice(0, 4)).map((item) => item.spot || item);
      const id = store.nextMapId++;
      store.maps.push({ id, user_id: viewer.id, name: theme.slice(0, 40), description: "AI 根据主题自动挑选的地点清单（演示）", created_at: new Date().toISOString().slice(0, 19).replace("T", " ") });
      store.mapSpots[id] = picked.map((spot) => spot.id);
      persist();
      return json({ id, name: theme.slice(0, 40), spot_ids: store.mapSpots[id] }, 201);
    }
    return json({ error: "Not found" }, 404);
  }

  window.QYDemo = {
    // 与 fetch 相同的调用签名，返回 Response；path 为带 /api 前缀的完整路径
    async handle(path, options) {
      const url = new URL(path, location.origin);
      const method = (options && options.method || "GET").toUpperCase();
      const body = parseBody(options && options.body);
      const viewer = viewerOf(options);
      try {
        return await route(url, method, body, options, viewer);
      } catch (error) {
        return json({ error: (error && error.message) || "演示环境请求失败" }, 400);
      }
    },
    reset() { store = defaultStore(); persist(); }
  };
})();
