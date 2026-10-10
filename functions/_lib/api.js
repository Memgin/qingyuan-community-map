const CATEGORIES = new Set(["scenic", "food", "shopping", "medical", "transit", "school"]);
const STATUSES = new Set(["pending", "approved", "rejected"]);
const PROJECT_STORAGE_LIMIT = 10 * 1024 * 1024 * 1024;
const PROJECT_CLASS_A_LIMIT = 1_000_000;
const PROJECT_CLASS_B_LIMIT = 10_000_000;

// 兼容 Cloudflare Worker fetch 与 Pages Functions：
// - Worker:       export default { async fetch(request, env) { return handleRequest(request, env); } }
// - Pages:        export const onRequest = (ctx) => handleRequest(ctx.request, ctx.env);
export async function handleRequest(request, env) {
  if (request.method === "OPTIONS") return response(null, 204, env);
  try {
    return await dispatch(request, env);
  } catch (error) {
    console.error(error);
    return json({ error: "服务暂时不可用" }, 500, env);
  }
}

async function dispatch(request, env) {
  const url = new URL(request.url);
    if (url.pathname === "/api/spots" && request.method === "GET") return listSpots(request, url, env);
    if (url.pathname === "/api/spots" && request.method === "POST") return createSpot(request, env);
    if (url.pathname === "/api/auth/register" && request.method === "POST") return register(request, env);
    if (url.pathname === "/api/auth/login" && request.method === "POST") return login(request, env);
    if (url.pathname === "/api/auth/me" && request.method === "GET") return currentUser(request, env);
    if (url.pathname === "/api/auth/logout" && request.method === "POST") return logout(request, env);
    if (url.pathname === "/api/uploads" && request.method === "POST") return uploadImage(request, env);
    const imageMatch = url.pathname.match(/^\/api\/images\/(.+)$/);
    if (imageMatch && request.method === "GET") return getImage(imageMatch[1], env);
    if (url.pathname === "/api/maps" && request.method === "GET") return listMaps(request, env);
    if (url.pathname === "/api/maps" && request.method === "POST") return createMap(request, env);
    const mapMatch = url.pathname.match(/^\/api\/maps\/(\d+)\/spots$/);
    if (mapMatch && request.method === "POST") return addMapSpot(request, env, Number(mapMatch[1]));
    if (mapMatch && request.method === "GET") return listMapSpots(request, env, Number(mapMatch[1]));
    if (url.pathname === "/api/my-spots" && request.method === "GET") return listMySpots(request, env);
    const likeMatch = url.pathname.match(/^\/api\/spots\/(\d+)\/like$/);
    if (likeMatch && request.method === "POST") return likeSpot(request, env, Number(likeMatch[1]));
    const reportMatch = url.pathname.match(/^\/api\/spots\/(\d+)\/report$/);
    if (reportMatch && request.method === "POST") return reportSpot(request, env, Number(reportMatch[1]));
    const deleteMatch = url.pathname.match(/^\/api\/spots\/(\d+)$/);
    if (deleteMatch && request.method === "DELETE") return deleteOwnSpot(request, env, Number(deleteMatch[1]));
    if (url.pathname === "/api/admin/spots" && request.method === "GET") return listPending(request, env);
    if (url.pathname === "/api/admin/reports" && request.method === "GET") return listReports(request, env);
    const reportStatusMatch = url.pathname.match(/^\/api\/admin\/reports\/(\d+)\/status$/);
    if (reportStatusMatch && request.method === "PATCH") return updateReportStatus(request, env, Number(reportStatusMatch[1]));
    const statusMatch = url.pathname.match(/^\/api\/admin\/spots\/(\d+)\/status$/);
    if (statusMatch && request.method === "PATCH") return updateStatus(request, env, Number(statusMatch[1]));
    const adminDeleteMatch = url.pathname.match(/^\/api\/admin\/spots\/(\d+)$/);
    if (adminDeleteMatch && request.method === "DELETE") return adminDeleteSpot(request, env, Number(adminDeleteMatch[1]));
    if (url.pathname === "/api/admin/spots/all" && request.method === "GET") return listAdminSpots(request, url, env);
    if (url.pathname === "/api/admin/amap-check" && request.method === "GET") return amapCheck(request, env);
    if (url.pathname === "/api/recommend" && request.method === "POST") return recommend(request, env);
    return json({ error: "Not found" }, 404, env);
}

async function listSpots(request, url, env) {
  const category = url.searchParams.get("category");
  const query = url.searchParams.get("q");
  // since 为增量同步参数：只返回该时间点之后新增或发生变更的点位
  const since = url.searchParams.get("since");
  // fields=map 只返回地图图钉需要的轻量字段，可一次拉取较大数量
  const fields = url.searchParams.get("fields") === "map" ? "map" : "full";
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const maxLimit = fields === "map" ? 500 : 50;
  const defaultLimit = fields === "map" ? 500 : 20;
  const limit = Math.min(maxLimit, Math.max(1, Number(url.searchParams.get("limit") || defaultLimit)));
  const conditions = ["status = 'approved'"];
  const bindings = [];
  if (CATEGORIES.has(category)) { conditions.push("category = ?"); bindings.push(category); }
  if (query) { conditions.push("(name LIKE ? OR description LIKE ?)"); bindings.push(`%${query}%`, `%${query}%`); }
  if (since) { conditions.push("COALESCE(updated_at, created_at) > ?"); bindings.push(since); }
  const where = conditions.join(" AND ");
  const count = await env.DB.prepare(`SELECT COUNT(*) AS total FROM spots WHERE ${where}`).bind(...bindings).first();
  const columns = fields === "map" ? "id, name, category, lat, lng" : "id, name, address, category, description, lat, lng, image_url, likes, created_at";
  const rows = await env.DB.prepare(`SELECT ${columns} FROM spots WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, (page - 1) * limit).all();
  // 登录用户附带自己的点赞状态，使网页与 App 的点赞跨端一致
  let data = rows.results;
  if (fields !== "map") {
    const user = await authenticatedUser(request, env);
    if (user && data.length) {
      const likedRows = await env.DB.prepare(`SELECT spot_id FROM spot_likes WHERE actor_key = ? AND spot_id IN (${data.map(() => "?").join(",")})`)
        .bind(`user:${user.id}`, ...data.map((row) => row.id)).all();
      const liked = new Set(likedRows.results.map((row) => row.spot_id));
      data = data.map((row) => ({ ...row, liked: liked.has(row.id) }));
    }
  }
  return json({ data, page, limit, total: count.total }, 200, env);
}

async function createSpot(request, env) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ error: "请先登录后再提交地点" }, 401, env);
  const body = await request.json();
  const spot = validateSpot(body);
  if (!spot.ok) return json({ error: spot.error }, 400, env);
  const ownerToken = request.headers.get("X-Owner-Token");
  if (!ownerToken || ownerToken.length < 20 || ownerToken.length > 100) return json({ error: "缺少提交者身份" }, 400, env);
  // client_token 由客户端生成（离线队列用），保证同一条提交重复发送只写入一次
  const clientToken = typeof body.client_token === "string" && body.client_token.length >= 8 && body.client_token.length <= 100 ? body.client_token : null;
  if (clientToken) {
    const existing = await env.DB.prepare("SELECT id, status FROM spots WHERE client_token = ?").bind(clientToken).first();
    if (existing) return json({ id: existing.id, status: existing.status, duplicated: true, message: "该提交已存在，已跳过重复写入" }, 200, env);
  }
  const duplicate = await env.DB.prepare("SELECT id FROM spots WHERE category = ? AND status != 'rejected' AND (lower(name) = lower(?) OR (abs(lat - ?) < 0.001 AND abs(lng - ?) < 0.001)) LIMIT 1")
    .bind(spot.value.category, spot.value.name, spot.value.lat, spot.value.lng).first();
  if (duplicate) return json({ error: "这个地点已经收录，无需重复提交" }, 409, env);
  const verification = await verifyWithAmap(spot.value, env);
  const verified = verification.passed;
  const status = verified ? "approved" : "pending";
  // 核验通过时用高德返回的坐标覆盖用户随手点的位置，保证点位落在准确位置
  const lat = verified && verification.corrected ? verification.corrected.lat : spot.value.lat;
  const lng = verified && verification.corrected ? verification.corrected.lng : spot.value.lng;
  const result = await env.DB.prepare("INSERT INTO spots (name, address, category, description, lat, lng, image_url, status, owner_token, user_id, client_token, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)")
    .bind(spot.value.name, spot.value.address, spot.value.category, spot.value.description, lat, lng, spot.value.image_url || null, status, ownerToken, user.id, clientToken).run();
  return json({ id: result.meta.last_row_id, status, verified, autocheck: verification.note, message: verified ? "地址和地点已核验，已自动通过" : "提交成功，等待人工审核" }, verified ? 201 : 202, env);
}

async function uploadImage(request, env) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ error: "请先登录" }, 401, env);
  if (!env.IMAGES) return json({ error: "图片存储尚未配置" }, 503, env);
  const contentType = request.headers.get("Content-Type") || "";
  if (!/^image\/(jpeg|png|webp)$/.test(contentType)) return json({ error: "仅支持 JPG、PNG、WebP 图片" }, 400, env);
  const body = await request.arrayBuffer();
  if (body.byteLength > 2 * 1024 * 1024) return json({ error: "图片不能超过 2MB" }, 400, env);
  if (!await reserveProjectUsage(env, body.byteLength, 1, 0)) return json({ error: "项目图片存储或写入总额度已达到上限" }, 429, env);
  const extension = contentType.split("/")[1].replace("jpeg", "jpg");
  const key = `${user.id}/${crypto.randomUUID()}.${extension}`;
  await env.IMAGES.put(key, body, { httpMetadata: { contentType } });
  return json({ url: `${new URL(request.url).origin}/api/images/${key}` }, 201, env);
}

async function getImage(key, env) {
  if (!env.IMAGES) return new Response("图片存储尚未配置", { status: 503 });
  if (!await reserveProjectUsage(env, 0, 0, 1)) return new Response("项目图片读取总额度已达到上限", { status: 429 });
  const object = await env.IMAGES.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType || "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable" } });
}

async function reserveProjectUsage(env, storageBytes, classAOps, classBOps) {
  const result = await env.DB.prepare("UPDATE r2_project_usage SET storage_bytes = storage_bytes + ?, class_a_ops = class_a_ops + ?, class_b_ops = class_b_ops + ? WHERE id = 1 AND storage_bytes + ? <= ? AND class_a_ops + ? <= ? AND class_b_ops + ? <= ?")
    .bind(storageBytes, classAOps, classBOps, storageBytes, PROJECT_STORAGE_LIMIT, classAOps, PROJECT_CLASS_A_LIMIT, classBOps, PROJECT_CLASS_B_LIMIT).run();
  return Boolean(result.meta.changes);
}

async function register(request, env) {
  const body = await request.json();
  if (!body.username || !/^[\w\u4e00-\u9fff-]{2,24}$/.test(body.username) || typeof body.password !== "string" || body.password.length < 8) return json({ error: "用户名需为 2-24 个字符，密码至少 8 位" }, 400, env);
  const exists = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(body.username.trim()).first();
  if (exists) return json({ error: "用户名已存在" }, 409, env);
  const salt = crypto.randomUUID();
  const hash = await passwordHash(body.password, salt);
  const result = await env.DB.prepare("INSERT INTO users (username, password_salt, password_hash) VALUES (?, ?, ?)").bind(body.username.trim(), salt, hash).run();
  return createSession(env, result.meta.last_row_id, body.username.trim());
}

async function login(request, env) {
  const body = await request.json();
  const user = await env.DB.prepare("SELECT id, username, password_salt, password_hash FROM users WHERE username = ?").bind(String(body.username || "").trim()).first();
  if (!user || user.password_hash !== await passwordHash(body.password || "", user.password_salt)) return json({ error: "用户名或密码错误" }, 401, env);
  return createSession(env, user.id, user.username);
}

async function currentUser(request, env) {
  const user = await authenticatedUser(request, env);
  return user ? json({ user: { id: user.id, username: user.username } }, 200, env) : json({ user: null }, 200, env);
}

async function logout(request, env) {
  const token = bearerToken(request);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  return json({ loggedOut: true }, 200, env);
}

async function createSession(env, userId, username) {
  const token = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))").bind(token, userId).run();
  return json({ token, user: { id: userId, username } }, 201, env);
}

async function authenticatedUser(request, env) {
  const token = bearerToken(request);
  if (!token) return null;
  return env.DB.prepare("SELECT users.id, users.username FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ? AND sessions.expires_at > CURRENT_TIMESTAMP").bind(token).first();
}

async function listMaps(request, env) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ error: "请先登录" }, 401, env);
  const rows = await env.DB.prepare("SELECT id, name, description, created_at FROM private_maps WHERE user_id = ? ORDER BY created_at DESC").bind(user.id).all();
  return json({ data: rows.results }, 200, env);
}

async function createMap(request, env) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ error: "请先登录" }, 401, env);
  const body = await request.json();
  if (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.length > 40) return json({ error: "私人地图名称需为 2-40 个字符" }, 400, env);
  const result = await env.DB.prepare("INSERT INTO private_maps (user_id, name, description) VALUES (?, ?, ?)").bind(user.id, body.name.trim(), String(body.description || "").slice(0, 120)).run();
  return json({ id: result.meta.last_row_id, name: body.name.trim() }, 201, env);
}

async function addMapSpot(request, env, mapId) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ error: "请先登录" }, 401, env);
  const owned = await env.DB.prepare("SELECT id FROM private_maps WHERE id = ? AND user_id = ?").bind(mapId, user.id).first();
  if (!owned) return json({ error: "私人地图不存在" }, 404, env);
  const body = await request.json();
  const spot = await env.DB.prepare("SELECT id FROM spots WHERE id = ? AND status = 'approved'").bind(Number(body.spot_id)).first();
  if (!spot) return json({ error: "公共地点不存在" }, 404, env);
  await env.DB.prepare("INSERT OR IGNORE INTO private_map_spots (map_id, spot_id) VALUES (?, ?)").bind(mapId, spot.id).run();
  return json({ map_id: mapId, spot_id: spot.id }, 201, env);
}

async function listMapSpots(request, env, mapId) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ error: "请先登录" }, 401, env);
  const rows = await env.DB.prepare("SELECT spots.id, spots.name, spots.address, spots.category, spots.description, spots.lat, spots.lng FROM private_map_spots JOIN spots ON spots.id = private_map_spots.spot_id JOIN private_maps ON private_maps.id = private_map_spots.map_id WHERE private_maps.id = ? AND private_maps.user_id = ? ORDER BY private_map_spots.created_at DESC").bind(mapId, user.id).all();
  return json({ data: rows.results }, 200, env);
}

async function listMySpots(request, env) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ error: "请先登录" }, 401, env);
  const rows = await env.DB.prepare("SELECT id, name, address, category, description, lat, lng, image_url, status, likes, created_at FROM spots WHERE user_id = ? ORDER BY created_at DESC").bind(user.id).all();
  return json({ data: rows.results }, 200, env);
}

async function deleteOwnSpot(request, env, id) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ error: "请先登录" }, 401, env);
  const result = await env.DB.prepare("DELETE FROM spots WHERE id = ? AND user_id = ?").bind(id, user.id).run();
  if (!result.meta.changes) return json({ error: "只能删除自己提交的地点" }, 403, env);
  return json({ id, deleted: true }, 200, env);
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { signal: controller.signal }); } finally { clearTimeout(timer); }
}

// 高德会把一家机构拆成多条（2号住院楼、门诊楼、体检中心、停车场…），去后缀后还原主体名称
function stripPlaceSuffix(name) {
  return String(name || "")
    .replace(/(门诊楼|住院大楼|住院楼|医技楼|行政楼|门诊大楼|急诊|急救中心|发热门诊|门诊部|住院部|体检中心|服务中心|一站式服务中心|核酸采样点|采样点|食堂|停车场|停车楼|消防站|微型消防站)/g, "")
    .replace(/[\-—(（].*$/, "")
    .replace(/[\d一二三四五六七八九十]+号楼?$/, "")
    .replace(/[\s·]+$/, "");
}

async function verifyWithAmap(spot, env) {
  if (!env.AMAP_WEB_KEY) return { passed: false, note: "自动核验未启用（高德 Web 服务 Key 未配置）" };
  const key = env.AMAP_WEB_KEY;
  const expected = normalizeName(spot.name);
  const address = normalizeName(spot.address);
  let failure = "";
  let nearbyName = "";

  // 1) 逆地理编码：坐标通常来自高德地图选点，直接反查该点周边 POI 最可靠
  try {
    const params = new URLSearchParams({ location: `${spot.lng},${spot.lat}`, extensions: "all", radius: "500", output: "json", key });
    const response = await fetchWithTimeout(`https://restapi.amap.com/v3/geocode/regeo?${params}`, 6000);
    const payload = await response.json().catch(() => ({}));
    if (payload.status === "1") {
      const pois = payload.regeocode?.pois || [];
      const hit = pois.find((poi) => {
        const poiName = normalizeName(poi.name || "");
        if (!poiName) return false;
        // 坐标落在该机构的园区内：本体名相等、去后缀后相等、或以前缀命中（住院楼等都算同一家）
        if (poiName === expected || stripPlaceSuffix(poiName) === stripPlaceSuffix(expected)) return true;
        return expected.length >= 5 && (poiName.startsWith(expected) || stripPlaceSuffix(poiName).startsWith(expected));
      });
      if (hit) return { passed: true, note: `标注坐标落在「${hit.name}」范围内，已自动通过` };
      // 未命中时不在此处判失败，继续走关键词检索
      if (pois.length) nearbyName = pois[0].name;
    } else {
      failure = `逆地理编码 ${payload.info || "失败"}${payload.infocode ? `(${payload.infocode})` : ""}`;
    }
  } catch {
    failure = failure || "逆地理编码请求异常";
  }

  // 2) 关键词检索：名称优先（地址可能是"地图选点 经度,纬度"这类坐标串，做关键词检索毫无意义）
  const tries = [
    { keywords: spot.name, city: "清远", citylimit: "true" },
    { keywords: spot.name },
    { keywords: spot.address }
  ];
  let nearest = null;
  let farHit = null;
  for (const options of tries) {
    if (!options.keywords || /^\s*地图选点/.test(options.keywords)) continue;
    try {
      const params = new URLSearchParams({ keywords: options.keywords, output: "json", offset: "20", key });
      if (options.city) { params.set("city", options.city); if (options.citylimit) params.set("citylimit", options.citylimit); }
      const response = await fetchWithTimeout(`https://restapi.amap.com/v3/place/text?${params}`, 6000);
      const payload = await response.json().catch(() => ({}));
      if (payload.status !== "1") {
        failure = failure || `检索 ${payload.info || "失败"}${payload.infocode ? `(${payload.infocode})` : ""}`;
        continue;
      }
      const pois = payload.pois || [];
      for (const poi of pois) {
        if (!poi.location) continue;
        const [lng, lat] = poi.location.split(",").map(Number);
        const distance = Math.round(distanceInMeters(spot.lat, spot.lng, lat, lng));
        if (!nearest || distance < nearest.distance) nearest = { name: poi.name, distance };
        const poiName = normalizeName(poi.name);
        const stripped = stripPlaceSuffix(poiName);
        const expectedStripped = stripPlaceSuffix(expected);
        const nameHit = poiName === expected || stripped === expectedStripped
          || (expected.length >= 5 && (poiName.startsWith(expected) || stripped.startsWith(expected)))
          || (poiName.length >= 2 && (poiName.includes(expected) || expected.includes(poiName)));
        if (!nameHit) continue;
        // 名称命中即通过，坐标交给高德结果校正，用户无需精确点选
        if (distance <= 5000) return { passed: true, corrected: { lat, lng }, note: `高德匹配到「${poi.name}」，已自动通过` };
        farHit = { name: poi.name, distance };
      }
      if (pois.length) break; // 有结果但名称或距离不匹配，无需继续放宽
    } catch {
      failure = failure || "检索请求异常";
    }
  }
  if (farHit) return { passed: false, note: `高德有「${farHit.name}」但距标注位置约 ${farHit.distance} 米，已转人工审核` };
  if (nearest) return { passed: false, note: `高德最近「${nearest.name}」约 ${nearest.distance} 米，与「${spot.name}」未匹配，已转人工审核` };
  if (nearbyName) return { passed: false, note: `标注坐标附近是「${nearbyName}」，与「${spot.name}」不一致，已转人工审核` };
  return { passed: false, note: failure ? `高德未匹配到该地点（${failure}），已转人工审核` : "高德检索无结果，已转人工审核" };
}

// 点赞身份：登录用户按账号记（网页与 App 跨端一致），未登录时仍用客户端本地随机串
async function actorKeyOf(request, env) {
  const user = await authenticatedUser(request, env);
  if (user) return { key: `user:${user.id}`, fromUser: true };
  return { key: request.headers.get("X-Actor-Token"), fromUser: false };
}

async function likeSpot(request, env, id) {
  const { key: actorKey, fromUser } = await actorKeyOf(request, env);
  if (!actorKey || (!fromUser && (actorKey.length < 20 || actorKey.length > 100))) return json({ error: "缺少点赞身份" }, 400, env);
  const spot = await env.DB.prepare("SELECT id, likes FROM spots WHERE id = ? AND status = 'approved'").bind(id).first();
  if (!spot) return json({ error: "地点不存在" }, 404, env);
  try {
    await env.DB.prepare("INSERT INTO spot_likes (spot_id, actor_key) VALUES (?, ?)").bind(id, actorKey).run();
    await env.DB.prepare("UPDATE spots SET likes = likes + 1 WHERE id = ?").bind(id).run();
    return json({ id, likes: spot.likes + 1, liked: true }, 201, env);
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) return json({ id, likes: spot.likes, liked: false, message: "你已经点过赞了" }, 200, env);
    throw error;
  }
}

async function reportSpot(request, env, id) {
  const { key: reporterKey, fromUser } = await actorKeyOf(request, env);
  if (!reporterKey || (!fromUser && (reporterKey.length < 20 || reporterKey.length > 100))) return json({ error: "缺少举报身份" }, 400, env);
  const body = await request.json().catch(() => ({}));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 2 || reason.length > 200) return json({ error: "举报原因需为 2-200 个字符" }, 400, env);
  const spot = await env.DB.prepare("SELECT id FROM spots WHERE id = ? AND status = 'approved'").bind(id).first();
  if (!spot) return json({ error: "地点不存在" }, 404, env);
  try {
    const result = await env.DB.prepare("INSERT INTO spot_reports (spot_id, reporter_key, reason) VALUES (?, ?, ?)").bind(id, reporterKey, reason).run();
    return json({ id: result.meta.last_row_id, message: "举报已提交" }, 201, env);
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) return json({ message: "你已经举报过这个地点" }, 200, env);
    throw error;
  }
}

async function listReports(request, env) {
  if (!authorized(request, env)) return json({ error: "未授权" }, 401, env);
  const rows = await env.DB.prepare("SELECT spot_reports.id, spot_reports.spot_id, spots.name, spot_reports.reason, spot_reports.status, spot_reports.created_at FROM spot_reports JOIN spots ON spots.id = spot_reports.spot_id WHERE spot_reports.status = 'pending' ORDER BY spot_reports.created_at ASC").all();
  return json({ data: rows.results }, 200, env);
}

async function updateReportStatus(request, env, id) {
  if (!authorized(request, env)) return json({ error: "未授权" }, 401, env);
  const body = await request.json().catch(() => ({}));
  if (!["resolved", "dismissed"].includes(body.status)) return json({ error: "无效的举报处理状态" }, 400, env);
  const result = await env.DB.prepare("UPDATE spot_reports SET status = ?, resolved_at = CURRENT_TIMESTAMP WHERE id = ?").bind(body.status, id).run();
  if (!result.meta.changes) return json({ error: "举报不存在" }, 404, env);
  return json({ id, status: body.status }, 200, env);
}

async function listPending(request, env) {
  if (!authorized(request, env)) return json({ error: "未授权" }, 401, env);
  const rows = await env.DB.prepare("SELECT * FROM spots WHERE status = 'pending' ORDER BY created_at ASC").all();
  return json({ data: rows.results }, 200, env);
}

async function updateStatus(request, env, id) {
  if (!authorized(request, env)) return json({ error: "未授权" }, 401, env);
  const body = await request.json();
  if (!STATUSES.has(body.status)) return json({ error: "无效的审核状态" }, 400, env);
  const result = await env.DB.prepare("UPDATE spots SET status = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(body.status, id).run();
  if (!result.meta.changes) return json({ error: "地点不存在" }, 404, env);
  return json({ id, status: body.status }, 200, env);
}

// 管理员列出任意状态的点位，用于下线 / 删除违规内容
async function listAdminSpots(request, url, env) {
  if (!authorized(request, env)) return json({ error: "未授权" }, 401, env);
  const status = url.searchParams.get("status");
  const query = url.searchParams.get("q");
  const conditions = [];
  const bindings = [];
  if (STATUSES.has(status)) { conditions.push("status = ?"); bindings.push(status); }
  if (query) { conditions.push("(name LIKE ? OR address LIKE ?)"); bindings.push(`%${query}%`, `%${query}%`); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await env.DB.prepare(`SELECT id, name, address, category, description, lat, lng, status, likes, created_at FROM spots ${where} ORDER BY created_at DESC LIMIT 100`).bind(...bindings).all();
  return json({ data: rows.results }, 200, env);
}

// 高德核验自检：不返回 Key 本身，只返回调用状态，用于定位自动核验为何不生效
async function amapCheck(request, env) {
  if (!authorized(request, env)) return json({ error: "未授权" }, 401, env);
  if (!env.AMAP_WEB_KEY) return json({ configured: false, message: "AMAP_WEB_KEY 未配置" }, 200, env);
  const key = env.AMAP_WEB_KEY;
  const report = { configured: true, regeo: null, search: null };
  try {
    const params = new URLSearchParams({ location: "113.056659,23.666902", extensions: "all", radius: "500", output: "json", key });
    const response = await fetchWithTimeout(`https://restapi.amap.com/v3/geocode/regeo?${params}`, 6000);
    const payload = await response.json().catch(() => ({}));
    report.regeo = { status: payload.status ?? null, info: payload.info || null, infocode: payload.infocode || null, pois: (payload.regeocode?.pois || []).slice(0, 3).map((poi) => poi.name) };
  } catch (error) { report.regeo = { error: String(error.message || error) }; }
  try {
    const params = new URLSearchParams({ keywords: "清远市人民医院", city: "清远", citylimit: "true", output: "json", offset: "5", key });
    const response = await fetchWithTimeout(`https://restapi.amap.com/v3/place/text?${params}`, 6000);
    const payload = await response.json().catch(() => ({}));
    report.search = { status: payload.status ?? null, info: payload.info || null, infocode: payload.infocode || null, count: payload.count || 0, pois: (payload.pois || []).slice(0, 3).map((poi) => `${poi.name}@${poi.location}`) };
  } catch (error) { report.search = { error: String(error.message || error) }; }
  return json(report, 200, env);
}

// 管理员删除点位，同时清理点赞、举报与私人地图收藏，避免留下脏数据
async function adminDeleteSpot(request, env, id) {
  if (!authorized(request, env)) return json({ error: "未授权" }, 401, env);
  const spot = await env.DB.prepare("SELECT id, name FROM spots WHERE id = ?").bind(id).first();
  if (!spot) return json({ error: "地点不存在" }, 404, env);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM spot_likes WHERE spot_id = ?").bind(id),
    env.DB.prepare("DELETE FROM spot_reports WHERE spot_id = ?").bind(id),
    env.DB.prepare("DELETE FROM private_map_spots WHERE spot_id = ?").bind(id),
    env.DB.prepare("DELETE FROM spots WHERE id = ?").bind(id)
  ]);
  return json({ id, name: spot.name, deleted: true }, 200, env);
}

// 4.7 系列为混合思考模型，显式关闭思考，让它直接给出结论
function buildAIBody(model, systemPrompt, userPrompt) {
  const body = { model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }], temperature: 0.7, max_tokens: 800 };
  if (/^glm-4\.7/.test(model)) body.thinking = { type: "disabled" };
  return body;
}

// 依次尝试主模型与备用免费模型，任一成功即返回；全部失败时带上最后一个错误
async function callAIModel(env, systemPrompt, userPrompt) {
  const models = [env.AI_MODEL, "glm-4.5-flash", "glm-4-flash"].filter(Boolean);
  const uniqueModels = models.filter((model, index) => models.indexOf(model) === index);
  let lastError = { status: 502, detail: "" };
  for (const model of uniqueModels) {
    try {
      const response = await fetch(env.AI_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.AI_API_KEY}` },
        body: JSON.stringify(buildAIBody(model, systemPrompt, userPrompt)),
        signal: AbortSignal.timeout(25000)
      });
      if (response.ok) return { ok: true, model, payload: await response.json().catch(() => null) };
      lastError = { status: 502, detail: (await response.text().catch(() => "")).slice(0, 200) };
    } catch (error) {
      lastError = { status: 504, detail: error?.name === "TimeoutError" ? "AI 响应超时" : String(error?.message || error) };
    }
  }
  return { ok: false, ...lastError };
}

async function recommend(request, env) {
  if (!env.AI_API_URL || !env.AI_API_KEY) return json({ error: "AI 推荐尚未配置", debug: { url: Boolean(env.AI_API_URL), key: Boolean(env.AI_API_KEY), model: env.AI_MODEL || null } }, 503, env);
  let body = {};
  try { body = await request.json(); } catch { return json({ error: "请求格式错误" }, 400, env); }
  const prompt = String(body.prompt || "").trim();
  if (prompt.length < 2 || prompt.length > 200) return json({ error: "请输入 2-200 字的推荐需求" }, 400, env);

  // 以用户当前地图中心为参照，按距离取最近的候选点位，既省 token 也更贴合视野
  const centerLat = Number(body.center?.lat);
  const centerLng = Number(body.center?.lng);
  const center = { lat: Number.isFinite(centerLat) ? centerLat : 23.6818, lng: Number.isFinite(centerLng) ? centerLng : 113.056 };
  const rows = await env.DB.prepare("SELECT id, name, category, address, description, lat, lng FROM spots WHERE status = 'approved'").all();
  const candidates = (rows.results || [])
    .map((spot) => ({ id: spot.id, name: spot.name, category: spot.category, address: spot.address || "", description: spot.description, distance: Math.round(distanceInMeters(center.lat, center.lng, spot.lat, spot.lng)) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 20);

  const systemPrompt = "你是清远本地生活向导。只能使用给定的候选点位作答，禁止编造不存在的地点。用中文回答：先一句总体建议，再列出 3-5 个最合适的点位，每个用「名称：一句话理由 + 打卡贴士」，最后一句出行提醒。总字数控制在 300 字以内。";
  const userPrompt = `用户需求：${prompt}\n当前位置由近到远的候选点位（JSON）：\n${JSON.stringify(candidates)}`;
  const result = await callAIModel(env, systemPrompt, userPrompt);
  if (!result.ok) {
    const busy = /访问量过大|繁忙|rate|limit|429/.test(result.detail);
    const message = busy ? "AI 模型当前繁忙，请稍后再试" : (result.status === 504 ? "AI 响应超时，请稍后再试" : "AI 服务请求失败，请稍后再试");
    return json({ error: message, detail: result.detail }, result.status, env);
  }
  const model = result.model;
  const payload = result.payload;
  const message = payload?.choices?.[0]?.message || {};
  const recommendation = String(message.content || message.reasoning_content || payload?.choices?.[0]?.text || payload?.recommendation || payload?.message || "").trim();
  if (!recommendation) return json({ error: "AI 返回内容为空，请换个说法再试", detail: JSON.stringify(payload || {}).slice(0, 300) }, 502, env);
  const spotIds = candidates.filter((spot) => recommendation.includes(spot.name)).map((spot) => spot.id);
  return json({ recommendation, spotIds, model }, 200, env);
}

function validateSpot(body) {
  if (!body || typeof body.name !== "string" || body.name.trim().length < 2 || body.name.length > 40) return { ok: false, error: "地点名称长度应为 2-40 个字符" };
  if (!CATEGORIES.has(body.category)) return { ok: false, error: "地点分类无效" };
  if (typeof body.description !== "string" || body.description.trim().length < 2 || body.description.length > 120) return { ok: false, error: "地点介绍长度应为 2-120 个字符" };
  const lat = Number(body.lat); const lng = Number(body.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 23.4 || lat > 24.8 || lng < 112.4 || lng > 113.8) return { ok: false, error: "坐标不在清远范围内" };
  if (typeof body.address !== "string" || body.address.trim().length < 2 || body.address.length > 120) return { ok: false, error: "请提供有效的地址" };
  return { ok: true, value: { name: body.name.trim(), address: body.address.trim(), category: body.category, description: body.description.trim(), lat, lng, image_url: typeof body.image_url === "string" ? body.image_url : "" } };
}

function normalizeName(value) { return String(value).replace(/[·\s（）()\-]/g, "").toLowerCase(); }
function distanceInMeters(lat1, lng1, lat2, lng2) { const radians = Math.PI / 180; const x = (lng2 - lng1) * radians * Math.cos(((lat1 + lat2) / 2) * radians); const y = (lat2 - lat1) * radians; return Math.sqrt(x * x + y * y) * 6371000; }

function authorized(request, env) { return Boolean(env.ADMIN_TOKEN && request.headers.get("Authorization") === `Bearer ${env.ADMIN_TOKEN}`); }
function bearerToken(request) { const value = request.headers.get("Authorization") || ""; return value.startsWith("Bearer ") ? value.slice(7) : ""; }
async function passwordHash(password, salt) { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]); const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 100000, hash: "SHA-256" }, key, 256); return base64(new Uint8Array(bits)); }
function base64(bytes) { let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary); }
function corsHeaders(env) { return { "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Owner-Token, X-Actor-Token", "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS", "Content-Type": "application/json; charset=utf-8" }; }
function json(data, status, env) { return new Response(JSON.stringify(data), { status, headers: corsHeaders(env) }); }
function response(body, status, env) { return new Response(body, { status, headers: corsHeaders(env) }); }
