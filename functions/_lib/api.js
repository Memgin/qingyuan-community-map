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
    if (error instanceof ApiError) return json({ error: error.message }, error.status, env);
    console.error(error);
    return json({ error: "服务暂时不可用" }, 500, env);
  }
}

// 业务异常：携带状态码，可穿透全局兜底直达客户端（如临时密码未修改时的 403 拦截）
class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// 管理员重置后的固定临时密码；用户登录时会被强制要求设置新密码
const TEMP_PASSWORD = "12345";

async function dispatch(request, env) {
  const url = new URL(request.url);
    if (url.pathname === "/api/spots" && request.method === "GET") return listSpots(request, url, env);
    if (url.pathname === "/api/spots" && request.method === "POST") return createSpot(request, env);
    if (url.pathname === "/api/auth/register" && request.method === "POST") return register(request, env);
    if (url.pathname === "/api/auth/login" && request.method === "POST") return login(request, env);
    if (url.pathname === "/api/auth/me" && request.method === "GET") return currentUser(request, env);
    if (url.pathname === "/api/auth/logout" && request.method === "POST") return logout(request, env);
    if (url.pathname === "/api/auth/change-password" && request.method === "POST") return changePassword(request, env);
    if (url.pathname === "/api/auth/reset-request" && request.method === "POST") return createResetRequest(request, env);
    if (url.pathname === "/api/uploads" && request.method === "POST") return uploadImage(request, env);
    const imageMatch = url.pathname.match(/^\/api\/images\/(.+)$/);
    if (imageMatch && request.method === "GET") return getImage(imageMatch[1], env);
    if (url.pathname === "/api/maps" && request.method === "GET") return listMaps(request, env);
    if (url.pathname === "/api/maps" && request.method === "POST") return createMap(request, env);
    const mapMatch = url.pathname.match(/^\/api\/maps\/(\d+)\/spots$/);
    if (mapMatch && request.method === "POST") return addMapSpot(request, env, Number(mapMatch[1]));
    if (mapMatch && request.method === "GET") return listMapSpots(request, env, Number(mapMatch[1]));
    if (url.pathname === "/api/my-spots" && request.method === "GET") return listMySpots(request, env);
    // 高德能力代理：客户端不持有 Web 服务 Key，避免密钥泄露与配额被盗用
    if (url.pathname === "/api/places" && request.method === "GET") return searchPlaces(request, url, env);
    if (url.pathname === "/api/regeo" && request.method === "GET") return reverseGeocode(request, url, env);
    // 审核结果推送：客户端（鸿蒙 App）上报 Push Token，退出登录时移除
    if (url.pathname === "/api/push-token" && request.method === "POST") return savePushToken(request, env);
    if (url.pathname === "/api/push-token" && request.method === "DELETE") return removePushToken(request, env);
    const likeMatch = url.pathname.match(/^\/api\/spots\/(\d+)\/like$/);
    if (likeMatch && request.method === "POST") return likeSpot(request, env, Number(likeMatch[1]));
    const reportMatch = url.pathname.match(/^\/api\/spots\/(\d+)\/report$/);
    if (reportMatch && request.method === "POST") return reportSpot(request, env, Number(reportMatch[1]));
    const deleteMatch = url.pathname.match(/^\/api\/spots\/(\d+)$/);
    if (deleteMatch && request.method === "DELETE") return deleteOwnSpot(request, env, Number(deleteMatch[1]));
    // 编辑自己提交的地点：按约定只允许改分类与配图，地点事实不可改，故不影响审核状态
    if (deleteMatch && request.method === "PUT") return updateOwnSpot(request, env, Number(deleteMatch[1]));
    // 照片墙：社区成员可为任意点位补充照片（追加式，不覆盖他人图片）
    const photoMatch = url.pathname.match(/^\/api\/spots\/(\d+)\/photos$/);
    if (photoMatch && request.method === "GET") return listSpotPhotos(request, env, Number(photoMatch[1]));
    if (photoMatch && request.method === "POST") return addSpotPhoto(request, env, Number(photoMatch[1]));
    const photoDeleteMatch = url.pathname.match(/^\/api\/photos\/(\d+)$/);
    if (photoDeleteMatch && request.method === "DELETE") return deleteSpotPhoto(request, env, Number(photoDeleteMatch[1]));
    if (url.pathname === "/api/admin/spots" && request.method === "GET") return listPending(request, env);
    if (url.pathname === "/api/admin/reports" && request.method === "GET") return listReports(request, env);
    const reportStatusMatch = url.pathname.match(/^\/api\/admin\/reports\/(\d+)\/status$/);
    if (reportStatusMatch && request.method === "PATCH") return updateReportStatus(request, env, Number(reportStatusMatch[1]));
    const statusMatch = url.pathname.match(/^\/api\/admin\/spots\/(\d+)\/status$/);
    if (statusMatch && request.method === "PATCH") return updateStatus(request, env, Number(statusMatch[1]));
    const adminDeleteMatch = url.pathname.match(/^\/api\/admin\/spots\/(\d+)$/);
    if (adminDeleteMatch && request.method === "DELETE") return adminDeleteSpot(request, env, Number(adminDeleteMatch[1]));
    if (url.pathname === "/api/admin/spots/all" && request.method === "GET") return listAdminSpots(request, url, env);
    if (url.pathname === "/api/admin/users/reset-password" && request.method === "POST") return adminResetPassword(request, env);
    if (url.pathname === "/api/admin/reset-requests" && request.method === "GET") return listResetRequests(request, env);
    const resetReqMatch = url.pathname.match(/^\/api\/admin\/reset-requests\/(\d+)\/handle$/);
    if (resetReqMatch && request.method === "POST") return handleResetRequest(request, env, Number(resetReqMatch[1]));
    // 删除（驳回）申请：软删除，状态改为 dismissed，保留审计痕迹
    const dismissMatch = url.pathname.match(/^\/api\/admin\/reset-requests\/(\d+)$/);
    if (dismissMatch && request.method === "DELETE") return dismissResetRequest(request, env, Number(dismissMatch[1]));
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
  // 坐标去重阈值 0.00005 度（约 5.5 米）：骑楼/美食城里相邻店铺只隔几米，
  // 更大的阈值会误判；同名重复仍由名称精确匹配拦截兜底
  const duplicate = await env.DB.prepare("SELECT id FROM spots WHERE category = ? AND status != 'rejected' AND (lower(name) = lower(?) OR (abs(lat - ?) < 0.00005 AND abs(lng - ?) < 0.00005)) LIMIT 1")
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
  if (!body.username || !/^[\w\u4e00-\u9fff-]{2,24}$/.test(body.username)) return json({ error: "用户名需为 2-24 个字符（支持中文、字母、数字、下划线）" }, 400, env);
  if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 128 || !/[A-Za-z]/.test(body.password) || !/\d/.test(body.password)) return json({ error: "密码至少 8 位，需同时包含字母和数字" }, 400, env);
  // Turnstile 人机验证：配置了 secret 且请求带 token 时才校验（网页端携带；未带 token 的见下方降级限额）
  if (env.TURNSTILE_SECRET && body.cfToken) {
    try {
      const verifyResponse = await fetchWithTimeout("https://challenges.cloudflare.com/turnstile/v0/siteverify", 8000, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: String(body.cfToken) }).toString()
      });
      const verify = await verifyResponse.json().catch(() => ({ success: false }));
      if (!verify.success) return json({ error: "人机验证未通过，请刷新页面重试" }, 400, env);
    } catch {
      return json({ error: "人机验证服务异常，请稍后重试" }, 502, env);
    }
  }
  // 注册 IP 频控：同 IP 24 小时最多 3 个账号；未通过人机验证的（App 原生注册/脚本直连）每天仅 1 个
  const regIp = request.headers.get("CF-Connecting-IP") || "unknown";
  const regCutoff = new Date(Date.now() - 86400000).toISOString().slice(0, 19).replace("T", " ");
  const regStat = await env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN has_token = 0 THEN 1 ELSE 0 END) AS no_token FROM registrations WHERE ip = ? AND created_at > ?").bind(regIp, regCutoff).first().catch(() => null);
  if (regStat) {
    if (Number(regStat.total || 0) >= 3) return json({ error: "该网络今日注册次数已达上限，请明天再试" }, 429, env);
    if (!body.cfToken && Number(regStat.no_token || 0) >= 1) return json({ error: "该网络今日免验证注册名额已用完，请明天再试" }, 429, env);
  }
  const exists = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(body.username.trim()).first();
  if (exists) return json({ error: "用户名已存在" }, 409, env);
  const salt = crypto.randomUUID();
  const hash = await passwordHash(body.password, salt);
  const result = await env.DB.prepare("INSERT INTO users (username, password_salt, password_hash) VALUES (?, ?, ?)").bind(body.username.trim(), salt, hash).run();
  await env.DB.prepare("INSERT INTO registrations (ip, has_token) VALUES (?, ?)").bind(regIp, body.cfToken ? 1 : 0).run().catch(() => null);
  return createSession(env, result.meta.last_row_id, body.username.trim());
}

async function login(request, env) {
  const body = await request.json();
  const username = String(body.username || "").trim();
  // 登录限流：同一用户名 15 分钟内连续失败 5 次临时锁定，防暴力破解
  const attempt = await env.DB.prepare("SELECT failed_count, locked_until FROM login_attempts WHERE username = ?").bind(username).first().catch(() => null);
  if (attempt && attempt.locked_until && String(attempt.locked_until) > new Date().toISOString().slice(0, 19).replace("T", " ")) {
    return json({ error: "失败次数过多，该账号已临时锁定，请 15 分钟后再试" }, 429, env);
  }
  const user = await env.DB.prepare("SELECT id, username, password_salt, password_hash, must_change_password FROM users WHERE username = ?").bind(username).first();
  // 无论用户是否存在都执行一次哈希，让两种失败的响应时间一致（防时序探测用户名）
  const candidate = await passwordHash(body.password || "", user ? user.password_salt : "timing");
  const ok = user !== null && user.password_hash === candidate;
  if (!ok) {
    if (user) {
      // 只对真实存在的账号计数，避免攻击者灌表探测用户名
      const failed = Number(attempt?.failed_count || 0) + 1;
      const lockSql = failed >= 5 ? ", locked_until = datetime('now', '+15 minutes')" : "";
      await env.DB.prepare(`INSERT INTO login_attempts (username, failed_count, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(username) DO UPDATE SET failed_count = ?, updated_at = CURRENT_TIMESTAMP${lockSql}`).bind(username, failed, failed).run().catch(() => null);
    }
    return json({ error: "用户名或密码错误" }, 401, env);
  }
  // 成功登录：清空失败计数，并清理该账号已过期的会话
  await env.DB.prepare("DELETE FROM login_attempts WHERE username = ?").bind(username).run().catch(() => null);
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at < datetime('now')").bind(user.id).run().catch(() => null);
  return createSession(env, user.id, user.username, user.must_change_password === 1);
}

// 强制/主动修改密码：使用当前登录态即可（临时密码场景不要求旧密码，因为那是管理员发放的一次性凭证）
async function changePassword(request, env) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ error: "请先登录" }, 401, env);
  const body = await request.json().catch(() => ({}));
  const newPassword = String(body.newPassword || "");
  if (newPassword.length < 8 || newPassword.length > 128 || !/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) return json({ error: "新密码至少 8 位，需同时包含字母和数字" }, 400, env);
  const salt = crypto.randomUUID();
  const hash = await passwordHash(newPassword, salt);
  await env.DB.prepare("UPDATE users SET password_salt = ?, password_hash = ?, must_change_password = 0 WHERE id = ?").bind(salt, hash, user.id).run();
  return json({ changed: true }, 200, env);
}

// 忘记密码申请（未登录可提交）：防枚举设计——用户不存在也返回同样文案
async function createResetRequest(request, env) {
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  if (!username) return json({ error: "请填写用户名" }, 400, env);
  const user = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
  if (user) {
    const pending = await env.DB.prepare("SELECT id FROM password_reset_requests WHERE username = ? AND status = 'pending'").bind(username).first();
    if (!pending) await env.DB.prepare("INSERT INTO password_reset_requests (username, note) VALUES (?, ?)").bind(username, String(body.note || "").slice(0, 200)).run();
  }
  return json({ message: "申请已提交，等待管理员审核。审核通过后你的临时密码为 " + TEMP_PASSWORD + "，请用它登录并立即设置新密码" }, 200, env);
}

async function listResetRequests(request, env) {
  if (!authorized(request, env)) return json({ error: "未授权" }, 401, env);
  const rows = await env.DB.prepare("SELECT id, username, note, created_at FROM password_reset_requests WHERE status = 'pending' ORDER BY created_at ASC").all().catch(() => ({ results: [] }));
  return json({ data: rows.results || [] }, 200, env);
}

// 管理员同意申请：重置为固定临时密码并要求用户下次登录强制改密
async function handleResetRequest(request, env, id) {
  if (!authorized(request, env)) return json({ error: "未授权" }, 401, env);
  const req = await env.DB.prepare("SELECT id, username FROM password_reset_requests WHERE id = ?").bind(id).first();
  if (!req) return json({ error: "申请不存在" }, 404, env);
  const user = await env.DB.prepare("SELECT id, must_change_password FROM users WHERE username = ?").bind(req.username).first();
  if (!user) return json({ error: "该用户已不存在" }, 404, env);
  // 安全前提：临时密码 12345 是公开值，必须有可靠的设备送达渠道才能启用，
  // 否则任何人凭用户名提交申请即可接管账号。无绑定设备时拒绝自动重置，转人工核验。
  const tokenRows = await env.DB.prepare("SELECT token FROM push_tokens WHERE user_id = ?").bind(user.id).all().catch(() => ({ results: [] }));
  if (!(tokenRows.results || []).length) {
    return json({ error: "该账号没有已绑定的推送设备，无法安全送达临时密码。请线下核实申请人身份后，改用「手动重置密码」并通过其他渠道告知。" }, 409, env);
  }
  const salt = crypto.randomUUID();
  const hash = await passwordHash(TEMP_PASSWORD, salt);
  await env.DB.prepare("UPDATE users SET password_salt = ?, password_hash = ?, must_change_password = 1 WHERE id = ?").bind(salt, hash, user.id).run();
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();
  await env.DB.prepare("DELETE FROM login_attempts WHERE username = ?").bind(req.username).run().catch(() => null);
  await env.DB.prepare("UPDATE password_reset_requests SET status = 'handled' WHERE id = ?").bind(id).run();
  // 推送临时密码到用户设备（Push Kit）：用户无需再等管理员人工告知
  const delivered = await pushToUser(env, user.id, "密码重置已通过",
    `你的临时密码是 ${TEMP_PASSWORD}，请用它登录，登录后请立即设置新密码`);
  return json({ username: req.username, tempPassword: TEMP_PASSWORD, delivered }, 200, env);
}

// 驳回/删除申请：软删除（状态改 dismissed），待审批列表不再显示，但数据库保留痕迹
async function dismissResetRequest(request, env, id) {
  if (!authorized(request, env)) return json({ error: "未授权" }, 401, env);
  const result = await env.DB.prepare("UPDATE password_reset_requests SET status = 'dismissed' WHERE id = ? AND status = 'pending'").bind(id).run();
  if (!result.meta.changes) return json({ error: "记录不存在或已处理" }, 404, env);
  return json({ id, dismissed: true }, 200, env);
}

async function currentUser(request, env) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ user: null }, 200, env);
  const payload = { user: { id: user.id, username: user.username } };
  if (user.must_change_password) payload.mustChangePassword = true;
  return json(payload, 200, env);
}

async function logout(request, env) {
  const token = bearerToken(request);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  return json({ loggedOut: true }, 200, env);
}

async function createSession(env, userId, username, mustChangePassword) {
  const token = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+30 days'))").bind(token, userId).run();
  const payload = { token, user: { id: userId, username } };
  if (mustChangePassword) payload.mustChangePassword = true;
  return json(payload, 201, env);
}

async function authenticatedUser(request, env) {
  const token = bearerToken(request);
  if (!token) return null;
  const user = await env.DB.prepare("SELECT users.id, users.username, users.must_change_password FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token = ? AND sessions.expires_at > CURRENT_TIMESTAMP").bind(token).first();
  if (!user) return null;
  // 临时密码未修改：仅放行浏览（GET）与改密/登出/身份查询，其余操作一律要求先改密
  if (user.must_change_password) {
    const path = new URL(request.url).pathname;
    const allowed = request.method === "GET" || path === "/api/auth/change-password" || path === "/api/auth/logout" || path === "/api/auth/me";
    if (!allowed) throw new ApiError("当前使用的是临时密码，请先设置新密码后再进行此操作", 403);
  }
  return user;
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

// 编辑自己提交的地点：只允许改分类与配图（名称/地址/坐标锁定，编辑不影响审核状态）；
// updated_at 会刷新，增量同步（?since=）会把修改自动推给网页与 App
async function updateOwnSpot(request, env, id) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ error: "请先登录" }, 401, env);
  const spot = await env.DB.prepare("SELECT id, user_id FROM spots WHERE id = ?").bind(id).first();
  if (!spot) return json({ error: "地点不存在" }, 404, env);
  if (spot.user_id !== user.id) return json({ error: "只能编辑自己提交的地点" }, 403, env);
  const body = await request.json().catch(() => ({}));
  const updates = {};
  if (body.category !== undefined) {
    if (!CATEGORIES.has(body.category)) return json({ error: "无效的地点分类" }, 400, env);
    updates.category = body.category;
  }
  if (body.image_url !== undefined) {
    const url = String(body.image_url || "").trim();
    if (url.length > 0 && !url.startsWith("/api/images/")) return json({ error: "图片地址无效" }, 400, env);
    updates.image_url = url;
  }
  const keys = Object.keys(updates);
  if (!keys.length) return json({ error: "没有需要更新的内容" }, 400, env);
  await env.DB.prepare(`UPDATE spots SET ${keys.map((key) => `${key} = ?`).join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(...keys.map((key) => updates[key]), id).run();
  return json({ id, updated: keys }, 200, env);
}

/* --------------------------- 照片墙（社区补充照片） --------------------------- */

async function listSpotPhotos(request, env, spotId) {
  const rows = await env.DB.prepare("SELECT spot_photos.id, spot_photos.url, spot_photos.user_id, spot_photos.created_at, users.username FROM spot_photos LEFT JOIN users ON users.id = spot_photos.user_id WHERE spot_photos.spot_id = ? ORDER BY spot_photos.created_at DESC").bind(spotId).all().catch(() => ({ results: [] }));
  return json({ data: rows.results || [] }, 200, env);
}

async function addSpotPhoto(request, env, spotId) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ error: "请先登录后再补充照片" }, 401, env);
  const spot = await env.DB.prepare("SELECT id FROM spots WHERE id = ?").bind(spotId).first();
  if (!spot) return json({ error: "地点不存在" }, 404, env);
  const body = await request.json().catch(() => ({}));
  const url = String(body.url || "").trim();
  if (!url.startsWith("/api/images/")) return json({ error: "请先上传图片" }, 400, env);
  // 限额：单人对单地点最多 9 张，防止刷量
  const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM spot_photos WHERE spot_id = ? AND user_id = ?").bind(spotId, user.id).first();
  if (Number(count.total) >= 9) return json({ error: "每个地点最多补充 9 张照片" }, 400, env);
  const result = await env.DB.prepare("INSERT INTO spot_photos (spot_id, user_id, url) VALUES (?, ?, ?)").bind(spotId, user.id, url).run();
  return json({ id: result.meta.last_row_id, url }, 201, env);
}

async function deleteSpotPhoto(request, env, id) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ error: "请先登录" }, 401, env);
  const photo = await env.DB.prepare("SELECT id, user_id FROM spot_photos WHERE id = ?").bind(id).first();
  if (!photo) return json({ error: "照片不存在" }, 404, env);
  if (photo.user_id !== user.id) return json({ error: "只能删除自己上传的照片" }, 403, env);
  await env.DB.prepare("DELETE FROM spot_photos WHERE id = ?").bind(id).run();
  return json({ id, deleted: true }, 200, env);
}

async function fetchWithTimeout(url, timeoutMs, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...(options || {}), signal: controller.signal }); } finally { clearTimeout(timer); }
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
  const spot = await env.DB.prepare("SELECT user_id, name FROM spots WHERE id = ?").bind(id).first();
  const result = await env.DB.prepare("UPDATE spots SET status = ?, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(body.status, id).run();
  if (!result.meta.changes) return json({ error: "地点不存在" }, 404, env);
  // 审核结果推送到提交者的设备；推送失败不影响审核流程本身
  if (spot && spot.user_id) {
    const approved = body.status === "approved";
    await pushToUser(env, spot.user_id,
      approved ? "点位已通过审核" : "点位未通过审核",
      approved ? `「${spot.name}」已上线，现在所有人都能在地图上看到它`
        : `「${spot.name}」未通过审核，可以调整后重新提交`);
  }
  return json({ id, status: body.status }, 200, env);
}

/* --------------------- 审核结果推送（华为 Push Kit） --------------------- */

async function savePushToken(request, env) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ error: "请先登录" }, 401, env);
  const body = await request.json().catch(() => ({}));
  const token = String(body.token || "").trim();
  const platform = String(body.platform || "harmony").trim();
  if (token.length < 20 || token.length > 512) return json({ error: "无效的推送令牌" }, 400, env);
  try {
    await env.DB.prepare("INSERT INTO push_tokens (user_id, platform, token, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP) " +
      "ON CONFLICT(user_id, platform, token) DO UPDATE SET updated_at = CURRENT_TIMESTAMP").bind(user.id, platform, token).run();
    return json({ saved: true, platform }, 200, env);
  } catch {
    return json({ error: "推送服务未启用（数据库未迁移）" }, 503, env);
  }
}

async function removePushToken(request, env) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ error: "请先登录" }, 401, env);
  const body = await request.json().catch(() => ({}));
  const token = String(body.token || "").trim();
  try {
    if (token.length > 0) {
      await env.DB.prepare("DELETE FROM push_tokens WHERE user_id = ? AND token = ?").bind(user.id, token).run();
    } else {
      await env.DB.prepare("DELETE FROM push_tokens WHERE user_id = ?").bind(user.id).run();
    }
    return json({ removed: true }, 200, env);
  } catch {
    return json({ removed: true }, 200, env);
  }
}

/** 华为推送 access token，按实例缓存到过期前 1 分钟 */
let pushTokenCache = { token: "", expiresAt: 0 };

async function huaweiAccessToken(env) {
  if (!env.PUSH_CLIENT_ID || !env.PUSH_CLIENT_SECRET) return "";
  if (pushTokenCache.token && pushTokenCache.expiresAt > Date.now() + 60000) return pushTokenCache.token;
  try {
    const response = await fetchWithTimeout("https://oauth-login.cloud.huawei.com/oauth2/v3/token", 8000, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: env.PUSH_CLIENT_ID, client_secret: env.PUSH_CLIENT_SECRET }).toString()
    });
    const payload = await response.json().catch(() => ({}));
    if (!payload.access_token) return "";
    pushTokenCache = { token: payload.access_token, expiresAt: Date.now() + Number(payload.expires_in || 3600) * 1000 };
    return pushTokenCache.token;
  } catch {
    return "";
  }
}

/** 给某账号的所有已注册设备发一条通知；返回是否确认送达（无设备/未配置/发送失败均为 false） */
async function pushToUser(env, userId, title, body) {
  if (!env.PUSH_APP_ID || !env.PUSH_CLIENT_ID || !env.PUSH_CLIENT_SECRET) return false;
  let tokens = [];
  try {
    const rows = await env.DB.prepare("SELECT token FROM push_tokens WHERE user_id = ?").bind(userId).all();
    tokens = (rows.results || []).map((row) => row.token).filter(Boolean);
  } catch {
    return false; // 迁移未执行时直接放弃，不影响审核
  }
  if (!tokens.length) return false;
  const accessToken = await huaweiAccessToken(env);
  if (!accessToken) return false;
  try {
    const pushResponse = await fetchWithTimeout(`https://push-api.cloud.huawei.com/v3/${env.PUSH_APP_ID}/messages:send`, 8000, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${accessToken}` },
      body: JSON.stringify({
        payload: { notification: { category: "IM", title, body, clickAction: { actionType: 0 } } },
        target: { token: tokens },
        pushOptions: { ttl: "86400s" }
      })
    });
    const pushPayload = await pushResponse.json().catch(() => ({}));
    // 华为推送成功码 80000000；失败（含 token 失效）视为未送达
    return pushResponse.ok && String(pushPayload.code || "") === "80000000";
  } catch {
    return false;
  }
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
// 高德 POI 检索代理：网页端与 App 提交页的「搜索并定位」都走这里，登录后方可调用以防刷量
async function searchPlaces(request, url, env) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ error: "请登录后使用地址检索" }, 401, env);
  const keywords = (url.searchParams.get("q") || "").trim();
  if (keywords.length < 2) return json({ error: "请输入至少 2 个字的关键词" }, 400, env);
  if (!env.AMAP_WEB_KEY) return json({ error: "地址检索未启用（未配置高德 Key）" }, 503, env);
  const city = url.searchParams.get("city") || "清远";
  const citylimit = url.searchParams.get("citylimit") === "false" ? "false" : "true";
  const params = new URLSearchParams({ keywords, city, citylimit, output: "json", offset: "20", page: "1", key: env.AMAP_WEB_KEY });
  try {
    const response = await fetchWithTimeout(`https://restapi.amap.com/v3/place/text?${params}`, 6000);
    const payload = await response.json().catch(() => ({}));
    if (payload.status !== "1") return json({ error: `地址检索失败（高德：${payload.info || "未知原因"}）` }, 502, env);
    const data = (payload.pois || []).map((poi) => {
      const parts = String(poi.location || "").split(",").map(Number);
      return { name: poi.name || "", address: poi.address || poi.adname || "", city: poi.cityname || poi.adname || "", lng: parts[0], lat: parts[1] };
    }).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
    return json({ data, total: Number(payload.count || data.length) }, 200, env);
  } catch {
    return json({ error: "地址检索服务异常，请稍后重试" }, 502, env);
  }
}

// 逆地理编码代理：把地图选点的坐标反查成可读地址
async function reverseGeocode(request, url, env) {
  const user = await authenticatedUser(request, env);
  if (!user) return json({ error: "请登录后使用" }, 401, env);
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: "缺少有效坐标" }, 400, env);
  if (!env.AMAP_WEB_KEY) return json({ error: "逆地理编码未启用（未配置高德 Key）" }, 503, env);
  try {
    const params = new URLSearchParams({ location: `${lng},${lat}`, extensions: "base", output: "json", key: env.AMAP_WEB_KEY });
    const response = await fetchWithTimeout(`https://restapi.amap.com/v3/geocode/regeo?${params}`, 6000);
    const payload = await response.json().catch(() => ({}));
    if (payload.status !== "1") return json({ error: `逆地理编码失败（高德：${payload.info || "未知原因"}）` }, 502, env);
    const component = payload.regeocode?.addressComponent || {};
    return json({ address: payload.regeocode?.formatted_address || "", city: component.city || component.province || "" }, 200, env);
  } catch {
    return json({ error: "逆地理编码服务异常，请稍后重试" }, 502, env);
  }
}

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

// 生成 12 位临时密码：字母 + 数字混合（去除易混淆字符 0/O/1/l/I）
// 管理员重置用户密码：统一重置为固定临时密码，用户下次登录会被强制要求设置新密码；重置后踢掉全部会话并清除登录锁定
async function adminResetPassword(request, env) {
  if (!authorized(request, env)) return json({ error: "未授权" }, 401, env);
  const body = await request.json().catch(() => ({}));
  const username = String(body.username || "").trim();
  if (!username) return json({ error: "请提供要重置的用户名" }, 400, env);
  const user = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
  if (!user) return json({ error: "用户不存在" }, 404, env);
  const salt = crypto.randomUUID();
  const hash = await passwordHash(TEMP_PASSWORD, salt);
  await env.DB.prepare("UPDATE users SET password_salt = ?, password_hash = ?, must_change_password = 1 WHERE id = ?").bind(salt, hash, user.id).run();
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();
  await env.DB.prepare("DELETE FROM login_attempts WHERE username = ?").bind(username).run().catch(() => null);
  // 手动重置同样推送给用户（若其设备上报过 Push Token）
  await pushToUser(env, user.id, "密码已被管理员重置",
    `你的临时密码是 ${TEMP_PASSWORD}，请用它登录，登录后请立即设置新密码`);
  return json({ username, tempPassword: TEMP_PASSWORD }, 200, env);
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
// PBKDF2-SHA256 + 随机盐。注意：Cloudflare Workers 平台限制迭代上限为 100000（本地 workerd 没有此限制，勿盲目调高）
async function passwordHash(password, salt) { const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]); const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 100000, hash: "SHA-256" }, key, 256); return base64(new Uint8Array(bits)); }
function base64(bytes) { let binary = ""; bytes.forEach((byte) => { binary += String.fromCharCode(byte); }); return btoa(binary); }
function corsHeaders(env) { return { "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "https://qymap.pages.dev", "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Owner-Token, X-Actor-Token", "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS", "Content-Type": "application/json; charset=utf-8" }; }
function json(data, status, env) { return new Response(JSON.stringify(data), { status, headers: corsHeaders(env) }); }
function response(body, status, env) { return new Response(body, { status, headers: corsHeaders(env) }); }
