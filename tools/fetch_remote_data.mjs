// 线上数据快照工具（只读，不向线上写入任何内容）
// 作用：把 https://qymap.pages.dev 的公开数据（点位 / 点评 / 照片墙）拉取下来，
//       生成本地演示种子文件 remote-seed.js，供本地路演页面直接使用线上真实数据。
// 用法：node tools/fetch_remote_data.mjs
// 说明：浏览器跨域白名单只允许 qymap.pages.dev 自身，本地页面无法直连线上 API，
//       因此用 Node 侧抓取（无 CORS 限制），落盘后作为静态种子加载。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.QY_REMOTE_BASE || "https://qymap.pages.dev";
const OUT = path.join(ROOT, "remote-seed.js");
const PAGE_LIMIT = 100;
// 路演不展示的点位（按名称精确匹配）：抓取时直接剔除
const EXCLUDE_SPOT_NAMES = new Set(["探鲜"]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// 库里存的是 /api/images/ 相对路径，改写为线上绝对地址，本地页面可直接显示线上图片
function absUrl(url) {
  if (typeof url !== "string" || !url) return null;
  if (/^https?:\/\//.test(url)) return url;
  if (url.startsWith("/")) return BASE + url;
  return url;
}

async function main() {
  console.log(`[snapshot] 从 ${BASE} 只读拉取公开数据…`);
  const spots = [];
  let page = 1;
  for (;;) {
    const payload = await getJson(`${BASE}/api/spots?page=${page}&limit=${PAGE_LIMIT}`);
    const batch = Array.isArray(payload.data) ? payload.data : [];
    spots.push(...batch);
    const total = typeof payload.total === "number" ? payload.total : spots.length;
    console.log(`[snapshot] 点位第 ${page} 页：+${batch.length}（累计 ${spots.length}/${total}）`);
    if (spots.length >= total || batch.length === 0 || page > 20) break;
    page += 1;
    await sleep(150);
  }

  const reviews = [];
  const photosBySpot = {};
  const remoteUsers = new Map(); // 线上用户 id → { nickname, avatar_url }
  const picked = spots.filter((spot) => !EXCLUDE_SPOT_NAMES.has(String(spot.name || "").trim()));
  if (picked.length !== spots.length) console.log(`[snapshot] 按名单剔除 ${spots.length - picked.length} 个点位：${[...EXCLUDE_SPOT_NAMES].join("、")}`);
  for (const spot of picked) {
    try {
      const rev = await getJson(`${BASE}/api/spots/${spot.id}/reviews`);
      for (const item of Array.isArray(rev.data) ? rev.data : []) {
        reviews.push({ ...item, spot_id: spot.id });
        if (item.user && typeof item.user.id === "number") {
          remoteUsers.set(item.user.id, { nickname: item.user.nickname, avatar_url: item.user.avatar_url });
        }
      }
    } catch (e) { console.log(`[snapshot] 点位 ${spot.id} 点评拉取失败：${e.message}`); }
    try {
      const ph = await getJson(`${BASE}/api/spots/${spot.id}/photos`);
      const rows = Array.isArray(ph.data) ? ph.data : [];
      if (rows.length) {
        photosBySpot[spot.id] = rows.map((p) => ({
          id: p.id, url: absUrl(p.url), created_at: p.created_at, nickname: p.nickname || null
        }));
      }
    } catch (e) { console.log(`[snapshot] 点位 ${spot.id} 照片拉取失败：${e.message}`); }
    await sleep(80);
  }

  // 线上用户映射为本地演示用户（id +200 避免与演示账号 1-6 冲突；密码统一演示密码，仅本地使用）
  const USER_OFFSET = 200;
  const users = Array.from(remoteUsers.entries()).map(([id, info]) => ({
    id: id + USER_OFFSET,
    username: `qy_user_${id}`,
    nickname: info.nickname || null,
    avatar_url: absUrl(info.avatar_url),
    password: "remote-imported",
    phone: null,
    created_at: "2026-01-01 00:00:00"
  }));
  const mapUserId = (id) => (typeof id === "number" && remoteUsers.has(id) ? id + USER_OFFSET : null);

  const mappedSpots = picked.map((spot, index) => ({
    id: spot.id,
    name: spot.name,
    address: spot.address,
    category: spot.category,
    tags: Array.isArray(spot.tags) ? spot.tags : (() => { try { return JSON.parse(spot.tags || "[]"); } catch { return []; } })(),
    description: spot.description,
    lat: spot.lat,
    lng: spot.lng,
    image_url: absUrl(spot.image_url),
    likes: Number(spot.likes) || 0,
    user_id: (index % 6) + 1, // 作者归入演示账号，保证「我的提交」等交互不报错
    created_at: spot.created_at
  }));

  const mappedReviews = reviews.map((r) => ({
    id: r.id,
    spot_id: r.spot_id,
    user_id: r.anonymous ? null : (mapUserId(r.user && r.user.id) ?? 1),
    rating: r.rating,
    content: r.content,
    anonymous: Boolean(r.anonymous),
    created_at: r.created_at
  }));

  const seed = {
    fetched_at: new Date().toISOString().slice(0, 19).replace("T", " "),
    base: BASE,
    users,
    spots: mappedSpots,
    reviews: mappedReviews,
    photos: photosBySpot
  };

  const body = `/* 线上数据快照（由 tools/fetch_remote_data.mjs 只读生成，本地路演演示数据）
 * 快照时间：${seed.fetched_at}　来源：${BASE}
 * 点位 ${mappedSpots.length} 个 · 点评 ${mappedReviews.length} 条 · 照片 ${Object.values(photosBySpot).reduce((a, b) => a + b.length, 0)} 张 · 导入用户 ${users.length} 位
 * 注意：本地演示对线上只读，所有提交/点评/点赞仅写入本地演示存储，不影响线上。 */
window.QY_REMOTE_SEED = ${JSON.stringify(seed, null, 2)};
`;
  fs.writeFileSync(OUT, body, "utf8");
  console.log(`[snapshot] 完成 → ${OUT}`);
  console.log(`[snapshot] 点位 ${mappedSpots.length} · 点评 ${mappedReviews.length} · 照片 ${Object.values(photosBySpot).reduce((a, b) => a + b.length, 0)} · 用户 ${users.length}`);
}

main().catch((e) => {
  console.error("[snapshot] 失败：", e.message);
  process.exit(1);
});
