import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  existsSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { openStore } from "../server/store.mjs";
import { harness } from "./helpers/harness.mjs";
const cwd = new URL("..", import.meta.url);
function temp(t) {
  const dir = mkdtempSync(join(tmpdir(), "brain-operation-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function run(script, args = [], env = {}, input) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    env: { ...process.env, ...env },
    input,
    encoding: "utf8",
    timeout: 15000,
  });
}
test("restore CLI accepts paths with spaces and clears sessions in the restored copy", async (t) => {
  const h = await harness(t);
  await h.login();
  const snapshot = h.app.snapshot();
  const target = join(h.dir, "restored with spaces");
  const result = run("scripts/restore.mjs", [
    join(h.dir, "snapshots", snapshot.id),
    target,
  ]);
  assert.equal(result.status, 0, result.stderr);
  const db = openStore(target);
  try {
    assert.equal(db.db.prepare("SELECT count(*) n FROM sessions").get().n, 0);
  } finally {
    db.db.close();
  }
  assert.ok(
    h.app.store.db.prepare("SELECT count(*) n FROM sessions").get().n > 0,
  );
});
test("restore CLI fails on missing arguments and missing snapshots", (t) => {
  assert.notEqual(run("scripts/restore.mjs").status, 0);
  assert.notEqual(
    run("scripts/restore.mjs", ["/not-a-real-snapshot", "/not-a-real-target"])
      .status,
    0,
  );
});
test("password reset preserves notes, changes authentication hash and revokes sessions", async (t) => {
  const h = await harness(t);
  await h.login();
  const e = h.app.store.create({ title: "Preserved during reset" });
  const before = h.app.store.db.prepare("SELECT hash FROM owner").get().hash;
  const result = run(
    "scripts/reset-password.mjs",
    [],
    { DATA_DIR: h.dir },
    "new synthetic password\n",
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(h.app.store.get(e.id).title, "Preserved during reset");
  assert.notEqual(
    h.app.store.db.prepare("SELECT hash FROM owner").get().hash,
    before,
  );
  assert.equal(
    h.app.store.db.prepare("SELECT count(*) n FROM sessions").get().n,
    0,
  );
  assert.equal(
    (await h.post("/login", { password: "new synthetic password" })).status,
    200,
  );
});
test("short password reset fails without changing the owner hash", async (t) => {
  const h = await harness(t);
  await h.login();
  const before = h.app.store.db.prepare("SELECT hash FROM owner").get().hash;
  assert.notEqual(
    run("scripts/reset-password.mjs", [], { DATA_DIR: h.dir }, "short\n")
      .status,
    0,
  );
  assert.equal(
    h.app.store.db.prepare("SELECT hash FROM owner").get().hash,
    before,
  );
});
test("failed portable imports clean temporary staging and never create a target", (t) => {
  const dir = temp(t);
  const file = join(dir, "bad.zip");
  writeFileSync(file, "not a zip");
  const before = readdirSync(resolve(".")).filter((f) =>
    f.startsWith(".portable-stage-"),
  );
  const target = join(dir, "target");
  const result = run("scripts/portable.mjs", ["import", file, target]);
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(target), false);
  assert.deepEqual(
    readdirSync(resolve(".")).filter((f) => f.startsWith(".portable-stage-")),
    before,
  );
});
for (const failure of [false, true])
  test(
    "backup runner " +
      (failure
        ? "does not record a failed repository job as successful"
        : "records verified repository success and preserves its snapshot"),
    { skip: process.platform === "win32" },
    (t) => {
      const dir = temp(t),
        bin = join(dir, "bin"),
        data = join(dir, "data with spaces"),
        log = join(dir, "restic-calls");
      mkdirSync(bin);
      mkdirSync(data);
      writeFileSync(
        join(bin, "restic"),
        '#!/bin/sh\nprintf "%s\\n" "$*" >> "$SYNTHETIC_RESTIC_LOG"\n' +
          (failure ? "exit 2\n" : "exit 0\n"),
        { mode: 0o700 },
      );
      const result = spawnSync("sh", ["scripts/backup.sh"], {
        cwd,
        env: {
          ...process.env,
          PATH: bin + ":" + process.env.PATH,
          DATA_DIR: data,
          RESTIC_REPOSITORY: join(dir, "fake repository"),
          RESTIC_PASSWORD_FILE: join(dir, "fake key"),
          BACKUP_KIND: "offsite",
          SYNTHETIC_RESTIC_LOG: log,
        },
        encoding: "utf8",
        timeout: 15000,
      });
      const status = JSON.parse(
        readFileSync(join(data, "backup-status.json"), "utf8"),
      );
      if (failure) {
        assert.notEqual(result.status, 0);
        assert.equal(status.lastOffsite, undefined);
      } else {
        assert.equal(result.status, 0, result.stderr);
        assert.ok(status.lastOffsite);
        assert.match(readFileSync(log, "utf8"), /^backup /);
        assert.match(readFileSync(log, "utf8"), /\ncheck\n/);
        assert.doesNotMatch(readFileSync(log, "utf8"), /forget/);
      }
      assert.ok(readdirSync(join(data, "snapshots")).length > 0);
    },
  );
