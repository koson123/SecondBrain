import { readFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hash } from "../server/importer.mjs";

export function restore(snapshot, target) {
  snapshot = resolve(snapshot);
  target = resolve(target);
  if (existsSync(target))
    throw new Error(
      "Restore target must not exist. Restore into a new directory, then switch after verification.",
    );
  const manifest = JSON.parse(
    readFileSync(join(snapshot, "manifest.json"), "utf8"),
  );
  if (
    manifest.format !== 1 ||
    manifest.schema !== 1 ||
    !manifest.files?.["brain.sqlite"]
  )
    throw new Error("Unsupported or incomplete manifest");
  for (const [file, digest] of Object.entries(manifest.files)) {
    if (file !== "brain.sqlite" && !/^objects\/[a-f0-9]{64}$/.test(file))
      throw new Error("Unsafe manifest path");
    if (hash(readFileSync(join(snapshot, file))) !== digest)
      throw new Error("Checksum mismatch: " + file);
  }
  mkdirSync(target, { recursive: true, mode: 0o700 });
  for (const file of Object.keys(manifest.files)) {
    mkdirSync(dirname(join(target, file)), { recursive: true, mode: 0o700 });
    copyFileSync(join(snapshot, file), join(target, file));
  }
  const db = new DatabaseSync(join(target, "brain.sqlite"));
  try {
    if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
      throw new Error("Database integrity check failed");
    db.exec("DELETE FROM sessions");
  } finally {
    db.close();
  }
  return target;
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    if (!process.argv[2] || !process.argv[3])
      throw new Error(
        "Usage: npm run restore -- SNAPSHOT_DIRECTORY NEW_DATA_DIRECTORY",
      );
    console.log(
      "Verified and restored to " + restore(process.argv[2], process.argv[3]),
    );
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
