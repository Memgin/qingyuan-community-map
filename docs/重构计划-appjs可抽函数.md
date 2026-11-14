# app.js 重构计划 · 可抽成函数的重复模式（2026-11-09）

> 目标：消除重复、降低维护成本，**功能零变化**。做完 #1-#3 预计 app.js 缩短约 150 行。
> 建议顺序：#1 → #2 → #3（先做低风险的弹窗三件套），每完成一项跑一次本地预览回归。
> 实施前先 commit 当前状态，每完成一项单独 commit，便于回滚。

---

## #1 弹窗/面板通用逻辑（收益最大，风险最低）

**现状**：关闭按钮绑定 + 点击遮罩关闭 + Esc 关闭，8 个弹窗各写一遍：
`editBackdrop`、`authBackdrop`、`forgotPanel`、`forceChangeBackdrop`、`profileBackdrop`、`settingsBackdrop`、`emergencyBackdrop`、`mapPickBackdrop`。

**方案**：

```js
// 通用弹窗开合：closeSelector 内元素或点击遮罩空白处关闭；可选 Esc
function setupModal(backdrop, { closeSelector = ".close-button", esc = true } = {}) {
  backdrop.querySelectorAll(closeSelector).forEach((button) =>
    button.addEventListener("click", () => { backdrop.hidden = true; }));
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) backdrop.hidden = true;
  });
  if (esc) pendingEscClose.push(() => { backdrop.hidden = true; });
}
// 现有的全局 keydown（Esc 关闭 detail/profile/settings）改为遍历 pendingEscClose
```

**注意**：
- `emergencyBackdrop` 关闭时还要 `clearEmergencyMarkers()`——支持 `onClose` 回调参数；
- `detailPanel` / `routeEditorPanel` 是左列面板（非遮罩弹窗），**不套用**本函数，保留各自逻辑。

---

## #2 API 请求 + 错误处理封装（覆盖面最广）

**现状**：`apiFetch → response.json() → !response.ok throw payload.error` 模式重复约 **25 处**
（收藏、分享、协作、回收站、点评删除、资料保存、上传、AI 建图等）。

**方案**：

```js
// 统一请求：成功返回 payload，失败抛出后端 error 信息；网络失败给默认文案
async function requestAPI(path, options = {}, { fallbackError = "请求失败" } = {}) {
  const response = await apiFetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || fallbackError);
  return payload;
}

// 用法示例（改造前 4 行 → 1 行）：
// 改造前：
//   const response2 = await apiFetch(url, { method: "DELETE", headers: authHeaders() });
//   const payload2 = await response2.json().catch(() => ({}));
//   if (!response2 || !response2.ok) { showToast("移除失败，请稍后重试"); return; }
// 改造后：
//   await requestAPI(url, { method: "DELETE", headers: authHeaders() }, { fallbackError: "移除失败，请稍后重试" });
```

**注意**：
- `addMapSpot`（`added === false` 时给不同提示）、`upsertSpotReview`（区分新增/更新）、`createShareToken`（需要返回 token）等需要**读 payload** 的调用处不强行套用——只在"成败二态"的调用处替换；
- 原代码里 `!response2` 的双重判断（网络层 undefined）在 requestAPI 内部消化。

---

## #3 确认 + 删除 + 刷新三联（5 处）

**现状**：`window.confirm → DELETE → showToast → 重新加载` 重复于：
删地图（软删）、彻底删除、移除地图点位、移除协作者、删除我的点评。

**方案**：

```js
async function confirmAndDelete(url, { message, successText = "已删除", reload } = {}) {
  if (!window.confirm(message)) return false;
  await requestAPI(url, { method: "DELETE", headers: authHeaders() });
  showToast(successText);
  if (reload) await reload();
  return true;
}
```

**注意**：删地图成功后还要收起详情面板并清 `state.openMapId`——用 `onDone` 回调承接。

---

## #4 序号标记绘制去重

**现状**：`drawRoute`（guideMap）与 `drawRouteEditorOverlay`（主地图）各有一份
"Polyline + 逐点序号 Marker"循环。

**方案**：

```js
function addRouteMarkers(mapInstance, spots, { color = "#2F80ED", weight = 5 } = {}) {
  const polyline = new AMap.Polyline({ path: spots.map((s) => [s.lng, s.lat]), strokeColor: color, strokeWeight: weight, strokeOpacity: .85, strokeStyle: "dashed", showDir: true });
  const markers = spots.map((spot, index) => new AMap.Marker({
    position: [spot.lng, spot.lat],
    content: `<div class="route-badge">${index + 1}</div>`,
    offset: new AMap.Pixel(-13, -40), zIndex: 110
  }));
  mapInstance.add([polyline, ...markers]);
  return { polyline, markers };
}
// 编辑器调用时传 color: "#E67E22", weight: 6
```

---

## #5 跨文件公共函数提取（app.js / all.js 重复）

- `starsHTML(rating)`：两处各一份 → 提 `common.js`；
- 导航埋点委托（`a[data-nav-id]` → sendBeacon）：两处各一份 → 提 `common.js`；
- `common.js` 在 `demo-data.js` 之前、页面脚本之后引入（无依赖顺序问题，仅 DOM 委托与纯函数）。

---

## #6 小工具（顺手做）

- `scrollToPanel(el)`：`el.scrollIntoView({ behavior: "smooth", block: "start" })`，出现 5+ 处；
- `categoryOptionsHTML(list, selectedKey)`：管理后台分类下拉、路线编辑器添加下拉等 3 处类似 `<option>` 渲染。

---

## 回归验证清单（重构完成后必做）

1. 本地 `compete/本地路演/启动本地服务.bat` → `index.html?demoRoute=1` 小地图正常
2. 登录 / 退出 / 强制改密流程
3. 收藏（单图直收 / 多图选择器 / 新建并收藏 / 已收藏 ✓）
4. 地图详情：改名保存、移除点位、顺路规划、分享链接复制、取消分享、删除→回收站→恢复→彻底删除
5. 协作：添加 / 昵称撞名候选 / 移除
6. 详情点评：发表 / 匿名 / 修改 / 删除；用户主页；资料设置
7. 应急弹窗定位与关闭
8. iPhone 视口截图回归（`预览-iPhone/` 重新生成对比）
