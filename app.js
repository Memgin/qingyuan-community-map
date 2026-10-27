const categories = {
  all: { label: "全部", color: "#2f6d5a", icon: "✦" },
  scenic: { label: "景点", color: "#5995a8", icon: "山" },
  food: { label: "美食", color: "#eb765e", icon: "食" },
  shopping: { label: "商圈", color: "#b4778e", icon: "逛" },
  medical: { label: "医疗", color: "#68a678", icon: "医" },
  school: { label: "学校", color: "#6f7fc0", icon: "校" },
  transit: { label: "车站", color: "#d39a47", icon: "行" }
};

// 演示用默认点位已于 2026-10-10 移除：页面只展示数据库里真实收录的点位。

const API_BASE = "/api";
const OWNER_TOKEN_KEY = "qingyuan-owner-token";
const AUTH_TOKEN_KEY = "qingyuan-auth-token";
const ACTOR_TOKEN_KEY = "qingyuan-actor-token";

const map = new AMap.Map("map", { zoom: 12, center: [113.056, 23.6818], viewMode: "2D", mapStyle: "amap://styles/normal" });

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

// InfoWindow 内容是字符串模板，用事件委托接「位置纠偏」点击
document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-correct-id]");
  if (!button) return;
  const spot = state.mapSpots.find((item) => String(item.id) === button.dataset.correctId);
  if (spot) enterCorrectionMode(spot);
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

const state = { spots: [], mapSpots: [], total: 0, filter: "all", query: "", page: 1, pageSize: 4, markers: [], likes: getLikes(), pickingLocation: false, myOnly: false, currentUser: null, authMode: "login", highlightIds: new Set() };
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

/* --------------------------- Turnstile 人机验证 --------------------------- */
// 填入 Cloudflare Turnstile 的 Site Key 即启用（后端需同步配置 TURNSTILE_SECRET）；
// 留空则不渲染验证组件，注册走服务端的免验证限额（同 IP 每天仅 1 个账号）
const TURNSTILE_SITE_KEY = "0x4AAAAAAFlIsuJHRZUtIttJ";

if (TURNSTILE_SITE_KEY) {
  const box = document.querySelector("#turnstileBox");
  if (box) {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => {
      window.turnstile.render(box, { sitekey: TURNSTILE_SITE_KEY, theme: "light", language: "zh-cn" });
    };
    document.head.appendChild(script);
  }
}

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

// 合并远程收录点与本地默认点/待审核提交/周边设施，已核验的覆盖未核验的同名同分类点，避免登录或刷新后默认点丢失。
// 地图图钉需要的轻量数据：一次拉取坐标，避免列表分页后地图只剩当前页的点
async function loadMapSpots() {
  try {
    const response = await fetch(`${API_BASE}/spots?fields=map&limit=500`);
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

// 列表使用后端真分页：只取当前页，分类与关键词交由后端过滤
async function loadListPage() {
  const params = new URLSearchParams({ page: String(state.page), limit: String(state.pageSize) });
  if (state.filter !== "all") params.set("category", state.filter);
  if (state.query) params.set("q", state.query);
  try {
    const response = await fetch(`${API_BASE}/spots?${params}`);
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
  return `<div class="marker-pin ${highlighted ? "is-highlight" : ""}" style="--marker-color:${item.color}"><span>${item.icon}</span></div>`;
}

// 把 AI 推荐到的点位在地图上高亮，并自动缩放到这些点
function highlightSpots(ids) {
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
  showToast(`已在地图高亮 ${targets.length} 个推荐点位`);
}

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

function renderMarkers() {
  state.markers.forEach((marker) => marker.setMap(null));
  state.markers = visibleSpots().map((spot) => {
    const item = categories[spot.category];
    const marker = new AMap.Marker({ position: [spot.lng, spot.lat], content: markerIcon(spot.category, state.highlightIds.has(String(spot.id))), offset: new AMap.Pixel(-14, -29), title: spot.name });
    marker.setMap(map);
    marker.on("click", () => {
      const image = spot.image_url ? `<img src="${escapeHTML(spot.image_url)}" alt="${escapeHTML(spot.name)}">` : "";
      const address = escapeHTML(spot.address || "地图上的目的地");
      // 地图图钉是轻量数据（fields=map），description 可能为空，必须兜底
      const description = escapeHTML(spot.description || "");
      const base = `<div class="popup-content">${image}<strong>${escapeHTML(spot.name)}</strong><small style="color:${item.color}">${item.label}</small><a class="navigate-link" href="${navigationURL(spot)}" target="_blank" rel="noopener">⌖ ${address} · 导航</a><button class="correction-link" data-correct-id="${spot.id}" type="button">📍 位置纠偏</button><p>${description}</p><div class="popup-wall"><span class="field-note">照片加载中…</span></div></div>`;
      const infoWindow = new AMap.InfoWindow({ content: base, offset: new AMap.Pixel(0, -35), closeWhenClickMap: true });
      infoWindow.open(map, marker.getPosition());
      // 照片墙异步补充：不阻塞弹窗打开，取到后整体重设内容（导航与分类保留在模板里）
      loadPopupWall(spot, infoWindow);
    });
    return marker;
  });
}

// 拉取点位社区照片并重绘地图弹窗；spot 来自闭包，字段与列表一致
async function loadPopupWall(spot, infoWindow) {
  try {
    const response = await fetch(`${API_BASE}/spots/${spot.id}/photos`);
    const payload = await response.json();
    const photos = Array.isArray(payload.data) ? payload.data : [];
    const item = categories[spot.category];
    const image = spot.image_url ? `<img src="${escapeHTML(spot.image_url)}" alt="${escapeHTML(spot.name)}">` : "";
    const address = escapeHTML(spot.address || "地图上的目的地");
    const description = escapeHTML(spot.description || "");
    const wall = photos.length
      ? `<div class="popup-wall">${photos.slice(0, 6).map((photo) => `<figure class="popup-wall-item"><img src="${escapeHTML(photo.url)}" alt="社区照片"><figcaption>${escapeHTML(photo.username || "社区成员")}</figcaption></figure>`).join("")}</div>`
      : `<div class="popup-wall"><span class="field-note">暂无社区照片</span></div>`;
    const content = `<div class="popup-content">${image}<strong>${escapeHTML(spot.name)}</strong><small style="color:${item.color}">${item.label}</small><a class="navigate-link" href="${navigationURL(spot)}" target="_blank" rel="noopener">⌖ ${address} · 导航</a><button class="correction-link" data-correct-id="${spot.id}" type="button">📍 位置纠偏</button><p>${description}</p>${wall}</div>`;
    infoWindow.setContent(content);
  } catch {
    // 照片加载失败时保留"加载中"占位，不影响基础信息展示
  }
}

function renderList() {
  // 公开模式：state.spots 已是后端返回的当前页数据；我的提交模式仍按本地切片
  const totalCount = state.myOnly ? state.spots.length : state.total;
  const totalPages = Math.max(1, Math.ceil(totalCount / state.pageSize));
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const list = state.myOnly ? state.spots.slice((state.page - 1) * state.pageSize, state.page * state.pageSize) : state.spots;
  spotList.innerHTML = list.length ? list.map((spot) => {
    const item = categories[spot.category];
    const likeCount = state.likes[spot.id] ?? spot.likes ?? 0;
    // liked 由后端按账号返回，保证网页与 App 的点赞状态一致
    // 是否已点赞只认后端按账号返回的 liked 字段，保证网页与 App 跨端一致。
    // 原实现用 `Number(state.likes[id]) > 0` 兜底，但 state.likes 存的是点赞总数
    const liked = spot.liked === true;
    const likes = `${liked ? "♥" : "♡"} ${likeCount}`;
    const image = spot.image_url ? `<img class="spot-image" src="${escapeHTML(spot.image_url)}" alt="${escapeHTML(spot.name)}">` : "";
    // 提交者：编辑（分类/主图）；其他登录用户：补图（往照片墙追加）
    const editButton = spot.isOwner ? `<button class="edit-button" data-edit-id="${spot.id}" type="button">编辑</button>` : (state.currentUser ? `<button class="edit-button" data-edit-id="${spot.id}" type="button">补图</button>` : "");
    const deleteButton = spot.isOwner ? `<button class="delete-button" data-delete-id="${spot.id}" type="button">删除</button>` : "";
    const saveButton = state.currentUser && !state.myOnly ? `<button class="save-map-button" data-map-spot-id="${spot.id}" type="button">收藏</button>` : "";
    const reportButton = !state.myOnly ? `<button class="report-button" data-report-id="${spot.id}" type="button">举报</button>` : "";
    const statusText = spot.status === "pending" ? "待审核 · 点击查看位置" : "点击查看位置";
    const address = escapeHTML(spot.address || "地图上的目的地");
    return `<article class="spot-card" data-lat="${spot.lat}" data-lng="${spot.lng}">${image}<div class="spot-card-top"><h3>${escapeHTML(spot.name)}</h3><span class="category-tag" style="--chip-color:${item.color}">${item.label}</span></div><a class="spot-address navigate-link" href="${navigationURL(spot)}" target="_blank" rel="noopener" data-navigation="true">⌖ ${address} · 导航</a><p>${escapeHTML(spot.description)}</p><div class="card-footer"><small>${statusText}</small><span class="card-actions">${editButton}${saveButton}${reportButton}${deleteButton}<button class="like-button" data-like-id="${spot.id}" type="button" aria-label="点赞 ${escapeHTML(spot.name)}">${likes}</button></span></div></article>`;
  }).join("") : '<div class="empty-state">没有找到匹配的地点，换个关键词试试。</div>';
  document.querySelector("#pageInfo").textContent = `${state.page} / ${totalPages}`;
  document.querySelector("#previousPageButton").disabled = state.page <= 1;
  document.querySelector("#nextPageButton").disabled = state.page >= totalPages;
  spotList.querySelectorAll(".like-button").forEach((button) => button.addEventListener("click", async () => {
    const id = button.dataset.likeId;
    try {
      // 带上登录态：后端会按账号记录点赞，实现网页与 App 跨端一致
      const response = await fetch(`${API_BASE}/spots/${id}/like`, { method: "POST", headers: authHeaders(actorHeaders()) });
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
  spotList.querySelectorAll(".spot-card").forEach((card) => card.addEventListener("click", (event) => {
    if (event.target.closest(".like-button")) return;
    map.setZoomAndCenter(16, [Number(card.dataset.lng), Number(card.dataset.lat)], true);
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
  const result = document.querySelector("#recommendResult");
  const submitButton = event.currentTarget.querySelector("button[type=submit]");
  const originalText = submitButton ? submitButton.textContent : "";
  if (submitButton) { submitButton.disabled = true; submitButton.textContent = "整理中…"; }
  result.textContent = "正在按你当前地图视野整理推荐……";
  const center = map.getCenter();
  try {
    const response = await fetch(`${API_BASE}/recommend`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: document.querySelector("#recommendInput").value.trim(), center: { lat: center.getLat(), lng: center.getLng() } }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "推荐暂不可用");
    result.textContent = payload.recommendation || "推荐结果已返回，请查看地图点位。";
    highlightSpots(payload.spotIds || []);
  } catch (error) {
    result.textContent = error.message === "Failed to fetch" ? "推荐服务尚未连接，请先部署 Worker。" : error.message;
  } finally {
    if (submitButton) { submitButton.disabled = false; submitButton.textContent = originalText; }
  }
});
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
  const image = formData.get("image");
  if (image && image.size > 2 * 1024 * 1024) { formMessage.textContent = "图片不能超过 2MB。"; return; }
  // client_token 用于离线重发的幂等：同一条提交重复发送只会被写入一次
  const spot = { id: Date.now(), name: formData.get("name").trim(), address: formData.get("address").trim(), category: formData.get("category"), description: formData.get("description").trim(), lat: Number(formData.get("lat")), lng: Number(formData.get("lng")), image_url: "", status: "pending", client_token: crypto.randomUUID() };
  if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lng) || spot.lat < 23.4 || spot.lat > 24.8 || spot.lng < 112.4 || spot.lng > 113.8) { formMessage.textContent = "请先搜索清远的地址或地点。"; return; }
  const saveSpotLocally = (imageURL = "") => { spot.image_url = imageURL; const submitted = getSubmittedSpots(); submitted.push(spot); localStorage.setItem("qingyuan-submissions", JSON.stringify(submitted)); state.filter = "all"; state.query = ""; state.page = 1; render(); };
  const restoreButton = () => { submitButton.disabled = false; submitButton.innerHTML = originalHTML; };
  const done = (message, savedLocally) => {
    formMessage.textContent = message;
    form.reset(); document.querySelector("input[name=lat]").value = ""; document.querySelector("input[name=lng]").value = "";
    restoreButton();
    setTimeout(() => { modalBackdrop.hidden = true; formMessage.textContent = ""; showToast(savedLocally ? "已保存在本机，联网后自动同步" : "提交成功"); }, 1100);
    if (!savedLocally) loadPublicSpots();
  };
  submitButton.disabled = true;
  submitButton.textContent = "提交中…";
  let imageURL = "";
  if (image && image.size) {
    const uploadResponse = await fetch(`${API_BASE}/uploads`, { method: "POST", headers: authHeaders({ "Content-Type": image.type }), body: image }).catch(() => null);
    if (!uploadResponse || !uploadResponse.ok) { formMessage.textContent = "图片上传失败，请重试或先不添加图片。"; restoreButton(); return; }
    imageURL = (await uploadResponse.json()).url;
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
    if (payload.id) trackOwnSubmission(payload.id);
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
    list.innerHTML = photos.map((photo) => `<figure class="wall-item"><img src="${escapeHTML(photo.url)}" alt="社区照片"><figcaption>${escapeHTML(photo.username || "社区成员")}</figcaption>${state.currentUser && photo.user_id === state.currentUser.id ? `<button class="wall-delete" type="button" data-wall-photo-id="${photo.id}" aria-label="删除">×</button>` : ""}</figure>`).join("");
    list.querySelectorAll(".wall-delete").forEach((button) => button.addEventListener("click", async () => {
      const response = await fetch(`${API_BASE}/photos/${button.dataset.wallPhotoId}`, { method: "DELETE", headers: authHeaders() });
      if (response.ok) { showToast("照片已删除"); await refreshPhotoWall(spotId); } else { showToast("只能删除自己上传的照片"); }
    }));
  } catch {
    list.innerHTML = '<span class="field-note">照片加载失败</span>';
  }
}

document.querySelector("#addWallPhotoButton").addEventListener("click", async () => {
  if (!editingSpotId) return;
  const file = document.querySelector("#editWallImage").files[0];
  if (!file) { showToast("请先选择一张照片"); return; }
  if (file.size > 2 * 1024 * 1024) { showToast("图片不能超过 2MB"); return; }
  const button = document.querySelector("#addWallPhotoButton");
  button.disabled = true; button.textContent = "上传中…";
  try {
    const uploadResponse = await fetch(`${API_BASE}/uploads`, { method: "POST", headers: authHeaders({ "Content-Type": file.type }), body: file });
    const uploadPayload = await uploadResponse.json().catch(() => ({}));
    if (!uploadResponse.ok) throw new Error(uploadPayload.error || "图片上传失败");
    const response = await fetch(`${API_BASE}/spots/${editingSpotId}/photos`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ url: uploadPayload.url }) });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "照片提交失败");
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
      if (file.size > 2 * 1024 * 1024) throw new Error("图片不能超过 2MB。");
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
  document.querySelector("#authButton").textContent = state.currentUser ? `${state.currentUser.username} · 退出` : "登录 / 注册";
  document.querySelector("#privatePanel").hidden = !state.currentUser;
  renderList();
}

async function checkLogin() {
  if (!authToken()) return;
  const response = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
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
  try {
    const maps = await fetch(`${API_BASE}/maps`, { headers: authHeaders() }).then((response) => response.json());
    if (!maps.data?.length) { showToast("请先在下方创建私人地图"); document.querySelector("#mapForm input").focus(); return; }
    await fetch(`${API_BASE}/maps/${maps.data[0].id}/spots`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ spot_id: spotId }) });
    showToast(`已收藏到：${maps.data[0].name}`);
  } catch { showToast("收藏失败，请稍后重试"); }
}

async function loadMaps() {
  const response = await fetch(`${API_BASE}/maps`, { headers: authHeaders() });
  if (!response.ok) return;
  const payload = await response.json();
  document.querySelector("#privateMapList").innerHTML = payload.data?.length ? payload.data.map((mapItem) => `<span class="private-map-item">${escapeHTML(mapItem.name)}</span>`).join("") : "还没有私人地图";
}

document.querySelector("#authButton").addEventListener("click", async () => {
  if (!state.currentUser) { openAuth(); return; }
  await fetch(`${API_BASE}/auth/logout`, { method: "POST", headers: authHeaders() }); localStorage.removeItem(AUTH_TOKEN_KEY); state.currentUser = null; updateAuthUI(); showToast("已退出登录");
});
document.querySelector("#closeAuthButton").addEventListener("click", () => { authBackdrop.hidden = true; });
document.querySelector("#authSwitchButton").addEventListener("click", () => { state.authMode = state.authMode === "login" ? "register" : "login"; document.querySelector("#authTitle").textContent = state.authMode === "login" ? "登录清远地图" : "注册清远地图"; document.querySelector("#authSubmitText").textContent = state.authMode === "login" ? "登录" : "注册"; document.querySelector("#authSwitchButton").textContent = state.authMode === "login" ? "没有账号？注册一个" : "已有账号？直接登录"; // 密码长度策略只在注册时生效；登录不限制（临时密码/旧密码可能较短）
  document.querySelector("#authPassword").minLength = state.authMode === "register" ? 8 : 0; });
document.querySelector("#forgotPasswordButton").addEventListener("click", () => {
  // 切换到找回密码申请视图：提交后由管理员在后台审批
  document.querySelector("#authForm").hidden = true;
  document.querySelector("#authSwitchButton").hidden = true;
  document.querySelector("#forgotPasswordButton").hidden = true;
  document.querySelector("#forgotPanel").hidden = false;
  document.querySelector("#authTitle").textContent = "申请重置密码";
  document.querySelector("#authMessage").textContent = "";
});

document.querySelector("#forgotBackButton").addEventListener("click", () => {
  document.querySelector("#forgotPanel").hidden = true;
  document.querySelector("#authForm").hidden = false;
  document.querySelector("#authSwitchButton").hidden = false;
  document.querySelector("#forgotPasswordButton").hidden = false;
  document.querySelector("#authTitle").textContent = "登录清远地图";
});

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
  // Turnstile 人机验证 token（注册时随表单提交；未启用 site key 时为空串走免验证限额）
  if (state.authMode === "register" && window.turnstile) data.cfToken = turnstile.getResponse() || "";
  const endpoint = state.authMode === "login" ? "login" : "register"; const message = document.querySelector("#authMessage"); message.textContent = "处理中……";
  try { const response = await fetch(`${API_BASE}/auth/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "请求失败"); localStorage.setItem(AUTH_TOKEN_KEY, payload.token); state.currentUser = payload.user; authBackdrop.hidden = true; updateAuthUI(); if (payload.mustChangePassword) { location.href = location.pathname + "?forceChange=1"; return; } await loadMaps(); showToast(`欢迎，${payload.user.username}`); } catch (error) { message.textContent = error.message; }
});
document.querySelector("#mapForm").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const name = new FormData(form).get("name"); try { const response = await fetch(`${API_BASE}/maps`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ name }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); form.reset(); await loadMaps(); showToast(`私人地图“${payload.name}”已创建`); } catch (error) { showToast(error.message || "创建失败"); } });
render();
loadPublicSpots();
checkLogin();
// 从「全部地点」页点卡片跳回时（index.html?spot=ID），定位该点位并打开弹窗
const requestedSpot = new URLSearchParams(location.search).get("spot");
if (requestedSpot) {
  const waitForSpot = (tries) => {
    const spot = state.mapSpots.find((item) => String(item.id) === requestedSpot);
    if (spot) {
      map.setZoomAndCenter(16, [spot.lng, spot.lat], true);
      const marker = state.markers.find((m) => m.getTitle() === spot.name);
      if (marker) marker.emit("click");
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
