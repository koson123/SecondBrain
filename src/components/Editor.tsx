import React, { useState, useEffect, useRef } from "react";
import {
  Plus,
  ArrowUpRight,
  X,
  Check,
  Download,
  RefreshCw,
  Trash2,
  Link as LinkIcon,
  ChevronRight,
  FileText,
  Paperclip,
} from "lucide-react";
import { CATS, AREA, today, date, Icon, download } from "../shared";
import { api, send, type Entry, type Connection } from "../api";
import { useDialogFocus } from "./Dialog";
const contentFields = [
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
  "deleted",
  "snooze",
  "hidden",
];
const sameContent = (a: Entry, b: Entry) =>
  contentFields.every((key) => (a as any)[key] === (b as any)[key]);
export function Editor({
  initial,
  onClose,
  onChange,
  onOpen,
  connections,
}: any) {
  const [entry, setEntry] = useState<Entry>(() => {
      try {
        const draft = JSON.parse(
          localStorage.getItem("brain-draft-" + initial.id) || "null",
        );
        if (
          draft &&
          draft.id === initial.id &&
          typeof draft.body === "string" &&
          typeof draft.title === "string" &&
          Number.isSafeInteger(draft.revision)
        ) {
          const merged = { ...initial, ...draft };
          return sameContent(merged, initial) ? initial : merged;
        }
        return initial;
      } catch {
        return initial;
      }
    }),
    [saved, setSaved] = useState<Entry>(initial),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [source, setSource] = useState<any>(null),
    [history, setHistory] = useState<any[]>([]),
    [showHistory, setShowHistory] = useState(false),
    [attachments, setAttachments] = useState<any[]>([]),
    [relatedOptions, setRelatedOptions] = useState<Entry[]>([]),
    [target, setTarget] = useState(""),
    [relation, setRelation] = useState("related"),
    [references, setReferences] = useState<any[]>([]),
    [ownConnections, setOwnConnections] = useState<Connection[] | null>(null),
    [tab, setTab] = useState(initial.openSource ? "source" : "note"),
    [saving, setSaving] = useState(false),
    [saveBlocked, setSaveBlocked] = useState(false);
  const latest = useRef(entry),
    acknowledged = useRef(saved),
    savingRef = useRef(false),
    mounted = useRef(true),
    deviceDraft = useRef(true);
  latest.current = entry;
  acknowledged.current = saved;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const dirty = !sameContent(entry, saved);
  const localKey = "brain-draft-" + entry.id;
  useEffect(() => {
    let cancelled = false;
    const requests = [
      api("/entries/" + entry.id + "/source"),
      api("/entries/" + entry.id + "/attachments"),
      api("/entries/" + entry.id + "/references"),
      api("/entries?limit=100"),
      api("/connections?entry=" + encodeURIComponent(entry.id)),
    ];
    Promise.allSettled(requests).then((results) => {
      if (cancelled) return;
      const setters = [
        setSource,
        setAttachments,
        setReferences,
        (value: any) =>
          setRelatedOptions(
            value.entries.filter((e: Entry) => e.id !== entry.id),
          ),
        setOwnConnections,
      ];
      results.forEach((result, i) => {
        if (result.status === "fulfilled") setters[i](result.value);
        else
          setError(
            "Could not load related information: " + result.reason.message,
          );
      });
    });
    return () => {
      cancelled = true;
    };
  }, [entry.id]);
  const change = (patch: Partial<Entry>) => {
    const next = { ...entry, ...patch };
    latest.current = next;
    setEntry(next);
    try {
      localStorage.setItem(localKey, JSON.stringify(next));
      deviceDraft.current = true;
      setStatus("Draft saved on this device");
    } catch {
      deviceDraft.current = false;
      setError(
        "Device storage is full. Keep this window open and save to the server.",
      );
    }
  };
  async function save() {
    if (savingRef.current) return;
    const sent = latest.current;
    if (sameContent(sent, acknowledged.current)) return;
    savingRef.current = true;
    setSaving(true);
    setSaveBlocked(false);
    try {
      const next = await send("/entries/" + sent.id, sent, "PATCH");
      const current = latest.current;
      const merged =
        sameContent(current, sent) && current.revision === sent.revision
          ? next
          : { ...current, revision: next.revision, updated: next.updated };
      latest.current = merged;
      acknowledged.current = next;
      if (!sameContent(merged, next)) {
        localStorage.setItem(localKey, JSON.stringify(merged));
        deviceDraft.current = true;
      } else localStorage.removeItem(localKey);
      if (mounted.current) {
        setSaved(next);
        setEntry(merged);
        setError("");
        setStatus(
          sameContent(merged, next)
            ? "Saved to server"
            : "Newer changes saved on this device",
        );
        try {
          await onChange(next);
        } catch (error: any) {
          if (mounted.current)
            setError(
              "Note saved, but the list could not refresh: " + error.message,
            );
        }
      }
    } catch (error: any) {
      if (mounted.current) {
        setError(error.message);
        setSaveBlocked(true);
        setStatus(
          error.status === 409
            ? "Conflict — draft preserved"
            : "Save failed — draft preserved",
        );
      }
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  useEffect(() => {
    if (!dirty || saving || saveBlocked) return;
    const timer = setTimeout(save, 1600);
    return () => clearTimeout(timer);
  }, [entry, saving, saveBlocked]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const close = () => {
    if (
      dirty &&
      !confirm(
        deviceDraft.current
          ? "Your draft is saved on this device. Close without uploading it yet?"
          : "This draft is only in this window because device storage failed. Close and discard it?",
      )
    )
      return;
    onClose();
  };
  const dialogRef = useDialogFocus(close);
  const related = (ownConnections || connections).filter(
    (l: Connection) => l.fromId === entry.id || l.toId === entry.id,
  );
  async function extract(messageId: string) {
    try {
      const e = await send("/extract", {
        sourceId: source.id,
        messageId,
        category: "Ideas",
        title: "Idea from " + entry.title,
      });
      if (mounted.current) onOpen(e);
    } catch (e: any) {
      setError(e.message);
    }
  }
  return (
    <div className="editor-scrim">
      <aside
        className="editor"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Edit thought"
      >
        <div className="editor-top">
          <span>
            <Icon name={entry.category} size={16} />
            {entry.type === "journal" ? "Life areas / Journal" : entry.category}
          </span>
          <button
            className="icon-button"
            aria-label="Close entry"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        <div className="editor-content">
          <div className="entry-tabs">
            <button
              className={tab === "note" ? "chosen" : ""}
              onClick={() => setTab("note")}
            >
              Your note
            </button>
            {source && (
              <button
                className={tab === "source" ? "chosen" : ""}
                onClick={() => setTab("source")}
              >
                Original conversation
              </button>
            )}
          </div>
          <input
            className="title-input"
            aria-label="Title"
            value={entry.title}
            onChange={(e) => change({ title: e.target.value })}
          />
          <div className="save-status" role="status">
            {saving
              ? "Saving…"
              : status ||
                (dirty ? "Recovered local draft" : "Saved to server")}{" "}
            · {date(entry.created)}
          </div>
          {error && (
            <div className="notice error" role="alert">
              {error}
              <div>
                <button onClick={() => download(entry, "preserved-draft.json")}>
                  Download draft
                </button>
                <button
                  onClick={async () => {
                    try {
                      const copy = await send("/entries", {
                        ...entry,
                        id: crypto.randomUUID(),
                        deleted: 0,
                        title: entry.title + " (conflict copy)",
                      });
                      localStorage.removeItem(localKey);
                      onOpen(copy);
                    } catch (e: any) {
                      setError(e.message);
                    }
                  }}
                >
                  Save as a copy
                </button>
                <button
                  onClick={async () => {
                    try {
                      const current = await api("/entries/" + entry.id);
                      download(latest.current, "preserved-draft.json");
                      localStorage.removeItem(localKey);
                      latest.current = current;
                      acknowledged.current = current;
                      setEntry(current);
                      setSaved(current);
                      setError("");
                      setSaveBlocked(false);
                    } catch (error: any) {
                      setError(error.message);
                    }
                  }}
                >
                  Download draft & reload latest
                </button>
              </div>
            </div>
          )}
          {tab === "source" && source ? (
            <Transcript
              source={source}
              onExtract={extract}
              initialMessage={initial.sourceMessage}
            />
          ) : (
            <>
              <div className="field-row">
                <label>
                  Keep in
                  <select
                    aria-label="Keep in"
                    value={entry.category}
                    onChange={(e) =>
                      change({
                        category: e.target.value,
                        type:
                          e.target.value === "Projects"
                            ? "project"
                            : entry.type === "project"
                              ? "note"
                              : entry.type,
                      })
                    }
                  >
                    {(entry.type === "journal"
                      ? ["Life areas", "Archive"]
                      : CATS
                    ).map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                {entry.category === "Life areas" && (
                  <label>
                    Life area
                    <select
                      aria-label="Life area"
                      value={entry.area}
                      onChange={(e) =>
                        change({
                          area: e.target.value,
                          type:
                            e.target.value === "Journal" ? "journal" : "note",
                          date: e.target.value === "Journal" ? today() : "",
                        })
                      }
                    >
                      <option value="">General</option>
                      {AREA.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {entry.type === "journal" && (
                <label>
                  Entry date
                  <input
                    type="date"
                    value={entry.date}
                    onChange={(e) => change({ date: e.target.value })}
                  />
                  <small>
                    Private to Journal; excluded from rediscovery and the broad
                    graph.
                  </small>
                </label>
              )}
              {entry.type === "project" && (
                <div className="project-fields">
                  <label>
                    Desired outcome
                    <input
                      aria-label="Desired outcome"
                      value={entry.goal}
                      onChange={(e) => change({ goal: e.target.value })}
                    />
                  </label>
                  <label>
                    Where I stopped
                    <textarea
                      aria-label="Where I stopped"
                      value={entry.handoff}
                      onChange={(e) => change({ handoff: e.target.value })}
                    />
                  </label>
                  <label>
                    Next small step
                    <input
                      aria-label="Next small step"
                      value={entry.nextAction}
                      onChange={(e) => change({ nextAction: e.target.value })}
                    />
                  </label>
                  <label>
                    Status
                    <select
                      aria-label="Status"
                      value={entry.status}
                      onChange={(e) => change({ status: e.target.value })}
                    >
                      {["planned", "active", "paused", "completed"].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
              <label className="body-label">
                {entry.type === "journal"
                  ? "What do you want to remember?"
                  : "Your thoughts"}
                <textarea
                  className="body-editor"
                  aria-label={
                    entry.type === "journal"
                      ? "What do you want to remember?"
                      : "Your thoughts"
                  }
                  placeholder={
                    entry.type === "journal"
                      ? "What happened? What is on my mind? One sentence is enough."
                      : "Start anywhere. It doesn’t need to be polished."
                  }
                  value={entry.body}
                  onChange={(e) => change({ body: e.target.value })}
                />
              </label>
              {references.length > 0 && (
                <section className="editor-section">
                  <h3>Where this came from</h3>
                  {references.map((r: any) => (
                    <button
                      className="related-row"
                      key={r.messageId}
                      onClick={async () => {
                        try {
                          const original = await api(
                            "/entries/" + r.sourceEntryId,
                          );
                          if (mounted.current)
                            onOpen({
                              ...original,
                              openSource: true,
                              sourceMessage: r.messageId,
                            });
                        } catch (e: any) {
                          if (mounted.current) setError(e.message);
                        }
                      }}
                    >
                      <FileText size={16} /> Original conversation · message{" "}
                      {r.messageId.slice(0, 10)}
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
                </section>
              )}
              <section className="editor-section">
                <h3>
                  <LinkIcon size={16} /> Connected thoughts
                </h3>
                {related.map((l: Connection) => {
                  const id = l.fromId === entry.id ? l.toId : l.fromId;
                  return (
                    <div className="related-row" key={l.id}>
                      <button
                        onClick={async () =>
                          onOpen(await api("/entries/" + id))
                        }
                      >
                        {relatedOptions.find((e) => e.id === id)?.title ||
                          "Connected thought"}{" "}
                        <small>{l.label}</small>
                      </button>
                      <button
                        aria-label="Remove connection"
                        onClick={async () => {
                          try {
                            await api("/connections/" + l.id, {
                              method: "DELETE",
                            });
                            setOwnConnections(
                              await api(
                                "/connections?entry=" +
                                  encodeURIComponent(entry.id),
                              ),
                            );
                            if (mounted.current) await onChange(saved);
                          } catch (error: any) {
                            setError(error.message);
                          }
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  );
                })}
                <div className="connect-form">
                  <select
                    aria-label="Related thought"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    <option value="">Choose a thought…</option>
                    {relatedOptions.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.title}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Relationship"
                    value={relation}
                    onChange={(e) => setRelation(e.target.value)}
                  >
                    {[
                      "related",
                      "part of",
                      "inspired by",
                      "depends on",
                      "replaces",
                    ].map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                  <button
                    disabled={!target}
                    aria-label="Add connection"
                    onClick={async () => {
                      try {
                        await send("/connections", {
                          fromId: entry.id,
                          toId: target,
                          label: relation,
                        });
                        setTarget("");
                        setOwnConnections(
                          await api(
                            "/connections?entry=" +
                              encodeURIComponent(entry.id),
                          ),
                        );
                        await onChange(saved);
                      } catch (e: any) {
                        setError(e.message);
                      }
                    }}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </section>
              <section className="editor-section">
                <h3>
                  <Paperclip size={16} /> Attachments
                </h3>
                {attachments.map((a) => (
                  <a
                    className="attachment"
                    key={a.id}
                    href={"/api/attachments/" + a.id}
                  >
                    {a.name}
                    <Download size={14} />
                  </a>
                ))}
                <label className="upload-small">
                  Attach a file (up to 20 MB)
                  <input
                    type="file"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      try {
                        await api("/entries/" + entry.id + "/attachments", {
                          method: "POST",
                          headers: {
                            "Content-Type":
                              f.type || "application/octet-stream",
                            "X-File-Name": encodeURIComponent(f.name),
                          },
                          body: f,
                        });
                        setAttachments(
                          await api("/entries/" + entry.id + "/attachments"),
                        );
                      } catch (e: any) {
                        setError(e.message);
                      }
                    }}
                  />
                </label>
              </section>
              <section className="editor-section">
                <button
                  className="text-button"
                  onClick={async () => {
                    try {
                      setHistory(
                        await api("/entries/" + entry.id + "/history"),
                      );
                      setShowHistory(!showHistory);
                    } catch (error: any) {
                      setError(error.message);
                    }
                  }}
                >
                  Version history <ChevronRight size={15} />
                </button>
                {showHistory &&
                  history.map((h: any) => (
                    <div className="history-row" key={h.revision}>
                      <span>
                        Version {h.revision} · {date(h.created)}
                      </span>
                      <button
                        onClick={() => {
                          const old = JSON.parse(h.snapshot);
                          change({ ...old, revision: entry.revision });
                          setShowHistory(false);
                        }}
                      >
                        Restore as a new revision
                      </button>
                    </div>
                  ))}
              </section>
            </>
          )}
        </div>
        <div className="editor-bottom">
          <button
            className="icon-button"
            aria-label={entry.deleted ? "Restore from trash" : "Move to trash"}
            onClick={() => change({ deleted: entry.deleted ? 0 : 1 })}
          >
            {entry.deleted ? <RefreshCw size={17} /> : <Trash2 size={17} />}
          </button>
          <button
            aria-label="Download note"
            onClick={() => download(entry, "thought.json")}
          >
            <Download size={15} />
          </button>
          <button
            className="primary"
            disabled={saving || !dirty}
            onClick={save}
          >
            {saving ? "Saving…" : "Save changes"}
            <Check size={16} />
          </button>
        </div>
      </aside>
    </div>
  );
}

function Transcript({ source, onExtract, initialMessage }: any) {
  const raw = source.raw;
  const mapping = raw.mapping || {};
  const currentNode =
    typeof raw.current_node === "string" && mapping[raw.current_node]
      ? raw.current_node
      : null;
  const [branch, setBranch] = useState(
    initialMessage || currentNode || Object.keys(mapping).at(-1),
  );
  const leaves = Object.keys(mapping).filter(
    (id) => !mapping[id]?.children?.length,
  );
  const active: any[] = [];
  let cursor = branch;
  const seen = new Set();
  while (cursor && mapping[cursor] && !seen.has(cursor)) {
    seen.add(cursor);
    const node = mapping[cursor];
    if (node.message) active.unshift({ ...node.message, id: cursor });
    cursor = node.parent;
  }
  return (
    <section className="transcript">
      <div className="notice">
        Original source material. Assistant responses are suggestions, not
        confirmed decisions.
      </div>
      <label>
        Conversation branch
        <select
          aria-label="Conversation branch"
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
        >
          {Array.from(new Set([initialMessage, currentNode, ...leaves]))
            .filter(Boolean)
            .map((id: any, i) => (
              <option key={id} value={id}>
                {id === currentNode
                  ? "Current branch"
                  : id === initialMessage
                    ? "Referenced message"
                    : "Alternative " + (i + 1)}{" "}
                · {id.slice(0, 8)}
              </option>
            ))}
        </select>
      </label>
      {active.map((m) => (
        <article className={"message " + m.author?.role} key={m.id}>
          <div className="message-head">
            <strong>{String(m.author?.role || "unknown")}</strong>
            <button onClick={() => onExtract(m.id)}>
              Keep as an idea <Plus size={13} />
            </button>
          </div>
          <div className="message-text">
            {(Array.isArray(m.content?.parts)
              ? m.content.parts
              : [
                  typeof m.content?.text === "string"
                    ? m.content.text
                    : "[Non-text content]",
                ]
            ).map((p: any, i: number) => (
              <React.Fragment key={i}>
                {typeof p === "string"
                  ? p
                  : typeof p?.text === "string"
                    ? p.text
                    : "[Non-text content — preserved in original export]"}
                {"\n"}
              </React.Fragment>
            ))}
          </div>
        </article>
      ))}
      <small>
        All source nodes remain preserved, including branches not currently
        displayed.
      </small>
    </section>
  );
}
