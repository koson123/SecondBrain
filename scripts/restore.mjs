import {
  readFileSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  rmSync,
  renameSync,
  mkdtempSync,
  lstatSync,
} from "node:fs";
import { resolve, join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
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
    !manifest.files?.["brain.sqlite"] ||
    typeof manifest.files !== "object" ||
    Array.isArray(manifest.files)
  )
    throw new Error("Unsupported or incomplete manifest");
  for (const [file, digest] of Object.entries(manifest.files)) {
    if (file !== "brain.sqlite" && !/^objects\/[a-f0-9]{64}$/.test(file))
      throw new Error("Unsafe manifest path");
    if (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest))
      throw new Error("Invalid manifest checksum");
    const path = join(snapshot, file);
    if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())
      throw new Error("Backup object must be a regular file");
    if (hash(readFileSync(path)) !== digest)
      throw new Error("Checksum mismatch: " + file);
  }
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  const stage = mkdtempSync(
    join(dirname(target), "." + basename(target) + "-restore-"),
  );
  try {
    for (const file of Object.keys(manifest.files)) {
      mkdirSync(dirname(join(stage, file)), { recursive: true, mode: 0o700 });
      copyFileSync(join(snapshot, file), join(stage, file));
    }
    const db = new DatabaseSync(join(stage, "brain.sqlite"));
    try {
      if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
        throw new Error("Database integrity check failed");
      if (db.prepare("PRAGMA foreign_key_check").all().length)
        throw new Error("Database has broken references");
      if (
        db.prepare("SELECT value FROM meta WHERE key='schema'").get()?.value !==
        "1"
      )
        throw new Error("Unsupported database schema");
      const required = [
        ...db
          .prepare("SELECT hash FROM attachments")
          .all()
          .map((a) => a.hash),
        ...db
          .prepare("SELECT original FROM imports")
          .all()
          .map((i) => i.original),
      ];
      for (const digest of required)
        if (!manifest.files["objects/" + digest])
          throw new Error(
            "Manifest omits a referenced attachment or import object: " +
              digest,
          );
      db.exec("DELETE FROM sessions; PRAGMA wal_checkpoint(TRUNCATE);");
    } finally {
      db.close();
    }
    if (existsSync(target))
      throw new Error(
        "Restore target was created by another process; refusing to overwrite it",
      );
    renameSync(stage, target);
    return target;
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (!process.argv[2] || !process.argv[3])
      throw new Error(
        "Usage: npm run restore -- SNAPSHOT_DIRECTORY NEW_DATA_DIRECTORY",
      );
    console.log(
      "Verified and restored to " + restore(process.argv[2], process.argv[3]),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
