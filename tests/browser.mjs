import { chromium } from "playwright";
import { mkdtempSync, rmSync } from "node:fs";
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
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(origin);
  await page.getByLabel("Server setup token").fill("synthetic-test-token");
  await page
    .getByLabel("Choose a password")
    .fill("a synthetic browser password");
  await page.getByRole("button", { name: "Create my space" }).click();
  await page.getByRole("heading", { name: /A little less/ }).waitFor();
  await page.getByLabel("Quick capture").fill("A captured browser thought");
  await page.getByRole("button", { name: "Capture thought" }).click();
  await page
    .getByRole("button", { name: /A captured browser thought/ })
    .waitFor();
  await page.getByRole("button", { name: "Life areas", exact: true }).click();
  await page.getByRole("button", { name: /Journal Your days/ }).click();
  await page.getByRole("button", { name: "Write today", exact: true }).click();
  await page
    .getByLabel("What do you want to remember?")
    .fill("Private journal sentinel");
  await page.getByLabel("Title", { exact: true }).fill("Private journal title");
  await page.getByText("Saved to server", { exact: false }).waitFor();
  await page.waitForTimeout(1900);
  await page.getByRole("button", { name: "Close entry" }).click();
  await page.getByRole("button", { name: /second brain/ }).click();
  await page.getByRole("heading", { name: /A little less/ }).waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: "Private journal title", exact: true })
      .count(),
    0,
  );
  await page
    .getByRole("button", { name: "Import conversations", exact: true })
    .click();
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
  await page.getByRole("button", { name: /Browser import example/ }).click();
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
  await page.getByRole("button", { name: "Close entry" }).click();
  await page.getByRole("button", { name: "Ideas", exact: true }).click();
  await page.getByRole("heading", { name: /Idea from/ }).waitFor();
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await page.locator(".thought-node").first().waitFor();
  assert.equal(await page.locator(".thought-node").count(), 2);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.getByRole("button", { name: /second brain/ }).click();
  await page.getByRole("heading", { name: /A little less/ }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: /A little less/ }).waitFor();
  // The production service worker must control the page before testing offline reload.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.getByRole("heading", { name: /A little less/ }).waitFor();
  await page.context().setOffline(true);
  await page.reload();
  await page.getByRole("heading", { name: "Keep the thought." }).waitFor();
  await page
    .getByLabel("What’s on your mind?", { exact: true })
    .fill("Saved offline, recovered online");
  await page
    .getByRole("button", { name: "Save on this device", exact: false })
    .click();
  await page.getByText("1 pending capture(s).", { exact: false }).waitFor();
  await page.context().setOffline(false);
  await page.reload();
  await page.getByRole("heading", { name: /A little less/ }).waitFor();
  await page
    .getByRole("button", { name: /Saved offline, recovered online/ })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Browser flows passed: setup, capture, Journal privacy, import, source extraction, graph, mobile overflow, session reload, offline capture and reconnect.",
  );
} finally {
  await browser?.close();
  await new Promise((r) => app.server.close(r));
  rmSync(dir, { recursive: true, force: true });
}
