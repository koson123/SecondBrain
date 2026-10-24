import { test } from "node:test";
import assert from "node:assert/strict";
import { win32, posix } from "node:path";
import { resolveStaticPath } from "../server/static.mjs";

test("Windows static routes accept CSS, JS, manifest, root, and encoded filenames", () => {
  const root = "C:\\Projects\\SecondBrain\\dist";
  for (const request of [
    "/",
    "/assets/index.css",
    "/assets/index.js",
    "/manifest.webmanifest",
    "/icon.svg",
  ])
    assert.equal(
      resolveStaticPath(root, request, win32),
      win32.resolve(root, "." + request),
    );
  assert.equal(
    resolveStaticPath(root, "/assets/a%20b.css", win32),
    win32.join(root, "assets", "a b.css"),
  );
});

test("POSIX static routes accept child files and both platforms reject traversal", () => {
  assert.equal(
    resolveStaticPath("/app/dist", "/assets/index.css", posix),
    "/app/dist/assets/index.css",
  );
  for (const [paths, root] of [
    [posix, "/app/dist"],
    [win32, "C:\\app\\dist"],
  ]) {
    assert.equal(resolveStaticPath(root, "/../private.txt", paths), null);
    assert.equal(resolveStaticPath(root, "/%2e%2e/private.txt", paths), null);
    assert.equal(
      resolveStaticPath(root, "/../dist-other/private.txt", paths),
      null,
    );
  }
  assert.equal(
    resolveStaticPath("C:\\app\\dist", "/..%5cprivate.txt", win32),
    null,
  );
});
