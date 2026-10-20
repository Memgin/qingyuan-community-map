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
  const response = await fetch(`${API_BASE}/my-spots`, { headers: { "X-Owner-Token": ownerToken } });
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
      const infoWindow = new AMap.InfoWindow({ content: `<div class="popup-content">${image}<strong>${escapeHTML(spot.name)}</strong><small style="color:${item.color}">${item.label}</small><a class="navigate-link" href="${navigationURL(spot)}" target="_blank" rel="noopener">⌖ ${address} · 导航</a><p>${escapeHTML(spot.description)}</p></div>`, offset: new AMap.Pixel(0, -35), closeWhenClickMap: true });
      infoWindow.open(map, marker.getPosition());
    });
    return marker;
  });
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
    const liked = spot.liked === true || Number(state.likes[spot.id] || 0) > 0;
    const likes = `${liked ? "♥" : "♡"} ${likeCount}`;
    const image = spot.image_url ? `<img class="spot-image" src="${escapeHTML(spot.image_url)}" alt="${escapeHTML(spot.name)}">` : "";
    const deleteButton = spot.isOwner ? `<button class="delete-button" data-delete-id="${spot.id}" type="button">删除</button>` : "";
    const saveButton = state.currentUser && !state.myOnly ? `<button class="save-map-button" data-map-spot-id="${spot.id}" type="button">收藏</button>` : "";
    const reportButton = !state.myOnly ? `<button class="report-button" data-report-id="${spot.id}" type="button">举报</button>` : "";
    const statusText = spot.status === "pending" ? "待审核 · 点击查看位置" : "点击查看位置";
    const address = escapeHTML(spot.address || "地图上的目的地");
    return `<article class="spot-card" data-lat="${spot.lat}" data-lng="${spot.lng}">${image}<div class="spot-card-top"><h3>${escapeHTML(spot.name)}</h3><span class="category-tag" style="--chip-color:${item.color}">${item.label}</span></div><a class="spot-address navigate-link" href="${navigationURL(spot)}" target="_blank" rel="noopener" data-navigation="true">⌖ ${address} · 导航</a><p>${escapeHTML(spot.description)}</p><div class="card-footer"><small>${statusText}</small><span class="card-actions">${saveButton}${reportButton}${deleteButton}<button class="like-button" data-like-id="${spot.id}" type="button" aria-label="点赞 ${escapeHTML(spot.name)}">${likes}</button></span></div></article>`;
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
      state.likes[id] = payload.likes; localStorage.setItem("qingyuan-likes", JSON.stringify(state.likes)); renderList();
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
    done(payload.verified ? "地址已由高德核验，自动通过。" : (payload.autocheck ? `${payload.autocheck}。` : "提交成功，等待审核。"), false);
  } catch {
    const items = getOutbox(); items.push({ spot, at: Date.now() }); setOutbox(items);
    saveSpotLocally(imageURL);
    done("网络异常，已在本机保存，联网后会自动同步。", true);
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
  if (response.ok) { const payload = await response.json(); state.currentUser = payload.user; updateAuthUI(); if (state.currentUser) await loadMaps(); }
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
document.querySelector("#authSwitchButton").addEventListener("click", () => { state.authMode = state.authMode === "login" ? "register" : "login"; document.querySelector("#authTitle").textContent = state.authMode === "login" ? "登录清远地图" : "注册清远地图"; document.querySelector("#authSubmitText").textContent = state.authMode === "login" ? "登录" : "注册"; document.querySelector("#authSwitchButton").textContent = state.authMode === "login" ? "没有账号？注册一个" : "已有账号？直接登录"; });
document.querySelector("#authForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const data = Object.fromEntries(new FormData(event.currentTarget)); const endpoint = state.authMode === "login" ? "login" : "register"; const message = document.querySelector("#authMessage"); message.textContent = "处理中……";
  try { const response = await fetch(`${API_BASE}/auth/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "请求失败"); localStorage.setItem(AUTH_TOKEN_KEY, payload.token); state.currentUser = payload.user; authBackdrop.hidden = true; updateAuthUI(); await loadMaps(); showToast(`欢迎，${payload.user.username}`); } catch (error) { message.textContent = error.message; }
});
document.querySelector("#mapForm").addEventListener("submit", async (event) => { event.preventDefault(); const form = event.currentTarget; const name = new FormData(form).get("name"); try { const response = await fetch(`${API_BASE}/maps`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ name }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error); form.reset(); await loadMaps(); showToast(`私人地图“${payload.name}”已创建`); } catch (error) { showToast(error.message || "创建失败"); } });
render();
loadPublicSpots();
checkLogin();
// 离线提交重发 + 联网即同步 + 定时检查新点位
flushOutbox();
window.addEventListener("online", flushOutbox);
setInterval(checkUpdates, 60000);
