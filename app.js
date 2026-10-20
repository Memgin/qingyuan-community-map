const categories = {
  all: { label: "全部", color: "#2f6d5a", icon: "✦" },
  scenic: { label: "景点", color: "#5995a8", icon: "山" },
  food: { label: "美食", color: "#eb765e", icon: "食" },
  shopping: { label: "商圈", color: "#b4778e", icon: "逛" },
  medical: { label: "医疗", color: "#68a678", icon: "医" },
  school: { label: "学校", color: "#6f7fc0", icon: "校" },
  transit: { label: "车站", color: "#d39a47", icon: "行" }
};

const defaultSpots = [
  { id: 1, name: "古龙峡玻璃大峡谷", category: "scenic", description: "山风很近，夏天来这里玩水最舒服。", lat: 24.4322, lng: 113.1067, locationVerified: false },
  { id: 2, name: "北江母亲河·江心岛", category: "scenic", description: "傍晚沿江走一圈，看城市亮灯。", lat: 23.6935, lng: 113.0457, locationVerified: false },
  { id: 3, name: "清远鸡老字号", category: "food", description: "本地人会反复去吃的一口鲜。", lat: 23.6824, lng: 113.0627, locationVerified: false },
  { id: 4, name: "万达广场", category: "shopping", description: "吃饭、看电影，雨天也有地方逛。", lat: 23.7037, lng: 113.0495, locationVerified: false },
  { id: 5, name: "飞来湖公园", category: "scenic", description: "湖面开阔，适合晨跑和发呆。", lat: 23.7334, lng: 113.0137, locationVerified: false },
  { id: 6, name: "清远市人民医院", category: "medical", description: "市区综合医院，周边交通方便。", lat: 23.6805, lng: 113.0632, locationVerified: false },
  { id: 7, name: "清远站", category: "transit", description: "高铁出发前，附近有便利店和咖啡。", lat: 23.6411, lng: 113.1104, locationVerified: false },
  { id: 8, name: "笔架山森林公园", category: "scenic", description: "一条不太费力的城市周边徒步线。", lat: 23.7541, lng: 113.0078, locationVerified: false }
];

const API_BASE = "/api";
const OWNER_TOKEN_KEY = "qingyuan-owner-token";
const AUTH_TOKEN_KEY = "qingyuan-auth-token";
const ACTOR_TOKEN_KEY = "qingyuan-actor-token";

const map = new AMap.Map("map", { zoom: 12, center: [113.056, 23.6818], viewMode: "2D", mapStyle: "amap://styles/normal" });
let currentLocationMarker = null;

const state = { spots: [...defaultSpots, ...getSubmittedSpots()], filter: "all", query: "", page: 1, pageSize: 4, markers: [], likes: getLikes(), pickingLocation: false, myOnly: false, currentUser: null, authMode: "login" };
let nearbyFacilities = []; // 金融学院周边检索结果的缓存，防止登录/刷新合并时丢失
const spotList = document.querySelector("#spotList");
const spotCount = document.querySelector("#spotCount");

function getSubmittedSpots() {
  try { return JSON.parse(localStorage.getItem("qingyuan-submissions") || "[]").map((spot) => ({ ...spot, status: "pending", isOwner: true })); } catch { return []; }
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
function mergePublicSpots(remoteList) {
  const normKey = (spot) => `${spot.category}:${String(spot.name || "").replace(/[·\s]/g, "").toLowerCase()}`;
  const merged = [];
  const upsert = (spot) => {
    const key = normKey(spot);
    const verified = spot.locationVerified !== false;
    const idx = merged.findIndex((item) => normKey(item) === key);
    if (idx >= 0) {
      const existingVerified = merged[idx].locationVerified !== false;
      if (!existingVerified && verified) merged[idx] = spot;
      return;
    }
    merged.push(spot);
  };
  remoteList.forEach((spot) => upsert({ ...spot, locationVerified: true }));
  defaultSpots.forEach((spot) => upsert({ ...spot }));
  getSubmittedSpots().forEach((spot) => upsert(spot));
  nearbyFacilities.forEach((spot) => upsert(spot));
  return merged;
}

async function loadRemoteSpots() {
  try {
    const response = await fetch(`${API_BASE}/spots?limit=100`);
    if (!response.ok) return;
    const payload = await response.json();
    if (Array.isArray(payload.data)) {
      state.spots = mergePublicSpots(payload.data);
      render();
      return true;
    }
  } catch {
    // Local sample data keeps the preview usable before Worker deployment.
  }
  return false;
}

async function loadMySpots() {
  const response = await fetch(`${API_BASE}/my-spots`, { headers: { "X-Owner-Token": ownerToken } });
  if (!response.ok) throw new Error("无法加载我的提交");
  const payload = await response.json();
  return payload.data || [];
}

function calibrateDefaultLocations() {
  AMap.plugin("AMap.PlaceSearch", () => {
    let remaining = defaultSpots.length;
    defaultSpots.forEach((spot) => {
      const placeSearch = new AMap.PlaceSearch({ city: "清远", citylimit: true, pageSize: 10 });
      placeSearch.search(`${spot.name} 清远`, (status, result) => {
        const pois = status === "complete" ? result.poiList?.pois || [] : [];
        const normalizedName = spot.name.replace(/[·\s]/g, "").toLowerCase();
        const poi = pois.find((item) => {
          const candidateName = String(item.name || "").replace(/[·\s]/g, "").toLowerCase();
          return candidateName === normalizedName;
        });
        if (poi?.location) {
          spot.lng = poi.location.lng;
          spot.lat = poi.location.lat;
          spot.locationVerified = true;
        }
        remaining -= 1;
        if (remaining === 0) render();
      });
    });
  });
}

function loadQingyuanStations() {
  AMap.plugin("AMap.PlaceSearch", () => {
    const placeSearch = new AMap.PlaceSearch({ city: "清远", citylimit: true, pageSize: 50 });
    const stationKeywords = ["高铁站", "城轨站", "火车站"];
    const stationMap = new Map();
    let remaining = stationKeywords.length;
    stationKeywords.forEach((keyword) => {
      placeSearch.search(keyword, (status, result) => {
        const pois = status === "complete" ? result.poiList?.pois || [] : [];
        pois.forEach((poi) => {
          if (!poi.location || stationMap.has(poi.id || `${poi.name}-${poi.location.lng}-${poi.location.lat}`)) return;
          stationMap.set(poi.id || `${poi.name}-${poi.location.lng}-${poi.location.lat}`, {
            id: `station-${stationMap.size + 1}`,
            name: poi.name,
            category: "transit",
            description: poi.address ? `清远铁路出行站点 · ${poi.address}` : "清远铁路出行站点",
            lat: poi.location.lat,
            lng: poi.location.lng,
            status: "approved"
          });
        });
        remaining -= 1;
        if (remaining === 0) {
          const pendingTransit = state.spots.filter((spot) => spot.category === "transit" && spot.status === "pending");
          state.spots = state.spots.filter((spot) => spot.category !== "transit" || spot.status === "pending");
          state.spots.push(...stationMap.values(), ...pendingTransit);
          render();
        }
      });
    });
  });
}

// 以广东金融学院（清远校区）为中心 20km，实时检索周边医院与铁路车站，作为默认展示点位（不入库）。
const FACILITY_CENTER = { lng: 113.086781, lat: 23.717058 };
const FACILITY_RADIUS_METERS = 20000;
function loadNearbyFacilities() {
  AMap.plugin("AMap.PlaceSearch", () => {
    const search = new AMap.PlaceSearch({ pageSize: 25, city: "清远", citylimit: true });
    const medicalKeep = (poi) => /三级甲等|三甲/.test(poi.level || "") || /人民医院|中医院|妇幼保健院|中心医院|附属医院/.test(poi.name || "");
    const tasks = [
      { keyword: "医院", category: "medical", keep: medicalKeep },
      { keyword: "妇幼保健院", category: "medical", keep: medicalKeep },
      { keyword: "高铁站", category: "transit" },
      { keyword: "火车站", category: "transit" },
      { keyword: "城轨站", category: "transit" }
    ];
    const added = [];
    // 只与已核验过的点去重，避免未核验的默认演示点（如"清远市人民医院"）遮挡真实高德数据。
    const seen = new Set(state.spots.filter((spot) => spot.locationVerified !== false).map((spot) => `${spot.category}:${String(spot.name).replace(/[·\s]/g, "").toLowerCase()}`));
    let pendingTasks = tasks.length;
    tasks.forEach((task) => {
      search.searchAround(task.keyword, [FACILITY_CENTER.lng, FACILITY_CENTER.lat], FACILITY_RADIUS_METERS, (status, result) => {
        if (status === "complete") {
          (result.poiList?.pois || []).forEach((poi) => {
            if (!poi.location) return;
            if (task.keep && !task.keep(poi)) return;
            const key = `${task.category}:${String(poi.name).replace(/[·\s]/g, "").toLowerCase()}`;
            if (seen.has(key)) return;
            seen.add(key);
            added.push({
              id: `facility-${task.category}-${added.length + 1}`,
              name: poi.name,
              address: poi.address || "",
              category: task.category,
              description: `${poi.level ? poi.level + " · " : ""}${poi.address ? "广东金融学院周边 20 公里内 · " + poi.address : "广东金融学院周边 20 公里内"}`,
              lat: poi.location.lat,
              lng: poi.location.lng,
              locationVerified: true,
              status: "approved"
            });
          });
        }
        pendingTasks -= 1;
        if (pendingTasks === 0) {
          if (added.length) {
            nearbyFacilities = [...nearbyFacilities, ...added];
            state.spots.push(...added);
          }
          render();
          console.log(`[facility] 默认周边设施新增 ${added.length} 处：`, added.map((p) => `${p.category}:${p.name}`));
        }
      });
    });
  });
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function navigationURL(spot) {
  return `https://uri.amap.com/navigation?to=${spot.lng},${spot.lat},${encodeURIComponent(spot.name)}&mode=car&policy=1&src=qingyuan-map&coordinate=gaode&callnative=1`;
}

function markerIcon(category) {
  const item = categories[category];
  return `<div class="marker-pin" style="--marker-color:${item.color}"><span>${item.icon}</span></div>`;
}

function visibleSpots() {
  return state.spots.filter((spot) => {
    const matchesCategory = state.filter === "all" || spot.category === state.filter;
    const searchText = `${spot.name} ${spot.description}`.toLowerCase();
    return (state.myOnly || spot.status !== "pending") && spot.locationVerified !== false && matchesCategory && searchText.includes(state.query.toLowerCase());
  });
}

function renderFilters() {
  const container = document.querySelector("#categoryFilters");
  container.innerHTML = Object.entries(categories).map(([key, item]) => `<button class="filter-chip ${state.filter === key ? "active" : ""}" data-filter="${key}" type="button"><span class="chip-dot" style="--chip-color:${item.color}"></span>${item.label}</button>`).join("");
  container.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => { state.filter = button.dataset.filter; render(); }));
}

function renderMarkers() {
  state.markers.forEach((marker) => marker.setMap(null));
  state.markers = visibleSpots().map((spot) => {
    const item = categories[spot.category];
    const marker = new AMap.Marker({ position: [spot.lng, spot.lat], content: markerIcon(spot.category), offset: new AMap.Pixel(-14, -29), title: spot.name });
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
  const allVisible = visibleSpots().slice().reverse();
  const totalPages = Math.max(1, Math.ceil(allVisible.length / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  const list = allVisible.slice((state.page - 1) * state.pageSize, state.page * state.pageSize);
  spotList.innerHTML = list.length ? list.map((spot) => {
    const item = categories[spot.category];
    const likes = state.likes[spot.id] ?? spot.likes ?? 0;
    const image = spot.image_url ? `<img class="spot-image" src="${escapeHTML(spot.image_url)}" alt="${escapeHTML(spot.name)}">` : "";
    const deleteButton = spot.isOwner ? `<button class="delete-button" data-delete-id="${spot.id}" type="button">删除</button>` : "";
    const saveButton = state.currentUser && !state.myOnly ? `<button class="save-map-button" data-map-spot-id="${spot.id}" type="button">收藏</button>` : "";
    const reportButton = !state.myOnly ? `<button class="report-button" data-report-id="${spot.id}" type="button">举报</button>` : "";
    const statusText = spot.status === "pending" ? "待审核 · 点击查看位置" : "点击查看位置";
    const address = escapeHTML(spot.address || "地图上的目的地");
    return `<article class="spot-card" data-lat="${spot.lat}" data-lng="${spot.lng}">${image}<div class="spot-card-top"><h3>${escapeHTML(spot.name)}</h3><span class="category-tag" style="--chip-color:${item.color}">${item.label}</span></div><a class="spot-address navigate-link" href="${navigationURL(spot)}" target="_blank" rel="noopener" data-navigation="true">⌖ ${address} · 导航</a><p>${escapeHTML(spot.description)}</p><div class="card-footer"><small>${statusText}</small><span class="card-actions">${saveButton}${reportButton}${deleteButton}<button class="like-button" data-like-id="${spot.id}" type="button" aria-label="点赞 ${escapeHTML(spot.name)}">♡ ${likes}</button></span></div></article>`;
  }).join("") : '<div class="empty-state">没有找到匹配的地点，换个关键词试试。</div>';
  document.querySelector("#pageInfo").textContent = `${state.page} / ${totalPages}`;
  document.querySelector("#previousPageButton").disabled = state.page <= 1;
  document.querySelector("#nextPageButton").disabled = state.page >= totalPages;
  spotList.querySelectorAll(".like-button").forEach((button) => button.addEventListener("click", async () => {
    const id = button.dataset.likeId;
    try {
      const response = await fetch(`${API_BASE}/spots/${id}/like`, { method: "POST", headers: actorHeaders() });
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

function render() { renderFilters(); renderMarkers(); renderList(); spotCount.textContent = state.spots.filter((spot) => spot.status !== "pending" && spot.locationVerified !== false).length; }

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
document.querySelector("#searchInput").addEventListener("input", (event) => { state.query = event.target.value.trim(); state.page = 1; renderList(); renderMarkers(); });
document.querySelector("#previousPageButton").addEventListener("click", () => { state.page -= 1; renderList(); });
document.querySelector("#nextPageButton").addEventListener("click", () => { state.page += 1; renderList(); });
document.querySelector("#pickLocationButton").addEventListener("click", () => {
  state.pickingLocation = true;
  modalBackdrop.hidden = true;
  showToast("请点击地图上的位置");
});
document.querySelector("#recommendForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const result = document.querySelector("#recommendResult");
  result.textContent = "正在整理推荐……";
  try {
    const response = await fetch(`${API_BASE}/recommend`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: document.querySelector("#recommendInput").value.trim() }) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "推荐暂不可用");
    result.textContent = payload.recommendation || payload.message || "推荐结果已返回，请查看地图点位。";
  } catch (error) {
    result.textContent = error.message === "Failed to fetch" ? "推荐服务尚未连接，请先部署 Worker。" : error.message;
  }
});
document.querySelector("#mySpotsButton").addEventListener("click", async () => {
  if (state.myOnly) {
    state.myOnly = false; state.query = ""; state.page = 1; document.querySelector("#searchInput").value = ""; document.querySelector("#mySpotsButton").textContent = "我的提交"; await loadRemoteSpots(); return;
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
  const spot = { id: Date.now(), name: formData.get("name").trim(), address: formData.get("address").trim(), category: formData.get("category"), description: formData.get("description").trim(), lat: Number(formData.get("lat")), lng: Number(formData.get("lng")), image_url: "", status: "pending" };
  if (!Number.isFinite(spot.lat) || !Number.isFinite(spot.lng) || spot.lat < 23.4 || spot.lat > 24.8 || spot.lng < 112.4 || spot.lng > 113.8) { formMessage.textContent = "请先搜索清远的地址或地点。"; return; }
  const saveSpotLocally = (imageURL = "") => { spot.image_url = imageURL; const submitted = getSubmittedSpots(); submitted.push(spot); localStorage.setItem("qingyuan-submissions", JSON.stringify(submitted)); state.filter = "all"; state.query = ""; state.page = 1; render(); };
  const restoreButton = () => { submitButton.disabled = false; submitButton.innerHTML = originalHTML; };
  const done = (message, savedLocally) => {
    formMessage.textContent = message;
    form.reset(); document.querySelector("input[name=lat]").value = ""; document.querySelector("input[name=lng]").value = "";
    restoreButton();
    setTimeout(() => { modalBackdrop.hidden = true; formMessage.textContent = ""; showToast(savedLocally ? "已保存在本机，联网后自动同步" : "提交成功"); }, 1100);
    if (!savedLocally) loadRemoteSpots();
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
    if (!response.ok) { formMessage.textContent = payload.error || "提交失败，请稍后重试。"; restoreButton(); return; }
    done(payload.verified ? "地址已由高德核验，自动通过。" : (payload.autocheck ? `${payload.autocheck}。` : "提交成功，等待审核。"), false);
  } catch {
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
loadRemoteSpots().then((remoteLoaded) => {
  if (!remoteLoaded) {
    calibrateDefaultLocations();
    loadQingyuanStations();
  }
  loadNearbyFacilities();
});
checkLogin();
