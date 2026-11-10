const API_BASE = "/api";
const tokenInput = document.querySelector("#adminToken");
const pendingList = document.querySelector("#pendingList");
const reportList = document.querySelector("#reportList");
const allSpotsList = document.querySelector("#allSpotsList");
const spotSearchInput = document.querySelector("#spotSearch");
const statusFilter = document.querySelector("#statusFilter");
const categoryChips = document.querySelector("#categoryChips");
// 管理列表里分类 key 显示为中文（与前台「全部地点」页的分类色一致）
const CATEGORY_LABELS = { scenic: "景点", food: "美食", shopping: "商圈", medical: "医疗", school: "校园", transit: "交通" };
const CATEGORY_COLORS = { scenic: "#6E8CA0", food: "#C96F5E", shopping: "#A97F92", medical: "#7A9B84", school: "#7D8BB5", transit: "#C9A063" };
// 数据概览图表（Chart.js）：分类分布 + 热度 Top 10，随点位数据加载后刷新
let chartCategories = null;
let chartHot = null;
function renderAdminCharts(spots) {
  if (typeof Chart === "undefined" || !spots?.length) return;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  const catCanvas = document.querySelector("#chartCategories");
  const hotCanvas = document.querySelector("#chartHot");
  if (catCanvas) {
    const counts = Object.keys(CATEGORY_LABELS).map((key) => spots.filter((spot) => spot.category === key).length);
    const data = { labels: Object.values(CATEGORY_LABELS), datasets: [{ data: counts, backgroundColor: Object.values(CATEGORY_COLORS), borderRadius: 8 }] };
    if (chartCategories) chartCategories.destroy();
    chartCategories = new Chart(catCanvas, { type: "bar", data, options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
  }
  if (hotCanvas) {
    const top = [...spots].sort((a, b) => Number(b.hot_score || 0) - Number(a.hot_score || 0)).slice(0, 10);
    // 三段堆叠：点赞(1) / 点评(2) / 导航(2)——即使热度很小也能看清构成
    const data = {
      labels: top.map((spot) => spot.name),
      datasets: [
        { label: "点赞", data: top.map((spot) => Number(spot.likes || 0)), backgroundColor: "#6E8CA0", borderRadius: 4 },
        { label: "点评×2", data: top.map((spot) => Number(spot.review_count || 0) * 2), backgroundColor: "#C96F5E", borderRadius: 4 },
        { label: "导航×2", data: top.map((spot) => Number(spot.nav_count || 0) * 2), backgroundColor: "#C9A063", borderRadius: 4 }
      ]
    };
    const totalHot = top.reduce((sum, spot) => sum + Number(spot.hot_score || 0), 0);
    document.querySelector("#chartHotEmpty").hidden = totalHot > 0;
    hotCanvas.style.visibility = totalHot > 0 ? "visible" : "hidden";
    if (chartHot) chartHot.destroy();
    chartHot = new Chart(hotCanvas, { type: "bar", data, options: { indexAxis: "y", responsive: true, plugins: { legend: { position: "top", labels: { boxWidth: 12 } }, tooltip: { callbacks: { label: (item) => ` ${item.dataset.label}：${item.raw}` } } }, scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } }, y: { stacked: true } } } });
  }
}
const ADMIN_CATEGORIES = [
  { key: "", label: "全部", color: "#2F6D5A" },
  { key: "scenic", label: "景点", color: "#5995A8" },
  { key: "food", label: "美食", color: "#EB765E" },
  { key: "shopping", label: "商圈", color: "#B4778E" },
  { key: "medical", label: "医疗", color: "#68A678" },
  { key: "school", label: "校园", color: "#6F7FC0" },
  { key: "transit", label: "交通", color: "#D39A47" }
];
let selectedCategory = "";
function renderCategoryChips() {
  if (!categoryChips) return;
  categoryChips.innerHTML = ADMIN_CATEGORIES.map((item) => `<button class="filter-chip${selectedCategory === item.key ? " active" : ""}" data-category="${item.key}" type="button"><span class="chip-dot" style="--chip-color:${item.color}"></span>${item.label}</button>`).join("");
  categoryChips.querySelectorAll(".filter-chip").forEach((button) => button.addEventListener("click", () => {
    selectedCategory = button.dataset.category;
    renderCategoryChips();
    loadAllSpots();
  }));
}
renderCategoryChips();
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
    correctionList.innerHTML = corrections.map((item) => `<div class="admin-card"><div><h2>${escapeHTML(item.name)} <small>#${escapeHTML(item.spot_id)} · ${escapeHTML(item.username || "匿名用户")}</small></h2><p>当前：${escapeHTML(item.old_lat)}, ${escapeHTML(item.old_lng)}<br>纠偏至：${escapeHTML(item.new_lat)}, ${escapeHTML(item.new_lng)}<br>${escapeHTML(item.address || "")} · ${escapeHTML(item.created_at)}</p></div><div class="admin-actions"><button class="approve" data-correction-id="${escapeHTML(item.id)}" data-action="apply" type="button">同意移动</button><button class="reject" data-correction-id="${escapeHTML(item.id)}" data-action="reject" type="button">驳回</button></div></div>`).join("");
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
    // note / username 由任意访客填写，必须转义后再插入 HTML。
    // 未转义时构成存储型 XSS：攻击者提交带脚本的申请，管理员一打开后台即执行，
    // 可读取 sessionStorage 中的管理密钥并外传，导致管理后台沦陷
    resetRequestList.innerHTML = requests.map((item) => `<div class="token-row"><strong>${escapeHTML(item.username)}</strong><span>${escapeHTML(item.note || "（无补充说明）")}</span><small>${escapeHTML(item.created_at)}</small><button class="primary-button" data-approve-reset="${escapeHTML(item.id)}" data-approve-name="${escapeHTML(item.username)}" type="button">同意并下发随机临时密码</button><button class="delete-button" data-dismiss-reset="${escapeHTML(item.id)}" type="button">删除记录</button></div>`).join("");
    resetRequestList.querySelectorAll("[data-approve-reset]").forEach((button) => button.addEventListener("click", async () => {
      if (!window.confirm(`确认同意 ${button.dataset.approveName} 的重置申请？系统将生成一次性随机临时密码并推送到其设备，登录后必须设置新密码。`)) return;
      button.disabled = true;
      try {
        const payload = await request(`/admin/reset-requests/${button.dataset.approveReset}/handle`, { method: "POST" });
        showToast(payload.delivered === false ? `已重置，但推送未送达，请通过其他渠道把返回的临时密码告知 ${payload.username}` : `已重置，临时密码已推送给 ${payload.username}`);
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
    if (selectedCategory) params.set("category", selectedCategory);
    const payload = await request(`/admin/spots/all?${params}`);
    renderAdminCharts(payload.data);
    const categoryOptions = (spot) => ADMIN_CATEGORIES.filter((item) => item.key).map((item) => `<option value="${item.key}"${spot.category === item.key ? " selected" : ""}>${item.label}</option>`).join("");
    const spotTagsText = (spot) => { try { const list = typeof spot.tags === "string" ? JSON.parse(spot.tags) : []; return Array.isArray(list) ? list.join("，") : ""; } catch { return ""; } };
    // 表格化布局：分类下拉与子标签输入均为失焦即保存，状态用彩色胶囊标签
    allSpotsList.innerHTML = payload.data.length ? `<div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>地点</th><th>状态</th><th>分类</th><th>子标签</th><th>点赞</th><th>加入时间</th><th>操作</th></tr></thead><tbody>${payload.data.map((spot) => `<tr>
      <td><strong>${escapeHTML(spot.name)}</strong><small>${escapeHTML(spot.address || spot.description || "")}</small></td>
      <td><span class="status-pill ${spot.status}">${escapeHTML(STATUS_LABELS[spot.status] || spot.status)}</span></td>
      <td><select data-category-id="${spot.id}">${categoryOptions(spot)}</select></td>
      <td><input type="text" class="admin-tags" data-tags-id="${spot.id}" value="${escapeHTML(spotTagsText(spot))}" maxlength="60" placeholder="逗号分隔，最多 5 个"></td>
      <td>${spot.likes}</td>
      <td>${escapeHTML((spot.created_at || "").slice(0, 16))}</td>
      <td><button class="delete" data-delete-id="${spot.id}" type="button">删除</button></td>
    </tr>`).join("")}</tbody></table></div>` : "<p>没有找到匹配的地点。</p>";
    allSpotsList.querySelectorAll("button[data-delete-id]").forEach((button) => button.addEventListener("click", () => deleteSpot(button.dataset.deleteId)));
    // 分类下拉选择即保存：成功后刷新以维持分类筛选的正确性，失败回滚显示
    allSpotsList.querySelectorAll("select[data-category-id]").forEach((select) => select.addEventListener("change", async () => {
      try {
        await request(`/admin/spots/${select.dataset.categoryId}/category`, { method: "POST", body: JSON.stringify({ category: select.value }) });
        message.textContent = "分类已更新";
        await loadAllSpots();
      } catch (error) {
        message.textContent = error.message;
        loadAllSpots();
      }
    }));
    // 子标签输入：失焦（change）即保存，超过 5 个自动截断并回写显示
    allSpotsList.querySelectorAll("input[data-tags-id]").forEach((input) => input.addEventListener("change", async () => {
      const tags = input.value.split(/[,，、\s]+/).map((tag) => tag.trim()).filter(Boolean).slice(0, 5);
      if (tags.length < input.value.split(/[,，、\s]+/).filter((tag) => tag.trim()).length) { message.textContent = "子标签最多 5 个，已保留前 5 个"; }
      try {
        await request(`/admin/spots/${input.dataset.tagsId}/tags`, { method: "POST", body: JSON.stringify({ tags }) });
        input.value = tags.join("，");
        message.textContent = "子标签已更新";
      } catch (error) {
        message.textContent = error.message;
        loadAllSpots();
      }
    }));
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
statusFilter.addEventListener("change", loadAllSpots);
