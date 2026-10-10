const API_BASE = "/api";
const tokenInput = document.querySelector("#adminToken");
const pendingList = document.querySelector("#pendingList");
const reportList = document.querySelector("#reportList");
const allSpotsList = document.querySelector("#allSpotsList");
const spotSearchInput = document.querySelector("#spotSearch");
const statusFilter = document.querySelector("#statusFilter");
const message = document.querySelector("#adminMessage");
const STATUS_LABELS = { pending: "待审核", approved: "已上线", rejected: "已下架" };

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers: { Authorization: `Bearer ${tokenInput.value.trim()}`, "Content-Type": "application/json", ...(options.headers || {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "请求失败");
  return payload;
}

async function loadPending() {
  message.textContent = "正在加载……";
  try {
    const payload = await request("/admin/spots");
    pendingList.innerHTML = payload.data.length ? payload.data.map((spot) => `<article class="admin-card"><div><h2>${escapeHTML(spot.name)}</h2><p>${escapeHTML(spot.description)} · ${spot.category} · ${spot.lat}, ${spot.lng}</p></div><div class="admin-actions"><button class="approve" data-id="${spot.id}" data-status="approved" type="button">通过</button><button class="reject" data-id="${spot.id}" data-status="rejected" type="button">拒绝</button><button class="delete" data-delete-id="${spot.id}" type="button">删除</button></div></article>`).join("") : '<p>目前没有待审核地点。</p>';
    pendingList.querySelectorAll("button[data-status]").forEach((button) => button.addEventListener("click", () => updateStatus(button.dataset.id, button.dataset.status)));
    pendingList.querySelectorAll("button[data-delete-id]").forEach((button) => button.addEventListener("click", () => deleteSpot(button.dataset.deleteId)));
    message.textContent = `共 ${payload.data.length} 条待审核地点`;
    await loadReports();
  } catch (error) { message.textContent = error.message; }
}

async function loadReports() {
  const payload = await request("/admin/reports");
  reportList.innerHTML = payload.data.length ? payload.data.map((report) => `<article class="admin-card"><div><h2>${escapeHTML(report.name)}</h2><p>${escapeHTML(report.reason)} · ${report.created_at}</p></div><div class="admin-actions"><button class="approve" data-report-id="${report.id}" data-report-status="resolved" type="button">已处理</button><button class="reject" data-report-id="${report.id}" data-report-status="dismissed" type="button">驳回</button></div></article>`).join("") : "<p>目前没有待处理举报。</p>";
  reportList.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => updateReport(button.dataset.reportId, button.dataset.reportStatus)));
}

async function updateReport(id, status) { try { await request(`/admin/reports/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); await loadReports(); } catch (error) { message.textContent = error.message; } }

async function updateStatus(id, status) {
  try { await request(`/admin/spots/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }); await loadPending(); } catch (error) { message.textContent = error.message; }
}

// 管理员点位列表：可按名称搜索、按状态筛选，违规点位可直接删除
async function loadAllSpots() {
  try {
    const params = new URLSearchParams();
    if (spotSearchInput.value.trim()) params.set("q", spotSearchInput.value.trim());
    if (statusFilter.value) params.set("status", statusFilter.value);
    const payload = await request(`/admin/spots/all?${params}`);
    allSpotsList.innerHTML = payload.data.length ? payload.data.map((spot) => `<article class="admin-card"><div><h2>${escapeHTML(spot.name)}<small>${escapeHTML(STATUS_LABELS[spot.status] || spot.status)}</small></h2><p>${escapeHTML(spot.address || spot.description)} · ${escapeHTML(spot.category)} · ${spot.likes} 赞 · ${escapeHTML(spot.created_at)}</p></div><div class="admin-actions"><button class="delete" data-delete-id="${spot.id}" type="button">删除</button></div></article>`).join("") : "<p>没有找到匹配的地点。</p>";
    allSpotsList.querySelectorAll("button[data-delete-id]").forEach((button) => button.addEventListener("click", () => deleteSpot(button.dataset.deleteId)));
  } catch (error) { message.textContent = error.message; }
}

async function deleteSpot(id) {
  if (!window.confirm("删除后不可恢复，确认删除这个地点？")) return;
  try {
    const payload = await request(`/admin/spots/${id}`, { method: "DELETE" });
    message.textContent = `已删除「${payload.name}」`;
    await loadAllSpots();
    await loadPending();
  } catch (error) { message.textContent = error.message; }
}

function escapeHTML(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character])); }
document.querySelector("#loadButton").addEventListener("click", async () => { await loadPending(); await loadAllSpots(); });
document.querySelector("#amapCheckButton").addEventListener("click", async () => {
  const box = document.querySelector("#amapCheckResult");
  box.textContent = "检查中……";
  try {
    box.textContent = JSON.stringify(await request("/admin/amap-check"), null, 2);
  } catch (error) { box.textContent = error.message; }
});
document.querySelector("#loadSpotsButton").addEventListener("click", loadAllSpots);
spotSearchInput.addEventListener("keydown", (event) => { if (event.key === "Enter") loadAllSpots(); });
