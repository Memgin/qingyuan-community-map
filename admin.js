const API_BASE = "/api";
const tokenInput = document.querySelector("#adminToken");
const pendingList = document.querySelector("#pendingList");
const reportList = document.querySelector("#reportList");
const message = document.querySelector("#adminMessage");

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
    pendingList.innerHTML = payload.data.length ? payload.data.map((spot) => `<article class="admin-card"><div><h2>${escapeHTML(spot.name)}</h2><p>${escapeHTML(spot.description)} · ${spot.category} · ${spot.lat}, ${spot.lng}</p></div><div class="admin-actions"><button class="approve" data-id="${spot.id}" data-status="approved" type="button">通过</button><button class="reject" data-id="${spot.id}" data-status="rejected" type="button">拒绝</button></div></article>`).join("") : '<p>目前没有待审核地点。</p>';
    pendingList.querySelectorAll("button").forEach((button) => button.addEventListener("click", () => updateStatus(button.dataset.id, button.dataset.status)));
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

function escapeHTML(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character])); }
document.querySelector("#loadButton").addEventListener("click", loadPending);
