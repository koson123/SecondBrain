import JSZip from "jszip";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/server.mjs";
import { restore } from "./restore.mjs";

const [command, input, target] = process.argv.slice(2);
if (command === "export") {
  const app = createApp();
  try {
    const snapshot = app.snapshot();
    const base = join(
      resolve(process.env.DATA_DIR || "data"),
      "snapshots",
      snapshot.id,
    );
    const manifest = JSON.parse(
      readFileSync(join(base, "manifest.json"), "utf8"),
    );
    const zip = new JSZip();
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    for (const file of Object.keys(manifest.files))
      zip.file(file, readFileSync(join(base, file)));
    const notes = app.store.db.prepare("SELECT * FROM entries").all();
    for (const e of notes)
      zip.file(
        "readable-notes/" + e.id + ".md",
        `# ${e.title}\n\n${e.body}\n\nCategory: ${e.category}\nArea: ${e.area}\n`,
      );
    const tables = ["entries", "connections", "source_refs", "layouts"];
    zip.file(
      "metadata.json",
      JSON.stringify(
        Object.fromEntries(
          tables.map((t) => [
            t,
            app.store.db.prepare("SELECT * FROM " + t).all(),
          ]),
        ),
        null,
        2,
      ),
    );
    zip.file(
      "README.txt",
      "Complete Second Brain portable snapshot. Includes readable notes, source records in the database, original import objects, and attachments. Contains private information including account credentials; store encrypted. Restore using npm run portable-import -- FILE.zip NEW_DATA_DIRECTORY.",
    );
    const dest = resolve(input || "secondbrain-portable.zip");
    writeFileSync(
      dest,
      await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }),
      { mode: 0o600 },
    );
    console.log(dest);
  } finally {
    app.store.db.close();
  }
} else if (command === "import") {
  if (!input || !target)
    throw new Error(
      "Usage: npm run portable-import -- FILE.zip NEW_DATA_DIRECTORY",
    );
  const stage = resolve(".portable-stage-" + randomUUID());
  mkdirSync(stage, { mode: 0o700 });
  try {
    const zip = await JSZip.loadAsync(readFileSync(input));
    const mf = zip.file("manifest.json");
    if (!mf || mf._data.uncompressedSize > 1024 * 1024)
      throw new Error("Invalid manifest");
    const manifest = JSON.parse(await mf.async("string"));
    writeFileSync(join(stage, "manifest.json"), JSON.stringify(manifest));
    let total = 0;
    for (const file of Object.keys(manifest.files || {})) {
      if (file !== "brain.sqlite" && !/^objects\/[a-f0-9]{64}$/.test(file))
        throw new Error("Unsafe path");
      const obj = zip.file(file);
      if (!obj) throw new Error("Missing " + file);
      total += obj._data.uncompressedSize;
      if (total > 1024 * 1024 * 1024)
        throw new Error("Expanded import exceeds 1 GB");
      if (file.startsWith("objects/"))
        mkdirSync(join(stage, "objects"), { recursive: true });
      writeFileSync(join(stage, file), await obj.async("nodebuffer"));
    }
    console.log(restore(stage, target));
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
} else throw new Error("Use export or import");
