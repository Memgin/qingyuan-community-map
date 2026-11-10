// 本地完整后端模拟器（无需 Cloudflare 账号 / 无需 workerd）
// 作用：把 functions/_lib/api.js（线上 Pages Functions 同一套代码）跑在 Node 上：
//   - env.DB  → node:sqlite 内置数据库（模拟 D1，含 first/all/run/batch 语义）
//   - env.IMAGES → 文件系统存储（模拟 R2，put/get + httpMetadata）
// 启动后访问 http://127.0.0.1:8788/register.html 即可完整验证真实后端逻辑。
// 用法：node --experimental-sqlite tools/local_backend_server.mjs
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleRequest } from "../functions/_lib/api.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, ".local-data");
const DB_FILE = path.join(DATA_DIR, "d1.sqlite");
const IMAGES_DIR = path.join(DATA_DIR, "images");
const PORT = Number(process.env.PORT || 8788);

fs.mkdirSync(IMAGES_DIR, { recursive: true });

/* ---------------- D1 模拟（node:sqlite） ---------------- */
// 与 D1 对齐的语义：prepare().bind().first()/all()/run()、db.batch()、meta.changes/last_row_id
function coerceParam(v) {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  return v;
}

class D1Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.params = []; }
  bind(...params) { this.params = params.map(coerceParam); return this; }
  async first(...params) {
    const p = params.length ? params.map(coerceParam) : this.params;
    const row = this.db.prepare(this.sql).get(...p);
    return row === undefined ? null : row;
  }
  async all(...params) {
    const p = params.length ? params.map(coerceParam) : this.params;
    const results = this.db.prepare(this.sql).all(...p);
    return { results, success: true, meta: { duration: 0 } };
  }
  async run(...params) {
    const p = params.length ? params.map(coerceParam) : this.params;
    const info = this.db.prepare(this.sql).run(...p);
    return {
      success: true,
      meta: { changes: Number(info.changes || 0), last_row_id: Number(info.lastInsertRowid || 0), duration: 0 }
    };
  }
}

class D1Database {
  constructor(file) {
    this.db = new DatabaseSync(file);
    this.db.exec("PRAGMA foreign_keys = ON;");
  }
  prepare(sql) { return new D1Statement(this.db, sql); }
  async batch(statements) {
    const out = [];
    this.db.exec("BEGIN");
    try {
      // batch 内逐条执行（node:sqlite 无批量 API，串行等价）
      for (const stmt of statements) {
        const info = this.db.prepare(stmt.sql).run(...stmt.params.map(coerceParam));
        out.push({ success: true, meta: { changes: Number(info.changes || 0), last_row_id: Number(info.lastInsertRowid || 0) } });
      }
      this.db.exec("COMMIT");
      return out;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

const db = new D1Database(DB_FILE);

// 启动时自动初始化表结构：schema.sql + 全部迁移（幂等容错，失败的迁移跳过并打印原因）
function initSchema() {
  const files = ["worker/schema.sql", ...fs.readdirSync(path.join(ROOT, "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => `migrations/${f}`)];
  for (const rel of files) {
    const sql = fs.readFileSync(path.join(ROOT, rel), "utf8");
    try {
      db.db.exec(sql);
      console.log(`[db] OK    ${rel}`);
    } catch (error) {
      // 幂等迁移里的重复建表/加列报错可以安全跳过
      console.log(`[db] SKIP  ${rel} → ${String(error.message).slice(0, 120)}`);
    }
  }
}
initSchema();

/* ---------------- R2 模拟（文件系统） ---------------- */
class R2Bucket {
  constructor(dir) { this.dir = dir; }
  #path(key) {
    const safe = path.normalize(key).replace(/^(\.\.[/\\])+/, "");
    return path.join(this.dir, safe);
  }
  async put(key, value, options = {}) {
    const p = this.#path(key);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const buf = value instanceof ArrayBuffer ? Buffer.from(value) : Buffer.from(value);
    fs.writeFileSync(p, buf);
    if (options.httpMetadata) fs.writeFileSync(`${p}.meta.json`, JSON.stringify(options.httpMetadata));
    return { key };
  }
  async get(key) {
    const p = this.#path(key);
    if (!fs.existsSync(p)) return null;
    const buf = fs.readFileSync(p);
    let httpMetadata;
    try { httpMetadata = JSON.parse(fs.readFileSync(`${p}.meta.json`, "utf8")); } catch {}
    return { body: new Uint8Array(buf), httpMetadata, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
  }
}

/* ---------------- wrangler.toml [vars] 读取（让本地 env 与线上一致） ---------------- */
function readWranglerVars() {
  const vars = {};
  try {
    const toml = fs.readFileSync(path.join(ROOT, "wrangler.toml"), "utf8");
    const inVars = toml.split(/\r?\n/);
    let active = false;
    for (const line of inVars) {
      if (/^\s*\[/.test(line)) { active = line.trim() === "[vars]"; continue; }
      if (!active) continue;
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"([^"]*)"/);
      if (m) vars[m[1]] = m[2];
    }
  } catch {}
  return vars;
}

const env = {
  DB: db,
  IMAGES: new R2Bucket(IMAGES_DIR),
  ...readWranglerVars(),
  ADMIN_TOKEN: process.env.ADMIN_TOKEN || readWranglerVars().ADMIN_TOKEN || "local-admin"
};

/* ---------------- 静态文件服务 ---------------- */
const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml",
  ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8",
  ".map": "application/json", ".toml": "text/plain; charset=utf-8"
};
const BLOCKED = [".local-data", "node_modules", ".wrangler", ".workbuddy", ".git"];

function serveStatic(urlPath, res) {
  let clean = decodeURIComponent(urlPath.split("?")[0]);
  if (clean === "/" || clean === "") clean = "/index.html";
  const target = path.join(ROOT, clean);
  if (!target.startsWith(ROOT) || BLOCKED.some((b) => target.includes(b))) {
    res.writeHead(403); res.end("Forbidden"); return;
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); res.end("Not found"); return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(target).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(target).pipe(res);
}

/* ---------------- 服务器 ---------------- */
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (["host", "content-length", "connection"].includes(key)) continue;
        headers.set(key, Array.isArray(value) ? value.join(",") : value);
      }
      let body;
      if (!["GET", "HEAD"].includes(req.method)) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        body = Buffer.concat(chunks);
      }
      const request = new Request(url.href, {
        method: req.method,
        headers,
        ...(body && body.length ? { body } : {})
      });
      const response = await handleRequest(request, env);
      const outHeaders = {};
      response.headers.forEach((value, key) => { outHeaders[key] = value; });
      const outBody = response.body ? Buffer.from(await response.arrayBuffer()) : null;
      res.writeHead(response.status, outHeaders);
      res.end(outBody);
      console.log(`[api] ${req.method} ${url.pathname}${url.search} → ${response.status}`);
    } else {
      serveStatic(req.url, res);
    }
  } catch (error) {
    console.error(`[error] ${req.method} ${url.pathname}:`, error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "本地服务器内部错误：" + error.message }));
    } else {
      res.end();
    }
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`清远社区地图 本地完整环境已启动（真实后端逻辑 + 本地数据库）`);
  console.log(`  注册页   http://127.0.0.1:${PORT}/register.html`);
  console.log(`  地图首页 http://127.0.0.1:${PORT}/index.html`);
  console.log(`  数据库   ${DB_FILE}`);
  console.log(`  图片存储 ${IMAGES_DIR}`);
  console.log(`  管理令牌 ADMIN_TOKEN=${env.ADMIN_TOKEN}`);
});
