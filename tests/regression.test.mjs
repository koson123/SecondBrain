import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import JSZip from "jszip";
import {
  harness,
  conversation,
  importConversation,
} from "./helpers/harness.mjs";
import { parseExport, hash } from "../server/importer.mjs";
import { restore } from "../scripts/restore.mjs";

const create = async (h, patch = {}) =>
  (
    await h.post("/entries", {
      title: "A note",
      body: "Original body",
      ...patch,
    })
  ).json;

test("all protected endpoints reject an unauthenticated client", async (t) => {
  const h = await harness(t);
  for (const path of [
    "/entries",
    "/stats",
    "/graph?focus=missing",
    "/connections",
    "/layout",
    "/imports",
    "/protection",
    "/export",
    "/attachments/missing",
    "/entries/missing",
    "/entries/missing/history",
    "/entries/missing/source",
  ]) {
    const r = await h.api(path, { authenticated: false });
    assert.equal(r.status, 401, path);
    assert.equal(r.headers.get("cache-control"), "no-store");
  }
});
test("setup is one-time, logout revokes the session, and a wrong password stays rejected", async (t) => {
  const h = await harness(t);
  await h.login();
  assert.equal(
    (
      await h.post("/setup", {
        token: "test-token",
        password: "different strong password",
      })
    ).status,
    409,
  );
  await h.post("/logout", {});
  assert.equal((await h.api("/entries")).status, 401);
  assert.equal(
    (await h.post("/login", { password: "incorrect long password" })).status,
    401,
  );
  assert.equal(
    (await h.post("/login", { password: "a synthetic strong password" }))
      .status,
    200,
  );
  assert.equal((await h.api("/entries")).status, 200);
});
test("concurrent first-run setup creates exactly one owner", async (t) => {
  const h = await harness(t);
  const results = await Promise.all([
    h.post("/setup", {
      token: "test-token",
      password: "a synthetic strong password",
    }),
    h.post("/setup", {
      token: "test-token",
      password: "another synthetic password",
    }),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  assert.equal(
    h.app.store.db.prepare("SELECT count(*) n FROM owner").get().n,
    1,
  );
});
test("expired and forged sessions are rejected", async (t) => {
  const h = await harness(t);
  await h.login();
  assert.equal(
    (await h.api("/entries", { headers: { Cookie: "brain=forged" } })).status,
    401,
  );
  h.app.store.db.prepare("UPDATE sessions SET expires=?").run(Date.now() - 1);
  assert.equal((await h.api("/entries")).status, 401);
});
test("login attempts are rate limited and cookies are HttpOnly and SameSite", async (t) => {
  const h = await harness(t);
  const first = await h.login();
  assert.match(first.headers.get("set-cookie"), /HttpOnly/);
  assert.match(first.headers.get("set-cookie"), /SameSite=Strict/);
  await h.post("/logout", {});
  for (let i = 0; i < 15; i++)
    assert.equal(
      (await h.post("/login", { password: "incorrect long password" })).status,
      401,
    );
  assert.equal(
    (await h.post("/login", { password: "incorrect long password" })).status,
    429,
  );
});
test("foreign origins and missing request headers cannot mutate data", async (t) => {
  const h = await harness(t);
  await h.login();
  for (const headers of [
    { Origin: "https://evil.invalid" },
    { "X-Brain-Request": "" },
    { Origin: "" },
  ])
    assert.equal(
      (
        await h.api("/entries", {
          method: "POST",
          data: { body: "blocked" },
          headers,
        })
      ).status,
      403,
    );
  assert.equal((await h.api("/entries")).json.total, 0);
});

test("partial PATCH preserves hidden, snooze and trash flags", async (t) => {
  const h = await harness(t);
  await h.login();
  let e = await create(h, { category: "Ideas" });
  e = (
    await h.post(
      "/entries/" + e.id,
      {
        revision: e.revision,
        hidden: 1,
        snooze: "2099-01-01T00:00:00.000Z",
        deleted: 1,
      },
      "PATCH",
    )
  ).json;
  e = (
    await h.post(
      "/entries/" + e.id,
      { revision: e.revision, title: "Renamed" },
      "PATCH",
    )
  ).json;
  assert.equal(e.hidden, 1);
  assert.equal(e.deleted, 1);
  assert.equal(e.snooze, "2099-01-01T00:00:00.000Z");
});
test("safe retries do not duplicate entries and ID collisions do not silently discard new content", async (t) => {
  const h = await harness(t);
  await h.login();
  const input = { id: "retry-id", title: "Retry", body: "Same payload" };
  assert.equal((await h.post("/entries", input)).status, 201);
  assert.equal((await h.post("/entries", input)).status, 201);
  assert.equal((await h.api("/entries")).json.total, 1);
  assert.equal(
    (await h.post("/entries", { ...input, body: "A different thought" }))
      .status,
    409,
  );
});
for (const [name, input] of Object.entries({
  category: { category: "Unknown" },
  type: { type: "unsupported" },
  status: { status: "invisible-state" },
  area: { area: "Unknown" },
  date: { date: "2026-02-31" },
  id: { id: "../../outside" },
  title: { title: "x".repeat(301) },
  body: { body: "x".repeat(200001) },
  snooze: { snooze: "not-a-date" },
}))
  test("reject invalid " + name + " without creating data", async (t) => {
    const h = await harness(t);
    await h.login();
    const r = await h.post("/entries", { title: "Invalid", ...input });
    assert.equal(r.status, 400, JSON.stringify(r.json));
    assert.equal((await h.api("/entries")).json.total, 0);
  });
for (const payload of [null, [], false, "not an object"])
  test("reject JSON body shape " + JSON.stringify(payload), async (t) => {
    const h = await harness(t);
    await h.login();
    assert.equal((await h.post("/entries", payload)).status, 400);
    assert.equal((await h.api("/entries")).json.total, 0);
  });
test("malformed JSON and oversized writes fail without affecting the next request", async (t) => {
  const h = await harness(t);
  await h.login();
  assert.equal(
    (await h.api("/entries", { method: "POST", raw: '{"bad":' })).status,
    400,
  );
  assert.equal(
    (await h.post("/entries", { body: "x".repeat(1100000) })).status,
    413,
  );
  assert.equal((await h.api("/health")).status, 200);
});
test("history keeps old content and stale revisions cannot overwrite newer data", async (t) => {
  const h = await harness(t);
  await h.login();
  const original = await create(h);
  const edited = (
    await h.post(
      "/entries/" + original.id,
      { revision: original.revision, body: "Edited" },
      "PATCH",
    )
  ).json;
  assert.equal(
    (
      await h.post(
        "/entries/" + original.id,
        { revision: original.revision, body: "Stale" },
        "PATCH",
      )
    ).status,
    409,
  );
  const history = (await h.api("/entries/" + original.id + "/history")).json;
  assert.equal(history.length, 2);
  assert.equal(JSON.parse(history[1].snapshot).body, "Original body");
  const restored = (
    await h.post(
      "/entries/" + original.id,
      { ...JSON.parse(history[1].snapshot), revision: edited.revision },
      "PATCH",
    )
  ).json;
  assert.equal(restored.body, "Original body");
  assert.equal(restored.revision, 3);
});

test("Journal privacy cannot be bypassed by choosing its area with note type", async (t) => {
  const h = await harness(t);
  await h.login();
  const e = await create(h, {
    category: "Life areas",
    area: "Journal",
    type: "note",
    body: "journal sentinel",
  });
  assert.equal(e.type, "journal");
  assert.equal((await h.api("/entries?q=sentinel")).json.total, 0);
  assert.equal((await h.api("/entries?area=Journal")).json.total, 1);
});
test("Journal can be archived, trashed, found in Trash and restored without losing privacy", async (t) => {
  const h = await harness(t);
  await h.login();
  let e = await create(h, { type: "journal", date: "2026-10-24" });
  e = (
    await h.post(
      "/entries/" + e.id,
      { revision: e.revision, category: "Archive" },
      "PATCH",
    )
  ).json;
  assert.equal(e.category, "Archive");
  assert.equal((await h.api("/entries?category=Archive")).json.total, 1);
  assert.equal((await h.api("/entries")).json.total, 0);
  e = (
    await h.post(
      "/entries/" + e.id,
      { revision: e.revision, deleted: 1 },
      "PATCH",
    )
  ).json;
  assert.equal((await h.api("/entries?trash=1")).json.total, 1);
  e = (
    await h.post(
      "/entries/" + e.id,
      { revision: e.revision, deleted: 0, category: "Life areas" },
      "PATCH",
    )
  ).json;
  assert.equal(e.area, "Journal");
  assert.equal((await h.api("/entries?q=Original")).json.total, 0);
});
test("Journal pagination uses entry dates instead of latest edit dates", async (t) => {
  const h = await harness(t);
  await h.login();
  const early = await create(h, { type: "journal", date: "2020-01-01" });
  await create(h, { type: "journal", date: "2025-01-01" });
  await h.post(
    "/entries/" + early.id,
    { revision: early.revision, body: "Edited older day" },
    "PATCH",
  );
  assert.equal(
    (await h.api("/entries?area=Journal&limit=1")).json.entries[0].date,
    "2025-01-01",
  );
});
test("search handles Unicode, quotes, punctuation, source text, and exact title ranking", async (t) => {
  const h = await harness(t);
  await h.login();
  const exact = await create(h, { title: "rain garden", body: "café 日本語" });
  await create(h, { title: "Recent unrelated title", body: "rain garden" });
  assert.equal(
    (await h.api("/entries?q=rain%20garden")).json.entries[0].id,
    exact.id,
  );
  assert.equal(
    (await h.api("/entries?q=" + encodeURIComponent("café"))).json.total,
    1,
  );
  for (const q of ['"', "---", "😊", ": OR *"])
    assert.equal(
      (await h.api("/entries?q=" + encodeURIComponent(q))).status,
      200,
      q,
    );
});
test("pagination has no duplicate items and rejects invalid numeric parameters", async (t) => {
  const h = await harness(t);
  await h.login();
  for (let i = 0; i < 7; i++) await create(h, { title: "Note " + i });
  const first = (await h.api("/entries?limit=3")).json;
  const second = (await h.api("/entries?limit=3&offset=3")).json;
  assert.equal(first.total, 7);
  assert.equal(
    new Set([...first.entries, ...second.entries].map((e) => e.id)).size,
    6,
  );
  for (const q of ["offset=NaN", "offset=-1", "offset=1.2", "limit=NaN"])
    assert.equal((await h.api("/entries?" + q)).status, 400, q);
});

test("connections reject missing, self, and deleted targets; duplicate links stay unique", async (t) => {
  const h = await harness(t);
  await h.login();
  const a = await create(h),
    b = await create(h);
  assert.equal(
    (
      await h.post("/connections", {
        fromId: a.id,
        toId: a.id,
        label: "related",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await h.post("/connections", {
        fromId: a.id,
        toId: "missing",
        label: "related",
      })
    ).status,
    400,
  );
  await h.post("/connections", { fromId: a.id, toId: b.id, label: "related" });
  await h.post("/connections", { fromId: a.id, toId: b.id, label: "related" });
  assert.equal((await h.api("/connections")).json.length, 1);
  await h.post(
    "/entries/" + b.id,
    { revision: b.revision, deleted: 1 },
    "PATCH",
  );
  assert.equal(
    (
      await h.post("/connections", {
        fromId: a.id,
        toId: b.id,
        label: "inspired by",
      })
    ).status,
    400,
  );
});
test("graph respects Journal/trash exclusion, unique neighbors, limit, and remaining count", async (t) => {
  const h = await harness(t);
  await h.login();
  const center = await create(h);
  for (let i = 0; i < 9; i++) {
    const e = await create(h, { title: "Neighbor " + i });
    await h.post("/connections", {
      fromId: center.id,
      toId: e.id,
      label: "related",
    });
    if (i === 0)
      await h.post("/connections", {
        fromId: center.id,
        toId: e.id,
        label: "part of",
      });
  }
  const result = (await h.api("/graph?focus=" + center.id + "&limit=6")).json;
  assert.equal(result.entries.length, 7);
  assert.equal(result.remaining, 3);
  assert.equal(new Set(result.entries.map((e) => e.id)).size, 7);
});
test("board positions survive reload and invalid layouts cannot break the graph", async (t) => {
  const h = await harness(t);
  await h.login();
  const good = { scope: "/ideas", value: { "note-1": { x: 12.5, y: -10 } } };
  assert.equal((await h.post("/layout", good)).status, 200);
  assert.deepEqual((await h.api("/layout?scope=%2Fideas")).json, good.value);
  for (const value of [
    null,
    [],
    5,
    { "note-1": { x: "bad", y: 0 } },
    { "note-1": { x: null, y: 0 } },
  ])
    assert.equal(
      (await h.post("/layout", { scope: "/ideas", value })).status,
      400,
    );
  assert.deepEqual((await h.api("/layout?scope=%2Fideas")).json, good.value);
});
test("attachments preserve exact bytes and safe names; absent files return 404", async (t) => {
  const h = await harness(t);
  await h.login();
  const e = await create(h);
  const bytes = Buffer.from([0, 1, 2, 255, 12]);
  const r = await h.api("/entries/" + e.id + "/attachments", {
    method: "POST",
    raw: bytes,
    headers: {
      "Content-Type": "application/octet-stream",
      "X-File-Name": encodeURIComponent("../notes 📝.txt"),
    },
  });
  assert.equal(r.status, 201);
  const got = await h.api("/attachments/" + r.json.id);
  assert.deepEqual(got.bytes, bytes);
  assert.match(got.headers.get("content-disposition"), /notes/);
  assert.equal((await h.api("/attachments/missing")).status, 404);
});

test("JSON and ZIP parse equivalently without changing roles, branches, or original identifiers", async () => {
  const c = conversation();
  const buf = Buffer.from(JSON.stringify([c]));
  const zip = new JSZip();
  zip.file("export/conversations.json", buf);
  const a = await parseExport(buf),
    b = await parseExport(await zip.generateAsync({ type: "nodebuffer" }));
  assert.deepEqual(a.items, b.items);
  assert.equal(
    a.items[0].messages.find((m) => m.id === "alternative").parent,
    "question",
  );
});
for (const [name, content] of Object.entries({
  empty: [],
  duplicate: [conversation(), conversation()],
  missingId: [{ ...conversation(), id: null }],
  invalidMapping: [{ ...conversation(), mapping: [] }],
}))
  test(
    "import rejects " + name + " without accepting ambiguous history",
    async () => {
      await assert.rejects(() =>
        parseExport(Buffer.from(JSON.stringify(content))),
      );
    },
  );
test("ZIP without conversation JSON and ZIP with two conversation JSON files reject", async () => {
  const one = new JSZip();
  one.file("readme.txt", "hi");
  await assert.rejects(
    () => one.generateAsync({ type: "nodebuffer" }).then(parseExport),
    /exactly one/,
  );
  one.file("a/conversations.json", "[]");
  one.file("b/conversations.json", "[]");
  await assert.rejects(
    () => one.generateAsync({ type: "nodebuffer" }).then(parseExport),
    /exactly one/,
  );
});
test("duplicate imports clean up temporary staging files", async (t) => {
  const h = await harness(t);
  await h.login();
  await importConversation(h);
  const again = await importConversation(h);
  assert.equal(again.commit.json.duplicate, true);
  assert.equal(again.commit.json.added, 0);
  assert.equal(again.commit.json.updated, 0);
  assert.equal(again.commit.json.skipped, 1);
  assert.deepEqual(readdirSync(join(h.dir, "staging")), []);
});
test("changed source keeps original uploads, source versions and reviewed note text", async (t) => {
  const h = await harness(t);
  await h.login();
  const first = await importConversation(h);
  await h.post(
    "/entries/" + first.entry.id,
    {
      revision: first.entry.revision,
      body: "My review",
      category: "Knowledge",
    },
    "PATCH",
  );
  await importConversation(
    h,
    conversation("conversation-1", "Updated thought"),
  );
  const e = h.app.store.get(first.entry.id);
  assert.equal(e.body, "My review");
  assert.equal(e.category, "Knowledge");
  assert.equal(
    h.app.store.db.prepare("SELECT count(*) n FROM source_versions").get().n,
    2,
  );
  assert.equal(
    h.app.store.db.prepare("SELECT count(*) n FROM imports").get().n,
    2,
  );
});
test("extracting text-only message content keeps its actual text", async (t) => {
  const h = await harness(t);
  await h.login();
  const i = await importConversation(
    h,
    conversation("text-only", "Keep this text", "text"),
  );
  const source = (await h.api("/entries/" + i.entry.id + "/source")).json;
  const e = await h.post("/extract", {
    sourceId: source.id,
    messageId: "question",
    category: "Ideas",
  });
  assert.equal(e.status, 201);
  assert.equal(e.json.body, "Keep this text");
});
test("invalid extraction and bad namespaces do not partially create records", async (t) => {
  const h = await harness(t);
  await h.login();
  const i = await importConversation(h);
  assert.equal(
    (
      await h.post("/extract", {
        sourceId: i.entry.sourceId,
        messageId: "missing",
      })
    ).status,
    400,
  );
  assert.equal((await h.api("/entries")).json.total, 1);
  const preview = await h.api("/import/preview", {
    method: "POST",
    raw: Buffer.from(JSON.stringify([conversation("another")])),
  });
  assert.equal(
    (
      await h.post("/import/commit", {
        id: preview.json.id,
        namespace: "bad:namespace",
      })
    ).status,
    400,
  );
  assert.equal((await h.api("/entries")).json.total, 1);
});

test("a recovery manifest cannot omit attachment objects referenced by its database", async (t) => {
  const h = await harness(t);
  await h.login();
  const e = await create(h);
  await h.api("/entries/" + e.id + "/attachments", {
    method: "POST",
    raw: Buffer.from("important bytes"),
  });
  const snap = h.app.snapshot();
  const path = join(h.dir, "snapshots", snap.id);
  const manifest = JSON.parse(
    readFileSync(join(path, "manifest.json"), "utf8"),
  );
  for (const key of Object.keys(manifest.files))
    if (key.startsWith("objects/")) delete manifest.files[key];
  writeFileSync(join(path, "manifest.json"), JSON.stringify(manifest));
  assert.throws(
    () => restore(path, join(h.dir, "incomplete")),
    /object|attachment|manifest/i,
  );
  assert.equal(existsSync(join(h.dir, "incomplete")), false);
});
test("failed restore leaves no half-restored target and never overwrites an existing directory", async (t) => {
  const h = await harness(t);
  await h.login();
  const snap = h.app.snapshot(),
    path = join(h.dir, "snapshots", snap.id);
  writeFileSync(join(path, "brain.sqlite"), "not a database");
  const m = JSON.parse(readFileSync(join(path, "manifest.json"), "utf8"));
  m.files["brain.sqlite"] = hash(readFileSync(join(path, "brain.sqlite")));
  writeFileSync(join(path, "manifest.json"), JSON.stringify(m));
  const target = join(h.dir, "bad-target");
  assert.throws(() => restore(path, target));
  assert.equal(existsSync(target), false);
  assert.throws(() => restore(path, h.dir), /must not exist/);
});
test("snapshots preserve independent backup timestamps and do not expose private objects publicly", async (t) => {
  const h = await harness(t);
  await h.login();
  writeFileSync(
    join(h.dir, "backup-status.json"),
    JSON.stringify({
      lastOffsite: "2026-01-01T00:00:00Z",
      lastIndependentBackup: "2026-01-02T00:00:00Z",
    }),
  );
  h.app.snapshot();
  const status = (await h.api("/protection")).json;
  assert.equal(status.lastOffsite, "2026-01-01T00:00:00Z");
  assert.equal(status.lastIndependentBackup, "2026-01-02T00:00:00Z");
  for (const path of [
    "/data/brain.sqlite",
    "/.env",
    "/objects/private",
    "/server/server.mjs",
  ])
    assert.notEqual((await h.request(path)).status, 200, path);
});

test("Trash spans categories and does not require an entry to have been archived first", async (t) => {
  const h = await harness(t);
  await h.login();
  const e = await create(h, { category: "Ideas" });
  await h.post(
    "/entries/" + e.id,
    { revision: e.revision, deleted: 1 },
    "PATCH",
  );
  assert.equal(
    (await h.api("/entries?category=Archive&trash=1")).json.total,
    1,
  );
});
test("rediscovery reaches old ideas beyond the first page and respects hidden/snoozed/trash flags", async (t) => {
  const h = await harness(t);
  await h.login();
  const old = await create(h, { title: "An old idea", category: "Ideas" });
  for (let i = 0; i < 65; i++)
    await create(h, { title: "Recent note " + i, category: "Knowledge" });
  assert.equal((await h.api("/rediscover")).json.entry.id, old.id);
  let e = (
    await h.post(
      "/entries/" + old.id,
      { revision: old.revision, hidden: 1 },
      "PATCH",
    )
  ).json;
  assert.equal((await h.api("/rediscover")).json.entry, null);
  e = (
    await h.post(
      "/entries/" + old.id,
      { revision: e.revision, hidden: 0, snooze: "2099-01-01T00:00:00Z" },
      "PATCH",
    )
  ).json;
  assert.equal((await h.api("/rediscover")).json.entry, null);
  await h.post(
    "/entries/" + old.id,
    { revision: e.revision, snooze: "2000-01-01T00:00:00Z" },
    "PATCH",
  );
  assert.equal((await h.api("/rediscover?offset=100")).json.entry.id, old.id);
});
test("Desk active filtering cannot be filled by archived notes", async (t) => {
  const h = await harness(t);
  await h.login();
  const e = await create(h, { title: "Active note" });
  for (let i = 0; i < 65; i++)
    await create(h, { title: "Archived " + i, category: "Archive" });
  const result = (await h.api("/entries?active=1&limit=3")).json;
  assert.equal(result.total, 1);
  assert.equal(result.entries[0].id, e.id);
});
test("read and mutation endpoints reject unsupported HTTP methods without changing records", async (t) => {
  const h = await harness(t);
  await h.login();
  const e = await create(h);
  const routes = [
    ["/config", "POST"],
    ["/stats", "POST"],
    ["/graph?focus=" + e.id, "POST"],
    ["/rediscover", "DELETE"],
    ["/protection", "PATCH"],
    ["/export", "POST"],
    ["/imports", "POST"],
    ["/entries", "DELETE"],
    ["/entries/" + e.id, "POST"],
    ["/entries/" + e.id + "/history", "PATCH"],
    ["/entries/" + e.id + "/source", "POST"],
    ["/entries/" + e.id + "/references", "DELETE"],
    ["/entries/" + e.id + "/attachments", "PATCH"],
    ["/attachments/missing", "DELETE"],
    ["/connections", "PATCH"],
    ["/layout", "DELETE"],
    ["/import/preview", "GET"],
    ["/import/commit", "GET"],
    ["/extract", "GET"],
    ["/snapshot", "GET"],
    ["/logout", "GET"],
  ];
  for (const [path, method] of routes)
    assert.equal(
      (await h.api(path, { method })).status,
      405,
      path + " " + method,
    );
  assert.equal((await h.api("/entries")).json.total, 1);
});
test("JSON content export omits account hashes and session tokens but keeps source provenance", async (t) => {
  const h = await harness(t);
  await h.login();
  const i = await importConversation(h);
  await h.post("/extract", {
    sourceId: i.entry.sourceId,
    messageId: "question",
  });
  const r = await h.api("/export");
  assert.equal(r.json.format, "secondbrain");
  assert.equal(r.json.tables.entries.length, 2);
  assert.equal(r.json.tables.source_refs.length, 1);
  assert.equal(r.json.tables.sources.length, 1);
  assert.equal(r.json.tables.owner, undefined);
  assert.equal(r.json.tables.sessions, undefined);
  assert.match(r.headers.get("content-disposition"), /attachment/);
  assert.equal(r.headers.get("cache-control"), "no-store");
});

test("import size and shape limits reject oversized input before allocating expanded history", async () => {
  await assert.rejects(
    () => parseExport(Buffer.allocUnsafe(100 * 1024 * 1024 + 1)),
    /100 MB/,
  );
  await assert.rejects(
    () => parseExport(Buffer.from(JSON.stringify(Array(15001).fill({})))),
    /15,000/,
  );
  const c = conversation();
  c.mapping = Object.fromEntries(
    Array.from({ length: 100001 }, (_, i) => ["node-" + i, null]),
  );
  await assert.rejects(
    () => parseExport(Buffer.from(JSON.stringify([c]))),
    /too many message nodes/,
  );
});
test("a ZIP that declares an oversized JSON member is rejected before decompression", async () => {
  const zip = new JSZip();
  zip.file("conversations.json", "[]");
  const bytes = await zip.generateAsync({ type: "nodebuffer" });
  const central = bytes.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  bytes.writeUInt32LE(101 * 1024 * 1024, central + 24);
  await assert.rejects(
    () => parseExport(bytes),
    /Expanded conversations.json exceeds/,
  );
});
test("non-text and text-object content stay readable and can be preserved as source text", async () => {
  const c = conversation();
  c.mapping.question.message.content.parts = [
    { text: "A text object" },
    { asset_pointer: "image-1" },
  ];
  const p = await parseExport(Buffer.from(JSON.stringify([c])));
  assert.match(p.items[0].text, /A text object/);
  assert.match(p.items[0].text, /Non-text content/);
});
test("unavailable previews, missing sources, and unknown routes fail without creating entries", async (t) => {
  const h = await harness(t);
  await h.login();
  assert.equal((await h.post("/import/commit", { id: "expired" })).status, 400);
  assert.equal(
    (await h.post("/extract", { sourceId: "missing", messageId: "missing" }))
      .status,
    400,
  );
  assert.equal((await h.api("/entries/missing/source")).status, 404);
  assert.equal((await h.api("/unknown")).status, 404);
  assert.equal((await h.api("/entries")).json.total, 0);
});
test("attachment size limit rejects oversized bytes without committing an object reference", async (t) => {
  const h = await harness(t);
  await h.login();
  const e = await create(h);
  assert.equal(
    (
      await h.api("/entries/" + e.id + "/attachments", {
        method: "POST",
        raw: Buffer.alloc(20 * 1024 * 1024 + 1),
      })
    ).status,
    413,
  );
  assert.equal(
    (await h.api("/entries/" + e.id + "/attachments")).json.length,
    0,
  );
});
test("a lifecycle of Unicode and punctuation content round-trips through every category without loss", async (t) => {
  const h = await harness(t);
  await h.login();
  const texts = [
    "📝 日本語 café",
    "line one\n\nline two",
    "<script>not executable</script>",
    "quotes \" ' and \\ backslashes",
    "a".repeat(8000),
  ];
  for (let i = 0; i < texts.length; i++) {
    let e = await create(h, {
      id: "roundtrip-" + i,
      body: texts[i],
      title: "Unicode case " + i,
    });
    for (const category of [
      "Projects",
      "Life areas",
      "Knowledge",
      "Ideas",
      "Archive",
    ]) {
      e = (
        await h.post(
          "/entries/" + e.id,
          { revision: e.revision, category },
          "PATCH",
        )
      ).json;
      assert.equal(e.body, texts[i]);
      assert.equal(e.category, category);
    }
    assert.equal((await h.api("/entries/" + e.id)).json.body, texts[i]);
  }
});
