import http from "node:http";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  statSync,
  copyFileSync,
  rmSync,
  statfsSync,
} from "node:fs";
import { resolve, join, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "node:process";
import { openStore, categories, areas } from "./store.mjs";
import { parseExport, hash, messageText } from "./importer.mjs";
import { resolveStaticPath } from "./static.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};
export function createApp({
  dir = process.env.DATA_DIR || join(root, "data"),
  setupToken = process.env.SETUP_TOKEN,
  secure = process.env.COOKIE_SECURE !== "false",
  origin = process.env.APP_ORIGIN,
} = {}) {
  dir = resolve(dir);
  const store = openStore(dir);
  const { db, get, create, update } = store;
  for (const p of ["objects", "staging", "snapshots"])
    mkdirSync(join(dir, p), { recursive: true, mode: 0o700 });
  // Backup/portable CLI processes also open the store. Never remove another
  // running process's fresh preview; only expire old staging files.
  for (const name of readdirSync(join(dir, "staging"))) {
    const path = join(dir, "staging", name);
    if (
      statSync(path).isFile() &&
      statSync(path).mtimeMs < Date.now() - 3600000
    )
      rmSync(path, { force: true });
  }
  const staged = new Map(),
    attempts = new Map();
  const tx = (fn) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const v = fn();
      db.exec("COMMIT");
      return v;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const json = (res, code, data) => {
    res.writeHead(code, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  async function body(req, max = 1024 * 1024) {
    const chunks = [];
    let length = 0;
    for await (const c of req) {
      length += c.length;
      if (length > max)
        throw Object.assign(new Error("Upload exceeds size limit"), {
          status: 413,
        });
      chunks.push(c);
    }
    return Buffer.concat(chunks);
  }
  const transactionData = async (req) => {
    let data;
    try {
      data = JSON.parse((await body(req)).toString() || "{}");
    } catch (error) {
      if (error.status) throw error;
      throw new Error("Request body must contain valid JSON");
    }
    if (!data || typeof data !== "object" || Array.isArray(data))
      throw new Error("Request body must be a JSON object");
    return data;
  };
  const originalPath = (digest) => join(dir, "objects", digest);
  function putObject(buf) {
    const digest = hash(buf);
    const p = originalPath(digest);
    if (!existsSync(p)) writeFileSync(p, buf, { mode: 0o600 });
    return digest;
  }
  function snapshot() {
    const id =
        new Date().toISOString().replaceAll(":", "-") +
        "-" +
        randomUUID().slice(0, 8),
      dest = join(dir, "snapshots", id);
    mkdirSync(dest, { recursive: true, mode: 0o700 });
    db.exec(
      `VACUUM INTO '${join(dest, "brain.sqlite").replaceAll("'", "''")}'`,
    );
    mkdirSync(join(dest, "objects"));
    for (const f of readdirSync(join(dir, "objects")))
      copyFileSync(originalPath(f), join(dest, "objects", f));
    const files = [
      "brain.sqlite",
      ...readdirSync(join(dest, "objects")).map((f) => "objects/" + f),
    ];
    const manifest = {
      format: 1,
      schema: 1,
      created: new Date().toISOString(),
      files: Object.fromEntries(
        files.map((f) => [f, hash(readFileSync(join(dest, f)))]),
      ),
    };
    writeFileSync(
      join(dest, "manifest.json"),
      JSON.stringify(manifest, null, 2),
    );
    const previous = existsSync(join(dir, "backup-status.json"))
      ? JSON.parse(readFileSync(join(dir, "backup-status.json"), "utf8"))
      : {};
    writeFileSync(
      join(dir, "backup-status.json"),
      JSON.stringify({
        ...previous,
        lastSnapshot: manifest.created,
        id,
        kind: "same-device snapshot",
        offsite: previous.offsite || "Not configured",
      }),
    );
    return { id, created: manifest.created };
  }
  async function handler(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    let url;
    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      return json(res, 400, { error: "Invalid request URL" });
    }
    const path = url.pathname;
    const method = req.method;
    try {
      if (path === "/api/health")
        return ["GET", "HEAD"].includes(method)
          ? json(res, 200, { ok: true })
          : json(res, 405, { error: "Method not allowed" });
      if (path.startsWith("/api/")) {
        if (!["GET", "HEAD"].includes(method)) {
          const expected =
            origin || `${secure ? "https" : "http"}://${req.headers.host}`;
          if (
            req.headers.origin !== expected ||
            req.headers["x-brain-request"] !== "1"
          )
            return json(res, 403, { error: "Request origin rejected" });
        }
        const hasOwner = !!db.prepare("SELECT id FROM owner").get();
        const cookie = req.headers.cookie
          ?.split(";")
          .map((x) => x.trim())
          .find((x) => x.startsWith("brain="))
          ?.slice(6);
        const authenticated =
          !!cookie &&
          !!db
            .prepare("SELECT token FROM sessions WHERE token=? AND expires>?")
            .get(hash(cookie), Date.now());
        if (path === "/api/session" && method === "GET")
          return json(res, 200, { authenticated, setup: !hasOwner });
        if (
          (path === "/api/setup" || path === "/api/login") &&
          method === "POST"
        ) {
          const key = req.socket.remoteAddress;
          const attempt = attempts.get(key) || { count: 0, start: Date.now() };
          if (Date.now() - attempt.start > 900000) {
            attempt.count = 0;
            attempt.start = Date.now();
          }
          attempts.set(key, attempt);
          if (++attempt.count > 15)
            return json(res, 429, {
              error: "Too many attempts. Try again in 15 minutes.",
            });
          const b = await transactionData(req);
          if (
            typeof b.password !== "string" ||
            b.password.length < 12 ||
            b.password.length > 256
          )
            throw new Error("Use a password between 12 and 256 characters.");
          if (path === "/api/setup") {
            if (db.prepare("SELECT id FROM owner").get())
              return json(res, 409, { error: "Owner already configured" });
            const configuredToken =
              typeof setupToken === "string" ? setupToken.trim() : "";
            if (!configuredToken)
              return json(res, 503, {
                error:
                  "The running server has no SETUP_TOKEN configured. Save SETUP_TOKEN in .env beside package.json, then stop and restart the server. Editing .env.example does not configure the server.",
              });
            if (
              typeof b.token !== "string" ||
              hash(b.token.trim()) !== hash(configuredToken)
            )
              return json(res, 403, {
                error:
                  "Setup token does not match the running server. Enter only the value after SETUP_TOKEN=, then restart the server if you changed .env. An existing SETUP_TOKEN environment variable overrides .env.",
              });
            const salt = randomBytes(32).toString("hex");
            db.prepare("INSERT INTO owner VALUES(1,?,?)").run(
              scryptSync(b.password, salt, 64).toString("hex"),
              salt,
            );
          } else {
            const owner = db.prepare("SELECT * FROM owner").get();
            if (
              !owner ||
              !timingSafeEqual(
                scryptSync(b.password, owner.salt, 64),
                Buffer.from(owner.hash, "hex"),
              )
            )
              return json(res, 401, { error: "Incorrect password" });
          }
          attempt.count = 0;
          const token = randomBytes(32).toString("hex");
          db.prepare("DELETE FROM sessions WHERE expires<?").run(Date.now());
          db.prepare("INSERT INTO sessions VALUES(?,?)").run(
            hash(token),
            Date.now() + 7 * 86400000,
          );
          res.setHeader(
            "Set-Cookie",
            `brain=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${secure ? "; Secure" : ""}`,
          );
          return json(res, 200, { ok: true });
        }
        if (!authenticated)
          return json(res, 401, {
            error: "Please sign in. Pending captures stay on this device.",
          });
        if (path === "/api/logout" && method === "POST") {
          db.prepare("DELETE FROM sessions WHERE token=?").run(hash(cookie));
          res.setHeader(
            "Set-Cookie",
            "brain=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
          );
          return json(res, 200, { ok: true });
        }
        const routeMethods = [
          [
            /^\/api\/(config|stats|graph|rediscover|protection|export|imports)$/,
            ["GET"],
          ],
          [/^\/api\/entries$/, ["GET", "POST"]],
          [/^\/api\/entries\/[^/]+$/, ["GET", "PATCH"]],
          [/^\/api\/entries\/[^/]+\/(history|source|references)$/, ["GET"]],
          [/^\/api\/entries\/[^/]+\/attachments$/, ["GET", "POST"]],
          [/^\/api\/(attachments|imports)\/[^/]+$/, ["GET", "HEAD"]],
          [/^\/api\/(connections|layout)$/, ["GET", "POST"]],
          [/^\/api\/connections\/[^/]+$/, ["DELETE"]],
          [
            /^\/api\/(import\/(preview|commit)|extract|snapshot|logout)$/,
            ["POST"],
          ],
        ];
        const allowed = routeMethods.find(([pattern]) =>
          pattern.test(path),
        )?.[1];
        if (allowed && !allowed.includes(method))
          return json(res, 405, { error: "Method not allowed" });
        if (path === "/api/config")
          return json(res, 200, { categories, areas });
        if (path === "/api/entries" && method === "GET") {
          const filters = ["deleted=?"];
          const args = [url.searchParams.get("trash") === "1" ? 1 : 0];
          const cat = url.searchParams.get("category"),
            area = url.searchParams.get("area"),
            q = url.searchParams.get("q");
          if (
            cat &&
            !(cat === "Archive" && url.searchParams.get("trash") === "1")
          ) {
            filters.push("category=?");
            args.push(cat);
          }
          if (area) {
            filters.push("area=?");
            args.push(area);
          }
          if (
            url.searchParams.get("journal") !== "1" &&
            area !== "Journal" &&
            cat !== "Archive" &&
            url.searchParams.get("trash") !== "1"
          )
            filters.push("type!='journal'");
          if (url.searchParams.get("active") === "1")
            filters.push("category!='Archive'");
          let order =
            area === "Journal"
              ? "date DESC,created DESC,id"
              : "updated DESC,id";
          const orderArgs = [];
          if (q?.trim()) {
            const tokens = q.match(/[\p{L}\p{N}_]+/gu) || [];
            if (!tokens.length)
              return json(res, 200, { entries: [], total: 0 });
            const term = tokens
              .map((token) => '"' + token + '"*')
              .join(" AND ");
            filters.push(
              "(id IN (SELECT id FROM entry_fts WHERE entry_fts MATCH ?) OR id IN (SELECT entryId FROM source_fts WHERE source_fts MATCH ?))",
            );
            args.push(term, term);
            order =
              "CASE WHEN title=? COLLATE NOCASE THEN 0 ELSE 1 END," + order;
            orderArgs.push(q.trim());
          }
          function numberParam(
            name,
            fallback,
            min,
            max = Number.MAX_SAFE_INTEGER,
          ) {
            const raw = url.searchParams.get(name);
            if (raw === null) return fallback;
            const n = Number(raw);
            if (!Number.isSafeInteger(n) || n < min)
              throw new Error("Invalid " + name);
            return Math.min(n, max);
          }
          const offset = numberParam("offset", 0, 0),
            limit = numberParam("limit", 60, 1, 100);
          const total = db
            .prepare(
              `SELECT count(*) n FROM entries WHERE ${filters.join(" AND ")}`,
            )
            .get(...args).n;
          return json(res, 200, {
            entries: db
              .prepare(
                `SELECT * FROM entries WHERE ${filters.join(" AND ")} ORDER BY ${order} LIMIT ? OFFSET ?`,
              )
              .all(...args, ...orderArgs, limit, offset),
            total,
          });
        }
        if (path === "/api/entries" && method === "POST") {
          const input = await transactionData(req);
          return json(
            res,
            201,
            tx(() => create(input)),
          );
        }
        if (path === "/api/rediscover") {
          const n = Number(url.searchParams.get("offset") || 0);
          if (!Number.isSafeInteger(n) || n < 0)
            throw new Error("Invalid offset");
          const where =
            "category='Ideas' AND type!='journal' AND deleted=0 AND hidden=0 AND (snooze='' OR snooze<=?)";
          const now = new Date().toISOString();
          const total = db
            .prepare("SELECT count(*) n FROM entries WHERE " + where)
            .get(now).n;
          const entry = total
            ? db
                .prepare(
                  "SELECT * FROM entries WHERE " +
                    where +
                    " ORDER BY updated,id LIMIT 1 OFFSET ?",
                )
                .get(now, n % total)
            : null;
          return json(res, 200, { entry, total });
        }
        if (path === "/api/stats") {
          const counts = Object.fromEntries(
            categories.map((c) => [
              c,
              db
                .prepare(
                  "SELECT count(*) n FROM entries WHERE category=? AND deleted=0",
                )
                .get(c).n,
            ]),
          );
          return json(res, 200, counts);
        }
        const em = path.match(
          /^\/api\/entries\/([^/]+)(?:\/(history|source|attachments|references))?$/,
        );
        if (em) {
          const e = get(em[1]);
          if (!e) return json(res, 404, { error: "Entry not found" });
          if (!em[2] && method === "GET") return json(res, 200, e);
          if (!em[2] && method === "PATCH") {
            const input = await transactionData(req);
            return json(
              res,
              200,
              tx(() => update(e.id, input)),
            );
          }
          if (em[2] === "history")
            return json(
              res,
              200,
              db
                .prepare(
                  "SELECT revision,snapshot,created FROM revisions WHERE entryId=? ORDER BY id DESC LIMIT 100",
                )
                .all(e.id),
            );
          if (em[2] === "references")
            return json(
              res,
              200,
              db
                .prepare(
                  "SELECT r.*,s.entryId sourceEntryId FROM source_refs r JOIN sources s ON r.sourceId=s.id WHERE r.entryId=?",
                )
                .all(e.id),
            );
          if (em[2] === "source") {
            const s = db
              .prepare("SELECT * FROM sources WHERE entryId=?")
              .get(e.id);
            return json(res, 200, s ? { ...s, raw: JSON.parse(s.raw) } : null);
          }
          if (em[2] === "attachments" && method === "GET")
            return json(
              res,
              200,
              db.prepare("SELECT * FROM attachments WHERE entryId=?").all(e.id),
            );
          if (em[2] === "attachments" && method === "POST") {
            const buf = await body(req, 20 * 1024 * 1024);
            const digest = putObject(buf);
            const id = randomUUID();
            let name = "attachment";
            try {
              name = decodeURIComponent(req.headers["x-file-name"] || name);
            } catch {}
            db.prepare("INSERT INTO attachments VALUES(?,?,?,?,?,?)").run(
              id,
              e.id,
              basename(name).slice(0, 200),
              String(req.headers["content-type"] || "application/octet-stream"),
              digest,
              buf.length,
            );
            return json(res, 201, { id });
          }
        }
        if (path.startsWith("/api/attachments/")) {
          const a = db
            .prepare("SELECT * FROM attachments WHERE id=?")
            .get(path.split("/").pop());
          if (!a) return json(res, 404, { error: "Not found" });
          res.writeHead(200, {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(a.name)}`,
            "Cache-Control": "no-store",
          });
          return res.end(readFileSync(originalPath(a.hash)));
        }
        if (path === "/api/graph" && method === "GET") {
          const id = url.searchParams.get("focus");
          const center = get(id);
          if (!center || center.deleted || center.type === "journal")
            return json(res, 200, { entries: [], links: [], remaining: 0 });
          const limit = Math.min(
            60,
            Math.max(1, Number(url.searchParams.get("limit")) || 6),
          );
          const all = db
            .prepare(
              `SELECT c.* FROM connections c JOIN entries a ON a.id=c.fromId JOIN entries b ON b.id=c.toId WHERE (c.fromId=? OR c.toId=?) AND a.deleted=0 AND b.deleted=0 AND a.type!='journal' AND b.type!='journal' ORDER BY c.id`,
            )
            .all(id, id);
          const neighbors = [
            ...new Set(all.map((l) => (l.fromId === id ? l.toId : l.fromId))),
          ];
          const chosen = neighbors.slice(0, limit);
          const ids = new Set([id, ...chosen]);
          return json(res, 200, {
            entries: [center, ...chosen.map(get)],
            links: all.filter((l) => ids.has(l.fromId) && ids.has(l.toId)),
            remaining: Math.max(0, neighbors.length - limit),
          });
        }
        if (path === "/api/connections" && method === "GET") {
          const focus = url.searchParams.get("entry");
          const extra = focus ? " AND (c.fromId=? OR c.toId=?)" : "";
          return json(
            res,
            200,
            db
              .prepare(
                "SELECT c.* FROM connections c JOIN entries a ON a.id=c.fromId JOIN entries b ON b.id=c.toId WHERE a.deleted=0 AND b.deleted=0 AND a.type!='journal' AND b.type!='journal'" +
                  extra +
                  " ORDER BY c.id LIMIT 10000",
              )
              .all(...(focus ? [focus, focus] : [])),
          );
        }
        if (path === "/api/connections" && method === "POST") {
          const b = await transactionData(req);
          if (
            !get(b.fromId) ||
            !get(b.toId) ||
            get(b.fromId).deleted ||
            get(b.toId).deleted ||
            b.fromId === b.toId
          )
            throw new Error("Choose two different existing entries");
          if (typeof b.label !== "string" || b.label.length > 60)
            throw new Error("Invalid relationship");
          db.prepare("INSERT OR IGNORE INTO connections VALUES(?,?,?,?)").run(
            randomUUID(),
            b.fromId,
            b.toId,
            b.label || "related",
          );
          return json(res, 201, { ok: true });
        }
        if (path.startsWith("/api/connections/") && method === "DELETE") {
          db.prepare("DELETE FROM connections WHERE id=?").run(
            path.split("/").pop(),
          );
          return json(res, 200, { ok: true });
        }
        if (path === "/api/layout" && method === "GET")
          return json(
            res,
            200,
            JSON.parse(
              db
                .prepare("SELECT value FROM layouts WHERE scope=?")
                .get(url.searchParams.get("scope") || "all")?.value || "{}",
            ),
          );
        if (path === "/api/layout" && method === "POST") {
          const b = await transactionData(req);
          if (
            typeof b.scope !== "string" ||
            !b.scope ||
            b.scope.length > 100 ||
            !b.value ||
            typeof b.value !== "object" ||
            Array.isArray(b.value) ||
            Object.keys(b.value).length > 10000
          )
            throw new Error("Invalid layout");
          for (const value of Object.values(b.value))
            if (
              !value ||
              typeof value !== "object" ||
              !Number.isFinite(value.x) ||
              !Number.isFinite(value.y) ||
              Math.abs(value.x) > 10000000 ||
              Math.abs(value.y) > 10000000
            )
              throw new Error("Invalid node position");
          db.prepare(
            "INSERT INTO layouts VALUES(?,?) ON CONFLICT(scope) DO UPDATE SET value=excluded.value",
          ).run(b.scope, JSON.stringify(b.value));
          return json(res, 200, { ok: true });
        }
        if (path === "/api/import/preview" && method === "POST") {
          const buf = await body(req, 100 * 1024 * 1024);
          const space = statfsSync(dir);
          if (space.bavail * space.bsize < buf.length * 4 + 100 * 1024 * 1024)
            throw new Error("Not enough free disk space for this import.");
          let name = "conversations.json";
          try {
            name = decodeURIComponent(req.headers["x-file-name"] || name);
          } catch {}
          const parsed = await parseExport(buf, name);
          const id = randomUUID();
          writeFileSync(join(dir, "staging", id), buf, { mode: 0o600 });
          staged.set(id, { parsed, expires: Date.now() + 3600000 });
          return json(res, 200, {
            id,
            count: parsed.items.length,
            messages: parsed.items.reduce((n, c) => n + c.messages.length, 0),
            titles: parsed.items.slice(0, 8).map((c) => c.title),
            warnings: parsed.warnings,
          });
        }
        if (path === "/api/import/commit" && method === "POST") {
          const b = await transactionData(req);
          const stage = staged.get(b.id);
          if (!stage || stage.expires < Date.now())
            throw new Error("Preview expired. Select the file again.");
          const ns = String(b.namespace || "personal").trim();
          if (!/^[\w -]{1,80}$/.test(ns))
            throw new Error(
              "Account label must use letters, numbers, spaces, or hyphens.",
            );
          const p = stage.parsed;
          const duplicate = db
            .prepare("SELECT result FROM imports WHERE digest=?")
            .get(hash(p.digest + ns));
          if (duplicate) {
            rmSync(join(dir, "staging", b.id), { force: true });
            staged.delete(b.id);
            return json(res, 200, {
              added: 0,
              updated: 0,
              skipped: p.items.length,
              duplicate: true,
            });
          }
          const original = putObject(readFileSync(join(dir, "staging", b.id)));
          const result = tx(() => {
            let added = 0,
              updated = 0,
              skipped = 0;
            for (const c of p.items) {
              const key = ns + ":" + c.sourceId;
              const old = db
                .prepare("SELECT * FROM sources WHERE sourceKey=?")
                .get(key);
              if (old?.digest === c.digest) {
                skipped++;
                continue;
              }
              const sid = old?.id || randomUUID();
              const eid = old?.entryId || randomUUID();
              if (!old) {
                create({
                  id: eid,
                  title: c.title,
                  body: `Imported ChatGPT conversation · ${c.messages.length} messages.\n\n${c.messages.find((m) => m.role === "user")?.text.slice(0, 600) || "Open the source conversation to review."}`,
                  category: "Inbox",
                  type: "conversation",
                  sourceId: sid,
                });
                added++;
              } else updated++;
              db.prepare(
                "INSERT INTO source_versions(sourceId,digest,raw,created) VALUES(?,?,?,?) ON CONFLICT DO NOTHING",
              ).run(
                sid,
                c.digest,
                JSON.stringify(c.raw),
                new Date().toISOString(),
              );
              db.prepare(
                "INSERT INTO sources VALUES(?,?,?,?,?,?,?) ON CONFLICT(sourceKey) DO UPDATE SET digest=excluded.digest,raw=excluded.raw,text=excluded.text,updated=excluded.updated",
              ).run(
                sid,
                key,
                eid,
                c.digest,
                JSON.stringify(c.raw),
                c.text,
                new Date().toISOString(),
              );
            }
            const out = { added, updated, skipped };
            db.prepare("INSERT INTO imports VALUES(?,?,?,?,?,?,?)").run(
              randomUUID(),
              hash(p.digest + ns),
              p.name,
              original,
              ns,
              new Date().toISOString(),
              JSON.stringify(out),
            );
            return out;
          });
          rmSync(join(dir, "staging", b.id), { force: true });
          staged.delete(b.id);
          return json(res, 200, result);
        }
        if (path === "/api/imports" && method === "GET")
          return json(
            res,
            200,
            db
              .prepare(
                "SELECT id,name,namespace,created,result FROM imports ORDER BY created DESC",
              )
              .all(),
          );
        if (path.startsWith("/api/imports/") && method === "GET") {
          const i = db
            .prepare("SELECT * FROM imports WHERE id=?")
            .get(path.split("/").pop());
          if (!i) return json(res, 404, { error: "Not found" });
          res.writeHead(200, {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(i.name)}`,
            "Cache-Control": "no-store",
          });
          return res.end(readFileSync(originalPath(i.original)));
        }
        if (path === "/api/extract" && method === "POST") {
          const b = await transactionData(req);
          const source = db
            .prepare("SELECT * FROM sources WHERE id=?")
            .get(b.sourceId);
          if (!source) throw new Error("Source not found");
          const raw = JSON.parse(source.raw);
          const node = raw.mapping[b.messageId];
          if (!node?.message) throw new Error("Message not found");
          const text = messageText(node.message);
          const entry = tx(() => {
            const e = create({
              title: b.title || "Thought from a conversation",
              body: text,
              category: b.category || "Ideas",
              type: b.category === "Projects" ? "project" : "idea",
            });
            db.prepare("INSERT INTO source_refs VALUES(?,?,?)").run(
              e.id,
              source.id,
              b.messageId,
            );
            db.prepare("INSERT INTO connections VALUES(?,?,?,?)").run(
              randomUUID(),
              e.id,
              source.entryId,
              "came from",
            );
            return e;
          });
          return json(res, 201, entry);
        }
        if (path === "/api/protection")
          return json(
            res,
            200,
            existsSync(join(dir, "backup-status.json"))
              ? JSON.parse(
                  readFileSync(join(dir, "backup-status.json"), "utf8"),
                )
              : { lastSnapshot: null, offsite: "Not configured" },
          );
        if (path === "/api/snapshot" && method === "POST")
          return json(res, 201, snapshot());
        if (path === "/api/export") {
          const tables = [
            "entries",
            "revisions",
            "connections",
            "sources",
            "source_versions",
            "source_refs",
            "imports",
            "attachments",
            "layouts",
          ];
          const data = {
            format: "secondbrain",
            version: 1,
            created: new Date().toISOString(),
            tables: Object.fromEntries(
              tables.map((t) => [t, db.prepare(`SELECT * FROM ${t}`).all()]),
            ),
          };
          res.setHeader(
            "Content-Disposition",
            'attachment; filename="secondbrain-export.json"',
          );
          return json(res, 200, data);
        }
        return json(res, 404, { error: "Not found" });
      }
      if (!["GET", "HEAD"].includes(method))
        return json(res, 405, { error: "Method not allowed" });
      if (
        path.split("/").some((part) => part.startsWith(".")) ||
        /^\/(data|objects|server|scripts)(\/|$)/.test(path)
      )
        return json(res, 404, { error: "Not found" });
      const dist = join(root, "dist");
      const safe = resolveStaticPath(dist, path);
      if (!safe) return json(res, 404, { error: "Not found" });
      if (
        !(existsSync(safe) && statSync(safe).isFile()) &&
        (extname(path) || path.startsWith("/assets/"))
      ) {
        res.writeHead(404, {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
        });
        return res.end(
          "Asset not found. Rebuild with npm run build and reload the page.",
        );
      }
      const file =
        existsSync(safe) && statSync(safe).isFile()
          ? safe
          : join(dist, "index.html");
      if (!existsSync(file))
        return json(res, 503, {
          error: "Build the frontend with npm run build first.",
        });
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
        "Cache-Control": path === "/sw.js" ? "no-cache" : "no-cache",
      });
      res.end(readFileSync(file));
    } catch (e) {
      json(res, e.status || 400, {
        error: e.message || "Request failed",
        ...(e.current ? { current: e.current } : {}),
      });
    }
  }
  const server = http.createServer(handler);
  const timer = setInterval(() => {
    for (const [id, s] of staged)
      if (s.expires < Date.now()) {
        rmSync(join(dir, "staging", id), { force: true });
        staged.delete(id);
      }
  }, 60000);
  timer.unref();
  server.on("close", () => {
    clearInterval(timer);
    db.close();
  });
  return { server, store, snapshot };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Support direct VS Code launches as well as npm start; existing process
  // environment variables retain Node's standard precedence.
  const envPath = join(root, ".env");
  if (existsSync(envPath)) loadEnvFile(envPath);
  const app = createApp();
  app.server.listen(
    Number(process.env.PORT || 3000),
    process.env.HOST || "127.0.0.1",
    () =>
      console.log(
        "Second Brain listening on port " + (process.env.PORT || 3000),
      ),
  );
}
