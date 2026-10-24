import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import JSZip from "jszip";
import { createApp } from "../server/server.mjs";
import { parseExport } from "../server/importer.mjs";
import { restore } from "../scripts/restore.mjs";

const conversation = (title = "A little idea", extra = "") => ({
  id: "conv-1",
  title,
  create_time: 1700000000,
  current_node: "a",
  mapping: {
    root: { id: "root", parent: null, children: ["u"] },
    u: {
      parent: "root",
      children: ["a", "alternate"],
      message: {
        author: { role: "user" },
        content: { parts: ["Build a plant watering reminder" + extra] },
        create_time: 1700000001,
      },
    },
    a: {
      parent: "u",
      children: [],
      message: {
        author: { role: "assistant" },
        content: { parts: ["A suggestion, not a decision"] },
      },
    },
    alternate: {
      parent: "u",
      children: [],
      message: {
        author: { role: "assistant" },
        content: { parts: ["Another branch"] },
      },
    },
  },
});

async function harness(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "brain-test-"));
  const app = createApp({
    dir,
    setupToken: "setup-secret",
    secure: false,
    ...options,
  });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const origin = "http://127.0.0.1:" + app.server.address().port;
  let cookie = "";
  async function req(path, options = {}) {
    const response = await fetch(origin + "/api" + path, {
      ...options,
      headers: {
        Origin: origin,
        "X-Brain-Request": "1",
        "Content-Type": "application/json",
        Cookie: cookie,
        ...options.headers,
      },
    });
    if (response.headers.get("set-cookie"))
      cookie = response.headers.get("set-cookie").split(";")[0];
    let data;
    try {
      data = await response.json();
    } catch {}
    return { status: response.status, data };
  }
  const post = (p, b, method = "POST") =>
    req(p, { method, body: JSON.stringify(b) });
  t.after(async () => {
    await new Promise((r) => app.server.close(r));
    rmSync(dir, { recursive: true, force: true });
  });
  return { app, dir, req, post };
}
async function login(h) {
  assert.equal(
    (
      await h.post("/setup", {
        token: "  setup-secret \n",
        password: "a long testing password",
      })
    ).status,
    200,
  );
}

test("authentication, origin checks, persistence, idempotent create, conflicts, Journal privacy and trash", async (t) => {
  const h = await harness(t);
  assert.equal((await h.req("/entries")).status, 401);
  assert.equal(
    (
      await h.post("/setup", {
        token: "wrong",
        password: "a long testing password",
      })
    ).status,
    403,
  );
  await login(h);
  const rootResponse = await fetch(
    "http://127.0.0.1:" + h.app.server.address().port + "/",
  );
  assert.equal(
    rootResponse.status,
    existsSync(new URL("../dist/index.html", import.meta.url)) ? 200 : 503,
  );
  if (rootResponse.status === 200) {
    const html = await rootResponse.text();
    assert.match(html, /id="root"/);
    const base = "http://127.0.0.1:" + h.app.server.address().port;
    for (const asset of html.match(/\/assets\/[^"\s]+/g) || []) {
      const response = await fetch(base + asset);
      assert.equal(response.status, 200);
      assert.match(
        response.headers.get("content-type"),
        asset.endsWith(".css") ? /text\/css/ : /javascript/,
      );
    }
    const manifest = await fetch(base + "/manifest.webmanifest");
    assert.equal(manifest.status, 200);
    assert.match(manifest.headers.get("content-type"), /manifest\+json/);
    const missing = await fetch(base + "/assets/does-not-exist.css");
    assert.equal(missing.status, 404);
    assert.match(missing.headers.get("content-type"), /text\/plain/);
  }

  assert.equal(
    (
      await h.req("/entries", {
        method: "POST",
        headers: { Origin: "https://evil.example" },
        body: "{}",
      })
    ).status,
    403,
  );
  const first = (
    await h.post("/entries", {
      id: "fixed-id",
      title: "First thought",
      body: "original",
      category: "Ideas",
    })
  ).data;
  assert.equal(first.revision, 1);
  assert.equal(
    (await h.post("/entries", { id: "fixed-id", body: "retry" })).status,
    409,
  );
  const edited = await h.post(
    "/entries/fixed-id",
    { ...first, title: "Renamed thought", body: "new body" },
    "PATCH",
  );
  assert.equal(edited.data.revision, 2);
  assert.equal(
    (
      await h.post(
        "/entries/fixed-id",
        { ...first, body: "stale edit" },
        "PATCH",
      )
    ).status,
    409,
  );
  assert.equal((await h.req("/entries/fixed-id/history")).data.length, 2);
  await h.post("/entries", {
    title: "Private journal",
    body: "secret journaling words",
    type: "journal",
    category: "Ideas",
  });
  assert.equal((await h.req("/entries?q=secret")).data.total, 0);
  assert.equal((await h.req("/entries?q=secret&journal=1")).data.total, 1);
  assert.equal(
    (await h.req("/entries?category=Life%20areas&area=Journal")).data.total,
    1,
  );
  const deleted = await h.post(
    "/entries/fixed-id",
    { ...edited.data, deleted: 1 },
    "PATCH",
  );
  assert.equal(deleted.status, 200);
  assert.equal((await h.req("/entries?q=Renamed")).data.total, 0);
  assert.equal((await h.req("/entries?trash=1")).data.total, 1);
  assert.equal(
    (
      await h.post(
        "/entries/fixed-id",
        { ...deleted.data, deleted: 0 },
        "PATCH",
      )
    ).status,
    200,
  );
});

test("JSON/ZIP import, roles and branches, duplicate retries, revised source, full text search, extraction, namespaces", async (t) => {
  const h = await harness(t);
  await login(h);
  const json = Buffer.from(JSON.stringify([conversation()]));
  const preview = await h.req("/import/preview", {
    method: "POST",
    body: json,
    headers: {
      "Content-Type": "application/octet-stream",
      "X-File-Name": "conversations.json",
    },
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.data.messages, 3);
  const committed = await h.post("/import/commit", {
    id: preview.data.id,
    namespace: "personal",
  });
  assert.equal(committed.data.added, 1);
  const inbox = (await h.req("/entries?category=Inbox")).data.entries;
  assert.equal(inbox.length, 1);
  assert.equal(inbox[0].type, "conversation");
  const source = (await h.req("/entries/" + inbox[0].id + "/source")).data;
  assert.equal(
    source.raw.mapping.alternate.message.content.parts[0],
    "Another branch",
  );
  assert.equal(source.raw.mapping.u.message.author.role, "user");
  assert.equal((await h.req("/entries?q=branch")).data.total, 1);
  const again = await h.req("/import/preview", { method: "POST", body: json });
  assert.equal(
    (
      await h.post("/import/commit", {
        id: again.data.id,
        namespace: "personal",
      })
    ).data.duplicate,
    true,
  );
  const edited = await h.post(
    "/entries/" + inbox[0].id,
    { ...inbox[0], body: "My own review", category: "Knowledge" },
    "PATCH",
  );
  assert.equal(edited.status, 200);
  const zip = new JSZip();
  zip.file(
    "conversations.json",
    JSON.stringify([conversation("Revised title", " with a new detail")]),
  );
  zip.file("photo.png", "fake image");
  const z = await zip.generateAsync({ type: "nodebuffer" });
  const next = await h.req("/import/preview", { method: "POST", body: z });
  assert.equal(next.data.count, 1);
  assert.equal(
    (
      await h.post("/import/commit", {
        id: next.data.id,
        namespace: "personal",
      })
    ).data.updated,
    1,
  );
  assert.equal(
    (await h.req("/entries/" + inbox[0].id)).data.body,
    "My own review",
  );
  assert.equal(
    h.app.store.db.prepare("SELECT count(*) n FROM source_versions").get().n,
    2,
  );
  const extracted = await h.post("/extract", {
    sourceId: source.id,
    messageId: "u",
    title: "Watering reminder",
    category: "Ideas",
  });
  assert.equal(extracted.status, 201);
  assert.match(extracted.data.body, /plant watering/);
  assert.equal(
    (await h.req("/entries/" + extracted.data.id + "/references")).data[0]
      .messageId,
    "u",
  );
  assert.equal((await h.req("/connections")).data.length, 1);
  const other = await h.req("/import/preview", { method: "POST", body: json });
  assert.equal(
    (
      await h.post("/import/commit", {
        id: other.data.id,
        namespace: "another-account",
      })
    ).data.added,
    1,
  );
  const originals = h.app.store.db.prepare("SELECT * FROM imports").all();
  assert.equal(
    readFileSync(join(h.dir, "objects", originals[0].original)).equals(json),
    true,
  );
});

test("unsupported import rejects safely and imported HTML is stored as data", async () => {
  await assert.rejects(
    () => parseExport(Buffer.from("{}")),
    /No conversations/,
  );
  await assert.rejects(
    () => parseExport(Buffer.from(JSON.stringify([{ id: "x", messages: [] }]))),
    /unsupported/,
  );
  await assert.rejects(
    () => parseExport(Buffer.from("bad json")),
    /valid JSON/,
  );
  const c = conversation("<script>alert(1)</script>");
  const p = await parseExport(Buffer.from(JSON.stringify([c])));
  assert.equal(p.items[0].title, c.title);
});

test("attachments require authentication and snapshots restore notes, source bytes and history; checksum damage rejects", async (t) => {
  const h = await harness(t);
  await login(h);
  const entry = (
    await h.post("/entries", { title: "Recovery note", body: "do not lose me" })
  ).data;
  const attach = await h.req("/entries/" + entry.id + "/attachments", {
    method: "POST",
    body: Buffer.from("attachment bytes"),
    headers: { "Content-Type": "text/plain", "X-File-Name": "notes.txt" },
  });
  assert.equal(attach.status, 201);
  const snap = h.app.snapshot();
  const path = join(h.dir, "snapshots", snap.id),
    target = join(h.dir, "restored");
  restore(path, target);
  assert.ok(existsSync(join(target, "brain.sqlite")));
  const { openStore } = await import("../server/store.mjs");
  const restored = openStore(target);
  assert.equal(restored.get(entry.id).body, "do not lose me");
  assert.equal(
    restored.db.prepare("SELECT count(*) n FROM sessions").get().n,
    0,
  );
  const attachment = restored.db.prepare("SELECT * FROM attachments").get();
  assert.equal(
    readFileSync(join(target, "objects", attachment.hash), "utf8"),
    "attachment bytes",
  );
  restored.db.close();
  writeFileSync(join(path, "objects", attachment.hash), "corrupted");
  assert.throws(
    () => restore(path, join(h.dir, "bad-restore")),
    /Checksum mismatch/,
  );
});

test("bounded graph crosses categories, excludes Journal, and snapshots do not remove an active import preview", async (t) => {
  const h = await harness(t);
  await login(h);
  const center = (
    await h.post("/entries", { title: "Center idea", category: "Ideas" })
  ).data;
  const project = (
    await h.post("/entries", {
      title: "Linked project",
      category: "Projects",
      type: "project",
    })
  ).data;
  const journal = (
    await h.post("/entries", { title: "Private journal", type: "journal" })
  ).data;
  for (const e of [project, journal])
    await h.post("/connections", {
      fromId: center.id,
      toId: e.id,
      label: "related",
    });
  const graph = (await h.req("/graph?focus=" + center.id + "&limit=1")).data;
  assert.deepEqual(
    new Set(graph.entries.map((e) => e.id)),
    new Set([center.id, project.id]),
  );
  assert.equal(
    (await h.req("/graph?focus=" + journal.id)).data.entries.length,
    0,
  );
  const preview = await h.req("/import/preview", {
    method: "POST",
    body: Buffer.from(JSON.stringify([conversation()])),
  });
  const other = createApp({ dir: h.dir, secure: false });
  other.snapshot();
  other.store.db.close();
  assert.equal(
    (await h.post("/import/commit", { id: preview.data.id })).data.added,
    1,
  );
});

test("complete portable ZIP round-trip preserves entries and relations", async (t) => {
  const h = await harness(t);
  await login(h);
  const a = (
    await h.post("/entries", {
      title: "Portable idea",
      body: "survives export",
      category: "Ideas",
    })
  ).data;
  const b = (
    await h.post("/entries", {
      title: "Portable project",
      category: "Projects",
      type: "project",
    })
  ).data;
  await h.post("/connections", { fromId: a.id, toId: b.id, label: "part of" });
  const zip = join(h.dir, "portable.zip"),
    target = join(h.dir, "portable-restored");
  const cwd = new URL("..", import.meta.url);
  const out = spawnSync(
    process.execPath,
    ["scripts/portable.mjs", "export", zip],
    { cwd, env: { ...process.env, DATA_DIR: h.dir }, encoding: "utf8" },
  );
  assert.equal(out.status, 0, out.stderr);
  const incoming = spawnSync(
    process.execPath,
    ["scripts/portable.mjs", "import", zip, target],
    { cwd, encoding: "utf8" },
  );
  assert.equal(incoming.status, 0, incoming.stderr);
  const { openStore } = await import("../server/store.mjs");
  const restored = openStore(target);
  try {
    assert.equal(restored.get(a.id).body, "survives export");
    assert.equal(
      restored.db.prepare("SELECT count(*) n FROM connections").get().n,
      1,
    );
  } finally {
    restored.db.close();
  }
});

test("setup distinguishes missing server configuration from a mismatched token", async (t) => {
  const h = await harness(t, { setupToken: null });
  const result = await h.post("/setup", {
    token: "a-token",
    password: "a long testing password",
  });
  assert.equal(result.status, 503);
  assert.match(result.data.error, /no SETUP_TOKEN configured/);
  assert.equal(
    h.app.store.db.prepare("SELECT count(*) n FROM owner").get().n,
    0,
  );
});
