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
        if (store && Array.isArray(store.spots) && Array.isArray(store.reviews)) {
          // 旧版本演示数据没有私人地图字段，补默认值避免报错
          if (!Array.isArray(store.maps)) store.maps = [];
          if (!store.mapSpots || typeof store.mapSpots !== "object") store.mapSpots = {};
          if (!store.nextMapId) store.nextMapId = 1;
          if (!store.collab || typeof store.collab !== "object") store.collab = {};
          if (!store.nextUserId) store.nextUserId = 1000;
          return store;
        }
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
      // 按用户名区分身份：同名登录回到同一身份，不同用户名各建一个账号——协作功能需要多用户
      let user = store.users.find((u) => u.username === username && u.id !== 999);
      if (!user) {
        const legacy = userById(999);
        if (legacy && legacy.username === username) {
          user = legacy;
        } else {
          user = { id: store.nextUserId++, username, nickname: null, avatar_url: null, created_at: now };
          store.users.push(user);
        }
      }
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
