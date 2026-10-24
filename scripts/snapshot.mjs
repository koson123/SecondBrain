import { createApp } from "../server/server.mjs";
import { resolve } from "node:path";
const app = createApp();
try {
  const result = app.snapshot();
  console.log(resolve(process.env.DATA_DIR || "data", "snapshots", result.id));
} finally {
  app.store.db.close();
}
