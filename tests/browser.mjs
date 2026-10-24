import { chromium } from "playwright";
import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import assert from "node:assert/strict";
import { createApp } from "../server/server.mjs";

const dir = mkdtempSync(join(tmpdir(), "brain-browser-"));
const app = createApp({
  dir,
  setupToken: "synthetic-test-token",
  secure: false,
});
app.server.listen(0, "127.0.0.1");
await once(app.server, "listening");
const origin = "http://127.0.0.1:" + app.server.address().port;
let browser;
try {
  browser = await chromium.launch({
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
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(10000);
  const screenDir = process.env.BRAIN_SCREENSHOTS;
  if (screenDir) mkdirSync(screenDir, { recursive: true });
  const screen = async (name) => {
    if (screenDir)
      await page.screenshot({
        path: join(screenDir, name + ".png"),
        fullPage: true,
      });
  };

  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByLabel("Server setup token").fill("synthetic-test-token");
  await page
    .getByLabel("Choose a password")
    .fill("a synthetic browser password");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByRole("heading", { name: "Desk", exact: true }).waitFor();
  await page
    .getByRole("link", { name: "Projects", exact: true })
    .first()
    .click();
  assert.equal(new URL(page.url()).pathname, "/projects");
  await page.reload();
  await page.getByRole("heading", { name: "Projects", exact: true }).waitFor();
  await page.getByRole("link", { name: "Ideas", exact: true }).first().click();
  assert.equal(new URL(page.url()).pathname, "/ideas");
  await page.goBack();
  await page.getByRole("heading", { name: "Projects", exact: true }).waitFor();
  await page.goForward();
  await page.getByRole("heading", { name: "Ideas", exact: true }).waitFor();
  await page.getByRole("link", { name: "Second Brain home" }).click();
  await page.getByLabel("Quick capture").fill("A captured browser thought");
  await page.getByRole("button", { name: "Save to Inbox" }).click();
  await page
    .getByRole("button", { name: /A captured browser thought/ })
    .waitFor();
  await screen("desk");
  await page
    .getByRole("link", { name: "Life areas", exact: true })
    .first()
    .click();
  await page.getByRole("link", { name: /Journal Days/ }).click();
  await page.getByRole("button", { name: "Write today", exact: true }).click();
  await page
    .getByLabel("What do you want to remember?")
    .fill("Private journal sentinel");
  await page.getByLabel("Title", { exact: true }).fill("Private journal title");
  await page.getByText("Saved to server", { exact: false }).waitFor();
  await page.waitForTimeout(1900);
  await page.getByRole("button", { name: "Close entry" }).click();
  await page.getByRole("link", { name: "Second Brain home" }).click();
  await page.getByRole("heading", { name: "Desk", exact: true }).waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: "Private journal title", exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("link", { name: "Import conversations", exact: true })
    .click();
  assert.equal(new URL(page.url()).pathname, "/imports");
  await page.reload();
  await page
    .getByRole("heading", { name: "Import ChatGPT conversations", exact: true })
    .waitFor();
  const fixture = [
    {
      id: "browser-conv",
      title: "Browser import example",
      current_node: "answer",
      mapping: {
        question: {
          parent: null,
          children: ["answer"],
          message: {
            author: { role: "user" },
            content: { parts: ["A browser import idea"] },
          },
        },
        answer: {
          parent: "question",
          children: [],
          message: {
            author: { role: "assistant" },
            content: { parts: ["A suggested response"] },
          },
        },
      },
    },
  ];
  await page.locator("input[type=file]").setInputFiles({
    name: "conversations.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page
    .getByRole("button", { name: "Import into Inbox", exact: true })
    .click();
  await page.getByRole("button", { name: "Open Inbox", exact: true }).click();
  await page
    .getByRole("button", { name: "Open Browser import example", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Original conversation", exact: true })
    .click();
  await page.getByText("A suggested response", { exact: false }).waitFor();
  await page
    .getByRole("button", { name: "Keep as an idea", exact: true })
    .first()
    .click();
  await page.getByLabel("Title", { exact: true }).waitFor();
  assert.match(
    await page.getByLabel("Your thoughts", { exact: true }).inputValue(),
    /browser import idea/,
  );
  assert.ok(new URL(page.url()).searchParams.get("entry"));
  await page.reload();
  await page.getByLabel("Your thoughts", { exact: true }).waitFor();
  assert.match(
    await page.getByLabel("Your thoughts", { exact: true }).inputValue(),
    /browser import idea/,
  );
  await page.getByRole("button", { name: "Close entry" }).click();
  await page.getByRole("link", { name: "Ideas", exact: true }).first().click();
  await page.getByRole("heading", { name: /Idea from/ }).waitFor();
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await page.locator(".thought-node").first().waitFor();
  assert.equal(await page.locator(".thought-node").count(), 2);
  await screen("connections");
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.getByRole("link", { name: "Second Brain home" }).click();
  await page.getByRole("heading", { name: "Desk", exact: true }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "Desk", exact: true }).waitFor();
  // The production service worker must control the page before testing offline reload.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.getByRole("heading", { name: "Desk", exact: true }).waitFor();
  await screen("mobile-desk");
  await page.context().setOffline(true);
  await page.reload();
  await page.getByRole("heading", { name: "Offline capture" }).waitFor();
  await page
    .getByLabel("What’s on your mind?", { exact: true })
    .fill("Saved offline, recovered online");
  await page
    .getByRole("button", { name: "Save on this device", exact: false })
    .click();
  await page.getByText("1 pending capture(s).", { exact: false }).waitFor();
  await page.context().setOffline(false);
  await page.reload();
  await page.getByRole("heading", { name: "Desk", exact: true }).waitFor();
  await page
    .getByRole("button", { name: /Saved offline, recovered online/ })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Browser flows passed: setup, capture, Journal privacy, import, source extraction, graph, routed pages, refresh, browser back/forward, entry deep links, mobile overflow, session reload, offline capture and reconnect.",
  );
} finally {
  await browser?.close();
  await new Promise((r) => app.server.close(r));
  rmSync(dir, { recursive: true, force: true });
}
