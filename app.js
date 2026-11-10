/* 分类色系（低饱和莫兰迪调）：在地图绿底上沉稳耐看，分类间仍可区分；
   应急地图的安全分类保持高饱和高辨识，不受此处影响 */
const categories = {
  all: { label: "全部", color: "#2f6d5a", icon: "ph:sparkle" },
  scenic: { label: "景点", color: "#6e8ca0", icon: "ph:mountains" },
  food: { label: "美食", color: "#c96f5e", icon: "ph:fork-knife" },
  shopping: { label: "商圈", color: "#a97f92", icon: "ph:storefront" },
  medical: { label: "医疗", color: "#7a9b84", icon: "ph:first-aid-kit" },
  school: { label: "学校", color: "#7d8bb5", icon: "ph:graduation-cap" },
  transit: { label: "车站", color: "#c9a063", icon: "ph:bus" }
};

// 演示用默认点位已于 2026-10-10 移除：页面只展示数据库里真实收录的点位。

const API_BASE = "/api";
const OWNER_TOKEN_KEY = "qingyuan-owner-token";
const AUTH_TOKEN_KEY = "qingyuan-auth-token";
const ACTOR_TOKEN_KEY = "qingyuan-actor-token";

const map = new AMap.Map("map", { zoom: 12, center: [113.056, 23.6818], viewMode: "2D", mapStyle: "amap://styles/normal" });
// 向导区路线小地图：容器平时 display:none（height:0 时创建实例会得到 0×0 空白画布且不自动恢复），
// 因此改为懒创建——等容器真正展开到最终尺寸后再实例化（见 drawRoute 里的 ensureGuideMap）。
// useNativeMap: 强制用 Canvas2D 渲染——绕开 Windows Chrome 的 WebGPU
// requestAdapter 二次调用失败（"No available adapters"）导致的空白画布
let guideMap = null;
function ensureGuideMap() {
  if (!guideMap) {
    guideMap = new AMap.Map("guideMap", { zoom: 12, center: [113.056, 23.6818], viewMode: "2D", mapStyle: "amap://styles/normal", useNativeMap: true });
  }
  return guideMap;
}

// ---------------- 位置纠偏：拖动标记修正点位位置，提交后转管理员确认 ----------------
let correctionContext = null;
const correctionBar = document.querySelector("#correctionBar");

function enterCorrectionMode(spot) {
  if (!state.currentUser) {
    showToast("请先登录后再提交纠偏");
    openAuth();
    return;
  }
  if (correctionContext) exitCorrectionMode();
  const marker = new AMap.Marker({
    position: [spot.lng, spot.lat],
    content: '<div class="correction-marker"></div>',
    offset: new AMap.Pixel(-13, -26),
    draggable: true,
    zIndex: 1300
  });
  map.add(marker);
  correctionContext = { spotId: spot.id, marker, lat: spot.lat, lng: spot.lng };
  marker.on("dragend", () => {
    const position = marker.getPosition();
    correctionContext.lat = position.getLat();
    correctionContext.lng = position.getLng();
  });
  map.setZoomAndCenter(16, [spot.lng, spot.lat]);
  correctionBar.hidden = false;
}

function exitCorrectionMode() {
  if (correctionContext) {
    map.remove(correctionContext.marker);
    correctionContext = null;
  }
  correctionBar.hidden = true;
}

// 导航点击埋点：跳高德前异步上报（sendBeacon 不阻塞跳转，失败静默），
// 次数计入综合热度（点赞 + 点评×2 + 导航×2），导航多的地点推荐更靠前
document.addEventListener("click", (event) => {
  const link = event.target.closest("a[data-nav-id]");
  if (!link) return;
  try { navigator.sendBeacon(`${API_BASE}/spots/${link.dataset.navId}/navigate`); } catch { /* 埋点失败不影响跳转 */ }
});

// InfoWindow 内容是字符串模板，用事件委托接「位置纠偏 / 查看点评 / 用户主页 / 删除点评」点击
document.addEventListener("click", (event) => {
  const correctButton = event.target.closest("[data-correct-id]");
  if (correctButton) {
    const spot = state.mapSpots.find((item) => String(item.id) === correctButton.dataset.correctId);
    if (spot) enterCorrectionMode(spot);
    return;
  }
  const detailButton = event.target.closest("[data-detail-id]");
  if (detailButton) { openSpotDetail(detailButton.dataset.detailId); return; }
  // 仅非匿名点评带 data-user-id；匿名点评没有作者信息，永远无法进入任何用户主页
  const userButton = event.target.closest("[data-user-id]");
  if (userButton) { openUserProfile(userButton.dataset.userId); return; }
  const reviewDeleteButton = event.target.closest("[data-review-delete-id]");
  if (reviewDeleteButton) { deleteMyReview(reviewDeleteButton.dataset.reviewDeleteId); }
  // 点击菜单外部时收起所有「⋯」菜单
  if (!event.target.closest(".more-menu-wrap")) document.querySelectorAll(".more-menu-wrap.open").forEach((el) => el.classList.remove("open"));
});

document.querySelector("#correctionSubmit").addEventListener("click", async () => {
  if (!correctionContext) return;
  const submitButton = document.querySelector("#correctionSubmit");
  submitButton.disabled = true;
  try {
    const response = await fetch(`${API_BASE}/spots/${correctionContext.spotId}/correction`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ lat: correctionContext.lat, lng: correctionContext.lng })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "提交失败");
    showToast(payload.message || "纠偏已提交");
    exitCorrectionMode();
  } catch (error) {
    showToast(error.message);
  }
  submitButton.disabled = false;
});

document.querySelector("#correctionCancel").addEventListener("click", exitCorrectionMode);
let currentLocationMarker = null;

const state = { spots: [], mapSpots: [], total: 0, filter: "all", query: "", page: 1, pageSize: 4, markers: [], likes: getLikes(), pickingLocation: false, myOnly: false, currentUser: null, authMode: "login", highlightIds: new Set(), myMaps: [], savedMapName: {}, openMapId: null, pickSpotId: null };
let nearbyFacilities = []; // 金融学院周边检索结果的缓存，防止登录/刷新合并时丢失
const spotList = document.querySelector("#spotList");
const spotCount = document.querySelector("#spotCount");

function getSubmittedSpots() {
  try { return JSON.parse(localStorage.getItem("qingyuan-submissions") || "[]").map((spot) => ({ ...spot, status: "pending", isOwner: true })); } catch { return []; }
}

// 离线提交队列（outbox）：断网时的提交先入队，联网后自动重发，client_token 保证重复发送只写入一次
const OUTBOX_KEY = "qingyuan-outbox";
const MAP_CACHE_KEY = "qingyuan-cache-map";
const LIST_CACHE_KEY = "qingyuan-cache-list";
const SYNC_KEY = "qingyuan-lastsync";
let lastSync = localStorage.getItem(SYNC_KEY) || "";

function getOutbox() { try { return JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]"); } catch { return []; } }
function setOutbox(items) { localStorage.setItem(OUTBOX_KEY, JSON.stringify(items)); }
function readCache(key) { try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } }
function writeCache(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 存储不可用时忽略 */ } }
function nowStamp() { return new Date().toISOString().slice(0, 19).replace("T", " "); }

async function flushOutbox() {
  const items = getOutbox();
  if (!items.length) return;
  const remaining = [];
  for (const item of items) {
    try {
      const response = await fetch(`${API_BASE}/spots`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json", "X-Owner-Token": ownerToken }), body: JSON.stringify(item.spot) });
      // 成功、重复（409）、或后端判定为重复提交都出队；未登录（401）与服务端错误保留待下次重试
      if (response.ok || response.status === 409) continue;
      remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }
  setOutbox(remaining);
  const synced = items.length - remaining.length;
  if (synced > 0) { showToast(`已同步 ${synced} 条离线提交`); await loadPublicSpots(); }
}

// 增量轮询：只问"有没有新点位"，有则提示手动刷新，避免打断当前浏览
async function checkUpdates() {
  if (!lastSync) return;
  try {
    const response = await fetch(`${API_BASE}/spots?since=${encodeURIComponent(lastSync)}&limit=1`);
    if (!response.ok) return;
    const payload = await response.json().catch(() => ({}));
    const count = Number(payload.total || 0);
    if (count > 0) showUpdateBanner(count);
  } catch { /* 轮询失败静默处理，下次再试 */ }
}

/* --------------------------- 审核结果提醒 --------------------------- */
// 与鸿蒙 App 同一套逻辑：轮询「我的提交」，把状态与本地快照比对，
// 一旦发现「待审核」变成「已通过 / 未通过」，就弹一条浏览器通知。
const REVIEW_SNAPSHOT_KEY = "qingyuan-review-snapshot";
const REVIEW_TRACKED_KEY = "qingyuan-review-tracked";
// 网页端提交成功后登记点位 id，覆盖「高德核验秒过审核」的场景
function trackOwnSubmission(spotId) {
  if (!spotId) return;
  let tracked = [];
  try { tracked = JSON.parse(localStorage.getItem(REVIEW_TRACKED_KEY) || "[]"); } catch { tracked = []; }
  if (!tracked.includes(spotId)) { tracked.push(spotId); localStorage.setItem(REVIEW_TRACKED_KEY, JSON.stringify(tracked)); }
}

async function checkReviewResults() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!authToken()) return;
  let spots = [];
  try {
    const response = await fetch(`${API_BASE}/my-spots`, { headers: authHeaders() });
    if (!response.ok) return;
    const payload = await response.json();
    spots = Array.isArray(payload.data) ? payload.data : [];
  } catch { return; }

  let previous = {};
  try { previous = JSON.parse(localStorage.getItem(REVIEW_SNAPSHOT_KEY) || "{}"); } catch { previous = {}; }
  let tracked = [];
  try { tracked = JSON.parse(localStorage.getItem(REVIEW_TRACKED_KEY) || "[]"); } catch { tracked = []; }
  const isFirstRun = Object.keys(previous).length === 0;
  const current = {};
  const changed = [];
  for (const spot of spots) {
    const status = spot.status || "pending";
    current[String(spot.id)] = status;
    const before = previous[String(spot.id)];
    if (before === undefined) {
      // 新出现的点位：网页端提交且已是终态（高德核验秒过）→ 补一条通知
      const idx = tracked.indexOf(spot.id);
      if (idx >= 0 && (status === "approved" || status === "rejected")) { tracked.splice(idx, 1); changed.push(spot); }
      continue;
    }
    if (before !== status && (status === "approved" || status === "rejected")) changed.push(spot);
  }
  localStorage.setItem(REVIEW_SNAPSHOT_KEY, JSON.stringify(current));
  localStorage.setItem(REVIEW_TRACKED_KEY, JSON.stringify(tracked));
  if (isFirstRun) return; // 首次只建基线，不补发历史通知
  for (const spot of changed) notifyReviewResult(spot);
}

function notifyReviewResult(spot) {
  const approved = spot.status === "approved";
  new Notification(approved ? "点位已通过审核" : "点位未通过审核", {
    body: approved
      ? `「${spot.name}」已上线，现在所有人都能在地图上看到它`
      : `「${spot.name}」未通过审核，可以调整后重新提交`
  });
}

// 顶栏加一个开关：浏览器要求用户主动授权才能弹通知
function setupReviewReminder() {
  if (!("Notification" in window)) return;
  const holder = document.querySelector(".topbar-actions");
  if (!holder || document.querySelector("#reviewReminderButton")) return;
  const button = document.createElement("button");
  button.className = "text-button";
  button.type = "button";
  button.id = "reviewReminderButton";
  button.textContent = Notification.permission === "granted" ? "🔔 审核提醒已开启" : "🔔 开启审核提醒";
  button.addEventListener("click", async () => {
    if (Notification.permission === "granted") { showToast("审核结果会通过浏览器通知提醒你"); checkReviewResults(); return; }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      button.textContent = "🔔 审核提醒已开启";
      showToast("审核结果会通过浏览器通知提醒你");
      checkReviewResults();
    } else {
      showToast("浏览器通知被拒绝，可在地址栏左侧站点设置里允许");
    }
  });
  holder.insertBefore(button, holder.firstChild);
}

/* --------------------------- Turnstile 人机验证（已停用） ---------------------------
 * Turnstile 的 api.js 会向页面注入 connect-src 限定的 CSP，拦截高德渲染器的
 * data: 连接，导致向导区小地图空白。注册防刷已由 IP 注册限额（3 账号/天）兜底，
 * 故移除 Turnstile；如需恢复人机验证，需先解决其 CSP 与地图渲染的冲突。
------------------------------------------------------------------------------------ */
const TURNSTILE_SITE_KEY = "";

function showUpdateBanner(count) {
  let banner = document.querySelector("#updateBanner");
  if (!banner) {
    banner = document.createElement("button");
    banner.id = "updateBanner";
    banner.type = "button";
    banner.style.cssText = "display:block;width:100%;margin:8px 0;padding:10px 12px;border:1px solid #ffd28a;background:#fff6e5;color:#8a5a00;border-radius:10px;font-size:13px;cursor:pointer;";
    banner.addEventListener("click", async () => { banner.remove(); await loadPublicSpots(); });
    spotList.parentElement.insertBefore(banner, spotList);
  }
  banner.textContent = `有 ${count} 个新点位，点击刷新`;
}

function getLikes() {
  try { return JSON.parse(localStorage.getItem("qingyuan-likes") || "{}"); } catch { return {}; }
}

function getOwnerToken() {
  let token = localStorage.getItem(OWNER_TOKEN_KEY);
  if (!token) { token = crypto.randomUUID(); localStorage.setItem(OWNER_TOKEN_KEY, token); }
  return token;
}

function authToken() { return localStorage.getItem(AUTH_TOKEN_KEY) || ""; }

function authHeaders(extra = {}) { return { ...extra, ...(authToken() ? { Authorization: `Bearer ${authToken()}` } : {}) }; }
function actorHeaders(extra = {}) { let token = localStorage.getItem(ACTOR_TOKEN_KEY); if (!token) { token = crypto.randomUUID(); localStorage.setItem(ACTOR_TOKEN_KEY, token); } return { ...extra, "X-Actor-Token": token }; }

const ownerToken = getOwnerToken();

/* ---------------- API 访问层：本地纯静态预览（无后端）时自动切换演示数据 ----------------
 * demo-data.js 提供演示数据与接口模拟。只有当真实 /api 请求不可达（网络错误，或本地
 * 静态服务器对 /api 返回 404）且页面运行在 localhost / 127.0.0.1 时才启用，
 * 线上部署（Cloudflare Pages Functions 可用）不受任何影响。 */
let demoMode = false;
function canFallbackToDemo() { return Boolean(window.QYDemo) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname); }
function showDemoBadge() {
  if (document.querySelector(".demo-badge")) return;
  const badge = document.createElement("div");
  badge.className = "demo-badge";
  badge.textContent = "本地演示模式：内置演示数据，可完整体验点评功能";
  document.body.appendChild(badge);
}
async function apiFetch(path, options = {}) {
  if (demoMode) return window.QYDemo.handle(path, options);
  try {
    const response = await fetch(path, options);
    // 本地静态服务器（python http.server 等）对 /api/* 一律返回 404 HTML 页；
    // 真实后端的 404 是 JSON（如"地点不存在"），两者必须区分开
    const contentType = response.headers.get("Content-Type") || "";
    if (response.status === 404 && !contentType.includes("application/json") && canFallbackToDemo()) {
      demoMode = true;
      showDemoBadge();
      return window.QYDemo.handle(path, options);
    }
    return response;
  } catch (error) {
    if (canFallbackToDemo()) {
      demoMode = true;
      showDemoBadge();
      return window.QYDemo.handle(path, options);
    }
    throw error;
  }
}

// 合并远程收录点与本地默认点/待审核提交/周边设施，已核验的覆盖未核验的同名同分类点，避免登录或刷新后默认点丢失。
// 地图图钉需要的轻量数据：一次拉取坐标，避免列表分页后地图只剩当前页的点
async function loadMapSpots() {
  try {
    const response = await apiFetch(`${API_BASE}/spots?fields=map&limit=500`);
    if (!response.ok) return;
    const payload = await response.json();
    if (Array.isArray(payload.data)) {
      state.mapSpots = payload.data.map((spot) => ({ ...spot, locationVerified: true }));
      writeCache(MAP_CACHE_KEY, state.mapSpots);
    }
  } catch {
    // 断网时回退到本地缓存，保证地图仍有内容可看
    const cache = readCache(MAP_CACHE_KEY);
    if (Array.isArray(cache)) state.mapSpots = cache;
  }
}

// 列表使用后端真分页：只取当前页，分类与关键词交由后端过滤；主页按综合热度排序（点赞+点评+导航）
// 列表骨架屏：数据加载期间显示占位微光卡片，加载完成后被真实卡片替换
function renderSkeletonList() {
  const spotList = document.querySelector("#spotList");
  if (!spotList) return;
  spotList.innerHTML = Array.from({ length: 4 }, () =>
    '<div class="skeleton-card"><div class="sk sk-cover"></div><div class="sk sk-line w60"></div><div class="sk sk-line w40"></div><div class="sk sk-line w80"></div></div>').join("");
}

async function loadListPage() {
  renderSkeletonList();
  const params = new URLSearchParams({ page: String(state.page), limit: String(state.pageSize), sort: "hot" });
  if (state.filter !== "all") params.set("category", state.filter);
  if (state.query) params.set("q", state.query);
  try {
    const response = await apiFetch(`${API_BASE}/spots?${params}`);
    if (!response.ok) return;
    const payload = await response.json();
    if (Array.isArray(payload.data)) {
      state.spots = payload.data.map((spot) => ({ ...spot, locationVerified: true }));
      state.total = Number(payload.total || 0);
      writeCache(LIST_CACHE_KEY, { list: state.spots, total: state.total });
    }
  } catch {
    // 断网时展示上一次缓存的列表
    const cache = readCache(LIST_CACHE_KEY);
    if (cache && Array.isArray(cache.list)) { state.spots = cache.list; state.total = Number(cache.total || cache.list.length); }
  }
}

async function refreshList() {
  if (state.myOnly) { render(); return; }
  await loadListPage();
  render();
}

async function loadPublicSpots() {
  renderSkeletonList();
  await loadMapSpots();
  await refreshList();
  lastSync = nowStamp();
  localStorage.setItem(SYNC_KEY, lastSync);
}

async function loadMySpots() {
  // 后端 /api/my-spots 按登录态（Authorization）识别用户，X-Owner-Token 仅作兼容保留，
  // 缺少 Authorization 会直接 401，导致「我的提交」始终加载失败
  const response = await fetch(`${API_BASE}/my-spots`, { headers: authHeaders({ "X-Owner-Token": ownerToken }) });
  if (!response.ok) throw new Error("无法加载我的提交");
  const payload = await response.json();
  return payload.data || [];
}

// 以广东金融学院（清远校区）为中心 20km 实时检索周边医院与铁路车站。
// 已于 2026-10-10 停用：这批点位已正式入库，页面统一以数据库为唯一数据源，避免出现重复点位。
const FACILITY_CENTER = { lng: 113.086781, lat: 23.717058 };
const FACILITY_RADIUS_METERS = 20000;
function loadNearbyFacilities() {
  AMap.plugin("AMap.PlaceSearch", () => {
    const search = new AMap.PlaceSearch({ pageSize: 25 });
    // 高德按关键词模糊匹配，会混入名字里带"高铁站"的酒店、充电站等，这里做过滤
    const STATION_NOISE = /酒店|宾馆|公寓|充电|超充|加油|停车场|停车楼|售票|代售|快递|物流|超市|便利店|餐厅|美食|小区|写字楼|汽车站|客运站|公交站|公交|收费|服务区|出入口|厕所|消防|派出所|警务|广场|公园|驿站|基站|泵站|电站|水站|垃圾站|门楼|工地/;
    const MEDICAL_NOISE = /药店|诊所|口腔|美容|宠物|足浴|按摩|停车|充电|超市|便利店|售票|殡仪|养老院|社区卫生|卫生室|服务站|消防|微型消防|派出所|警务|公交|地铁|垃圾站|泵站|电站/;
    // 严格只展示清城区的三甲医院，其余医院一律不收录
    const MEDICAL_WHITELIST = /清远市人民医院|广州中医药大学附属清远中医院/;
    // 用户指定的不展示车站
    const STATION_EXCLUDE = /银盏|龙塘|长隆/;
    // 同一家医院的门诊楼、服务点、康复中心等内部部门不算独立点位
    const MEDICAL_PART = /门诊楼|服务点|服务中心|康复|保健中心|体检|急诊|发热门诊|住院楼|医技楼|核酸|行政楼|出入口/;
    const medicalKeep = (poi) => {
      const name = String(poi.name || "");
      if (MEDICAL_NOISE.test(name) || MEDICAL_PART.test(name)) return false;
      return MEDICAL_WHITELIST.test(name);
    };
    const stationKeep = (poi) => {
      const name = String(poi.name || "");
      const type = `${poi.type || ""} ${poi.typecode || ""}`;
      if (STATION_EXCLUDE.test(name)) return false;
      if (STATION_NOISE.test(name) || STATION_NOISE.test(type)) return false;
      // 类型命中铁路/轨道设施即通过（地铁、磁浮旅游专线不算）；否则要求名称以"站"结尾
      if (/火车站|铁路|高铁|城铁|轻轨/.test(type)) return true;
      return /站$/.test(name);
    };
    // 高德会把一家医院拆成多条（住院大楼、耳鼻喉门诊、急诊、体检中心…），按医院主体归并为一条
    const hospitalGroup = new Map();
    const groupKeyOf = (name) => {
      const match = String(name).match(/^.*?(?:人民医院|中医院|妇幼保健院|中心医院|附属医院|医院)/);
      return match ? match[0].replace(/[·\s]/g, "") : String(name);
    };
    const tasks = [
      { keyword: "医院", category: "medical", keep: medicalKeep },
      { keyword: "人民医院", category: "medical", keep: medicalKeep },
      { keyword: "中医院", category: "medical", keep: medicalKeep },
      { keyword: "中心医院", category: "medical", keep: medicalKeep },
      { keyword: "妇幼保健院", category: "medical", keep: medicalKeep },
      { keyword: "高铁站", category: "transit", keep: stationKeep },
      { keyword: "火车站", category: "transit", keep: stationKeep },
      { keyword: "城轨站", category: "transit", keep: stationKeep }
    ];
    console.log("[facility] PlaceSearch 可用方法：", Object.getOwnPropertyNames(Object.getPrototypeOf(search)).filter((key) => key.startsWith("search")).join(","));
    const added = [];
    // 只与已核验过的点去重，避免未核验的默认演示点（如"清远市人民医院"）遮挡真实高德数据。
    const seen = new Set(state.spots.filter((spot) => spot.locationVerified !== false).map((spot) => `${spot.category}:${String(spot.name).replace(/[·\s]/g, "").toLowerCase()}`));
    let index = 0;
    // 串行检索：并发请求容易触发高德的 QPS 限流导致返回空
    const runNext = () => {
      if (index >= tasks.length) {
        // 归并后的医院：同一家只保留本体那条
        hospitalGroup.forEach((spot) => {
          // 归并后若代表条目仍带噪声后缀（如只剩"XX医院-微型消防站"），整组丢弃
          if (MEDICAL_NOISE.test(spot.name) || MEDICAL_PART.test(spot.name)) return;
          const key = `medical:${String(spot.name).replace(/[·\s]/g, "").toLowerCase()}`;
          if (seen.has(key)) return;
          seen.add(key);
          added.push({ ...spot, id: `facility-medical-${added.length + 1}` });
        });
        if (added.length) {
          nearbyFacilities = [...nearbyFacilities, ...added];
          state.spots.push(...added);
        }
        render();
        console.log(`[facility] 全部完成，共新增 ${added.length} 处`, added.map((spot) => `${spot.category}:${spot.name}`));
        return;
      }
      const task = tasks[index];
      index += 1;
      // 不同版本 SDK 的周边检索方法名不同，逐个兜底
      const runSearch = (callback) => {
        if (typeof search.searchNearBy === "function") {
          search.searchNearBy(task.keyword, [FACILITY_CENTER.lng, FACILITY_CENTER.lat], FACILITY_RADIUS_METERS, callback);
        } else if (typeof search.searchAround === "function") {
          search.searchAround(task.keyword, [FACILITY_CENTER.lng, FACILITY_CENTER.lat], FACILITY_RADIUS_METERS, callback);
        } else {
          search.search(task.keyword, callback);
        }
      };
      runSearch((status, result) => {
        const pois = status === "complete" ? result.poiList?.pois || [] : [];
        if (status !== "complete") console.log(`[facility] ${task.keyword} 检索未成功：${status}`, result?.info || "");
        let kept = 0;
        pois.forEach((poi) => {
          if (!poi.location) return;
          if (task.keep && !task.keep(poi)) return;
          const key = `${task.category}:${String(poi.name).replace(/[·\s]/g, "").toLowerCase()}`;
          if (seen.has(key)) return;
          const spot = {
            name: poi.name,
            address: poi.address || "",
            category: task.category,
            description: `${poi.level ? poi.level + " · " : ""}${poi.address ? "广东金融学院周边 20 公里内 · " + poi.address : "广东金融学院周边 20 公里内"}`,
            lat: poi.location.lat,
            lng: poi.location.lng,
            locationVerified: true,
            status: "approved"
          };
          if (task.category === "medical") {
            // 归并：保留名称最短的那条作为医院本体
            const groupKey = groupKeyOf(poi.name);
            const existing = hospitalGroup.get(groupKey);
            if (!existing || String(poi.name).length < String(existing.name).length) hospitalGroup.set(groupKey, spot);
            return;
          }
          seen.add(key);
          kept += 1;
          added.push({ ...spot, id: `facility-${task.category}-${added.length + 1}` });
        });
        console.log(`[facility] ${task.keyword}：高德返回 ${pois.length} 条，纳入 ${kept} 条`, pois.slice(0, 12).map((poi) => `${poi.name}|等级:${poi.level || "-"}|类型:${poi.type || "-"}`));
        runNext();
      });
    };
    runNext();
  });
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function navigationURL(spot) {
  return `https://uri.amap.com/navigation?to=${spot.lng},${spot.lat},${encodeURIComponent(spot.name)}&mode=car&policy=1&src=qingyuan-map&coordinate=gaode&callnative=1`;
}

function markerIcon(category, highlighted = false) {
  const item = categories[category];
  return `<div class="marker-pin ${highlighted ? "is-highlight" : ""}" style="--marker-color:${item.color}"><span class="marker-pin-body"><iconify-icon icon="${item.icon}" inline></iconify-icon></span></div>`;
}

// 把 AI 推荐到的点位在地图上高亮，并自动缩放到这些点
function highlightSpots(ids, silentToast = false) {
  state.highlightIds = new Set(ids.map(String));
  state.filter = "all";
  state.query = "";
  state.page = 1;
  document.querySelector("#searchInput").value = "";
  refreshList();
  // 推荐点位可能不在当前页，用全量地图数据定位坐标
  const source = state.myOnly ? state.spots : state.mapSpots;
  const targets = source.filter((spot) => state.highlightIds.has(String(spot.id)) && spot.locationVerified !== false);
  if (!targets.length) return;
  if (targets.length === 1) {
    map.setZoomAndCenter(16, [targets[0].lng, targets[0].lat]);
  } else {
    const lngs = targets.map((spot) => spot.lng);
    const lats = targets.map((spot) => spot.lat);
    map.setBounds(new AMap.Bounds(new AMap.LngLat(Math.min(...lngs), Math.min(...lats)), new AMap.LngLat(Math.max(...lngs), Math.max(...lats))));
  }
  if (!silentToast) showToast(`已在地图高亮 ${targets.length} 个推荐点位`);
  // 两个及以上点位时在向导区小地图上连成游览路线（主地图只高亮不画线）
  drawRoute(targets.length >= 2 ? targets : []);
}

/* ---------------- 推荐路线：向导区下方可交互小地图（为路线编辑预留） ---------------- */
let routeOverlay = { polyline: null, badges: [] };

function clearRoute() {
  if (routeOverlay.polyline && guideMap) { guideMap.remove(routeOverlay.polyline); routeOverlay.polyline = null; }
  if (guideMap) routeOverlay.badges.forEach((badge) => guideMap.remove(badge));
  routeOverlay.badges = [];
  const container = document.querySelector("#guideMap");
  if (container) container.classList.remove("visible");
  const editorButton = document.querySelector("#routeEditorButton");
  if (editorButton) editorButton.hidden = true;
  const clearButton = document.querySelector("#clearRouteButton");
  const orderText = document.querySelector("#routeOrder");
  if (clearButton) clearButton.hidden = true;
  if (orderText) { orderText.hidden = true; orderText.textContent = ""; }
}

// 最近邻贪心：从第一个点出发依次连最近的未访问点，形成顺路的游览顺序
function orderRouteSpots(spots) {
  if (spots.length <= 2) return spots.slice();
  const remaining = spots.slice(1);
  const ordered = [spots[0]];
  let current = spots[0];
  while (remaining.length) {
    let bestIndex = 0;
    let bestDistance = Infinity;
    remaining.forEach((spot, index) => {
      const distance = Math.abs(spot.lat - current.lat) + Math.abs(spot.lng - current.lng);
      if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
    });
    current = remaining.splice(bestIndex, 1)[0];
    ordered.push(current);
  }
  return ordered;
}

function drawRoute(spots) {
  clearRoute();
  if (spots.length < 2) return;
  const ordered = orderRouteSpots(spots);
  const path = ordered.map((spot) => [spot.lng, spot.lat]);
  const orderText = document.querySelector("#routeOrder");
  if (orderText) { orderText.hidden = false; orderText.innerHTML = `<iconify-icon icon="ph:compass" inline></iconify-icon> 推荐路线：${ordered.map((spot, index) => `${index + 1}. ${escapeHTML(spot.name)}`).join(" → ")}`; }
  const clearButton = document.querySelector("#clearRouteButton");
  if (clearButton) clearButton.hidden = false;
  const container = document.querySelector("#guideMap");
  if (container) container.classList.add("visible");
  const editorButton = document.querySelector("#routeEditorButton");
  if (editorButton) editorButton.hidden = false;
  // 容器此时已是最终尺寸（display 显隐，无高度动画），可直接创建地图
  const gm = ensureGuideMap();
  // 路线画在向导区小地图上（主地图只高亮）：虚线连接 + 序号标记
  routeOverlay.polyline = new AMap.Polyline({ path, strokeColor: "#2F80ED", strokeWeight: 5, strokeOpacity: 0.85, strokeStyle: "dashed", showDir: true, zIndex: 80 });
  gm.add(routeOverlay.polyline);
  ordered.forEach((spot, index) => {
    const badge = new AMap.Marker({ position: [spot.lng, spot.lat], content: `<div class="route-badge">${index + 1}</div>`, offset: new AMap.Pixel(-13, -40), zIndex: 110 });
    gm.add(badge);
    routeOverlay.badges.push(badge);
  });
  gm.setFitView(null, false, [40, 40, 40, 40]);
  // 强制首次绘制：高德在尺寸未变化时会跳过重绘，轻推 1px 再还原可立刻触发绘制
  const nudgeRepaint = () => {
    window.dispatchEvent(new Event("resize"));
    if (!container) return;
    container.style.height = "301px";
    requestAnimationFrame(() => {
      container.style.height = "";
      gm.resize();
    });
  };
  nudgeRepaint();
  setTimeout(nudgeRepaint, 400);
}

document.querySelector("#clearRouteButton").addEventListener("click", () => {
  clearRoute();
  clearRouteDraft();
  state.highlightIds = new Set();
  refreshList();
});

/* ---------------- 推荐路线暂存 + 路线编辑器（主地图大画布上调整顺序/增删点位） ---------------- */
const ROUTE_DRAFT_KEY = "qingyuan-route-draft";
const routeEditorPanel = document.querySelector("#routeEditorPanel");
let routeEditor = { spots: [], polyline: null, markers: [] };

function readRouteDraft() { try { return JSON.parse(localStorage.getItem(ROUTE_DRAFT_KEY)) || null; } catch { return null; } }
function writeRouteDraft(draft) { try { localStorage.setItem(ROUTE_DRAFT_KEY, JSON.stringify(draft)); } catch { /* 存储不可用时忽略 */ } }
function clearRouteDraft() { localStorage.removeItem(ROUTE_DRAFT_KEY); }

function drawRouteEditorOverlay() {
  if (routeEditor.polyline) { map.remove(routeEditor.polyline); routeEditor.polyline = null; }
  routeEditor.markers.forEach((marker) => map.remove(marker));
  routeEditor.markers = [];
  if (routeEditor.spots.length < 2) return;
  routeEditor.polyline = new AMap.Polyline({ path: routeEditor.spots.map((spot) => [spot.lng, spot.lat]), strokeColor: "#E67E22", strokeWeight: 6, strokeOpacity: .9, showDir: true, zIndex: 90 });
  map.add(routeEditor.polyline);
  routeEditor.spots.forEach((spot, index) => {
    const marker = new AMap.Marker({ position: [spot.lng, spot.lat], content: `<div class="route-badge">${index + 1}</div>`, offset: new AMap.Pixel(-13, -40), zIndex: 120 });
    map.add(marker);
    routeEditor.markers.push(marker);
  });
}

function renderRouteEditor() {
  const list = document.querySelector("#routeEditorList");
  list.innerHTML = routeEditor.spots.map((spot, index) => `<div class="private-map-spot"><div class="private-map-spot-info"><strong>${index + 1}. ${escapeHTML(spot.name)}</strong><span>${escapeHTML(spot.address || "")}</span></div><span class="card-actions"><button class="text-button re-up" data-index="${index}" type="button" ${index === 0 ? "disabled" : ""}>↑</button><button class="text-button re-down" data-index="${index}" type="button" ${index === routeEditor.spots.length - 1 ? "disabled" : ""}>↓</button><button class="remove-map-spot re-remove" data-index="${index}" type="button">移除</button></span></div>`).join("");
  list.querySelectorAll(".re-up").forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.index);
    [routeEditor.spots[index - 1], routeEditor.spots[index]] = [routeEditor.spots[index], routeEditor.spots[index - 1]];
    renderRouteEditor();
    drawRouteEditorOverlay();
  }));
  list.querySelectorAll(".re-down").forEach((button) => button.addEventListener("click", () => {
    const index = Number(button.dataset.index);
    [routeEditor.spots[index + 1], routeEditor.spots[index]] = [routeEditor.spots[index], routeEditor.spots[index + 1]];
    renderRouteEditor();
    drawRouteEditorOverlay();
  }));
  list.querySelectorAll(".re-remove").forEach((button) => button.addEventListener("click", () => {
    routeEditor.spots.splice(Number(button.dataset.index), 1);
    renderRouteEditor();
    drawRouteEditorOverlay();
  }));
  // 可添加的点位：全部图钉数据中不在当前路线的
  const candidates = state.mapSpots.filter((spot) => !routeEditor.spots.some((item) => String(item.id) === String(spot.id)));
  const addSelect = document.querySelector("#routeEditorAddSelect");
  addSelect.innerHTML = candidates.map((spot) => `<option value="${spot.id}">${escapeHTML(spot.name)}</option>`).join("") || '<option value="">没有更多可添加的点位</option>';
  addSelect.disabled = !candidates.length;
  document.querySelector("#saveRouteEditorButton").disabled = routeEditor.spots.length < 2;
}

function closeRouteEditor() {
  if (routeEditor.polyline) { map.remove(routeEditor.polyline); routeEditor.polyline = null; }
  routeEditor.markers.forEach((marker) => map.remove(marker));
  routeEditor.markers = [];
  routeEditorPanel.hidden = true;
  if (detailPanel.hidden) introPanel.hidden = false;
  renderMarkers();
}

document.querySelector("#routeEditorButton").addEventListener("click", () => {
  const draft = readRouteDraft();
  const ids = draft?.spotIds?.length ? draft.spotIds : [...state.highlightIds];
  const spots = ids.map((id) => findSpotAnywhere(id)).filter(Boolean);
  if (spots.length < 2) { showToast("请先用 AI 推荐生成一条路线"); return; }
  routeEditor.spots = spots;
  introPanel.hidden = true;
  detailPanel.hidden = true;
  routeEditorPanel.hidden = false;
  routeEditorPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  renderRouteEditor();
  drawRouteEditorOverlay();
});
document.querySelector("#closeRouteEditorButton").addEventListener("click", closeRouteEditor);
document.querySelector("#routeEditorAddButton").addEventListener("click", () => {
  const addSelect = document.querySelector("#routeEditorAddSelect");
  if (!addSelect.value) return;
  const spot = findSpotAnywhere(addSelect.value);
  if (!spot) return;
  routeEditor.spots.push(spot);
  renderRouteEditor();
  drawRouteEditorOverlay();
});
document.querySelector("#saveRouteEditorButton").addEventListener("click", () => {
  const draft = readRouteDraft() || {};
  draft.spotIds = routeEditor.spots.map((spot) => spot.id);
  draft.savedAt = new Date().toISOString();
  writeRouteDraft(draft);
  drawRoute(routeEditor.spots);
  closeRouteEditor();
  showToast("路线已保存，刷新后也会保留");
});

// 恢复上次的推荐路线草稿：页面加载后等图钉数据就绪，再高亮并画线（刷新不丢内容）
(function restoreRouteDraft() {
  const draft = readRouteDraft();
  if (!draft) return;
  if (draft.prompt) document.querySelector("#recommendInput").value = draft.prompt;
  if (draft.resultText) document.querySelector("#recommendResult").textContent = draft.resultText;
  const ids = draft.spotIds || [];
  if (ids.length < 2) return;
  const waitAndRestore = (tries) => {
    const targets = ids.map((id) => findSpotAnywhere(id)).filter(Boolean);
    if (targets.length >= 2) {
      highlightSpots(targets, true);
      showToast("已恢复上次的推荐路线");
    } else if (tries > 0) setTimeout(() => waitAndRestore(tries - 1), 500);
  };
  waitAndRestore(20);
})();

// 地图图钉的数据源：公开模式用轻量全量数据，我的提交模式用本地列表
function visibleSpots() {
  const source = state.myOnly ? state.spots : state.mapSpots;
  return source.filter((spot) => {
    const matchesCategory = state.filter === "all" || spot.category === state.filter;
    const searchText = `${spot.name} ${spot.description || ""}`.toLowerCase();
    return (state.myOnly || spot.status !== "pending") && spot.locationVerified !== false && matchesCategory && searchText.includes(state.query.toLowerCase());
  });
}

function renderFilters() {
  const container = document.querySelector("#categoryFilters");
  container.innerHTML = Object.entries(categories).map(([key, item]) => `<button class="filter-chip ${state.filter === key ? "active" : ""}" data-filter="${key}" type="button"><span class="chip-dot" style="--chip-color:${item.color}"></span>${item.label}</button>`).join("");
  container.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => { state.filter = button.dataset.filter; state.page = 1; refreshList(); }));
}

// 地图弹窗模板：评分 + 点评入口 + 基础信息 + 位置纠偏（照片墙已移至详情面板轮播）
function popupContentHTML(spot) {
  const item = categories[spot.category];
  const image = spot.image_url ? `<img src="${escapeHTML(spot.image_url)}" alt="${escapeHTML(spot.name)}">` : "";
  const address = escapeHTML(spot.address || "地图上的目的地");
  const description = escapeHTML(spot.description || "");
  // 地图图钉是轻量数据（fields=map），description 可能为空，必须兜底
  const ratingLine = spot.review_count
    ? `<div class="popup-rating"><span class="stars">${starsHTML(spot.avg_rating)}</span><small>${Number(spot.avg_rating).toFixed(1)} · ${spot.review_count} 条点评</small><button class="detail-link" data-detail-id="${spot.id}" type="button">查看点评 →</button></div>`
    : `<div class="popup-rating"><button class="detail-link" data-detail-id="${spot.id}" type="button">评分与点评 →</button></div>`;
  const tagLine = parseSpotTagsClient(spot.tags);
  return `<div class="popup-content">${image}<strong>${escapeHTML(spot.name)}</strong><small style="color:${item.color}">${item.label}</small>${tagLine ? `<div class="spot-tags">${tagLine}</div>` : ""}${ratingLine}<a class="navigate-link" href="${navigationURL(spot)}" target="_blank" rel="noopener" data-nav-id="${spot.id}"><iconify-icon icon="ph:navigation-arrow" inline></iconify-icon> ${address} · 导航</a><button class="correction-link" data-correct-id="${spot.id}" type="button"><iconify-icon icon="ph:map-pin" inline></iconify-icon> 位置纠偏</button><p>${description}</p></div>`;
}

// 客户端子标签解析：后端 tags 是 JSON 数组字符串，解析失败返回空
function parseSpotTagsClient(raw) {
  try {
    const list = typeof raw === "string" ? JSON.parse(raw) : Array.isArray(raw) ? raw : [];
    return list.map((tag) => `<span class="tag-chip">${escapeHTML(String(tag))}</span>`).join("");
  } catch { return ""; }
}

function renderMarkers() {
  state.markers.forEach((marker) => marker.setMap(null));
  state.markers = visibleSpots().map((spot) => {
    const marker = new AMap.Marker({ position: [spot.lng, spot.lat], content: markerIcon(spot.category, state.highlightIds.has(String(spot.id))), offset: new AMap.Pixel(-16, -41), title: spot.name });
    marker.setMap(map);
    marker.on("click", () => {
      const infoWindow = new AMap.InfoWindow({ content: popupContentHTML(spot), offset: new AMap.Pixel(0, -35), closeWhenClickMap: true });
      infoWindow.open(map, marker.getPosition());
    });
    return marker;
  });
}

// 拉取点位社区照片并重绘地图弹窗；spot 来自闭包，字段与列表一致
function renderList() {
  // 公开模式：state.spots 已是后端返回的当前页数据；我的提交模式仍按本地切片
  const totalCount = state.myOnly ? state.spots.length : state.total;
  const totalPages = Math.max(1, Math.ceil(totalCount / state.pageSize));
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const list = state.myOnly ? state.spots.slice((state.page - 1) * state.pageSize, state.page * state.pageSize) : state.spots;
  // 主页为热门榜：后端按点赞数排序平铺展示（分组会打断热度顺序，已移至 recent.html）
  const cardHTML = (spot) => {
    const item = categories[spot.category];
    const likeCount = state.likes[spot.id] ?? spot.likes ?? 0;
    // liked 由后端按账号返回，保证网页与 App 的点赞状态一致
    // 是否已点赞只认后端按账号返回的 liked 字段，保证网页与 App 跨端一致。
    // 原实现用 `Number(state.likes[id]) > 0` 兜底，但 state.likes 存的是点赞总数
    const liked = spot.liked === true;
    const likes = `<iconify-icon icon="${liked ? "ph:heart-fill" : "ph:heart"}" inline></iconify-icon> ${likeCount}`;
    // 封面是卡片的第一视觉锚点（Google Maps / 大众点评模式：带图卡片点击率显著更高）；
    // 无图时用分类色渐变 + 图标占位，避免卡片空洞
    const cover = spot.image_url
      ? `<img class="spot-cover" src="${escapeHTML(spot.image_url)}" alt="${escapeHTML(spot.name)}">`
      : `<div class="cover-banner" style="background:linear-gradient(135deg, ${item.color}, ${item.color}b3)"><iconify-icon icon="${item.icon}" inline></iconify-icon></div>`;
    // 提交者：编辑（分类/主图）；其他登录用户：补图（往照片墙追加）
    const editButton = spot.isOwner ? `<button class="edit-button" data-edit-id="${spot.id}" type="button">编辑分类 / 配图</button>` : (state.currentUser ? `<button class="edit-button" data-edit-id="${spot.id}" type="button">补图</button>` : "");
    const deleteButton = spot.isOwner ? `<button class="delete-button" data-delete-id="${spot.id}" type="button">删除地点</button>` : "";
    // 已收藏标记：state.savedMapName 由 loadMaps 构建（spotId → 地图名）
    const savedName = state.savedMapName[String(spot.id)];
    const saveButton = state.currentUser && !state.myOnly ? `<button class="save-map-button ${savedName ? "saved" : ""}" data-map-spot-id="${spot.id}" type="button" ${savedName ? `title="已收藏到：${escapeHTML(savedName)}，点击可换一张地图"` : ""}>${savedName ? `<iconify-icon icon="ph:bookmark-simple-fill" inline></iconify-icon> 已收藏` : `<iconify-icon icon="ph:bookmark-simple" inline></iconify-icon> 收藏`}</button>` : "";
    const reportButton = !state.myOnly ? `<button class="report-button" data-report-id="${spot.id}" type="button">举报</button>` : "";
    // 次要操作收进「⋯」菜单：底部只留高频的点赞与热度，避免窄卡片溢出
    const moreItems = [saveButton, editButton, reportButton, deleteButton].filter(Boolean);
    const moreMenu = moreItems.length ? `<span class="more-menu-wrap"><button class="more-button" type="button" aria-label="更多操作">⋯</button><span class="more-menu">${moreItems.join("")}</span></span>` : "";
    const pendingTag = spot.status === "pending" ? `<span class="pending-tag">待审核</span>` : "";
    const hotBadge = Number.isFinite(Number(spot.hot_score)) && Number(spot.hot_score) > 0 ? `<span class="footer-stat" title="点赞 + 点评×2 + 导航×2"><iconify-icon icon="ph:fire" inline></iconify-icon> ${spot.hot_score}</span>` : "";
    // 评分与分类合并为一行元信息（大众点评模式：星级 + 条数 + 品类相邻呈现）
    const metaLine = spot.review_count
      ? `<span class="stars">${starsHTML(spot.avg_rating)}</span> ${Number(spot.avg_rating).toFixed(1)}（${spot.review_count} 条） · ${item.label}`
      : `${item.label} · ${spot.address ? escapeHTML(spot.address.split(" ")[0]) : "待补充"}`;
    const spotTags = parseSpotTagsClient(spot.tags);
    const address = escapeHTML(spot.address || "地图上的目的地");
    return `<article class="spot-card" data-lat="${spot.lat}" data-lng="${spot.lng}" data-spot-id="${spot.id}">${cover}<div class="spot-card-top"><h3>${escapeHTML(spot.name)}${pendingTag}</h3></div><div class="card-meta">${metaLine}</div>${spotTags ? `<div class="spot-tags">${spotTags}</div>` : ""}<a class="spot-address navigate-link" href="${navigationURL(spot)}" target="_blank" rel="noopener" data-navigation="true" data-nav-id="${spot.id}"><iconify-icon icon="ph:navigation-arrow" inline></iconify-icon> ${address} · 导航</a><p>${escapeHTML(spot.description)}</p><div class="card-footer"><button class="like-button" data-like-id="${spot.id}" type="button" aria-label="点赞 ${escapeHTML(spot.name)}">${likes}</button><span class="footer-stat"><iconify-icon icon="ph:chats" inline></iconify-icon> ${spot.review_count || 0}</span>${hotBadge}<span class="card-actions">${moreMenu}</span></div></article>`;
  };
  spotList.innerHTML = list.length ? list.map(cardHTML).join("") : '<div class="empty-state">没有找到匹配的地点，换个关键词试试。</div>';
  document.querySelector("#pageInfo").textContent = `${state.page} / ${totalPages}`;
  document.querySelector("#previousPageButton").disabled = state.page <= 1;
  document.querySelector("#nextPageButton").disabled = state.page >= totalPages;
  spotList.querySelectorAll(".like-button").forEach((button) => button.addEventListener("click", async () => {
    const id = button.dataset.likeId;
    try {
      // 带上登录态：后端会按账号记录点赞，实现网页与 App 跨端一致
      const response = await apiFetch(`${API_BASE}/spots/${id}/like`, { method: "POST", headers: authHeaders(actorHeaders()) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "点赞失败");
      if (payload.liked === false) { showToast("你已经点过赞了"); return; }
      state.likes[id] = payload.likes; localStorage.setItem("qingyuan-likes", JSON.stringify(state.likes));
      // 同步当前列表里的点赞态：后端 liked 要等下次请求才带回，这里先本地置位避免 UI 回退
      const target = state.spots.find((item) => String(item.id) === String(id));
      if (target) target.liked = true;
      renderList();
    } catch {
      showToast("点赞失败，请稍后重试");
    }
  }));
  spotList.querySelectorAll(".report-button").forEach((button) => button.addEventListener("click", async (event) => {
    event.stopPropagation();
    const reason = window.prompt("请填写举报原因（2-200字）");
    if (!reason) return;
    const response = await fetch(`${API_BASE}/spots/${button.dataset.reportId}/report`, { method: "POST", headers: actorHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ reason }) });
    const payload = await response.json().catch(() => ({})); showToast(payload.message || payload.error || "举报请求失败");
  }));
  spotList.querySelectorAll(".delete-button").forEach((button) => button.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (!window.confirm("确定删除你提交的这个地点吗？")) return;
    const response = await fetch(`${API_BASE}/spots/${button.dataset.deleteId}`, { method: "DELETE", headers: authHeaders() });
    if (!response.ok) { showToast("删除失败，只能删除自己提交的地点"); return; }
    state.spots = state.spots.filter((spot) => String(spot.id) !== String(button.dataset.deleteId));
    render(); showToast("地点已删除");
  }));
  spotList.querySelectorAll(".edit-button").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const spot = state.spots.find((item) => String(item.id) === button.dataset.editId);
    if (spot) openEditModal(spot);
  }));
  spotList.querySelectorAll(".save-map-button").forEach((button) => button.addEventListener("click", () => saveSpotToMap(button.dataset.mapSpotId)));
  // 「⋯」更多操作菜单：点按钮开合，点菜单项或页面其他位置自动收起
  spotList.querySelectorAll(".more-button").forEach((button) => button.addEventListener("click", (event) => {
    event.stopPropagation();
    const wrap = button.closest(".more-menu-wrap");
    spotList.querySelectorAll(".more-menu-wrap.open").forEach((el) => { if (el !== wrap) el.classList.remove("open"); });
    wrap.classList.toggle("open");
  }));
  spotList.querySelectorAll(".more-menu button").forEach((button) => button.addEventListener("click", () => {
    const wrap = button.closest(".more-menu-wrap");
    if (wrap) wrap.classList.remove("open");
  }));
  spotList.querySelectorAll(".spot-card").forEach((card) => card.addEventListener("click", (event) => {
    // 卡片上的按钮（点赞/举报/编辑等）与导航链接不触发详情
    if (event.target.closest("button, a")) return;
    map.setZoomAndCenter(16, [Number(card.dataset.lng), Number(card.dataset.lat)], true);
    // 点击卡片进入详情：查看评分与大众点评
    openSpotDetail(card.dataset.spotId);
  }));
}

function render() { renderFilters(); renderMarkers(); renderList(); spotCount.textContent = state.myOnly ? state.spots.length : state.total; }

const modalBackdrop = document.querySelector("#modalBackdrop");
const categorySelect = document.querySelector("select[name=category]");
categorySelect.innerHTML = Object.entries(categories).filter(([key]) => key !== "all").map(([key, item]) => `<option value="${key}">${item.label}</option>`).join("");

document.querySelector("#addSpotButton").addEventListener("click", () => { if (!state.currentUser) { openAuth(); return; } modalBackdrop.hidden = false; document.querySelector("input[name=name]").focus(); });
document.querySelector("#closeModalButton").addEventListener("click", () => { modalBackdrop.hidden = true; });
modalBackdrop.addEventListener("click", (event) => { if (event.target === modalBackdrop) modalBackdrop.hidden = true; });
document.addEventListener("keydown", (event) => { if (event.key === "Escape") modalBackdrop.hidden = true; });
document.querySelector("#addressSearchButton").addEventListener("click", () => {
  const addressInput = document.querySelector("#addressInput");
  const addressMessage = document.querySelector("#addressMessage");
  const address = addressInput.value.trim();
  if (!address) { addressMessage.textContent = "请先输入地址或地点名称。"; return; }
  addressMessage.textContent = "正在搜索地址……";
  AMap.plugin(["AMap.PlaceSearch", "AMap.Geocoder"], () => {
    const placeSearch = new AMap.PlaceSearch({ city: "清远", citylimit: true, pageSize: 1 });
    placeSearch.search(address, (status, result) => {
      const poi = status === "complete" && result.poiList?.pois?.[0];
      if (poi?.location) {
        document.querySelector("input[name=name]").value = poi.name || document.querySelector("input[name=name]").value;
        document.querySelector("input[name=lat]").value = poi.location.lat;
        document.querySelector("input[name=lng]").value = poi.location.lng;
        addressMessage.textContent = `已定位：${poi.name}${poi.address ? ` · ${poi.address}` : ""}`;
        map.setZoomAndCenter(17, [poi.location.lng, poi.location.lat], true);
        return;
      }
      const geocoder = new AMap.Geocoder({ city: "清远" });
      geocoder.getLocation(address, (geocodeStatus, geocodeResult) => {
        const geocode = geocodeStatus === "complete" && geocodeResult.geocodes?.[0];
        if (!geocode?.location) { addressMessage.textContent = "没有找到该地址，请补充街道或地标名称。"; return; }
        document.querySelector("input[name=lat]").value = geocode.location.lat;
        document.querySelector("input[name=lng]").value = geocode.location.lng;
        addressMessage.textContent = `已定位：${geocode.formattedAddress}`;
        map.setZoomAndCenter(17, [geocode.location.lng, geocode.location.lat], true);
      });
    });
  });
});
document.querySelector("#locateButton").addEventListener("click", () => {
  showToast("正在获取你的位置…");
  AMap.plugin("AMap.Geolocation", () => {
    const geolocation = new AMap.Geolocation({ enableHighAccuracy: true, timeout: 10000, maximumAge: 0, convert: true, showButton: false, showMarker: false, noIpLocate: true });
    geolocation.getCurrentPosition((status, result) => {
      if (status !== "complete" || !result.position) {
        showToast("无法获取准确位置，请打开手机 GPS 和浏览器定位权限");
        return;
      }
      const location = result.position;
      if (currentLocationMarker) currentLocationMarker.setMap(null);
      currentLocationMarker = new AMap.Marker({ position: location, content: '<div class="location-marker"><span></span></div>', offset: new AMap.Pixel(-10, -10), map });
      map.setZoomAndCenter(17, location, true);
      const accuracy = Math.round(result.accuracy || 0);
      showToast(accuracy > 300 ? `已定位，当前精度约 ${accuracy} 米` : "已定位到你的位置");
    });
  });
});
let searchTimer = null;
document.querySelector("#searchInput").addEventListener("input", (event) => {
  state.query = event.target.value.trim();
  state.page = 1;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => refreshList(), 250);
});
document.querySelector("#previousPageButton").addEventListener("click", () => { state.page -= 1; refreshList(); });
document.querySelector("#nextPageButton").addEventListener("click", () => { state.page += 1; refreshList(); });
document.querySelector("#pickLocationButton").addEventListener("click", () => {
  state.pickingLocation = true;
  modalBackdrop.hidden = true;
  showToast("请点击地图上的位置");
});
document.querySelector("#recommendForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  // AI 推荐消耗真实模型配额，必须登录：未登录直接弹出登录页，而不是事后提示
  if (!state.currentUser) {
    openAuth();
    document.querySelector("#recommendResult").textContent = "登录后即可使用 AI 推荐";
    return;
  }
  const result = document.querySelector("#recommendResult");
  const submitButton = event.currentTarget.querySelector("button[type=submit]");
  const originalText = submitButton ? submitButton.textContent : "";
  if (submitButton) { submitButton.disabled = true; submitButton.textContent = "整理中…"; }
  result.textContent = "正在按你当前地图视野整理推荐……";
  const center = map.getCenter();
  try {
    const response = await fetch(`${API_BASE}/recommend`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ prompt: document.querySelector("#recommendInput").value.trim(), center: { lat: center.getLat(), lng: center.getLng() } }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      // 会话过期等导致的 401：直接弹出登录页重新登录
      if (response.status === 401) {
        state.currentUser = null;
        updateAuthUI();
        openAuth();
        throw new Error("登录已过期，请重新登录后使用 AI 推荐");
      }
      throw new Error(payload.error || "推荐暂不可用");
    }
    result.textContent = payload.recommendation || "推荐结果已返回，请查看地图点位。";
    highlightSpots(payload.spotIds || []);
    // 暂存本次推荐（需求原文 + 结果文字 + 点位顺序）：强制刷新后自动恢复，也能进编辑路线调整
    writeRouteDraft({ prompt: document.querySelector("#recommendInput").value.trim(), resultText: payload.recommendation || "", spotIds: payload.spotIds || [], savedAt: new Date().toISOString() });
  } catch (error) {
    result.textContent = error.message === "Failed to fetch" ? "推荐服务尚未连接，请先部署 Worker。" : error.message;
  } finally {
    if (submitButton) { submitButton.disabled = false; submitButton.textContent = originalText; }
  }
});
// 季节推荐：按当前月份把应季主题排最前并高亮，点击即填入需求并直接推荐（复用现有 AI 接口，零额外成本）
const SEASON_THEMES = [
  { months: [2, 3, 4], label: "春 · 赏花踏青", prompt: "春天想赏花踏青，推荐几个适合出游的地方" },
  { months: [5, 6, 7], label: "夏 · 亲水避暑", prompt: "夏天想找亲水避暑的地方，推荐几个凉爽的好去处" },
  { months: [8, 9, 10], label: "秋 · 登高望远", prompt: "秋天想登高望远看秋色，推荐几个适合的地方" },
  { months: [11, 12, 1], label: "冬 · 暖胃食补", prompt: "冬天想暖胃食补，推荐几家好吃又暖和的店" }
];
(function renderSeasonChips() {
  const holder = document.querySelector("#seasonChips");
  if (!holder) return;
  const month = new Date().getMonth() + 1;
  const ordered = [...SEASON_THEMES].sort((a, b) => (b.months.includes(month) ? 1 : 0) - (a.months.includes(month) ? 1 : 0));
  holder.innerHTML = ordered.map((theme) => `<button class="season-chip${theme.months.includes(month) ? " current" : ""}" type="button">${theme.label}</button>`).join("");
  holder.querySelectorAll(".season-chip").forEach((button, index) => button.addEventListener("click", () => {
    document.querySelector("#recommendInput").value = ordered[index].prompt;
    document.querySelector("#recommendForm").requestSubmit();
  }));
})();

document.querySelector("#mySpotsButton").addEventListener("click", async () => {
  if (state.myOnly) {
    state.myOnly = false; state.query = ""; state.page = 1; document.querySelector("#searchInput").value = ""; document.querySelector("#mySpotsButton").textContent = "我的提交"; await loadPublicSpots(); return;
  }
  try { state.spots = await loadMySpots(); state.spots.forEach((spot) => { spot.isOwner = true; spot.locationVerified = true; }); state.myOnly = true; state.filter = "all"; state.query = ""; state.page = 1; document.querySelector("#searchInput").value = ""; document.querySelector("#mySpotsButton").textContent = "返回公开地图"; render(); } catch { showToast("暂时无法加载你的提交"); }
});

map.on("click", (event) => {
  if (!state.pickingLocation) return;
  document.querySelector("input[name=lat]").value = event.lnglat.getLat().toFixed(6);
  document.querySelector("input[name=lng]").value = event.lnglat.getLng().toFixed(6);
  document.querySelector("#addressInput").value = `地图选点 ${event.lnglat.getLng().toFixed(6)}, ${event.lnglat.getLat().toFixed(6)}`;
  state.pickingLocation = false;
  modalBackdrop.hidden = false;
  document.querySelector("input[name=name]").focus();
  showToast("已选择地图坐标");
});
document.querySelector("#shareButton").addEventListener("click", async () => { try { await navigator.clipboard.writeText(window.location.href); showToast("地图链接已复制"); } catch { showToast("复制失败，请手动分享当前页面"); } });

document.querySelector("#spotForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const submitButton = form.querySelector('button[type="submit"]');
  const originalHTML = submitButton.innerHTML;
  const formMessage = document.querySelector("#formMessage");
  const formData = new FormData(form);
  // 多图上传：第一张作封面（image_url），其余在点位创建成功后追加进照片墙；
  // 总共 ≤20MB、最多 10 张（与照片墙"单人单地点 9 张"上限对齐）
  const imageFiles = [...(form.querySelector('input[name="image"]').files || [])].slice(0, 10);
  if (imageFiles.reduce((sum, file) => sum + file.size, 0) > 20 * 1024 * 1024) { formMessage.textContent = "图片总共不能超过 20MB。"; return; }
  // 子标签：预设选中 + 自定义输入，合计最多 5 个
  const formTags = collectFormTags();
  if (formTags === null) return;
  // client_token 用于离线重发的幂等：同一条提交重复发送只会被写入一次
  const spot = { id: Date.now(), name: formData.get("name").trim(), address: formData.get("address").trim(), category: formData.get("category"), description: formData.get("description").trim(), lat: Number(formData.get("lat")), lng: Number(formData.get("lng")), image_url: "", status: "pending", client_token: crypto.randomUUID(), tags: formTags };
  if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lng) || spot.lat < 23.4 || spot.lat > 24.8 || spot.lng < 112.4 || spot.lng > 113.8) { formMessage.textContent = "请先搜索清远的地址或地点。"; return; }
  const saveSpotLocally = (imageURL = "") => { spot.image_url = imageURL; const submitted = getSubmittedSpots(); submitted.push(spot); localStorage.setItem("qingyuan-submissions", JSON.stringify(submitted)); state.filter = "all"; state.query = ""; state.page = 1; render(); };
  const restoreButton = () => { submitButton.disabled = false; submitButton.innerHTML = originalHTML; };
  const done = (message, savedLocally) => {
    formMessage.textContent = message;
    form.reset(); document.querySelector("input[name=lat]").value = ""; document.querySelector("input[name=lng]").value = "";
    // 清理子标签选择状态
    selectedTags.clear();
    renderTagChips(formData.get("category"));
    tagCustomInput.value = "";
    restoreButton();
    setTimeout(() => { modalBackdrop.hidden = true; formMessage.textContent = ""; showToast(savedLocally ? "已保存在本机，联网后自动同步" : "提交成功"); }, 1100);
    if (!savedLocally) loadPublicSpots();
  };
  submitButton.disabled = true;
  submitButton.textContent = "提交中…";
  let imageURL = "";
  const extraPhotoUrls = [];
  if (imageFiles.length) {
    for (let i = 0; i < imageFiles.length; i++) {
      submitButton.textContent = `上传图片 ${i + 1}/${imageFiles.length}…`;
      const uploadResponse = await fetch(`${API_BASE}/uploads`, { method: "POST", headers: authHeaders({ "Content-Type": imageFiles[i].type }), body: imageFiles[i] }).catch(() => null);
      if (!uploadResponse || !uploadResponse.ok) {
        const errPayload = uploadResponse ? await uploadResponse.json().catch(() => ({})) : {};
        // 一张失败不拖垮整单：已有封面时跳过该张继续；连封面都没有才中止提交
        if (!imageURL) { formMessage.textContent = errPayload.error || "图片上传失败，请重试或先不添加图片。"; restoreButton(); return; }
        formMessage.textContent = `第 ${i + 1} 张上传失败，将使用其余 ${i} 张继续提交。`;
        break;
      }
      const url = (await uploadResponse.json()).url;
      if (!imageURL) imageURL = url; else extraPhotoUrls.push(url);
    }
    submitButton.textContent = "提交中…";
  }
  spot.image_url = imageURL;
  try {
    const response = await fetch(`${API_BASE}/spots`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json", "X-Owner-Token": ownerToken }), body: JSON.stringify(spot) });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 409) { formMessage.textContent = payload.error || "这个地点已经收录。"; restoreButton(); return; }
    if (!response.ok) {
      // 服务端错误也入队，等恢复后自动重发
      if (response.status >= 500) { const items = getOutbox(); items.push({ spot, at: Date.now() }); setOutbox(items); }
      formMessage.textContent = payload.error || "提交失败，请稍后重试。"; restoreButton(); return;
    }
    if (payload.id) {
      trackOwnSubmission(payload.id);
      // 剩余图片追加进照片墙（单张失败静默跳过，之后还可用「补图」继续添加）
      for (const url of extraPhotoUrls) {
        await fetch(`${API_BASE}/spots/${payload.id}/photos`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ url }) }).catch(() => null);
      }
    }
    done(payload.verified ? "地址已由高德核验，自动通过。" : (payload.autocheck ? `${payload.autocheck}。` : "提交成功，等待审核。"), false);
  } catch {
    const items = getOutbox(); items.push({ spot, at: Date.now() }); setOutbox(items);
    saveSpotLocally(imageURL);
    done("网络异常，已在本机保存，联网后会自动同步。", true);
  }
});

/* --------------------------- 编辑地点（分类 + 配图） --------------------------- */
// 按约定：名称/地址/坐标锁定（地点事实不可改，审核结论不受影响），只允许改分类与配图
const editBackdrop = document.querySelector("#editBackdrop");
let editingSpotId = null;
let editingOwner = false;

async function openEditModal(spot) {
  editingSpotId = spot.id;
  // 提交者可以改分类与主图；其他登录用户只能往照片墙追加照片
  editingOwner = spot.isOwner === true;
  document.querySelector("#ownerEditSection").hidden = !editingOwner;
  if (editingOwner) {
    const select = document.querySelector("#editCategory");
    select.innerHTML = Object.keys(categories).filter((key) => key !== "all").map((key) => `<option value="${key}">${categories[key].label}</option>`).join("");
    select.value = spot.category;
    document.querySelector("#editImage").value = "";
    document.querySelector("#editImageNote").textContent = spot.image_url ? "当前已有主图：不选新图则保留原图，选了即替换" : "当前没有主图，可以上传一张";
    document.querySelector("#editMessage").textContent = "";
  }
  document.querySelector("#editWallImage").value = "";
  editBackdrop.hidden = false;
  await refreshPhotoWall(spot.id);
}

async function refreshPhotoWall(spotId) {
  const list = document.querySelector("#editWallList");
  list.innerHTML = '<span class="field-note">加载中…</span>';
  try {
    const response = await fetch(`${API_BASE}/spots/${spotId}/photos`);
    const payload = await response.json();
    const photos = Array.isArray(payload.data) ? payload.data : [];
    if (!photos.length) { list.innerHTML = '<span class="field-note">还没有社区照片，来传第一张</span>'; return; }
    list.innerHTML = photos.map((photo) => `<figure class="wall-item"><img src="${escapeHTML(photo.url)}" alt="社区照片"><figcaption>${escapeHTML(photo.nickname || "社区成员")}</figcaption>${state.currentUser && photo.user_id === state.currentUser.id ? `<button class="wall-delete" type="button" data-wall-photo-id="${photo.id}" aria-label="删除">×</button>` : ""}</figure>`).join("");
    list.querySelectorAll(".wall-delete").forEach((button) => button.addEventListener("click", async () => {
      const response = await fetch(`${API_BASE}/photos/${button.dataset.wallPhotoId}`, { method: "DELETE", headers: authHeaders() });
      if (response.ok) { showToast("照片已删除"); await refreshPhotoWall(spotId); } else { showToast("只能删除自己上传的照片"); }
    }));
  } catch {
    list.innerHTML = '<span class="field-note">照片加载失败</span>';
  }
}

// 照片墙追加公共函数：照片已上传（/api/uploads）后提交到点位照片墙
async function requestPhotoAppend(spotId, url) {
  const response = await fetch(`${API_BASE}/spots/${spotId}/photos`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ url }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "照片提交失败");
  return payload;
}

document.querySelector("#addWallPhotoButton").addEventListener("click", async () => {
  if (!editingSpotId) return;
  const file = document.querySelector("#editWallImage").files[0];
  if (!file) { showToast("请先选择一张照片"); return; }
  if (file.size > 20 * 1024 * 1024) { showToast("单张图片不能超过 20MB"); return; }
  const button = document.querySelector("#addWallPhotoButton");
  button.disabled = true; button.textContent = "上传中…";
  try {
    const uploadResponse = await fetch(`${API_BASE}/uploads`, { method: "POST", headers: authHeaders({ "Content-Type": file.type }), body: file });
    const uploadPayload = await uploadResponse.json().catch(() => ({}));
    if (!uploadResponse.ok) throw new Error(uploadPayload.error || "图片上传失败");
    await requestPhotoAppend(editingSpotId, uploadPayload.url);
    document.querySelector("#editWallImage").value = "";
    showToast("照片已补充到点位");
    await refreshPhotoWall(editingSpotId);
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false; button.textContent = "上传补充照片";
  }
});

document.querySelector("#closeEditButton").addEventListener("click", () => { editBackdrop.hidden = true; });

document.querySelector("#editForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!editingSpotId) return;
  const message = document.querySelector("#editMessage");
  const submitButton = event.currentTarget.querySelector('button[type="submit"]');
  submitButton.disabled = true; submitButton.textContent = "保存中…";
  try {
    const body = { category: document.querySelector("#editCategory").value };
    const file = document.querySelector("#editImage").files[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) throw new Error("单张图片不能超过 20MB。");
      const uploadResponse = await fetch(`${API_BASE}/uploads`, { method: "POST", headers: authHeaders({ "Content-Type": file.type }), body: file });
      const uploadPayload = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok) throw new Error(uploadPayload.error || "图片上传失败");
      body.image_url = uploadPayload.url;
    }
    const response = await fetch(`${API_BASE}/spots/${editingSpotId}`, { method: "PUT", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "保存失败");
    editBackdrop.hidden = true;
    showToast("地点信息已更新");
    await loadPublicSpots();
  } catch (error) {
    message.textContent = error.message;
  } finally {
    submitButton.disabled = false; submitButton.textContent = "保存修改";
  }
});

function showToast(message) { const toast = document.querySelector("#toast"); toast.textContent = message; toast.classList.add("visible"); setTimeout(() => toast.classList.remove("visible"), 2200); }

const authBackdrop = document.querySelector("#authBackdrop");
function openAuth() { authBackdrop.hidden = false; document.querySelector("#authMessage").textContent = ""; document.querySelector("input[name=username]").focus(); }
function updateAuthUI() {
  document.querySelector("#authButton").textContent = state.currentUser ? `${state.currentUser.nickname || state.currentUser.username} · 退出` : "登录 / 注册";
  document.querySelector("#privatePanel").hidden = !state.currentUser;
  document.querySelector("#settingsButton").hidden = !state.currentUser;
  renderList();
}

async function checkLogin() {
  if (!authToken()) return;
  const response = await apiFetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
  if (response.ok) {
    const payload = await response.json();
    state.currentUser = payload.user;
    updateAuthUI();
    // 强制改密最优先：先弹窗，再加载其他数据（地图加载失败也不能阻塞弹窗）
    if (payload.mustChangePassword) showForceChange();
    if (state.currentUser) {
      try { await loadMaps(); } catch { /* 私人地图加载失败不阻塞页面 */ }
    }
  }
}

async function saveSpotToMap(spotId) {
  if (!state.myMaps.length) { showToast("请先在下方创建私人地图"); document.querySelector("#mapForm input").focus(); return; }
  // 只有一张地图直接收藏；多张时弹出选择器，避免所有收藏都堆进同一张
  if (state.myMaps.length === 1) { await collectSpotToMap(state.myMaps[0].id, spotId); return; }
  openMapPicker(spotId);
}

async function collectSpotToMap(mapId, spotId) {
  try {
    const response = await apiFetch(`${API_BASE}/maps/${mapId}/spots`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ spot_id: spotId }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "收藏失败");
    const mapItem = state.myMaps.find((m) => m.id === Number(mapId));
    if (payload.added === false) { showToast(`「${escapeHTML(spotNameById(spotId))}」已在 ${mapItem?.name || "该地图"} 中`); return; }
    showToast(`已收藏到：${mapItem?.name || "私人地图"}`);
    await loadMaps();
    renderList();
  } catch { showToast("收藏失败，请稍后重试"); }
}

function spotNameById(spotId) {
  const source = [...state.spots, ...state.mapSpots];
  const spot = source.find((item) => String(item.id) === String(spotId));
  return spot ? spot.name : "该地点";
}

/* ---------------- 收藏选择器：多张地图时选择收藏到哪张，也可现场新建 ---------------- */
const mapPickBackdrop = document.querySelector("#mapPickBackdrop");

function openMapPicker(spotId) {
  state.pickSpotId = spotId;
  const list = document.querySelector("#mapPickList");
  list.innerHTML = state.myMaps.map((mapItem, index) => `<label class="map-pick-option"><input type="radio" name="pick-map" value="${mapItem.id}" ${index === 0 ? "checked" : ""}><span>${escapeHTML(mapItem.name)}</span><small>${(mapItem.spot_ids || []).length} 个点位</small></label>`).join("");
  mapPickBackdrop.hidden = false;
}

document.querySelector("#closeMapPickButton").addEventListener("click", () => { mapPickBackdrop.hidden = true; });
document.querySelector("#confirmMapPickButton").addEventListener("click", async () => {
  const selected = document.querySelector('input[name="pick-map"]:checked');
  if (!selected || !state.pickSpotId) return;
  mapPickBackdrop.hidden = true;
  await collectSpotToMap(Number(selected.value), state.pickSpotId);
});
document.querySelector("#createAndPickButton").addEventListener("click", async () => {
  const name = document.querySelector("#mapPickNewName").value.trim();
  if (name.length < 2) { showToast("地图名称需 2-40 个字符"); return; }
  try {
    const response = await apiFetch(`${API_BASE}/maps`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ name }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "创建失败");
    const newId = payload.id;
    mapPickBackdrop.hidden = true;
    document.querySelector("#mapPickNewName").value = "";
    await loadMaps();
    await collectSpotToMap(newId, state.pickSpotId);
  } catch (error) { showToast(error.message || "创建失败"); }
});

async function loadMaps() {
  const response = await apiFetch(`${API_BASE}/maps`, { headers: authHeaders() });
  if (!response || !response.ok) return;
  const payload = await response.json();
  state.myMaps = payload.data || [];
  // 构建「已收藏」映射：spotId → 地图名（同一地点收藏进多张地图时显示第一张）
  state.savedMapName = {};
  state.myMaps.forEach((mapItem) => (mapItem.spot_ids || []).forEach((id) => { if (!state.savedMapName[String(id)]) state.savedMapName[String(id)] = mapItem.name; }));
  renderPrivateMaps();
  renderList();
}

function renderPrivateMaps() {
  const container = document.querySelector("#privateMapList");
  if (!state.myMaps.length) { container.innerHTML = "还没有私人地图"; return; }
  container.innerHTML = state.myMaps.map((mapItem) => `<button class="private-map-item ${state.openMapId === mapItem.id ? "active" : ""}" data-map-id="${mapItem.id}" type="button">${escapeHTML(mapItem.name)}${mapItem.role === "editor" ? '<em class="collab-tag">协作</em>' : ""}<small>${(mapItem.spot_ids || []).length} 个点位</small></button>`).join("");
  container.querySelectorAll(".private-map-item").forEach((button) => button.addEventListener("click", () => toggleMapDetail(Number(button.dataset.mapId))));
}

/* ---------------- 地图详情：点击地图名展开点位清单，可高亮定位、移除 ---------------- */
async function toggleMapDetail(mapId) {
  if (state.openMapId === mapId) {
    state.openMapId = null;
    renderPrivateMaps();
    const detail = document.querySelector("#privateMapDetail");
    detail.hidden = true;
    detail.innerHTML = "";
    return;
  }
  state.openMapId = mapId;
  renderPrivateMaps();
  await openMapDetail(mapId);
}

async function openMapDetail(mapId) {
  const detail = document.querySelector("#privateMapDetail");
  detail.hidden = false;
  detail.innerHTML = '<span class="field-note">加载中……</span>';
  const mapItem = state.myMaps.find((m) => m.id === mapId);
  const response = await apiFetch(`${API_BASE}/maps/${mapId}/spots`, { headers: authHeaders() });
  if (!response || !response.ok) { detail.innerHTML = '<span class="field-note">加载失败，请稍后重试</span>'; return; }
  const payload = await response.json();
  const spots = payload.data || [];
  const isOwnerMap = mapItem?.role !== "editor";
  const statusLabel = mapItem?.role === "editor" ? '<span class="collab-tag">协作地图</span>' : (mapItem?.shared ? '<span class="collab-tag">已分享</span>' : "");
  // 删除/分享/成员管理仅主人可用；协作者可编辑点位与名称
  const ownerActions = isOwnerMap ? `<button class="text-button share-map-button" type="button">${mapItem?.shared ? "取消分享" : "分享"}</button><button class="remove-map-spot delete-map-button" type="button">删除地图</button>` : "";
  // 头部：地图名称直接在输入框里改（替代原来的 prompt 重命名），旁边是操作按钮
  const head = `<div class="map-detail-head">
    <div class="map-detail-name"><input id="mapNameInput" value="${escapeHTML(mapItem?.name || "")}" maxlength="40" aria-label="地图名称"><button class="text-button rename-save-button" type="button">保存名称</button>${statusLabel}</div>
    <div class="card-actions"><button class="text-button plan-route-button" type="button" ${spots.length < 2 ? "disabled title=\"至少收藏 2 个点位才能规划路线\"" : ""}>顺路规划</button><button class="text-button collab-button" type="button">协作</button>${ownerActions}</div>
  </div>`;
  const bodyHTML = spots.length
    ? spots.map((spot) => `<div class="private-map-spot"><div class="private-map-spot-info"><strong>${escapeHTML(spot.name)}</strong><span>${escapeHTML(spot.address || "")}</span></div><span class="card-actions"><button class="text-button highlight-map-spot" data-spot-id="${spot.id}" type="button">主地图高亮</button><button class="remove-map-spot" data-spot-id="${spot.id}" type="button">移除</button></span></div>`).join("")
    : '<p class="field-note">这张地图还没有收藏点位：在上方「热门地点」列表的卡片上点「收藏」，就能把点位加进来。</p>';
  detail.innerHTML = head + `<div class="private-map-detail-list">${bodyHTML}</div>` + '<div id="collabSection" class="collab-section" hidden></div>';
  detail.querySelectorAll(".highlight-map-spot").forEach((button) => button.addEventListener("click", () => highlightMapSpots(mapId)));
  // 顺路规划：复用 AI 推荐的贪心排序 + 向导区小地图画线，把收藏点位串成一条路线
  const planButton = detail.querySelector(".plan-route-button");
  if (planButton) planButton.addEventListener("click", () => {
    if (spots.length < 2) { showToast("这张地图至少要 2 个点位才能规划路线"); return; }
    drawRoute(spots);
    document.querySelector("#guideMap").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  // 分享 / 取消分享合并为一个按钮，随状态切换文案（仅主人）
  const shareButton = detail.querySelector(".share-map-button");
  if (shareButton) shareButton.addEventListener("click", async () => {
    if (mapItem?.shared) {
      if (!window.confirm("取消后，之前分享的链接将立即失效（再次点「分享」会生成新链接）。确定吗？")) return;
      const response2 = await apiFetch(`${API_BASE}/maps/${mapId}/share`, { method: "DELETE", headers: authHeaders() });
      if (!response2 || !response2.ok) { showToast("操作失败，请稍后重试"); return; }
      showToast("已取消分享");
      await loadMaps();
      if (state.openMapId === mapId) await openMapDetail(mapId);
      return;
    }
    const response2 = await apiFetch(`${API_BASE}/maps/${mapId}/share`, { method: "POST", headers: authHeaders() });
    const payload2 = await response2.json().catch(() => ({}));
    if (!response2 || !response2.ok) { showToast(payload2.error || "生成分享链接失败"); return; }
    const url = `${location.origin}/shared.html?t=${payload2.share_token}`;
    try { await navigator.clipboard.writeText(url); showToast("只读分享链接已复制，发给朋友即可查看"); }
    catch { window.prompt("复制下面的只读分享链接", url); }
    await loadMaps();
    if (state.openMapId === mapId) await openMapDetail(mapId);
  });
  // 协作面板：主人可按用户名添加/移除协作者，双方都可查看成员
  detail.querySelector(".collab-button").addEventListener("click", () => {
    const section = detail.querySelector("#collabSection");
    if (!section.hidden) { section.hidden = true; section.innerHTML = ""; return; }
    renderCollabSection(section, mapId);
  });
  detail.querySelectorAll(".remove-map-spot[data-spot-id]").forEach((button) => button.addEventListener("click", async (event) => {
    event.stopPropagation();
    const response2 = await apiFetch(`${API_BASE}/maps/${mapId}/spots/${button.dataset.spotId}`, { method: "DELETE", headers: authHeaders() });
    if (!response2 || !response2.ok) { showToast("移除失败，请稍后重试"); return; }
    showToast("已从地图移除");
    await loadMaps();
    if (state.openMapId === mapId) await openMapDetail(mapId);
  }));
  // 地图名称就地修改：点「保存名称」或回车提交
  const nameInput = detail.querySelector("#mapNameInput");
  const saveName = async () => {
    const name = nameInput.value.trim();
    if (!name || name === (mapItem?.name || "")) return;
    const response2 = await apiFetch(`${API_BASE}/maps/${mapId}`, { method: "PATCH", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ name }) });
    const payload2 = await response2.json().catch(() => ({}));
    if (!response2.ok) { showToast(payload2.error || "保存失败"); return; }
    showToast("名称已保存");
    await loadMaps();
    if (state.openMapId === mapId) await openMapDetail(mapId);
  };
  detail.querySelector(".rename-save-button").addEventListener("click", saveName);
  nameInput.addEventListener("keydown", (event) => { if (event.key === "Enter") saveName(); });
  // 删除地图：软删除进回收站，30 天内可在「最近删除」中恢复（仅主人）
  const deleteButton = detail.querySelector(".delete-map-button");
  if (deleteButton) deleteButton.addEventListener("click", async () => {
    const mapItem = state.myMaps.find((m) => m.id === mapId);
    if (!window.confirm(`确定删除「${mapItem?.name || "这张地图"}」吗？删除后可在「最近删除」中找回（保留 30 天）。`)) return;
    const response2 = await apiFetch(`${API_BASE}/maps/${mapId}`, { method: "DELETE", headers: authHeaders() });
    if (!response2 || !response2.ok) { showToast("删除失败，请稍后重试"); return; }
    showToast("已移入回收站，30 天内可恢复");
    state.openMapId = null;
    const detail2 = document.querySelector("#privateMapDetail");
    detail2.hidden = true;
    detail2.innerHTML = "";
    await loadMaps();
  });
}

async function renderCollabSection(section, mapId) {
  section.hidden = false;
  section.innerHTML = '<span class="field-note">加载中……</span>';
  const response = await apiFetch(`${API_BASE}/maps/${mapId}/collaborators`, { headers: authHeaders() });
  const payload = await response.json().catch(() => ({}));
  if (!response || !response.ok) { section.innerHTML = `<span class="field-note">${escapeHTML(payload.error || "加载失败")}</span>`; return; }
  const members = payload.data || [];
  const isOwner = !!payload.isOwner;
  section.innerHTML = '<p class="private-map-detail-title"><span>协作成员（均可收藏/移除点位、重命名）</span></p>' +
    (members.length ? members.map((member) => `<div class="private-map-spot"><div class="private-map-spot-info"><strong>${escapeHTML(member.nickname || "社区成员")}</strong><span>用户 ID ${member.id}</span></div><span class="card-actions">${isOwner ? `<button class="remove-map-spot remove-collab-button" data-user-id="${member.id}" type="button">移除</button>` : ""}</span></div>`).join("") : '<p class="field-note">还没有协作者。添加后，对方能在自己的「我的私人地图」里看到这张地图并一起编辑。</p>') +
    (isOwner ? '<div class="collab-add"><input id="collabUsernameInput" type="text" placeholder="输入对方的用户名（或昵称）" maxlength="40"><button class="text-button" id="addCollabButton" type="button">添加协作者 +</button></div><div id="collabCandidates" class="collab-candidates"></div>' : "");
  section.querySelectorAll(".remove-collab-button").forEach((button) => button.addEventListener("click", async () => {
    const response2 = await apiFetch(`${API_BASE}/maps/${mapId}/collaborators/${button.dataset.userId}`, { method: "DELETE", headers: authHeaders() });
    if (!response2 || !response2.ok) { showToast("移除失败，请稍后重试"); return; }
    showToast("已移除协作者");
    await renderCollabSection(section, mapId);
  }));
  const addButton = section.querySelector("#addCollabButton");
  if (addButton) addButton.addEventListener("click", async () => {
    const input = section.querySelector("#collabUsernameInput");
    const username = input.value.trim();
    if (username.length < 2) { showToast("请输入对方的用户名"); return; }
    const response2 = await apiFetch(`${API_BASE}/maps/${mapId}/collaborators`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ username }) });
    const payload2 = await response2.json().catch(() => ({}));
    if (!response2 || !response2.ok) {
      // 昵称撞名：展示候选列表让主人选择具体用户
      if (payload2.candidates?.length) { renderCandidatePicker(section, mapId, payload2.candidates); return; }
      showToast(payload2.error || "添加失败");
      return;
    }
    showToast(payload2.added ? `已添加 ${payload2.user.nickname || "社区成员"} 为协作者` : "该用户已经是协作者");
    input.value = "";
    await renderCollabSection(section, mapId);
  });
}

// 昵称重名时的候选选择：选中后按 user_id 精确添加（候选只含昵称与用户 ID，不暴露登录名）
function renderCandidatePicker(section, mapId, candidates) {
  const box = section.querySelector("#collabCandidates");
  if (!box) return;
  box.innerHTML = '<p class="field-note">以下用户昵称相同，请选择要添加的人：</p>' +
    candidates.map((candidate) => `<label class="map-pick-option"><input type="radio" name="collab-candidate" value="${candidate.id}"><span>${escapeHTML(candidate.nickname || "社区成员")}</span><small>用户 ID ${candidate.id}</small></label>`).join("") +
    '<button class="text-button" id="confirmCandidateButton" type="button">添加选中的用户 →</button>';
  const first = box.querySelector('input[name="collab-candidate"]');
  if (first) first.checked = true;
  box.querySelector("#confirmCandidateButton").addEventListener("click", async () => {
    const selected = box.querySelector('input[name="collab-candidate"]:checked');
    if (!selected) return;
    const response2 = await apiFetch(`${API_BASE}/maps/${mapId}/collaborators`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ user_id: Number(selected.value) }) });
    const payload2 = await response2.json().catch(() => ({}));
    if (!response2 || !response2.ok) { showToast(payload2.error || "添加失败"); return; }
    showToast(payload2.added ? `已添加 ${payload2.user.nickname || "社区成员"} 为协作者` : "该用户已经是协作者");
    await renderCollabSection(section, mapId);
  });
}

/* ---------------- 应急地图：附近救援设施 + 一键求助（纯前端，联系人只存本机浏览器） ---------------- */
const EMERGENCY_CATEGORIES = [
  { key: "police", icon: "ph:police-car", label: "警察局", keywords: "派出所|公安局", color: "#2F80ED" },
  { key: "hospital", icon: "ph:hospital", label: "医院", keywords: "医院|卫生院", color: "#E53E3E" },
  { key: "fire", icon: "ph:fire-truck", label: "消防", keywords: "消防", color: "#DD6B20" },
  { key: "shelter", icon: "ph:house-line", label: "避难所", keywords: "应急避难所|避难场所", color: "#38A169" }
];
const EMERGENCY_CONTACTS_KEY = "qingyuan-emergency-contacts";
const emergencyBackdrop = document.querySelector("#emergencyBackdrop");
const emergencyButton = document.querySelector("#emergencyButton");
let emergencyCenter = null;
const emergencyMarkers = [];

function emergencyContacts() {
  try { return JSON.parse(localStorage.getItem(EMERGENCY_CONTACTS_KEY)) || []; } catch { return []; }
}

function sosText() {
  const time = new Date().toLocaleString("zh-CN");
  if (!emergencyCenter) return `【紧急求助】我需要帮助！定位暂不可用，请直接拨打我的电话。发送时间：${time}`;
  const url = `https://uri.amap.com/marker?position=${emergencyCenter.lng},${emergencyCenter.lat}&name=${encodeURIComponent("我的位置")}`;
  const accuracy = emergencyCenter.accuracy ? `（误差约 ${Math.round(emergencyCenter.accuracy)} 米）` : "";
  return `【紧急求助】我需要帮助！我的位置：${url}${accuracy} 发送时间：${time}`;
}

function updateSosText() {
  const box = document.querySelector("#sosText");
  if (box) box.value = sosText();
}

function locateForEmergency() {
  const status = document.querySelector("#emergencyLocateStatus");
  updateSosText();
  const useMapCenter = () => {
    if (typeof map === "undefined" || !map) return;
    const center = map.getCenter();
    emergencyCenter = { lng: center.lng, lat: center.lat, accuracy: 0 };
    updateSosText();
  };
  if (!navigator.geolocation) { status.textContent = "浏览器不支持定位，已用地图中心代替。"; useMapCenter(); return; }
  navigator.geolocation.getCurrentPosition((position) => {
    emergencyCenter = { lng: position.coords.longitude, lat: position.coords.latitude, accuracy: position.coords.accuracy };
    status.textContent = `已定位（误差约 ${Math.round(position.coords.accuracy)} 米）`;
    updateSosText();
  }, () => {
    status.textContent = "定位失败（可能被浏览器拦截），已用地图中心代替。";
    useMapCenter();
  }, { enableHighAccuracy: true, timeout: 8000 });
}

function renderEmergencyContacts() {
  const list = document.querySelector("#contactList");
  if (!list) return;
  const contacts = emergencyContacts();
  list.innerHTML = contacts.length ? contacts.map((contact, index) => `<div class="private-map-spot"><div class="private-map-spot-info"><strong>${escapeHTML(contact.name)}</strong><span>${escapeHTML(contact.phone)}</span></div><span class="card-actions"><a class="text-button" href="tel:${escapeHTML(contact.phone)}"><iconify-icon icon="ph:phone" inline></iconify-icon> 电话</a><button class="text-button sms-contact-button" data-phone="${escapeHTML(contact.phone)}" type="button"><iconify-icon icon="ph:envelope-simple" inline></iconify-icon> 发定位短信</button><button class="remove-map-spot" data-index="${index}" type="button">移除</button></span></div>`).join("") : '<p class="field-note">还没有紧急联系人。联系人只保存在这台设备的浏览器里，不会上传。</p>';
  list.querySelectorAll(".remove-map-spot").forEach((button) => button.addEventListener("click", () => {
    const contacts = emergencyContacts();
    contacts.splice(Number(button.dataset.index), 1);
    localStorage.setItem(EMERGENCY_CONTACTS_KEY, JSON.stringify(contacts));
    renderEmergencyContacts();
  }));
  list.querySelectorAll(".sms-contact-button").forEach((button) => button.addEventListener("click", () => {
    location.href = `sms:${button.dataset.phone}?body=${encodeURIComponent(sosText())}`;
  }));
}

function clearEmergencyMarkers() {
  if (typeof map !== "undefined" && map) emergencyMarkers.forEach((marker) => map.remove(marker));
  emergencyMarkers.length = 0;
}

function searchEmergencyFacilities(key) {
  const category = EMERGENCY_CATEGORIES.find((item) => item.key === key);
  const results = document.querySelector("#emergencyResults");
  if (!category || !results) return;
  if (!emergencyCenter) { showToast("还在定位中，等状态栏显示已定位后再试"); return; }
  if (typeof AMap === "undefined" || !AMap.PlaceSearch) { showToast("地图服务未加载，请刷新页面"); return; }
  results.innerHTML = '<span class="field-note">搜索中……</span>';
  const search = new AMap.PlaceSearch({ pageSize: 10, extensions: "base" });
  search.searchNearBy(category.keywords, [emergencyCenter.lng, emergencyCenter.lat], 3000, (status, result) => {
    const pois = status === "complete" && result.poiList ? result.poiList.pois || [] : [];
    if (!pois.length) { results.innerHTML = '<p class="field-note">附近 3 公里内没有找到，可以换个分类，或直接用下面的快捷拨号。</p>'; return; }
    clearEmergencyMarkers();
    results.innerHTML = pois.map((poi) => {
      const address = typeof poi.address === "string" ? poi.address : "";
      const distance = poi.distance ? ` · 约 ${Math.round(poi.distance)} 米` : "";
      const link = `https://uri.amap.com/navigation?to=${poi.location.lng},${poi.location.lat},${encodeURIComponent(poi.name)}&mode=car&src=qymap-emergency`;
      return `<div class="private-map-spot"><div class="private-map-spot-info"><strong>${category.icon} ${escapeHTML(poi.name)}</strong><span>${escapeHTML(address)}${distance}</span></div><span class="card-actions"><a class="text-button navigate-link" href="${link}" target="_blank" rel="noopener">导航 →</a></span></div>`;
    }).join("");
    pois.forEach((poi) => {
      const marker = new AMap.Marker({
        position: [poi.location.lng, poi.location.lat],
        content: `<div class="marker-pin"><span class="marker-pin-body" style="--marker-color:${category.color}"><iconify-icon icon="${category.icon}" inline></iconify-icon></span></div>`,
        offset: new AMap.Pixel(-16, -41),
        title: poi.name
      });
      map.add(marker);
      emergencyMarkers.push(marker);
    });
    map.setFitView(emergencyMarkers, false, [60, 60, 60, 60]);
    document.querySelector(".map-panel").scrollIntoView({ behavior: "smooth" });
  });
}

emergencyButton.addEventListener("click", () => {
  emergencyBackdrop.hidden = false;
  renderEmergencyContacts();
  locateForEmergency();
});
document.querySelector("#closeEmergencyButton").addEventListener("click", () => {
  emergencyBackdrop.hidden = true;
  clearEmergencyMarkers();
});
document.querySelectorAll(".emergency-categories button").forEach((button) => button.addEventListener("click", () => searchEmergencyFacilities(button.dataset.ekey)));
document.querySelector("#copySosButton").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(sosText()); showToast("求救信息已复制，粘贴发给家人朋友即可"); }
  catch { window.prompt("复制下面的求救信息", sosText()); }
});
document.querySelector("#addContactButton").addEventListener("click", () => {
  const nameInput = document.querySelector("#contactName");
  const phoneInput = document.querySelector("#contactPhone");
  const name = nameInput.value.trim();
  const phone = phoneInput.value.trim();
  if (name.length < 1) { showToast("请填写联系人称呼"); return; }
  if (!/^[+\d][\d\-]{4,14}$/.test(phone)) { showToast("请填写正确的手机号"); return; }
  const contacts = emergencyContacts();
  if (contacts.some((contact) => contact.phone === phone)) { showToast("这个号码已经添加过了"); return; }
  contacts.push({ name, phone });
  localStorage.setItem(EMERGENCY_CONTACTS_KEY, JSON.stringify(contacts));
  nameInput.value = "";
  phoneInput.value = "";
  renderEmergencyContacts();
  showToast("已添加紧急联系人");
});

/* ---------------- 回收站：最近删除的地图可恢复或彻底删除 ---------------- */
const trashToggleButton = document.querySelector("#trashToggleButton");

async function refreshTrashView() {
  const detail = document.querySelector("#privateMapDetail");
  detail.hidden = false;
  detail.innerHTML = '<span class="field-note">加载中……</span>';
  const response = await apiFetch(`${API_BASE}/maps/trash`, { headers: authHeaders() });
  const payload = await response.json().catch(() => ({}));
  if (!response || !response.ok) { detail.innerHTML = `<span class="field-note">${escapeHTML(payload.error || "加载失败，请稍后重试")}</span>`; return; }
  const rows = payload.data || [];
  if (!rows.length) { detail.innerHTML = '<p class="field-note">回收站是空的。删除的地图会在这里保留 30 天。</p>'; return; }
  detail.innerHTML = '<p class="private-map-detail-title"><span>最近删除（保留 30 天，过期自动清除）</span></p>' + rows.map((row) => `<div class="private-map-spot"><div class="private-map-spot-info"><strong>${escapeHTML(row.name)}</strong><span>${row.spot_count || 0} 个点位 · 删除于 ${escapeHTML(String(row.deleted_at || "").slice(0, 10))}</span></div><span class="card-actions"><button class="text-button restore-map-button" data-map-id="${row.id}" type="button">恢复</button><button class="remove-map-spot purge-map-button" data-map-id="${row.id}" type="button">彻底删除</button></span></div>`).join("");
  detail.querySelectorAll(".restore-map-button").forEach((button) => button.addEventListener("click", async () => {
    const response2 = await apiFetch(`${API_BASE}/maps/${button.dataset.mapId}/restore`, { method: "POST", headers: authHeaders() });
    const payload2 = await response2.json().catch(() => ({}));
    if (!response2 || !response2.ok) { showToast(payload2.error || "恢复失败"); return; }
    showToast("已恢复");
    await loadMaps();
    await refreshTrashView();
  }));
  detail.querySelectorAll(".purge-map-button").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("彻底删除后无法恢复，确定吗？")) return;
    const response2 = await apiFetch(`${API_BASE}/maps/${button.dataset.mapId}?permanent=1`, { method: "DELETE", headers: authHeaders() });
    if (!response2 || !response2.ok) { showToast("删除失败，请稍后重试"); return; }
    showToast("已彻底删除");
    await refreshTrashView();
  }));
}

trashToggleButton.addEventListener("click", () => {
  const detail = document.querySelector("#privateMapDetail");
  if (trashToggleButton.classList.contains("active")) {
    trashToggleButton.classList.remove("active");
    detail.hidden = true;
    detail.innerHTML = "";
    return;
  }
  trashToggleButton.classList.add("active");
  state.openMapId = null;
  renderPrivateMaps();
  refreshTrashView();
});

function highlightMapSpots(mapId) {
  const mapItem = state.myMaps.find((m) => m.id === mapId);
  const ids = new Set((mapItem?.spot_ids || []).map(String));
  if (!ids.size) { showToast("这张地图还没有点位"); return; }
  // 与 AI 推荐高亮同一机制：主地图只高亮不画线
  state.highlightIds = ids;
  renderMarkers();
  const source = state.myOnly ? state.spots : state.mapSpots;
  const targets = source.filter((spot) => ids.has(String(spot.id)) && spot.locationVerified !== false);
  if (!targets.length) { showToast("地图数据尚未同步，稍后再试"); return; }
  if (targets.length === 1) {
    map.setZoomAndCenter(16, [targets[0].lng, targets[0].lat]);
  } else {
    const lngs = targets.map((spot) => spot.lng);
    const lats = targets.map((spot) => spot.lat);
    map.setBounds(new AMap.Bounds(new AMap.LngLat(Math.min(...lngs), Math.min(...lats)), new AMap.LngLat(Math.max(...lngs), Math.max(...lats))));
  }
  document.querySelector(".map-panel").scrollIntoView({ behavior: "smooth" });
  showToast(`已在主地图高亮 ${targets.length} 个收藏点位`);
}

document.querySelector("#authButton").addEventListener("click", async () => {
  if (!state.currentUser) { openAuth(); return; }
  await apiFetch(`${API_BASE}/auth/logout`, { method: "POST", headers: authHeaders() }); localStorage.removeItem(AUTH_TOKEN_KEY); state.currentUser = null; state.myMaps = []; state.savedMapName = {}; state.openMapId = null; renderPrivateMaps(); trashToggleButton.classList.remove("active"); document.querySelector("#privateMapDetail").hidden = true; updateAuthUI(); showToast("已退出登录");
});
document.querySelector("#closeAuthButton").addEventListener("click", () => { authBackdrop.hidden = true; });
document.querySelector("#authSwitchButton").addEventListener("click", () => {
  // 注册已移至独立页面 register.html：Turnstile 只在注册页加载，避免其 CSP 影响主页面地图
  location.href = "register.html";
});
// 手机号归一化：与后端一致（去空格/连字符/+86 前缀）
function normalizePhone(value) {
  let phone = String(value ?? "").replace(/[\s-]/g, "");
  if (/^\+?86(?=\d{11}$)/.test(phone)) phone = phone.replace(/^\+?86/, "");
  return /^1[3-9]\d{9}$/.test(phone) ? phone : null;
}

function showAuthLoginView() {
  document.querySelector("#authForm").hidden = false;
  document.querySelector("#authSwitchButton").hidden = false;
  document.querySelector("#forgotPasswordButton").hidden = false;
  document.querySelector("#phoneResetPanel").hidden = true;
  document.querySelector("#forgotPanel").hidden = true;
  document.querySelector("#authTitle").textContent = "登录清远地图";
  document.querySelector("#authMessage").textContent = "";
}

document.querySelector("#forgotPasswordButton").addEventListener("click", () => {
  // 默认走手机号快速找回：核验通过立即改密，无需等管理员审核
  document.querySelector("#authForm").hidden = true;
  document.querySelector("#authSwitchButton").hidden = true;
  document.querySelector("#forgotPasswordButton").hidden = true;
  document.querySelector("#phoneResetPanel").hidden = false;
  document.querySelector("#authTitle").textContent = "通过手机号找回密码";
  document.querySelector("#authMessage").textContent = "";
  document.querySelector("#phoneResetMessage").textContent = "";
  document.querySelector("#phoneResetUsername").focus();
});

document.querySelector("#phoneResetBackButton").addEventListener("click", showAuthLoginView);
document.querySelector("#toAdminResetButton").addEventListener("click", () => {
  document.querySelector("#phoneResetPanel").hidden = true;
  document.querySelector("#forgotPanel").hidden = false;
  document.querySelector("#authTitle").textContent = "申请重置密码（人工审核）";
  document.querySelector("#forgotMessage").textContent = "";
});
document.querySelector("#toPhoneResetButton").addEventListener("click", () => {
  document.querySelector("#forgotPanel").hidden = true;
  document.querySelector("#phoneResetPanel").hidden = false;
  document.querySelector("#authTitle").textContent = "通过手机号找回密码";
});

document.querySelector("#phoneResetForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = document.querySelector("#phoneResetMessage");
  const username = document.querySelector("#phoneResetUsername").value.trim();
  const phone = normalizePhone(document.querySelector("#phoneResetPhone").value);
  const newPassword = document.querySelector("#phoneResetPassword").value;
  if (!username) { message.textContent = "请填写注册时的用户名"; return; }
  if (!phone) { message.textContent = "手机号格式不正确：请输入 11 位大陆手机号"; return; }
  if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) { message.textContent = "新密码至少 8 位，需同时包含字母和数字"; return; }
  const button = document.querySelector("#phoneResetSubmitButton");
  button.disabled = true;
  message.textContent = "核验中……";
  try {
    const response = await apiFetch(`${API_BASE}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, phone, newPassword })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "重置失败");
    // 重置成功：直接用新密码自动登录（把用户名带回登录框，体验更顺）
    message.textContent = "密码已重置，正在自动登录……";
    const loginResponse = await apiFetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: newPassword })
    });
    const loginPayload = await loginResponse.json().catch(() => ({}));
    if (!loginResponse.ok) throw new Error(loginPayload.error || "自动登录失败，请手动登录");
    localStorage.setItem(AUTH_TOKEN_KEY, loginPayload.token);
    state.currentUser = loginPayload.user;
    updateAuthUI();
    showToast("密码已重置并登录成功");
    authBackdrop.hidden = true;
  } catch (error) {
    message.textContent = error.message;
  }
  button.disabled = false;
});

document.querySelector("#forgotBackButton").addEventListener("click", showAuthLoginView);

document.querySelector("#forgotForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = document.querySelector("#forgotMessage");
  const username = document.querySelector("#forgotUsername").value.trim();
  if (!username) { message.textContent = "请填写用户名"; return; }
  document.querySelector("#forgotSubmitButton").disabled = true;
  message.textContent = "提交中……";
  try {
    const response = await fetch(`${API_BASE}/auth/reset-request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, note: document.querySelector("#forgotNote").value.trim() }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "提交失败");
    message.textContent = payload.message || "申请已提交";
  } catch (error) {
    message.textContent = error.message;
  }
  document.querySelector("#forgotSubmitButton").disabled = false;
});

// 强制改密：临时密码登录后必须设置新密码才能继续
const forceChangeBackdrop = document.querySelector("#forceChangeBackdrop");
function showForceChange() { forceChangeBackdrop.hidden = false; }
document.querySelector("#forceChangeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = document.querySelector("#forceChangeMessage");
  const newPassword = document.querySelector("#forceNewPassword").value;
  message.textContent = "保存中……";
  try {
    const response = await fetch(`${API_BASE}/auth/change-password`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ newPassword }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "修改失败");
    // 改密成功：重载页面清掉 URL 参数与全部临时状态
    location.href = location.pathname;
  } catch (error) {
    message.textContent = error.message;
  }
});
document.querySelector("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget));
  const message = document.querySelector("#authMessage"); message.textContent = "处理中……";
  try { const response = await apiFetch(`${API_BASE}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: data.username, password: data.password }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "请求失败"); localStorage.setItem(AUTH_TOKEN_KEY, payload.token); state.currentUser = payload.user; authBackdrop.hidden = true; updateAuthUI(); if (payload.mustChangePassword) { location.href = location.pathname + "?forceChange=1"; return; } await loadMaps(); showToast(`欢迎，${payload.user.nickname || payload.user.username}`); } catch (error) { message.textContent = error.message; }
});
/* ---------------- 提交表单 · 子标签：分类下再细分自定义标签（美食有预设建议） ---------------- */
const TAG_PRESETS = { food: ["早茶", "烧烤", "火锅", "小炒", "甜品", "夜宵", "粉面", "奶茶"] };
const tagSection = document.querySelector("#tagSection");
const tagChips = document.querySelector("#tagChips");
const tagCustomInput = document.querySelector("#tagCustomInput");
const selectedTags = new Set();

function renderTagChips(category) {
  const presets = TAG_PRESETS[category] || [];
  tagChips.innerHTML = presets.length
    ? presets.map((tag) => `<button type="button" class="tag-chip${selectedTags.has(tag) ? " on" : ""}" data-tag="${tag}">${tag}</button>`).join("")
    : '<span class="field-note">该分类暂无建议标签，可直接在下方输入自定义标签</span>';
  tagChips.querySelectorAll("button[data-tag]").forEach((button) => button.addEventListener("click", () => {
    const tag = button.dataset.tag;
    if (selectedTags.has(tag)) { selectedTags.delete(tag); button.classList.remove("on"); return; }
    if (selectedTags.size >= 5) { showToast("最多选 5 个子标签"); return; }
    selectedTags.add(tag);
    button.classList.add("on");
  }));
}

document.querySelector("select[name=category]").addEventListener("change", (event) => {
  selectedTags.clear();
  renderTagChips(event.target.value);
});
renderTagChips(document.querySelector("select[name=category]").value || "food");

// 组装提交的子标签：选中的预设 + 自定义输入（逗号分隔），合计最多 5 个
function collectFormTags() {
  const custom = tagCustomInput.value.split(/[,，、\s]+/).map((tag) => tag.trim()).filter(Boolean);
  const tags = [...new Set([...selectedTags, ...custom])];
  if (tags.length > 5) { showToast("子标签最多 5 个"); return null; }
  return tags;
}

document.querySelector("#mapForm").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const name = new FormData(form).get("name"); try { const response = await apiFetch(`${API_BASE}/maps`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ name }) }); const payload = await response.json().catch(() => ({})); if (!response.ok) throw new Error(payload.error || "创建失败"); form.reset(); await loadMaps(); showToast(`私人地图“${payload.name}”已创建`); } catch (error) { showToast(error.message || "创建失败"); } });
// AI 生成私人地图：输入主题，模型从已上线点位中挑 2-8 个自动建图
document.querySelector("#autoMapForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const theme = new FormData(form).get("theme");
  const button = form.querySelector("button");
  button.disabled = true; button.textContent = "AI 挑选中……";
  try {
    const response = await apiFetch(`${API_BASE}/maps/auto`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ theme }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "生成失败");
    form.reset();
    await loadMaps();
    showToast(`AI 已创建「${payload.name}」，挑了 ${payload.spot_ids?.length || 0} 个点位`);
  } catch (error) { showToast(error.message || "生成失败"); }
  finally { button.disabled = false; button.innerHTML = '<iconify-icon icon="ph:sparkle" inline></iconify-icon> AI 挑地点建图'; }
});
render();
loadPublicSpots();
checkLogin();
// 从「全部地点」页点卡片跳回时（index.html?spot=ID），定位该点位并打开弹窗；
// 带 &detail=1 时直接打开点评详情（all.html 的「点评」入口）
const requestedSpot = new URLSearchParams(location.search).get("spot");
if (requestedSpot) {
  const openDetail = new URLSearchParams(location.search).has("detail");
  const waitForSpot = (tries) => {
    const spot = state.mapSpots.find((item) => String(item.id) === requestedSpot);
    if (spot) {
      map.setZoomAndCenter(16, [spot.lng, spot.lat], true);
      const marker = state.markers.find((m) => m.getTitle() === spot.name);
      if (marker) marker.emit("click");
      if (openDetail) openSpotDetail(spot.id);
    } else if (tries > 0) {
      setTimeout(() => waitForSpot(tries - 1), 500);
    }
  };
  waitForSpot(20);
}
// 离线提交重发 + 联网即同步 + 定时检查新点位 + 审核结果提醒
flushOutbox();
window.addEventListener("online", flushOutbox);
setInterval(checkUpdates, 60000);
setInterval(checkReviewResults, 60000);
setupReviewReminder();
checkReviewResults();

/* ==================================================================
 * 大众点评：评分与评论（匿名 / 实名）
 * - 匿名点评：显示「匿名用户」+ 模糊头像，不返回任何作者信息，无法进入用户主页
 * - 实名点评：显示用户昵称 + 头像，点击头像可进入该用户公开主页
 * ================================================================== */
const AVATAR_COLORS = ["#5995a8", "#eb765e", "#b4778e", "#68a678", "#6f7fc0", "#d39a47"];
function avatarColor(seed) {
  const text = String(seed ?? "");
  let sum = 0;
  for (const ch of text) sum += ch.charCodeAt(0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}
// 头像：有自定义头像用图片；没有则用昵称首字 + 按用户生成的底色
function avatarSpan(user, options = {}) {
  const size = options.small ? " small" : "";
  const seed = options.seed ?? (user ? (user.id ?? user.nickname ?? user.username ?? "") : "");
  const name = user ? (user.nickname || user.username || "用") : "?";
  const inner = user && user.avatar_url
    ? `<img src="${escapeHTML(user.avatar_url)}" alt="${escapeHTML(name)}的头像">`
    : escapeHTML(String(name).trim().charAt(0).toUpperCase() || "?");
  return `<span class="avatar${size}" style="--avatar-color:${avatarColor(seed)}">${inner}</span>`;
}
// 匿名头像：模糊人形图标，配合「匿名用户」名称展示
function anonymousAvatarSpan(small = false) {
  return `<span class="avatar anonymous${small ? " small" : ""}" aria-hidden="true"><iconify-icon icon="ph:user" inline></iconify-icon></span>`;
}
function starsHTML(rating) {
  const value = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return Array.from({ length: 5 }, (_, index) => `<span class="${index < value ? "on" : ""}">★</span>`).join("");
}
function ratingLineHTML(spot) {
  if (!spot || !spot.review_count) return "";
  return `<div class="card-rating"><span class="stars">${starsHTML(spot.avg_rating)}</span>${Number(spot.avg_rating).toFixed(1)}<small>${spot.review_count} 条点评</small></div>`;
}
function formatReviewTime(value) { return escapeHTML(String(value || "").slice(0, 16)); }

/* ---------------- 地点详情 + 评论区（左列就地面板：覆盖 hero，右侧地图保留定位显示） ---------------- */
const detailPanel = document.querySelector("#detailPanel");
const introPanel = document.querySelector(".intro-panel");
let detailSpotId = null;
let reviewStarValue = 5;

function showDetailPanel() {
  if (introPanel) introPanel.hidden = true;
  detailPanel.hidden = false;
  detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
}
// 进入详情前的高亮集合（如 AI 推荐的高亮），关闭详情时恢复
let highlightBeforeDetail = null;
function hideDetailPanel() {
  stopPhotoAutoPlay();
  closePhotoLightbox();
  detailPanel.hidden = true;
  if (introPanel) introPanel.hidden = false;
  state.highlightIds = highlightBeforeDetail || new Set();
  highlightBeforeDetail = null;
  renderMarkers();
}

function setReviewStars(value) {
  reviewStarValue = value;
  document.querySelectorAll("#starInput button").forEach((button, index) => button.classList.toggle("on", index < value));
}

function renderStarInput() {
  const holder = document.querySelector("#starInput");
  holder.innerHTML = Array.from({ length: 5 }, (_, index) => `<button type="button" data-star="${index + 1}" class="${index < reviewStarValue ? "on" : ""}" aria-label="${index + 1} 星">★</button>`).join("");
  holder.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => setReviewStars(Number(button.dataset.star))));
}

function findSpotAnywhere(spotId) {
  return state.spots.find((item) => String(item.id) === String(spotId))
    || state.mapSpots.find((item) => String(item.id) === String(spotId));
}

function openSpotDetail(spotId) {
  const spot = findSpotAnywhere(spotId);
  if (!spot) { showToast("未找到该地点"); return; }
  detailSpotId = spot.id;
  // 地图上高亮当前详情点位（橙色光圈），方便在多图钉中区分；关闭详情时恢复之前的高亮
  if (detailPanel.hidden) highlightBeforeDetail = state.highlightIds;
  state.highlightIds = new Set([String(spot.id)]);
  renderMarkers();
  // 地图同步弹出该点位的图钉信息窗（照片墙在弹窗里），与左侧详情联动
  const marker = state.markers.find((m) => m.getTitle() === spot.name);
  if (marker) marker.emit("click");
  const item = categories[spot.category] || categories.all;
  const image = document.querySelector("#detailImage");
  if (spot.image_url) { image.src = spot.image_url; image.hidden = false; image.alt = spot.name; } else { image.hidden = true; image.removeAttribute("src"); }
  document.querySelector("#detailTitle").textContent = spot.name;
  const tag = document.querySelector("#detailCategory");
  tag.textContent = item.label;
  tag.style.setProperty("--chip-color", item.color);
  const navigate = document.querySelector("#detailNavigate");
  navigate.href = navigationURL(spot);
  navigate.dataset.navId = spot.id;
  navigate.innerHTML = `<iconify-icon icon="ph:navigation-arrow" inline></iconify-icon> ${escapeHTML(spot.address || "地图上的目的地")} · 导航`;
  document.querySelector("#detailDescription").textContent = spot.description || "";
  // 子标签展示在详情元信息区
  const detailTags = parseSpotTagsClient(spot.tags);
  document.querySelector("#detailTags").innerHTML = detailTags ? detailTags : "";
  document.querySelector("#ratingSummary").innerHTML = '<span class="field-note">评分加载中…</span>';
  document.querySelector("#reviewList").innerHTML = '<span class="field-note">点评加载中…</span>';
  document.querySelector("#reviewMessage").textContent = "";
  // 表单可见性：未登录提示登录；登录则展示（提交逻辑里会预填我的点评）
  document.querySelector("#reviewForm").hidden = !state.currentUser;
  document.querySelector("#reviewLoginHint").hidden = Boolean(state.currentUser);
  // 补图区块：登录用户在详情页直接给点位追加照片
  document.querySelector("#detailPhotoBlock").hidden = !state.currentUser;
  document.querySelector("#detailWallImage").value = "";
  renderDetailPhotoCarousel(spot.id);
  showDetailPanel();
  renderStarInput();
  setReviewStars(5);
  document.querySelector("#reviewContent").value = "";
  document.querySelector("#reviewAnonymous").checked = false;
  document.querySelector("#reviewSubmitButton").innerHTML = '发表点评 <span>→</span>';
  document.querySelector("#reviewFormLabel").textContent = "我的点评（一人一店一条，再次提交为修改）";
  loadSpotReviews(spot.id);
}

async function loadSpotReviews(spotId) {
  try {
    const response = await apiFetch(`${API_BASE}/spots/${spotId}/reviews`, { headers: authHeaders() });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "点评加载失败");
    const reviews = Array.isArray(payload.data) ? payload.data : [];
    const stats = payload.stats || {};
    renderRatingSummary(stats);
    renderReviewList(reviews);
    prefillMyReview(reviews);
    syncSpotRating(spotId, stats);
  } catch (error) {
    document.querySelector("#ratingSummary").innerHTML = `<span class="field-note">${escapeHTML(error.message || "评分加载失败")}</span>`;
    document.querySelector("#reviewList").innerHTML = '<span class="field-note">点评加载失败，请稍后重试</span>';
  }
}

function renderRatingSummary(stats) {
  const holder = document.querySelector("#ratingSummary");
  if (!stats || !stats.count) { holder.innerHTML = '<span class="field-note">还没有评分，来做第一个点评的人吧</span>'; return; }
  holder.innerHTML = `<span class="rating-value">${Number(stats.average).toFixed(1)}</span><span class="rating-sub"><span class="stars">${starsHTML(stats.average)}</span><span>${stats.count} 条点评</span></span>`;
}

function renderReviewList(reviews) {
  const holder = document.querySelector("#reviewList");
  if (!reviews.length) { holder.innerHTML = '<div class="empty-state">还没有点评，点上方评分抢个沙发吧。</div>'; return; }
  holder.innerHTML = reviews.map((review) => {
    // 匿名点评：user 为空（后端不返回任何作者字段），展示匿名用户 + 模糊头像
    const head = review.anonymous || !review.user
      ? `<div class="review-anon-name">${anonymousAvatarSpan()}匿名用户<span class="review-badge">匿名</span></div>`
      : `<button class="review-user" data-user-id="${review.user.id}" type="button" title="查看 TA 的主页">${avatarSpan(review.user)}<strong class="review-name">${escapeHTML(review.user.nickname || review.user.username || "社区成员")}</strong></button>`;
    return `<article class="review-item${review.anonymous ? " anonymous" : ""}">${head}<div class="review-body"><span class="stars">${starsHTML(review.rating)}</span><p>${escapeHTML(review.content)}</p><span class="review-foot"><small>${formatReviewTime(review.created_at)}</small>${review.mine ? `<button class="review-delete" data-review-delete-id="${review.id}" type="button">删除我的点评</button>` : ""}</span></div></article>`;
  }).join("");
}

// 已有我的点评：预填评分/内容/匿名状态，按钮变为「保存修改」
function prefillMyReview(reviews) {
  const mine = reviews.find((review) => review.mine);
  if (!mine || !state.currentUser) return;
  setReviewStars(mine.rating);
  document.querySelector("#reviewContent").value = mine.content;
  document.querySelector("#reviewAnonymous").checked = Boolean(mine.anonymous);
  document.querySelector("#reviewSubmitButton").innerHTML = '保存修改 <span>→</span>';
  document.querySelector("#reviewFormLabel").textContent = "我的点评（再次提交会覆盖原内容）";
}

// 评分变化同步到列表卡片与地图弹窗的展示
function syncSpotRating(spotId, stats) {
  const patch = (list) => {
    const target = list.find((item) => String(item.id) === String(spotId));
    if (target) { target.avg_rating = stats.average; target.review_count = stats.count; }
  };
  patch(state.spots);
  patch(state.mapSpots);
  renderList();
  renderMarkers();
}

document.querySelector("#reviewForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.currentUser) { openAuth(); return; }
  const message = document.querySelector("#reviewMessage");
  const content = document.querySelector("#reviewContent").value.trim();
  if (content.length < 2) { message.textContent = "点评内容至少 2 个字"; return; }
  const button = document.querySelector("#reviewSubmitButton");
  button.disabled = true;
  message.textContent = "提交中……";
  try {
    const response = await apiFetch(`${API_BASE}/spots/${detailSpotId}/reviews`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ rating: reviewStarValue, content, anonymous: document.querySelector("#reviewAnonymous").checked })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "点评失败");
    message.textContent = "";
    showToast(payload.updated ? "点评已更新" : "点评已发表");
    await loadSpotReviews(detailSpotId);
  } catch (error) {
    message.textContent = error.message;
  }
  button.disabled = false;
});

async function deleteMyReview(reviewId) {
  if (!window.confirm("确定删除这条点评吗？")) return;
  try {
    const response = await apiFetch(`${API_BASE}/reviews/${reviewId}`, { method: "DELETE", headers: authHeaders() });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "删除失败");
    showToast("点评已删除");
    if (detailSpotId) await loadSpotReviews(detailSpotId);
  } catch (error) {
    showToast(error.message);
  }
}

/* ---------------- 详情页照片轮播（自动播放 + 触摸滑动）与点击放大灯箱 ---------------- */
let detailPhotos = [];
let detailPhotoIndex = 0;
let detailPhotoTimer = null;

function stopPhotoAutoPlay() { if (detailPhotoTimer) { clearInterval(detailPhotoTimer); detailPhotoTimer = null; } }
function showDetailPhoto(index) {
  if (!detailPhotos.length) return;
  detailPhotoIndex = (index + detailPhotos.length) % detailPhotos.length;
  document.querySelector("#detailPhotoTrack").style.transform = `translateX(-${detailPhotoIndex * 100}%)`;
  document.querySelectorAll("#detailPhotoDots button").forEach((dot, i) => dot.classList.toggle("on", i === detailPhotoIndex));
}

async function renderDetailPhotoCarousel(spotId) {
  stopPhotoAutoPlay();
  detailPhotos = [];
  detailPhotoIndex = 0;
  const carousel = document.querySelector("#detailPhotoCarousel");
  const empty = document.querySelector("#detailPhotoEmpty");
  const dots = document.querySelector("#detailPhotoDots");
  const track = document.querySelector("#detailPhotoTrack");
  carousel.hidden = true;
  empty.hidden = false;
  empty.innerHTML = '<span class="field-note">照片加载中…</span>';
  try {
    const response = await apiFetch(`${API_BASE}/spots/${spotId}/photos`);
    const payload = await response.json();
    detailPhotos = (Array.isArray(payload.data) ? payload.data : []).map((photo) => photo.url);
  } catch { /* 加载失败按无照片处理，不影响补图 */ }
  if (!detailPhotos.length) { empty.innerHTML = '<span class="field-note">还没有照片，来传第一张</span>'; return; }
  empty.hidden = true;
  carousel.hidden = false;
  track.innerHTML = detailPhotos.map((url) => `<img src="${escapeHTML(url)}" alt="社区照片" data-lightbox-index="${detailPhotos.indexOf(url)}">`).join("");
  dots.innerHTML = detailPhotos.map((_, index) => `<button type="button" data-dot="${index}" aria-label="第 ${index + 1} 张"></button>`).join("");
  dots.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => showDetailPhoto(Number(button.dataset.dot))));
  showDetailPhoto(0);
  // 自动轮播：4 秒一张；触摸滑动切换（手机直接划）
  detailPhotoTimer = setInterval(() => showDetailPhoto(detailPhotoIndex + 1), 4000);
}

document.querySelector("#detailPhotoPrev").addEventListener("click", () => { stopPhotoAutoPlay(); showDetailPhoto(detailPhotoIndex - 1); });
document.querySelector("#detailPhotoNext").addEventListener("click", () => { stopPhotoAutoPlay(); showDetailPhoto(detailPhotoIndex + 1); });
// 点击照片打开灯箱放大查看
document.querySelector("#detailPhotoTrack").addEventListener("click", (event) => {
  const img = event.target.closest("img");
  if (!img) return;
  stopPhotoAutoPlay();
  openPhotoLightbox(Number(img.dataset.lightboxIndex));
});
// 触摸滑动：左右划切换
(() => {
  const carousel = document.querySelector("#detailPhotoCarousel");
  let startX = 0;
  carousel.addEventListener("touchstart", (event) => { startX = event.touches[0].clientX; }, { passive: true });
  carousel.addEventListener("touchend", (event) => {
    const dx = event.changedTouches[0].clientX - startX;
    if (Math.abs(dx) > 40) { stopPhotoAutoPlay(); showDetailPhoto(detailPhotoIndex + (dx < 0 ? 1 : -1)); }
  }, { passive: true });
})();

/* ---------------- 灯箱：全屏放大查看，左右切换，Esc / 点空白关闭 ---------------- */
const photoLightbox = document.querySelector("#photoLightbox");
let lightboxIndex = 0;

function openPhotoLightbox(index) {
  if (!detailPhotos.length) return;
  // 先显示灯箱再更新内容：updateLightbox 有 hidden 守卫，顺序颠倒会导致 src 永远不设置
  photoLightbox.hidden = false;
  lightboxIndex = ((index % detailPhotos.length) + detailPhotos.length) % detailPhotos.length;
  updateLightbox();
}
function updateLightbox() {
  if (photoLightbox.hidden) return;
  document.querySelector("#lightboxImage").src = detailPhotos[lightboxIndex] || "";
  document.querySelector("#lightboxCount").textContent = `${lightboxIndex + 1} / ${detailPhotos.length}`;
  const single = detailPhotos.length < 2;
  document.querySelector("#lightboxPrev").hidden = single;
  document.querySelector("#lightboxNext").hidden = single;
}
function closePhotoLightbox() { photoLightbox.hidden = true; document.querySelector("#lightboxImage").src = ""; }

document.querySelector("#closeLightboxButton").addEventListener("click", closePhotoLightbox);
photoLightbox.addEventListener("click", (event) => { if (event.target === photoLightbox) closePhotoLightbox(); });
document.querySelector("#lightboxPrev").addEventListener("click", () => { lightboxIndex = (lightboxIndex - 1 + detailPhotos.length) % detailPhotos.length; updateLightbox(); });
document.querySelector("#lightboxNext").addEventListener("click", () => { lightboxIndex = (lightboxIndex + 1) % detailPhotos.length; updateLightbox(); });

document.querySelector("#reviewLoginButton").addEventListener("click", openAuth);
// 详情页补图：与编辑弹窗的补图同一后端流程（uploads → 照片墙追加）
document.querySelector("#detailUploadPhotoButton").addEventListener("click", async () => {
  if (!state.currentUser) { openAuth(); return; }
  if (!detailSpotId) return;
  const file = document.querySelector("#detailWallImage").files[0];
  if (!file) { showToast("请先选择一张照片"); return; }
  if (file.size > 20 * 1024 * 1024) { showToast("单张图片不能超过 20MB"); return; }
  const button = document.querySelector("#detailUploadPhotoButton");
  button.disabled = true; button.textContent = "上传中…";
  try {
    const uploadResponse = await fetch(`${API_BASE}/uploads`, { method: "POST", headers: authHeaders({ "Content-Type": file.type }), body: file });
    const uploadPayload = await uploadResponse.json().catch(() => ({}));
    if (!uploadResponse.ok) throw new Error(uploadPayload.error || "图片上传失败");
    await requestPhotoAppend(detailSpotId, uploadPayload.url);
    document.querySelector("#detailWallImage").value = "";
    showToast("照片已补充到点位");
    renderDetailPhotoCarousel(detailSpotId);
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false; button.textContent = "上传照片";
  }
});
document.querySelector("#closeDetailButton").addEventListener("click", hideDetailPanel);

/* ---------------- 用户公开主页（点击实名点评头像进入） ---------------- */
const profileBackdrop = document.querySelector("#profileBackdrop");

async function openUserProfile(userId) {
  document.querySelector("#profileTitle").textContent = "加载中…";
  document.querySelector("#profileJoined").textContent = "";
  document.querySelector("#profileStats").innerHTML = "";
  document.querySelector("#profileReviews").innerHTML = '<span class="field-note">加载中…</span>';
  profileBackdrop.hidden = false;
  try {
    const response = await apiFetch(`${API_BASE}/users/${userId}/profile`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "加载失败");
    const user = payload.user;
    document.querySelector("#profileTitle").textContent = user.nickname || `用户 #${user.id}`;
    const avatarHolder = document.querySelector("#profileAvatar");
    avatarHolder.style.setProperty("--avatar-color", avatarColor(user.id));
    avatarHolder.innerHTML = user.avatar_url
      ? `<img src="${escapeHTML(user.avatar_url)}" alt="${escapeHTML(user.nickname)}的头像">`
      : escapeHTML(String(user.nickname || user.username || "?").charAt(0).toUpperCase());
    document.querySelector("#profileJoined").textContent = `加入于 ${String(user.created_at || "").slice(0, 10)}`;
    document.querySelector("#profileStats").innerHTML = `<div><strong>${payload.stats.public_reviews}</strong><span>公开点评</span></div><div><strong>${payload.stats.spots}</strong><span>提交地点</span></div>`;
    const reviews = Array.isArray(payload.reviews) ? payload.reviews : [];
    document.querySelector("#profileReviews").innerHTML = reviews.length
      ? reviews.map((review) => `<article class="review-item"><div class="review-anon-name">${avatarSpan(user)}<span class="profile-review-spot">${escapeHTML(review.spot_name)}</span></div><div class="review-body"><span class="stars">${starsHTML(review.rating)}</span><p>${escapeHTML(review.content)}</p><small>${formatReviewTime(review.created_at)}</small></div></article>`).join("")
      : '<div class="empty-state">TA 还没有公开点评（匿名点评不会出现在主页）。</div>';
  } catch (error) {
    document.querySelector("#profileTitle").textContent = "加载失败";
    document.querySelector("#profileReviews").innerHTML = `<span class="field-note">${escapeHTML(error.message)}</span>`;
  }
}

document.querySelector("#closeProfileButton").addEventListener("click", () => { profileBackdrop.hidden = true; });
profileBackdrop.addEventListener("click", (event) => { if (event.target === profileBackdrop) profileBackdrop.hidden = true; });

/* ---------------- 我的资料：昵称与头像（实名点评中展示） ---------------- */
const settingsBackdrop = document.querySelector("#settingsBackdrop");
let pendingAvatarFile = null;
// 「移除头像」标志：点保存后才真正提交 avatar_url=null（保存接口支持清空回默认首字头像）
let pendingRemoveAvatar = false;

function renderSettingsPreview(name, avatarUrl, seed) {
  const holder = document.querySelector("#settingsPreviewAvatar");
  holder.style.setProperty("--avatar-color", avatarColor(seed ?? name));
  holder.innerHTML = avatarUrl ? `<img src="${escapeHTML(avatarUrl)}" alt="头像预览">` : escapeHTML(String(name || "?").charAt(0).toUpperCase());
  document.querySelector("#settingsPreviewName").textContent = name || "未设置昵称";
}

function syncRemoveAvatarButton() {
  const button = document.querySelector("#removeAvatarButton");
  const hasAvatar = Boolean(state.currentUser?.avatar_url);
  button.hidden = !hasAvatar || pendingAvatarFile || pendingRemoveAvatar;
}

function openSettings() {
  if (!state.currentUser) return;
  document.querySelector("#settingsNickname").value = state.currentUser.nickname || "";
  // 手机号脱敏显示（138****5678）：完整号码只在填写新号码时使用
  document.querySelector("#settingsPhone").value = "";
  document.querySelector("#settingsPhone").placeholder = state.currentUser.phone
    ? `当前绑定：${state.currentUser.phone}（留空 = 不修改）`
    : "尚未绑定，绑定后可自助找回密码";
  document.querySelector("#settingsAvatar").value = "";
  pendingAvatarFile = null;
  pendingRemoveAvatar = false;
  document.querySelector("#settingsAvatarNote").textContent = "选择新图片后会先上传再保存。";
  document.querySelector("#settingsMessage").textContent = "";
  renderSettingsPreview(state.currentUser.nickname || state.currentUser.username, state.currentUser.avatar_url, state.currentUser.id);
  syncRemoveAvatarButton();
  settingsBackdrop.hidden = false;
}

document.querySelector("#settingsButton").addEventListener("click", openSettings);
document.querySelector("#closeSettingsButton").addEventListener("click", () => { settingsBackdrop.hidden = true; });
settingsBackdrop.addEventListener("click", (event) => { if (event.target === settingsBackdrop) settingsBackdrop.hidden = true; });
document.querySelector("#settingsAvatar").addEventListener("change", () => {
  const file = document.querySelector("#settingsAvatar").files[0];
  pendingAvatarFile = file || null;
  if (pendingAvatarFile) pendingRemoveAvatar = false;
  document.querySelector("#settingsAvatarNote").textContent = file ? `已选择：${file.name}（${Math.round(file.size / 1024)} KB）` : "选择新图片后会先上传再保存。";
  syncRemoveAvatarButton();
});

// 恢复默认头像：无需重新上传，保存时提交 avatar_url=null 即可
document.querySelector("#removeAvatarButton").addEventListener("click", () => {
  pendingRemoveAvatar = true;
  pendingAvatarFile = null;
  document.querySelector("#settingsAvatar").value = "";
  document.querySelector("#settingsAvatarNote").textContent = "已选择移除头像，点「保存资料」后恢复默认首字头像。";
  renderSettingsPreview(document.querySelector("#settingsNickname").value.trim() || state.currentUser.username, "", state.currentUser.id);
  syncRemoveAvatarButton();
});

document.querySelector("#settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!state.currentUser) return;
  const message = document.querySelector("#settingsMessage");
  const nickname = document.querySelector("#settingsNickname").value.trim();
  // 按 Unicode code point 计数（emoji 占 1 个字），与后端规则一致
  const nicknameLength = [...nickname].length;
  if (nickname && (nicknameLength < 2 || nicknameLength > 24)) { message.textContent = "昵称需为 2-24 个字"; return; }
  const button = document.querySelector("#settingsSubmitButton");
  button.disabled = true;
  message.textContent = "保存中……";
  try {
    let avatarUrl = pendingRemoveAvatar ? "" : (state.currentUser.avatar_url || "");
    if (pendingAvatarFile) {
      if (pendingAvatarFile.size > 2 * 1024 * 1024) throw new Error("头像不能超过 2MB");
      // purpose=avatar：服务端按头像规则复核（≤2MB、最小分辨率 64×64）
      const upload = await apiFetch(`${API_BASE}/uploads?purpose=avatar`, { method: "POST", headers: authHeaders({ "Content-Type": pendingAvatarFile.type }), body: pendingAvatarFile });
      const uploadPayload = await upload.json().catch(() => ({}));
      if (!upload.ok) throw new Error(uploadPayload.error || "头像上传失败");
      avatarUrl = uploadPayload.url;
    }
    renderSettingsPreview(nickname || state.currentUser.username, avatarUrl, state.currentUser.id);
    const body = { nickname, avatar_url: avatarUrl };
    // 手机号留空 = 不修改；填写了才提交改绑
    const phoneRaw = document.querySelector("#settingsPhone").value.trim();
    if (phoneRaw) {
      const phone = normalizePhone(phoneRaw);
      if (!phone) { message.textContent = "手机号格式不正确：请输入 11 位大陆手机号"; button.disabled = false; return; }
      body.phone = phone;
    }
    const response = await apiFetch(`${API_BASE}/auth/profile`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "保存失败");
    state.currentUser = { ...state.currentUser, ...payload.user };
    updateAuthUI();
    message.textContent = "资料已保存";
    showToast("资料已保存，实名点评将展示新形象");
  } catch (error) {
    message.textContent = error.message;
  }
  button.disabled = false;
});

// Esc 关闭点评相关弹窗
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // 灯箱开着时 Esc 只关灯箱（优先级高于详情面板）
  if (!photoLightbox.hidden) { closePhotoLightbox(); return; }
  hideDetailPanel();
  profileBackdrop.hidden = true;
  settingsBackdrop.hidden = true;
});

// 本地验证开关：访问 index.html?demoRoute=1 时自动在向导区文字下方画一条演示路线，
// 不依赖后端接口，用于确认小地图渲染正常
if (new URLSearchParams(location.search).has("demoRoute")) {
  drawRoute([
    { id: "demo-1", name: "飞来湖", lng: 113.02, lat: 23.70 },
    { id: "demo-2", name: "清远市博物馆", lng: 113.06, lat: 23.68 },
    { id: "demo-3", name: "笔架山", lng: 113.09, lat: 23.72 }
  ]);
}
