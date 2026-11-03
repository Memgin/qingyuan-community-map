/* 本地预览演示数据：当 /api 后端不可达（例如用 serve_local.py / python -m http.server 做
 * 纯静态预览）时，app.js 的 apiFetch 会自动切换到本模块，让评分、大众点评（匿名 / 实名）、
 * 用户主页、资料设置等功能在没有 Cloudflare 后端的情况下也能完整体验。
 * 线上环境后端正常时本模块不会被触发，不影响生产逻辑。
 * 演示数据保存在 localStorage（key: qingyuan-demo-store），刷新不丢失。 */
(function () {
  "use strict";

  const STORE_KEY = "qingyuan-demo-store";
  const DEMO_TOKEN = "demo-token";

  /* ---------------- 演示数据种子 ---------------- */
  const seedUsers = [
    { id: 1, username: "chen_foodie", nickname: "北江食客", avatar_url: null, created_at: "2026-08-12 09:20:00" },
    { id: 2, username: "lq_local", nickname: "清远小灵通", avatar_url: null, created_at: "2026-08-30 21:04:00" },
    { id: 3, username: "may_eats", nickname: "阿May食记", avatar_url: null, created_at: "2026-09-05 12:40:00" },
    { id: 4, username: "hiker_lin", nickname: "山系少年", avatar_url: null, created_at: "2026-09-18 08:15:00" },
    { id: 5, username: "laoqingyuan", nickname: "老清远", avatar_url: null, created_at: "2026-09-26 17:32:00" },
    { id: 6, username: "zhouxin_gm", nickname: "洲心阿婆", avatar_url: null, created_at: "2026-10-02 10:10:00" }
  ];

  const seedSpots = [
    { id: 1, name: "老桥饭店", address: "清远市清城区下廓一街", category: "food", description: "招牌白切清远鸡，皮爽肉滑，蘸姜葱蓉一流，本地人的饭堂。", lat: 23.6815, lng: 113.0562, image_url: null, likes: 46, user_id: 1, created_at: "2026-10-12 11:30:00" },
    { id: 2, name: "洲心大眼球烧肉粽", address: "清远市清城区洲心街", category: "food", description: "烧肉粽糯米油润，肥肉入口即化，早晨出摊即排队。", lat: 23.6602, lng: 113.0841, image_url: null, likes: 38, user_id: 6, created_at: "2026-10-13 08:05:00" },
    { id: 3, name: "北江河鲜舫", address: "清远市清城区北江一路", category: "food", description: "江景河鲜，边吃边看北江，黄骨鱼和河虾是必点。", lat: 23.6905, lng: 113.0502, image_url: null, likes: 31, user_id: 2, created_at: "2026-10-15 18:40:00" },
    { id: 4, name: "龙塘豆豉鸡大排档", address: "清远市清城区龙塘镇", category: "food", description: "豆豉炒鸡镬气十足，人均 40 吃到扶墙。", lat: 23.6310, lng: 113.1015, image_url: null, likes: 27, user_id: 5, created_at: "2026-10-18 19:12:00" },
    { id: 5, name: "笔架山森林公园", address: "清远市清城区笔架山林场", category: "scenic", description: "市区边的登山步道，山顶可俯瞰全城，适合半天轻徒步。", lat: 23.7305, lng: 113.0710, image_url: null, likes: 52, user_id: 4, created_at: "2026-10-20 09:00:00" },
    { id: 6, name: "飞来湖公园", address: "清远市清城区飞来湖", category: "scenic", description: "环湖绿道加湿地栈道，傍晚看日落的人最多。", lat: 23.6930, lng: 113.0298, image_url: null, likes: 44, user_id: 2, created_at: "2026-10-22 16:20:00" },
    { id: 7, name: "城市广场", address: "清远市清城区先锋中路", category: "shopping", description: "老牌商圈，吃饭看电影一站解决，周末人多。", lat: 23.6820, lng: 113.0610, image_url: null, likes: 19, user_id: 3, created_at: "2026-10-25 14:45:00" },
    { id: 8, name: "太和古洞", address: "清远市清新区太和古洞旅游区", category: "scenic", description: "清幽山谷里的古道观，溪水台阶一路向上，夏天避暑首选。", lat: 23.7120, lng: 113.0180, image_url: null, likes: 35, user_id: 4, created_at: "2026-10-28 10:30:00" }
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
    { id: 25, spot_id: 8, user_id: 4, rating: 4, content: "溪水清凉，古道幽静，夏天去最舒服，注意防蚊。", anonymous: false, created_at: "2026-10-29 11:00:00" }
  ];

  /* ---------------- 存取 ---------------- */
  function defaultStore() {
    return {
      users: JSON.parse(JSON.stringify(seedUsers)),
      spots: JSON.parse(JSON.stringify(seedSpots)),
      reviews: JSON.parse(JSON.stringify(seedReviews)),
      likedBy: {},
      currentUser: null,
      nextReviewId: 100
    };
  }
  function loadStore() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const store = JSON.parse(raw);
        if (store && Array.isArray(store.spots) && Array.isArray(store.reviews)) return store;
      }
    } catch { /* 存储不可用时回到内存种子 */ }
    return defaultStore();
  }
  let store = loadStore();
  function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* 忽略 */ } }

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
      Object.assign(viewer, updates);
      const record = userById(viewer.id);
      if (record) Object.assign(record, updates);
      persist();
      return json({ user: { id: viewer.id, username: viewer.username, nickname: viewer.nickname || null, avatar_url: viewer.avatar_url || null } });
    }
    if (path === "/api/auth/me" && method === "GET") {
      return json({ user: viewer ? { id: viewer.id, username: viewer.username, nickname: viewer.nickname || null, avatar_url: viewer.avatar_url || null } : null });
    }
    if (path === "/api/auth/login" && method === "POST") {
      const username = String(body.username || "").trim();
      if (username.length < 2) return json({ error: "请输入用户名（演示环境任意账号密码均可）" }, 400);
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      const existing = userById(999);
      const user = existing || { id: 999, username, nickname: null, avatar_url: null, created_at: now };
      user.username = username;
      if (!existing) store.users.push(user);
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
