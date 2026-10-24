import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

export const categories = [
  "Inbox",
  "Projects",
  "Life areas",
  "Ideas",
  "Knowledge",
  "Archive",
];
export const areas = ["Journal", "Faith", "Health", "School", "Finances"];
export function openStore(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(dir, "brain.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT OR IGNORE INTO meta VALUES ('schema','1');
    CREATE TABLE IF NOT EXISTS owner (id INTEGER PRIMARY KEY CHECK(id=1), hash TEXT NOT NULL, salt TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS entries (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', category TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'note', area TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'active', goal TEXT NOT NULL DEFAULT '', handoff TEXT NOT NULL DEFAULT '', nextAction TEXT NOT NULL DEFAULT '', date TEXT NOT NULL DEFAULT '', created TEXT NOT NULL, updated TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1, deleted INTEGER NOT NULL DEFAULT 0, snooze TEXT NOT NULL DEFAULT '', hidden INTEGER NOT NULL DEFAULT 0, sourceId TEXT);
    CREATE TABLE IF NOT EXISTS revisions (id INTEGER PRIMARY KEY, entryId TEXT NOT NULL REFERENCES entries(id), revision INTEGER NOT NULL, snapshot TEXT NOT NULL, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, fromId TEXT NOT NULL REFERENCES entries(id), toId TEXT NOT NULL REFERENCES entries(id), label TEXT NOT NULL, UNIQUE(fromId,toId,label));
    CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, sourceKey TEXT UNIQUE NOT NULL, entryId TEXT NOT NULL REFERENCES entries(id), digest TEXT NOT NULL, raw TEXT NOT NULL, text TEXT NOT NULL, updated TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS source_versions (id INTEGER PRIMARY KEY, sourceId TEXT NOT NULL, digest TEXT NOT NULL, raw TEXT NOT NULL, created TEXT NOT NULL, UNIQUE(sourceId,digest));
    CREATE TABLE IF NOT EXISTS imports (id TEXT PRIMARY KEY, digest TEXT UNIQUE NOT NULL, name TEXT NOT NULL, original TEXT NOT NULL, namespace TEXT NOT NULL, created TEXT NOT NULL, result TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, entryId TEXT NOT NULL REFERENCES entries(id), name TEXT NOT NULL, mime TEXT NOT NULL, hash TEXT NOT NULL, size INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS source_refs (entryId TEXT NOT NULL REFERENCES entries(id), sourceId TEXT NOT NULL REFERENCES sources(id), messageId TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS layouts (scope TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE VIRTUAL TABLE IF NOT EXISTS entry_fts USING fts5(id UNINDEXED,title,body);
    CREATE VIRTUAL TABLE IF NOT EXISTS source_fts USING fts5(entryId UNINDEXED,text);
    CREATE TRIGGER IF NOT EXISTS entry_ai AFTER INSERT ON entries BEGIN INSERT INTO entry_fts VALUES(new.id,new.title,new.body); END;
    CREATE TRIGGER IF NOT EXISTS entry_au AFTER UPDATE ON entries BEGIN DELETE FROM entry_fts WHERE id=old.id; INSERT INTO entry_fts VALUES(new.id,new.title,new.body); END;
    CREATE TRIGGER IF NOT EXISTS source_ai AFTER INSERT ON sources BEGIN INSERT INTO source_fts VALUES(new.entryId,new.text); END;
    CREATE TRIGGER IF NOT EXISTS source_au AFTER UPDATE ON sources BEGIN DELETE FROM source_fts WHERE entryId=old.entryId; INSERT INTO source_fts VALUES(new.entryId,new.text); END;
  `);
  const get = (id) => db.prepare("SELECT * FROM entries WHERE id=?").get(id);
  const snapshot = (e) =>
    db
      .prepare(
        "INSERT INTO revisions(entryId,revision,snapshot,created) VALUES(?,?,?,?)",
      )
      .run(e.id, e.revision, JSON.stringify(e), new Date().toISOString());
  function create(input) {
    assertObject(input);
    const id = input.id || randomUUID();
    if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(id))
      throw new Error("Invalid entry id");
    const e = validate(input);
    if (get(id)) {
      const first = db
        .prepare(
          "SELECT snapshot FROM revisions WHERE entryId=? ORDER BY id LIMIT 1",
        )
        .get(id);
      const original = first ? JSON.parse(first.snapshot) : get(id);
      if (
        Object.keys(e).some((key) => e[key] !== original[key]) ||
        (input.sourceId || null) !== (original.sourceId || null)
      )
        throw Object.assign(
          new Error(
            "This capture ID already belongs to different content. Save the new thought with a new ID.",
          ),
          { status: 409 },
        );
      return get(id);
    }
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO entries(id,title,body,category,type,area,status,goal,handoff,nextAction,date,created,updated,sourceId,deleted,snooze,hidden) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      id,
      e.title,
      e.body,
      e.category,
      e.type,
      e.area,
      e.status,
      e.goal,
      e.handoff,
      e.nextAction,
      e.date,
      now,
      now,
      input.sourceId || null,
      e.deleted,
      e.snooze,
      e.hidden,
    );
    snapshot(get(id));
    return get(id);
  }
  function update(id, input) {
    assertObject(input);
    const old = get(id);
    if (!old)
      throw Object.assign(new Error("Entry not found"), { status: 404 });
    if (input.revision !== old.revision)
      throw Object.assign(
        new Error(
          "This entry changed on another device. Your draft is preserved; reload the latest version or save a copy.",
        ),
        { status: 409, current: old },
      );
    const e = validate({ ...old, ...input });
    db.prepare(
      `UPDATE entries SET title=?,body=?,category=?,type=?,area=?,status=?,goal=?,handoff=?,nextAction=?,date=?,updated=?,revision=revision+1,deleted=?,snooze=?,hidden=? WHERE id=?`,
    ).run(
      e.title,
      e.body,
      e.category,
      e.type,
      e.area,
      e.status,
      e.goal,
      e.handoff,
      e.nextAction,
      e.date,
      new Date().toISOString(),
      e.deleted,
      e.snooze,
      e.hidden,
      id,
    );
    snapshot(get(id));
    return get(id);
  }
  return { db, get, create, update, snapshot };
}
function assertObject(input) {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Request body must be a JSON object");
}
function validate(input) {
  assertObject(input);
  const e = {};
  for (const key of [
    "title",
    "body",
    "category",
    "type",
    "area",
    "status",
    "goal",
    "handoff",
    "nextAction",
    "date",
  ]) {
    if (input[key] != null && typeof input[key] !== "string")
      throw new Error(`Invalid ${key}`);
    e[key] =
      input[key] ??
      ({ category: "Inbox", type: "note", status: "active" }[key] || "");
  }
  e.title =
    e.title.trim() ||
    e.body.trim().split("\n")[0].slice(0, 90) ||
    "Untitled thought";
  if (!categories.includes(e.category)) throw new Error("Invalid category");
  if (!["note", "idea", "project", "journal", "conversation"].includes(e.type))
    throw new Error("Invalid entry type");
  if (
    e.title.length > 300 ||
    e.body.length > 200000 ||
    [e.goal, e.handoff, e.nextAction].some((s) => s.length > 20000)
  )
    throw new Error("Entry is too large");
  if (
    !["planned", "active", "paused", "completed", "archived"].includes(e.status)
  )
    throw new Error("Invalid status");
  if (e.area && !areas.includes(e.area)) throw new Error("Invalid life area");
  if (
    e.type === "journal" ||
    (e.category === "Life areas" && e.area === "Journal")
  ) {
    e.type = "journal";
    if (e.category !== "Archive") e.category = "Life areas";
    e.area = "Journal";
  }
  if (
    e.date &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(e.date) ||
      !Number.isFinite(Date.parse(e.date + "T12:00:00Z")) ||
      new Date(e.date + "T12:00:00Z").toISOString().slice(0, 10) !== e.date)
  )
    throw new Error("Invalid date");
  for (const key of ["hidden", "deleted"]) {
    e[key] = input[key] ?? 0;
    if (e[key] !== 0 && e[key] !== 1) throw new Error("Invalid " + key);
  }
  e.snooze = input.snooze ?? "";
  if (
    typeof e.snooze !== "string" ||
    (e.snooze && !Number.isFinite(Date.parse(e.snooze)))
  )
    throw new Error("Invalid snooze date");
  return e;
}
