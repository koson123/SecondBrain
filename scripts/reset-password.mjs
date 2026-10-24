import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync } from "node:crypto";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
const file = join(resolve(process.env.DATA_DIR || "data"), "brain.sqlite");
if (!existsSync(file)) throw new Error("Database not found. Check DATA_DIR.");
console.error(
  "Stop the application first. Enter a new owner password (12–256 characters), then EOF:",
);
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (input.length > 300) throw new Error("Password too long");
}
const password = input.trimEnd();
if (password.length < 12 || password.length > 256)
  throw new Error("Password must be 12–256 characters");
const db = new DatabaseSync(file);
try {
  const salt = randomBytes(32).toString("hex");
  const result = db
    .prepare("UPDATE owner SET hash=?,salt=? WHERE id=1")
    .run(scryptSync(password, salt, 64).toString("hex"), salt);
  if (!result.changes)
    throw new Error("Owner not configured; use first-run setup instead.");
  db.exec("DELETE FROM sessions");
  console.log("Owner password replaced; sessions revoked.");
} finally {
  db.close();
}
