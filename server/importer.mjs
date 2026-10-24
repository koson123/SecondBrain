import JSZip from "jszip";
import { createHash } from "node:crypto";

export const hash = (value) => createHash("sha256").update(value).digest("hex");
const MAX = 100 * 1024 * 1024;
export async function parseExport(buffer, name = "conversations.json") {
  if (buffer.length > MAX)
    throw new Error(
      "Export exceeds the 100 MB upload limit. Upload conversations.json separately.",
    );
  let json = buffer.toString("utf8");
  let attachments = [];
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) {
    const zip = await JSZip.loadAsync(buffer, { checkCRC32: false });
    const files = Object.values(zip.files).filter((f) => !f.dir);
    if (files.length > 20000) throw new Error("ZIP contains too many files.");
    const candidates = files.filter((f) =>
      /(^|\/)conversations\.json$/.test(f.name),
    );
    if (candidates.length !== 1)
      throw new Error("ZIP must contain exactly one conversations.json.");
    const file = candidates[0];
    if (file._data.uncompressedSize > MAX)
      throw new Error("Expanded conversations.json exceeds 100 MB.");
    json = await file.async("string");
    if (Buffer.byteLength(json) > MAX)
      throw new Error("Expanded conversations.json exceeds 100 MB.");
    attachments = files.filter((f) => f !== file).map((f) => f.name);
  }
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new Error(
      "This is not valid JSON. Choose the original ZIP or conversations.json.",
    );
  }
  const conversations = Array.isArray(raw) ? raw : raw?.conversations;
  if (!Array.isArray(conversations) || !conversations.length)
    throw new Error(
      "No conversations found. Expected a ChatGPT conversations array.",
    );
  if (conversations.length > 15000)
    throw new Error(
      "More than 15,000 conversations; split the JSON before importing.",
    );
  const seen = new Set();
  const items = conversations.map((c, index) => {
    if (
      !c ||
      typeof c !== "object" ||
      !c.mapping ||
      Array.isArray(c.mapping) ||
      typeof c.mapping !== "object"
    )
      throw new Error(
        `Conversation ${index + 1} has an unsupported structure (missing mapping).`,
      );
    const sourceId = String(c.id || c.conversation_id || "");
    if (!sourceId || seen.has(sourceId))
      throw new Error(
        `Conversation ${index + 1} has a missing or duplicate ID.`,
      );
    seen.add(sourceId);
    const nodes = Object.entries(c.mapping);
    if (nodes.length > 100000)
      throw new Error("A conversation has too many message nodes.");
    const messages = nodes
      .filter(([, n]) => n?.message)
      .map(([id, n]) => {
        const m = n.message;
        const parts = Array.isArray(m.content?.parts) ? m.content.parts : [];
        const text = parts
          .map((p) =>
            typeof p === "string"
              ? p
              : "[Non-text content — see original export]",
          )
          .join("\n");
        return {
          id,
          parent: n.parent || null,
          children: n.children || [],
          role: String(m.author?.role || "unknown"),
          text: text || m.content?.text || "[Non-text message]",
          created: m.create_time || null,
        };
      });
    const canonical = JSON.stringify(c);
    return {
      sourceId,
      title: String(c.title || "Untitled conversation").slice(0, 300),
      raw: c,
      messages,
      digest: hash(canonical),
      text: messages.map((m) => `${m.role}: ${m.text}`).join("\n\n"),
      currentNode: c.current_node || null,
      created: c.create_time || null,
    };
  });
  return {
    items,
    digest: hash(buffer),
    name: name.slice(0, 200),
    attachments,
    warnings: [
      "Imported conversations are source material, not confirmed decisions. All branches are preserved.",
      ...(attachments.length
        ? [
            "ZIP contents are preserved in the original download. Embedded media is not extracted or rendered in this version.",
          ]
        : ["JSON imports do not include attachment bytes."]),
    ],
  };
}
