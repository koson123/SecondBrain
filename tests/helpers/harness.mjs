import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { createApp } from "../../server/server.mjs";
export async function harness(t, options = {}) {
  const dir = mkdtempSync(join(tmpdir(), "brain-regression-"));
  const app = createApp({
    dir,
    setupToken: "test-token",
    secure: false,
    origin: null,
    ...options,
  });
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  const origin = "http://127.0.0.1:" + app.server.address().port;
  let cookie = "";
  async function request(
    path,
    { method = "GET", data, raw, headers = {}, authenticated = true } = {},
  ) {
    const response = await fetch(origin + path, {
      method,
      headers: {
        Origin: origin,
        "X-Brain-Request": "1",
        "Content-Type": "application/json",
        ...(authenticated ? { Cookie: cookie } : {}),
        ...headers,
      },
      body:
        raw !== undefined
          ? raw
          : data !== undefined
            ? JSON.stringify(data)
            : undefined,
    });
    if (response.headers.get("set-cookie"))
      cookie = response.headers.get("set-cookie").split(";")[0];
    const bytes = Buffer.from(await response.arrayBuffer());
    let json;
    try {
      json = JSON.parse(bytes.toString());
    } catch {}
    return { status: response.status, json, bytes, headers: response.headers };
  }
  const api = (path, options) => request("/api" + path, options);
  const post = (path, data, method = "POST") => api(path, { method, data });
  async function login() {
    const r = await post("/setup", {
      token: "test-token",
      password: "a synthetic strong password",
    });
    if (r.status !== 200) throw new Error(JSON.stringify(r.json));
    return r;
  }
  t.after(async () => {
    await new Promise((r) => app.server.close(r));
    rmSync(dir, { recursive: true, force: true });
  });
  return {
    dir,
    app,
    origin,
    request,
    api,
    post,
    login,
    get cookie() {
      return cookie;
    },
  };
}
export function conversation(
  id = "conversation-1",
  text = "An original thought",
  format = "parts",
) {
  return {
    id,
    title: "A conversation",
    current_node: "answer",
    mapping: {
      question: {
        parent: null,
        children: ["answer", "alternative"],
        message: {
          id: "question",
          author: { role: "user" },
          content:
            format === "text"
              ? { content_type: "text", text }
              : { parts: [text] },
        },
      },
      answer: {
        parent: "question",
        children: [],
        message: {
          id: "answer",
          author: { role: "assistant" },
          content: { parts: ["A suggestion"] },
        },
      },
      alternative: {
        parent: "question",
        children: [],
        message: {
          id: "alternative",
          author: { role: "assistant" },
          content: { parts: ["A different suggestion"] },
        },
      },
    },
  };
}
export async function importConversation(
  h,
  c = conversation(),
  namespace = "personal",
) {
  const preview = await h.api("/import/preview", {
    method: "POST",
    raw: Buffer.from(JSON.stringify([c])),
  });
  if (preview.status !== 200) throw new Error(JSON.stringify(preview.json));
  const commit = await h.post("/import/commit", {
    id: preview.json.id,
    namespace,
  });
  return {
    preview: preview.json,
    commit,
    entry: h.app.store.db
      .prepare(
        "SELECT * FROM entries WHERE type='conversation' ORDER BY created DESC LIMIT 1",
      )
      .get(),
  };
}
