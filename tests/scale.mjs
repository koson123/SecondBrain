// Synthetic capacity check. Deliberately separate from the fast regression suite.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { performance } from "node:perf_hooks";
import { createApp } from "../server/server.mjs";
import { parseExport } from "../server/importer.mjs";
const dir = mkdtempSync(join(tmpdir(), "brain-scale-"));
const app = createApp({
  dir,
  setupToken: "scale-test",
  secure: false,
  origin: null,
});
try {
  const start = performance.now();
  app.store.db.exec("BEGIN");
  for (let i = 0; i < 5000; i++)
    app.store.create({
      id: "scale-" + i,
      title: "Synthetic note " + i,
      body: "Capacity fixture searchable-marker-" + i,
      category: i % 2 ? "Knowledge" : "Ideas",
    });
  const insert = app.store.db.prepare(
    "INSERT INTO connections VALUES(?,?,?,?)",
  );
  for (let i = 0; i < 5000; i++)
    for (let j = 1; j <= 5; j++)
      insert.run(
        "edge-" + i + "-" + j,
        "scale-" + i,
        "scale-" + ((i + j) % 5000),
        "related",
      );
  app.store.db.exec("COMMIT");
  const seedMs = performance.now() - start;
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const origin = "http://127.0.0.1:" + app.server.address().port;
  const setup = await fetch(origin + "/api/setup", {
    method: "POST",
    headers: {
      Origin: origin,
      "X-Brain-Request": "1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      token: "scale-test",
      password: "a synthetic scale password",
    }),
  });
  assert.equal(setup.status, 200);
  const cookie = setup.headers.get("set-cookie").split(";")[0];
  const at = performance.now();
  const graph = await fetch(origin + "/api/graph?focus=scale-4999&limit=6", {
    headers: { Cookie: cookie },
  }).then((r) => r.json());
  const graphMs = performance.now() - at;
  assert.equal(graph.entries.length, 7);
  assert.ok(graph.remaining > 0);
  const searchAt = performance.now();
  const search = await fetch(
    origin + "/api/entries?q=" + encodeURIComponent("searchable-marker-4999"),
    { headers: { Cookie: cookie } },
  ).then((r) => r.json());
  const searchMs = performance.now() - searchAt;
  assert.equal(search.entries[0].id, "scale-4999");
  const mapping = Object.fromEntries(
    Array.from({ length: 100000 }, (_, i) => [
      "message-" + i,
      {
        parent: i ? "message-" + (i - 1) : null,
        children: i < 99999 ? ["message-" + (i + 1)] : [],
        message: {
          author: { role: i % 2 ? "assistant" : "user" },
          content: { parts: ["Synthetic message " + i] },
        },
      },
    ]),
  );
  const parseAt = performance.now();
  const parsed = await parseExport(
    Buffer.from(
      JSON.stringify([
        {
          id: "large-conversation",
          title: "Synthetic capacity conversation",
          mapping,
          current_node: "message-99999",
        },
      ]),
    ),
  );
  const parseMs = performance.now() - parseAt;
  assert.equal(parsed.items[0].messages.length, 100000);
  console.log(
    JSON.stringify(
      {
        notes: 5000,
        connections: 25000,
        messagesParsed: 100000,
        seedMs: Math.round(seedMs),
        graphMs: Math.round(graphMs),
        searchMs: Math.round(searchMs),
        parseMs: Math.round(parseMs),
        note: "Measurements from the test container, not a target homelab guarantee.",
      },
      null,
      2,
    ),
  );
} finally {
  if (app.server.listening) await new Promise((r) => app.server.close(r));
  else app.store.db.close();
  rmSync(dir, { recursive: true, force: true });
}
