import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import {
  harness,
  conversation,
  importConversation,
} from "./helpers/harness.mjs";
const browserOptions = {
  headless: true,
  ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
    ? {
        executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
        args: [
          "--no-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--single-process",
          "--no-zygote",
        ],
      }
    : {}),
};
async function screen(t, { mobile = false, initialScript } = {}) {
  const h = await harness(t);
  await h.login();
  const browser = await chromium.launch(browserOptions);
  const context = await browser.newContext({
    viewport: mobile
      ? { width: 360, height: 800 }
      : { width: 1366, height: 950 },
    serviceWorkers: "block",
    acceptDownloads: true,
  });
  const errors = [];
  context.on("page", (p) => p.on("pageerror", (e) => errors.push(e.message)));
  await context.addCookies([
    {
      name: "brain",
      value: h.cookie.split("=")[1],
      url: h.origin,
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
  if (initialScript) await context.addInitScript(initialScript);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("dialog", (d) => d.accept());
  t.after(async () => {
    await context.close();
    await browser.close();
    assert.deepEqual(errors, [], "Uncaught browser errors");
  });
  return { ...h, context, page, errors };
}
const seed = async (h, patch = {}) =>
  (
    await h.post("/entries", {
      title: "A browser note",
      body: "Original browser content",
      category: "Ideas",
      ...patch,
    })
  ).json;
const open = async (h, e, path = "/ideas") => {
  await h.page.goto(h.origin + path + "?entry=" + e.id);
  await h.page.getByLabel("Title", { exact: true }).waitFor();
};
async function until(fn) {
  for (let i = 0; i < 100; i++) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 80));
  }
  throw new Error("Expected state did not arrive");
}
const close = async (p) =>
  p.getByRole("button", { name: "Close entry", exact: true }).click();

test("typing during a slow save keeps the newer local draft and serializes saves", async (t) => {
  const h = await screen(t);
  const e = await seed(h);
  let release;
  const gate = new Promise((r) => (release = r));
  let notify;
  const started = new Promise((r) => (notify = r));
  let count = 0;
  await h.page.route("**/api/entries/" + e.id, async (route) => {
    if (route.request().method() === "PATCH") {
      count++;
      if (count === 1) {
        notify();
        await gate;
      }
    }
    await route.continue();
  });
  try {
    await open(h, e);
    await h.page
      .getByLabel("Your thoughts", { exact: true })
      .fill("First edit");
    await started;
    await h.page
      .getByLabel("Your thoughts", { exact: true })
      .fill("Newer edit while saving");
    await h.page.waitForTimeout(1800);
    assert.equal(count, 1, "A second write must not race the first revision");
    release();
    await until(async () => {
      const draft = await h.page.evaluate(
        (id) => JSON.parse(localStorage.getItem("brain-draft-" + id) || "null"),
        e.id,
      );
      return draft?.body === "Newer edit while saving" && draft.revision === 2;
    });
    await h.page.reload();
    await h.page.getByLabel("Your thoughts", { exact: true }).waitFor();
    assert.equal(
      await h.page.getByLabel("Your thoughts", { exact: true }).inputValue(),
      "Newer edit while saving",
    );
    await until(() => h.app.store.get(e.id).body === "Newer edit while saving");
    assert.equal(h.app.store.get(e.id).revision, 3);
  } finally {
    release?.();
  }
});

test("a completed save from an unmounted editor cannot reopen the previous note", async (t) => {
  const h = await screen(t);
  const a = await seed(h, { title: "First note" }),
    b = await seed(h, { title: "Second note" });
  await h.post("/connections", { fromId: a.id, toId: b.id, label: "related" });
  let release, notify;
  const gate = new Promise((r) => (release = r)),
    started = new Promise((r) => (notify = r));
  await h.page.route("**/api/entries/" + a.id, async (route) => {
    if (route.request().method() === "PATCH") {
      notify();
      await gate;
    }
    await route.continue();
  });
  try {
    await open(h, a);
    await h.page
      .getByLabel("Your thoughts", { exact: true })
      .fill("Saved after leaving");
    await started;
    await h.page.getByRole("button", { name: /Second note related/ }).click();
    await until(
      async () =>
        (await h.page.getByLabel("Title", { exact: true }).inputValue()) ===
        "Second note",
    );
    release();
    await until(() => h.app.store.get(a.id).body === "Saved after leaving");
    await h.page.waitForTimeout(200);
    assert.equal(new URL(h.page.url()).searchParams.get("entry"), b.id);
    assert.equal(
      await h.page.getByLabel("Title", { exact: true }).inputValue(),
      "Second note",
    );
  } finally {
    release?.();
  }
});

test("two tabs conflict safely and the losing draft can be saved as a separate copy", async (t) => {
  const h = await screen(t);
  const e = await seed(h);
  await open(h, e);
  const other = await h.context.newPage();
  other.setDefaultTimeout(10000);
  other.on("dialog", (d) => d.accept());
  await other.goto(h.origin + "/ideas?entry=" + e.id);
  await other.getByLabel("Title", { exact: true }).waitFor();
  await h.page
    .getByLabel("Your thoughts", { exact: true })
    .fill("First tab wins");
  await until(() => h.app.store.get(e.id).revision === 2);
  await other
    .getByLabel("Your thoughts", { exact: true })
    .fill("Second tab survives");
  await other
    .getByRole("alert")
    .filter({ hasText: "changed on another device" })
    .waitFor();
  assert.equal(h.app.store.get(e.id).body, "First tab wins");
  await other
    .getByRole("button", { name: "Save as a copy", exact: true })
    .click();
  await until(
    () =>
      h.app.store.db.prepare("SELECT count(*) n FROM entries").get().n === 2,
  );
  assert.equal(
    h.app.store.db.prepare("SELECT body FROM entries WHERE id!=?").get(e.id)
      .body,
    "Second tab survives",
  );
});

test("conflict recovery downloads the local draft before loading the newer server version", async (t) => {
  const h = await screen(t);
  const e = await seed(h);
  await open(h, e);
  await h.post(
    "/entries/" + e.id,
    { revision: e.revision, body: "Updated elsewhere" },
    "PATCH",
  );
  await h.page
    .getByLabel("Your thoughts", { exact: true })
    .fill("Preserve my conflict");
  await h.page
    .getByRole("button", {
      name: "Download draft & reload latest",
      exact: true,
    })
    .waitFor();
  const got = h.page.waitForEvent("download");
  await h.page
    .getByRole("button", {
      name: "Download draft & reload latest",
      exact: true,
    })
    .click();
  const file = await got;
  assert.equal(
    JSON.parse(readFileSync(await file.path(), "utf8")).body,
    "Preserve my conflict",
  );
  await until(
    async () =>
      (await h.page
        .getByLabel("Your thoughts", { exact: true })
        .inputValue()) === "Updated elsewhere",
  );
  assert.equal(h.app.store.get(e.id).body, "Updated elsewhere");
});

test("failed saves preserve drafts, stop automatic retry loops, and support a manual retry", async (t) => {
  const h = await screen(t);
  const e = await seed(h);
  let writes = 0;
  await h.page.route("**/api/entries/" + e.id, async (route) => {
    if (route.request().method() === "PATCH") {
      writes++;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Synthetic save failure" }),
      });
    } else await route.continue();
  });
  await open(h, e);
  await h.page
    .getByLabel("Your thoughts", { exact: true })
    .fill("A recoverable failed save");
  await h.page
    .getByRole("alert")
    .filter({ hasText: "Synthetic save failure" })
    .waitFor();
  await h.page.waitForTimeout(1900);
  assert.equal(writes, 1);
  assert.equal(
    await h.page.evaluate(
      (id) => JSON.parse(localStorage.getItem("brain-draft-" + id)).body,
      e.id,
    ),
    "A recoverable failed save",
  );
  await h.page.unroute("**/api/entries/" + e.id);
  await h.page
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await until(() => h.app.store.get(e.id).body === "A recoverable failed save");
});

test("a corrupt local draft cannot crash an entry or replace its server identity", async (t) => {
  const h = await screen(t);
  const e = await seed(h);
  await h.page.addInitScript(
    ({ id }) =>
      localStorage.setItem(
        "brain-draft-" + id,
        JSON.stringify({
          id: "wrong-id",
          body: { bad: true },
          title: [],
          revision: 2,
        }),
      ),
    { id: e.id },
  );
  await open(h, e);
  assert.equal(
    await h.page.getByLabel("Your thoughts", { exact: true }).inputValue(),
    e.body,
  );
  assert.equal(
    await h.page.getByLabel("Title", { exact: true }).inputValue(),
    e.title,
  );
});

test("failed related-information requests stay visible without crashing the editor", async (t) => {
  const h = await screen(t);
  const e = await seed(h);
  await h.page.route("**/api/entries/" + e.id + "/attachments", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Synthetic attachment failure" }),
    }),
  );
  await open(h, e);
  await h.page
    .getByRole("alert")
    .filter({ hasText: "Synthetic attachment failure" })
    .waitFor();
  await h.page
    .getByLabel("Your thoughts", { exact: true })
    .fill("Still editable");
  await until(() => h.app.store.get(e.id).body === "Still editable");
});

test("project outcome, handoff, next action and state survive refresh", async (t) => {
  const h = await screen(t);
  await h.page.goto(h.origin + "/projects");
  await h.page
    .getByRole("button", { name: "New project", exact: true })
    .click();
  await h.page.getByLabel("Title", { exact: true }).fill("Build a small shelf");
  await h.page
    .getByLabel("Desired outcome", { exact: true })
    .fill("A finished shelf");
  await h.page
    .getByLabel("Where I stopped", { exact: true })
    .fill("Measured the wall");
  await h.page
    .getByLabel("Next small step", { exact: true })
    .fill("Cut the first board");
  await h.page.getByLabel("Status", { exact: true }).selectOption("paused");
  const id = new URL(h.page.url()).searchParams.get("entry");
  await until(
    () =>
      h.app.store.get(id).handoff === "Measured the wall" &&
      h.app.store.get(id).status === "paused",
  );
  await close(h.page);
  await h.page.reload();
  await h.page
    .locator(".project-column")
    .filter({
      has: h.page.getByRole("heading", { name: "Paused", exact: true }),
    })
    .getByRole("heading", { name: "Build a small shelf", exact: true })
    .waitFor();
});

test("Inbox Move to actions move the note once and keep its content", async (t) => {
  const h = await screen(t);
  const e = await seed(h, { category: "Inbox", title: "Inbox review item" });
  await h.page.goto(h.origin + "/inbox");
  await h.page
    .getByLabel("Move Inbox review item", { exact: true })
    .selectOption("Knowledge");
  await until(() => h.app.store.get(e.id).category === "Knowledge");
  await h.page
    .getByRole("link", { name: "Knowledge", exact: true })
    .first()
    .click();
  await h.page.getByRole("button", { name: /Inbox review item/ }).waitFor();
  assert.equal(h.app.store.get(e.id).body, e.body);
  assert.equal(
    h.app.store.db.prepare("SELECT count(*) n FROM entries").get().n,
    1,
  );
});

test("Journal archive/trash/restore is reachable from the interface without leaking into Desk", async (t) => {
  const h = await screen(t);
  const e = await seed(h, {
    type: "journal",
    title: "Private journal recovery",
    date: "2026-10-24",
  });
  await open(h, e, "/life/journal");
  await h.page.getByLabel("Keep in", { exact: true }).selectOption("Archive");
  await until(() => h.app.store.get(e.id).category === "Archive");
  await h.page
    .getByRole("button", { name: "Move to trash", exact: true })
    .click();
  await until(() => h.app.store.get(e.id).deleted === 1);
  await close(h.page);
  await h.page.goto(h.origin + "/archive?trash=1");
  await h.page
    .getByRole("button", { name: /Private journal recovery/ })
    .click();
  await h.page
    .getByRole("button", { name: "Restore from trash", exact: true })
    .click();
  await until(() => h.app.store.get(e.id).deleted === 0);
  await close(h.page);
  await h.page.goto(h.origin + "/");
  await h.page.getByRole("heading", { name: "Desk", exact: true }).waitFor();
  assert.equal(
    await h.page
      .getByText("Private journal recovery", { exact: false })
      .count(),
    0,
  );
});

test("Trash shows notes deleted directly from an active category", async (t) => {
  const h = await screen(t);
  const e = await seed(h, { title: "Deleted directly from Ideas" });
  await h.post(
    "/entries/" + e.id,
    { revision: e.revision, deleted: 1 },
    "PATCH",
  );
  await h.page.goto(h.origin + "/archive?trash=1");
  await h.page
    .getByRole("button", { name: /Deleted directly from Ideas/ })
    .waitFor();
});

test("Journal search is opt-in and browser navigation restores search scope", async (t) => {
  const h = await screen(t);
  await seed(h, { title: "Ordinary sentinel", body: "sharedkeyword" });
  await seed(h, {
    title: "Private sentinel",
    body: "sharedkeyword",
    type: "journal",
  });
  await h.page.goto(h.origin + "/search?q=sharedkeyword");
  await h.page
    .getByRole("heading", { name: "Ordinary sentinel", exact: true })
    .waitFor();
  assert.equal(
    await h.page
      .getByRole("heading", { name: "Private sentinel", exact: true })
      .count(),
    0,
  );
  await h.page
    .getByLabel("Include private Journal entries", { exact: true })
    .check();
  await h.page
    .getByRole("heading", { name: "Private sentinel", exact: true })
    .waitFor();
  await h.page
    .getByRole("link", { name: "Projects", exact: true })
    .first()
    .click();
  await h.page.goBack();
  await h.page
    .getByRole("heading", { name: "Private sentinel", exact: true })
    .waitFor();
  assert.equal(
    await h.page
      .getByLabel("Include private Journal entries", { exact: true })
      .isChecked(),
    true,
  );
});

test("attachments download byte-for-byte and HTML note text is never executed", async (t) => {
  const h = await screen(t);
  const e = await seed(h, {
    body: '<img src=x onerror="window.syntheticXss=true">',
  });
  await open(h, e);
  assert.equal(await h.page.evaluate(() => window.syntheticXss), undefined);
  const bytes = Buffer.from("synthetic attachment\nline two");
  await h.page.locator("input[type=file]").setInputFiles({
    name: "test attachment.txt",
    mimeType: "text/plain",
    buffer: bytes,
  });
  const link = h.page.getByRole("link", {
    name: "test attachment.txt",
    exact: false,
  });
  await link.waitFor();
  const got = h.page.waitForEvent("download");
  await link.click();
  const d = await got;
  assert.deepEqual(readFileSync(await d.path()), bytes);
  assert.equal(await h.page.evaluate(() => window.syntheticXss), undefined);
});

test("version history restores old content as a new revision", async (t) => {
  const h = await screen(t);
  const e = await seed(h);
  await open(h, e);
  await h.page
    .getByLabel("Your thoughts", { exact: true })
    .fill("A later draft");
  await until(() => h.app.store.get(e.id).revision === 2);
  await h.page
    .getByRole("button", { name: "Version history", exact: false })
    .click();
  await h.page
    .locator(".history-row")
    .last()
    .getByRole("button", { name: "Restore as a new revision", exact: true })
    .click();
  await until(() => h.app.store.get(e.id).revision === 3);
  assert.equal(h.app.store.get(e.id).body, e.body);
});

test("source references reopen an alternative branch even when message.id differs from its mapping key", async (t) => {
  const h = await screen(t);
  const c = conversation();
  c.mapping.alternative.message.id = "a-different-original-id";
  const i = await importConversation(h, c);
  await open(h, i.entry, "/inbox");
  await h.page
    .getByRole("button", { name: "Original conversation", exact: true })
    .click();
  await h.page
    .getByLabel("Conversation branch", { exact: true })
    .selectOption("alternative");
  await h.page
    .locator(".message")
    .last()
    .getByRole("button", { name: "Keep as an idea", exact: true })
    .click();
  await until(
    () =>
      h.app.store.db.prepare("SELECT count(*) n FROM source_refs").get().n ===
      1,
  );
  await h.page
    .getByRole("button", {
      name: /Original conversation · message alternativ/,
    })
    .click();
  await h.page.waitForURL(
    (url) => url.searchParams.get("source") === "alternative",
  );
  await h.page.getByText("A different suggestion", { exact: false }).waitFor();
  assert.equal(new URL(h.page.url()).searchParams.get("source"), "alternative");
});

test("connections can be added, persisted, explored, and removed", async (t) => {
  const h = await screen(t);
  const a = await seed(h, { title: "Graph A" }),
    b = await seed(h, { title: "Graph B", category: "Knowledge" });
  await open(h, a);
  await h.page
    .getByLabel("Related thought", { exact: true })
    .selectOption(b.id);
  await h.page
    .getByLabel("Relationship", { exact: true })
    .selectOption("depends on");
  await h.page
    .getByRole("button", { name: "Add connection", exact: true })
    .click();
  await until(
    () =>
      h.app.store.db.prepare("SELECT count(*) n FROM connections").get().n ===
      1,
  );
  await close(h.page);
  await h.page.goto(h.origin + "/ideas?mode=explore");
  await until(
    async () => (await h.page.locator(".thought-node").count()) === 2,
  );
  await h.page.reload();
  await until(
    async () => (await h.page.locator(".thought-node").count()) === 2,
  );
  await h.page
    .locator(".thought-node")
    .filter({
      has: h.page.getByRole("heading", { name: "Graph A", exact: true }),
    })
    .getByRole("button", { name: "Open", exact: true })
    .click();
  await h.page
    .getByRole("button", { name: "Remove connection", exact: true })
    .click();
  await until(
    () =>
      h.app.store.db.prepare("SELECT count(*) n FROM connections").get().n ===
      0,
  );
});

test("theme persists, dialogs close with Escape, and mobile pages contain long titles", async (t) => {
  const h = await screen(t, { mobile: true });
  const long = "VeryLongUnbrokenTitle".repeat(12);
  await seed(h, { title: long, category: "Projects", type: "project" });
  await seed(h, { title: long, category: "Knowledge" });
  await seed(h, { title: long, type: "journal" });
  await h.page.goto(h.origin + "/");
  await h.page
    .getByRole("button", { name: "Toggle theme", exact: true })
    .click();
  const theme = await h.page.locator("html").getAttribute("data-theme");
  await h.page.reload();
  await until(
    async () =>
      (await h.page.locator("html").getAttribute("data-theme")) === theme,
  );
  await h.page.getByRole("button", { name: "New note", exact: true }).click();
  await h.page.getByLabel("Title", { exact: true }).waitFor();
  await h.page.keyboard.press("Escape");
  await until(() => !new URL(h.page.url()).searchParams.get("entry"));
  for (const path of [
    "/projects",
    "/knowledge",
    "/life/journal",
    "/settings",
    "/imports",
  ]) {
    await h.page.goto(h.origin + path);
    await h.page.locator("main h1").waitFor();
    await h.page.waitForTimeout(200);
    assert.equal(
      await h.page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      path,
    );
  }
});

test("a failed rediscovery action reports an error instead of an unhandled rejection", async (t) => {
  const h = await screen(t);
  const e = await seed(h, { title: "Return to this idea" });
  await h.page.route("**/api/entries/" + e.id, async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Synthetic rediscovery failure" }),
      });
    else await route.continue();
  });
  await h.page.goto(h.origin + "/");
  await h.page.getByRole("button", { name: "Later", exact: true }).click();
  await h.page
    .getByRole("alert")
    .filter({ hasText: "Synthetic rediscovery failure" })
    .waitFor();
  assert.equal(h.app.store.get(e.id).snooze, "");
});

test("an expired session preserves a pending capture and opens sign-in", async (t) => {
  const h = await screen(t);
  await h.page.goto(h.origin + "/");
  await h.page.getByRole("heading", { name: "Desk", exact: true }).waitFor();
  h.app.store.db.prepare("UPDATE sessions SET expires=?").run(Date.now() - 1);
  await h.page
    .getByLabel("Quick capture", { exact: true })
    .fill("Keep after session expiry");
  await h.page
    .getByRole("button", { name: "Save to Inbox", exact: true })
    .click();
  await h.page.getByRole("heading", { name: "Sign in", exact: true }).waitFor();
  await h.page
    .getByLabel("Password", { exact: true })
    .fill("a synthetic strong password");
  await h.page.getByRole("button", { name: "Sign in", exact: true }).click();
  await until(
    () =>
      h.app.store.db
        .prepare(
          "SELECT count(*) n FROM entries WHERE body='Keep after session expiry'",
        )
        .get().n === 1,
  );
});

test("device draft storage failure warns before closing and server Save still works", async (t) => {
  const h = await screen(t);
  const e = await seed(h);
  await h.page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith("brain-draft-"))
        throw new DOMException("Synthetic full device", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await open(h, e);
  await h.page
    .getByLabel("Your thoughts", { exact: true })
    .fill("Survives full device storage");
  await h.page
    .getByRole("alert")
    .filter({ hasText: "Device storage is full" })
    .waitFor();
  h.page.removeAllListeners("dialog");
  let prompt = "";
  h.page.once("dialog", async (d) => {
    prompt = d.message();
    await d.dismiss();
  });
  await h.page
    .getByRole("button", { name: "Close entry", exact: true })
    .click();
  assert.match(prompt, /only in this window/);
  await h.page
    .getByRole("button", { name: "Save changes", exact: true })
    .click();
  await until(
    () => h.app.store.get(e.id).body === "Survives full device storage",
  );
});

test("unexpected source field shapes are displayed as data instead of crashing React", async (t) => {
  const h = await screen(t);
  const c = conversation();
  c.current_node = { unexpected: true };
  c.mapping.answer.message.author.role = { unexpected: true };
  c.mapping.answer.message.content.parts = 123;
  const i = await importConversation(h, c);
  await open(h, i.entry, "/inbox");
  await h.page
    .getByRole("button", { name: "Original conversation", exact: true })
    .click();
  await h.page
    .getByLabel("Conversation branch", { exact: true })
    .selectOption("answer");
  await h.page.getByText("[Non-text content]", { exact: false }).waitFor();
  assert.equal(h.errors.length, 0);
});

test("failed connection removal leaves the link intact and reports the error", async (t) => {
  const h = await screen(t);
  const a = await seed(h),
    b = await seed(h, { title: "Another linked note" });
  await h.post("/connections", { fromId: a.id, toId: b.id, label: "related" });
  await h.page.route("**/api/connections/*", async (route) => {
    if (route.request().method() === "DELETE")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Synthetic removal failure" }),
      });
    else await route.continue();
  });
  await open(h, a);
  await h.page
    .getByRole("button", { name: "Remove connection", exact: true })
    .click();
  await h.page
    .getByRole("alert")
    .filter({ hasText: "Synthetic removal failure" })
    .waitFor();
  assert.equal(
    h.app.store.db.prepare("SELECT count(*) n FROM connections").get().n,
    1,
  );
});

test("graph positions persist after dragging and a failed position save is visible", async (t) => {
  const h = await screen(t);
  const a = await seed(h, { title: "Drag this note" }),
    b = await seed(h, { title: "Connected note" });
  await h.post("/connections", { fromId: a.id, toId: b.id, label: "related" });
  await h.page.goto(h.origin + "/ideas?mode=explore");
  await until(
    async () => (await h.page.locator(".thought-node").count()) === 2,
  );
  await h.page.waitForTimeout(200);
  const node = h.page.locator(".thought-node").filter({
    has: h.page.getByRole("heading", { name: "Drag this note", exact: true }),
  });
  let box = await node.boundingBox();
  await h.page.mouse.move(box.x + 70, box.y + 35);
  await h.page.mouse.down();
  await h.page.mouse.move(box.x + 110, box.y + 90, { steps: 6 });
  await h.page.mouse.up();
  await until(
    () =>
      !!h.app.store.db
        .prepare("SELECT value FROM layouts WHERE scope=?")
        .get("/ideas"),
  );
  const saved = JSON.parse(
    h.app.store.db
      .prepare("SELECT value FROM layouts WHERE scope=?")
      .get("/ideas").value,
  );
  assert.ok(Number.isFinite(saved[a.id].x));
  await h.page.reload();
  await node.waitFor();
  await h.page.waitForTimeout(200);
  await h.page.route("**/api/layout", async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Synthetic layout failure" }),
      });
    else await route.continue();
  });
  box = await node.boundingBox();
  await h.page.mouse.move(box.x + 70, box.y + 35);
  await h.page.mouse.down();
  await h.page.mouse.move(box.x + 95, box.y + 65, { steps: 6 });
  await h.page.mouse.up();
  await h.page
    .getByRole("alert")
    .filter({ hasText: "Position is only saved in this tab" })
    .waitFor();
  assert.deepEqual(
    JSON.parse(
      h.app.store.db
        .prepare("SELECT value FROM layouts WHERE scope=?")
        .get("/ideas").value,
    ),
    saved,
  );
});

test("a rejected queued capture does not prevent later valid captures from uploading", async (t) => {
  const h = await screen(t);
  await h.page.goto(h.origin + "/");
  await h.page.getByRole("heading", { name: "Desk", exact: true }).waitFor();
  await h.page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open("secondbrain-captures", 1);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction("captures", "readwrite");
      tx.objectStore("captures").put({
        id: "a-invalid",
        body: "Keep this failed capture",
        category: "unsupported",
      });
      tx.objectStore("captures").put({
        id: "b-valid",
        title: "",
        body: "Later valid capture",
        category: "Inbox",
        type: "note",
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await h.page.reload();
  await h.page
    .getByRole("alert")
    .filter({ hasText: "A pending note could not upload" })
    .waitFor();
  await until(
    () =>
      h.app.store.db
        .prepare(
          "SELECT count(*) n FROM entries WHERE body='Later valid capture'",
        )
        .get().n === 1,
  );
  assert.equal(
    h.app.store.db.prepare("SELECT count(*) n FROM entries").get().n,
    1,
  );
});

test("settings can create a real recovery snapshot and download a credential-free content export", async (t) => {
  const h = await screen(t);
  await seed(h);
  await h.page.goto(h.origin + "/settings");
  await h.page
    .getByRole("button", { name: "Create recovery snapshot", exact: false })
    .click();
  await until(
    () =>
      h.app.store.db.prepare("SELECT count(*) n FROM entries").get().n === 1 &&
      h.page
        .getByText("No snapshot yet", { exact: true })
        .count()
        .then((n) => n === 0),
  );
  const got = h.page.waitForEvent("download");
  await h.page
    .getByRole("link", {
      name: "Download notes & source metadata (JSON)",
      exact: true,
    })
    .click();
  const file = await got;
  const data = JSON.parse(readFileSync(await file.path(), "utf8"));
  assert.equal(data.tables.entries.length, 1);
  assert.equal(data.tables.sessions, undefined);
  assert.equal(data.tables.owner, undefined);
});
