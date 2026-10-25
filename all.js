// 全部地点页：独立轻量页面，一次拉取所有点位以网格展示，支持分类筛选。
// 复用主页 style.css 的卡片与筛选样式；点击卡片跳回地图并自动定位（index.html?spot=ID）。
const API_BASE = "/api";

// 与主页 app.js 保持一致的分类标签与配色
const CATEGORIES = {
  scenic: { label: "景点", color: "#5995A8" },
  food: { label: "美食", color: "#EB765E" },
  shopping: { label: "商圈", color: "#B4778E" },
  medical: { label: "医疗", color: "#68A678" },
  school: { label: "校园", color: "#6F7FC0" },
  transit: { label: "交通", color: "#D39A47" }
};

const FILTERS = [{ key: "all", label: "全部", color: "#2F6D5A" },
  ...Object.keys(CATEGORIES).map((key) => ({ key: key, label: CATEGORIES[key].label, color: CATEGORIES[key].color }))];

let allSpots = [];
let currentFilter = "all";

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

function navigationURL(spot) {
  return `https://uri.amap.com/navigation?to=${spot.lng},${spot.lat},${encodeURIComponent(spot.name)}&mode=car&policy=1&src=qingyuan-map&coordinate=gaode&callnative=1`;
}

function renderFilters() {
  const holder = document.querySelector("#allFilters");
  holder.innerHTML = FILTERS.map((item) => `<button class="filter-chip${currentFilter === item.key ? " active" : ""}" data-filter="${item.key}" type="button"><span class="chip-dot" style="--chip-color:${item.color}"></span>${item.label}</button>`).join("");
  holder.querySelectorAll(".filter-chip").forEach((button) => button.addEventListener("click", () => {
    currentFilter = button.dataset.filter;
    renderFilters();
    renderList();
  }));
}

function renderList() {
  const list = document.querySelector("#allList");
  const meta = document.querySelector("#allMeta");
  const spots = currentFilter === "all" ? allSpots : allSpots.filter((spot) => spot.category === currentFilter);
  const filterLabel = FILTERS.find((item) => item.key === currentFilter).label;
  meta.textContent = `共 ${allSpots.length} 个地点 · ${filterLabel}${spots.length} 个 · 点击卡片回到地图查看位置`;
  list.innerHTML = spots.map((spot) => {
    const item = CATEGORIES[spot.category] || { label: spot.category, color: "#2F6D5A" };
    const image = spot.image_url ? `<img class="spot-image" src="${escapeHTML(spot.image_url)}" alt="${escapeHTML(spot.name)}">` : "";
    return `<article class="spot-card"><a class="all-card-link" href="index.html?spot=${spot.id}">${image}<div class="spot-card-top"><h3>${escapeHTML(spot.name)}</h3><span class="category-tag" style="--chip-color:${item.color}">${item.label}</span></div></a><a class="spot-address navigate-link" href="${navigationURL(spot)}" target="_blank" rel="noopener">⌖ ${escapeHTML(spot.address || "地图上的目的地")} · 导航</a><p>${escapeHTML(spot.description || "")}</p><div class="card-footer"><small>♡ ${spot.likes ?? 0}</small><small>${escapeHTML((spot.created_at || "").slice(0, 10))}</small></div></article>`;
  }).join("") || '<div class="empty-state">这个分类下还没有地点。</div>';
}

async function loadAll() {
  try {
    // 后端 full 模式单页上限 50，循环取页直到取满 total
    allSpots = [];
    for (let page = 1; page <= 20; page++) {
      const response = await fetch(`${API_BASE}/spots?page=${page}&limit=50`);
      const payload = await response.json();
      const rows = Array.isArray(payload.data) ? payload.data : [];
      allSpots.push(...rows);
      if (rows.length === 0 || allSpots.length >= Number(payload.total || 0)) break;
    }
    renderFilters();
    renderList();
  } catch {
    document.querySelector("#allMeta").textContent = "加载失败，请刷新重试";
  }
}

loadAll();
