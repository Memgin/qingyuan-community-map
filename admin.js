const API_BASE = "/api";
const tokenInput = document.querySelector("#adminToken");
const pendingList = document.querySelector("#pendingList");
const reportList = document.querySelector("#reportList");
const allSpotsList = document.querySelector("#allSpotsList");
const spotSearchInput = document.querySelector("#spotSearch");
const statusFilter = document.querySelector("#statusFilter");
const message = document.querySelector("#adminMessage");
const STATUS_LABELS = { pending: "待审核", approved: "已上线", rejected: "已下架" };

// 轻量提示条（admin 页面独立于主页脚本，需自带 showToast）
let toastTimer = null;
function showToast(message) {
  const toast = document.querySelector("#adminToast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3200);
}

// ---------------- 标签页切换 ----------------
document.querySelectorAll(".admin-tab").forEach((tab) => tab.addEventListener("click", () => {
  document.querySelectorAll(".admin-tab").forEach((t) => t.classList.toggle("active", t === tab));
  document.querySelectorAll(".admin-panel").forEach((panel) => { panel.hidden = panel.id !== `panel-${tab.dataset.tab}`; });
}));

// 管理密钥本会话内自动记住（关闭浏览器即清除，不落盘长期存储）
const ADMIN_TOKEN_KEY = "qymap-admin-token";
const savedAdminToken = sessionStorage.getItem(ADMIN_TOKEN_KEY);
if (savedAdminToken && !tokenInput.value) tokenInput.value = savedAdminToken;
tokenInput.addEventListener("change", () => sessionStorage.setItem(ADMIN_TOKEN_KEY, tokenInput.value.trim()));

// ---------------- 位置纠偏：列表与审批 ----------------
const correctionList = document.querySelector("#correctionList");
const loadCorrectionsButton = document.querySelector("#loadCorrectionsButton");

loadCorrectionsButton.addEventListener("click", loadCorrections);

async function loadCorrections() {
  correctionList.textContent = "加载中……";
  try {
    const payload = await request("/admin/corrections");
    const corrections = payload.data || [];
    if (!corrections.length) { correctionList.textContent = "暂无待审核的纠偏申请。"; return; }
    correctionList.innerHTML = corrections.map((item) => `<div class="admin-card"><div><h2>${item.name} <small>#${item.spot_id} · ${item.username || "匿名用户"}</small></h2><p>当前：${item.old_lat}, ${item.old_lng}<br>纠偏至：${item.new_lat}, ${item.new_lng}<br>${item.address || ""} · ${item.created_at}</p></div><div class="admin-actions"><button class="approve" data-correction-id="${item.id}" data-action="apply" type="button">同意移动</button><button class="reject" data-correction-id="${item.id}" data-action="reject" type="button">驳回</button></div></div>`).join("");
    correctionList.querySelectorAll("[data-correction-id]").forEach((button) => button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await request(`/admin/corrections/${button.dataset.correctionId}/handle`, { method: "POST", body: JSON.stringify({ action: button.dataset.action }) });
        showToast(button.dataset.action === "apply" ? "已移动点位" : "已驳回纠偏");
        loadCorrections();
      } catch (error) {
        showToast(error.message);
        button.disabled = false;
      }
    }));
  } catch (error) {
    correctionList.textContent = error.message;
  }
}

// ---------------- 密码重置申请：列表与审批 ----------------
const resetRequestList = document.querySelector("#resetRequestList");
const loadResetRequestsButton = document.querySelector("#loadResetRequestsButton");

loadResetRequestsButton.addEventListener("click", loadResetRequests);

async function loadResetRequests() {
  resetRequestList.textContent = "加载中……";
  try {
    const payload = await request("/admin/reset-requests");
    const requests = payload.data || [];
    if (!requests.length) { resetRequestList.textContent = "暂无待审批的申请。"; return; }
    resetRequestList.innerHTML = requests.map((item) => `<div class="token-row"><strong>${item.username}</strong><span>${item.note || "（无补充说明）"}</span><small>${item.created_at}</small><button class="primary-button" data-approve-reset="${item.id}" data-approve-name="${item.username}" type="button">同意（重置为 12345）</button><button class="delete-button" data-dismiss-reset="${item.id}" type="button">删除记录</button></div>`).join("");
    resetRequestList.querySelectorAll("[data-approve-reset]").forEach((button) => button.addEventListener("click", async () => {
      if (!window.confirm(`确认同意 ${button.dataset.approveName} 的重置申请？其密码将重置为 12345，且登录后必须设置新密码。`)) return;
      button.disabled = true;
      try {
        const payload = await request(`/admin/reset-requests/${button.dataset.approveReset}/handle`, { method: "POST" });
        showToast(payload.delivered === false ? `已重置，但推送可能未送达，请务必人工告知 ${payload.username} 临时密码 12345` : `已重置并推送通知给 ${payload.username}`);
        loadResetRequests();
      } catch (error) {
        showToast(error.message);
        button.disabled = false;
      }
    }));
    resetRequestList.querySelectorAll("[data-dismiss-reset]").forEach((button) => button.addEventListener("click", async () => {
      if (!window.confirm("确定删除这条申请记录吗？它将从待审批列表移除。")) return;
      button.disabled = true;
      try {
        await request(`/admin/reset-requests/${button.dataset.dismissReset}`, { method: "DELETE" });
        showToast("记录已删除");
        loadResetRequests();
      } catch (error) {
        showToast(error.message);
        button.disabled = false;
      }
    }));
  } catch (error) {
    resetRequestList.textContent = error.message;
  }
}

// ---------------- 用户账号：重置密码 ----------------
const resetUsernameInput = document.querySelector("#resetUsername");
const resetPasswordButton = document.querySelector("#resetPasswordButton");
const resetResult = document.querySelector("#resetResult");

resetPasswordButton.addEventListener("click", async () => {
  const username = resetUsernameInput.value.trim();
  if (!username) { resetResult.textContent = "请先输入要重置的用户名。"; return; }
  resetPasswordButton.disabled = true;
  resetResult.textContent = "重置中……";
  try {
    const payload = await request("/admin/users/reset-password", { method: "POST", body: JSON.stringify({ username }) });
    resetResult.textContent = `已重置「${payload.username}」的密码。\n临时密码：${payload.tempPassword}\n请告知用户用它登录，登录后系统会强制要求设置新密码。该账号所有登录会话已被踢下线。`;
  } catch (error) {
    resetResult.textContent = error.message;
  }
  resetPasswordButton.disabled = false;
});

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
