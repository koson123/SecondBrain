import React, { useState, useEffect, useCallback, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  applyNodeChanges,
  type NodeProps,
} from "@xyflow/react";
import {
  Home,
  Inbox,
  Layers,
  Heart,
  Lightbulb,
  BookOpen,
  Archive,
  Search,
  Plus,
  ArrowUpRight,
  ArrowLeft,
  ArrowRight,
  Upload,
  X,
  Check,
  Sun,
  Moon,
  Network,
  LayoutGrid,
  Download,
  Settings,
  Leaf,
  RefreshCw,
  Trash2,
  Link as LinkIcon,
  Shield,
  ChevronRight,
  FileText,
  BookHeart,
  LogOut,
  Paperclip,
} from "lucide-react";
import "@xyflow/react/dist/style.css";
import "./style.css";
import { api, send, type Entry, type Connection } from "./api";
import { pending, enqueue, dequeue } from "./queue";

const CATS = [
  "Inbox",
  "Projects",
  "Life areas",
  "Ideas",
  "Knowledge",
  "Archive",
];
const ICONS: any = {
  Inbox,
  Projects: Layers,
  "Life areas": Heart,
  Ideas: Lightbulb,
  Knowledge: BookOpen,
  Archive,
};
const COLORS: any = {
  Inbox: "#b9c6d0",
  Projects: "#c0baed",
  "Life areas": "#dab8a3",
  Ideas: "#ddcd93",
  Knowledge: "#a7c6b4",
  Archive: "#aeb1b6",
};
const DESC: any = {
  Inbox: "A landing place for anything on your mind.",
  Projects: "Give the things that matter a little momentum.",
  "Life areas": "Make room for the ongoing parts of life.",
  Ideas: "Possibilities, without the pressure.",
  Knowledge: "Keep what you learn within reach.",
  Archive: "Out of the way. Never out of reach.",
};
const AREA = ["Journal", "Faith", "Health", "School", "Finances"];
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const date = (s: string) =>
  new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const Icon = ({ name, ...props }: any) => {
  const I = ICONS[name] || FileText;
  return <I {...props} />;
};
function download(data: any, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function App() {
  const [session, setSession] = useState<any>(null),
    [view, setView] = useState("Home"),
    [area, setArea] = useState(""),
    [query, setQuery] = useState(""),
    [includeJournal, setIncludeJournal] = useState(false),
    [entries, setEntries] = useState<Entry[]>([]),
    [total, setTotal] = useState(0),
    [counts, setCounts] = useState<any>({}),
    [connections, setConnections] = useState<Connection[]>([]),
    [selected, setSelected] = useState<Entry | null>(null),
    [mode, setMode] = useState("cards"),
    [focus, setFocus] = useState(""),
    [capture, setCapture] = useState(""),
    [importOpen, setImportOpen] = useState(false),
    [settings, setSettings] = useState(false),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [pendingCount, setPendingCount] = useState(0),
    [theme, setTheme] = useState(localStorage.getItem("brain-theme") || "dark"),
    [rediscover, setRediscover] = useState(0),
    [busy, setBusy] = useState(false),
    [trash, setTrash] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("brain-theme", theme);
  }, [theme]);
  useEffect(() => {
    api("/session")
      .then(setSession)
      .catch((e) => setError(e.message));
  }, []);
  const scopeKey = JSON.stringify([view, area, query, includeJournal, trash]);
  const currentScope = useRef(scopeKey);
  currentScope.current = scopeKey;
  const loadGeneration = useRef(0);
  const refresh = useCallback(async () => {
    if (!session?.authenticated) return;
    const generation = ++loadGeneration.current;
    const requestedScope = scopeKey;
    const p = new URLSearchParams({
      journal: includeJournal ? "1" : "0",
      trash: trash ? "1" : "0",
      limit: "60",
    });
    if (CATS.includes(view)) p.set("category", view);
    if (area) p.set("area", area);
    if (query) p.set("q", query);
    const [data, c, l] = await Promise.all([
      api("/entries?" + p),
      api("/stats"),
      api("/connections"),
    ]);
    if (
      generation !== loadGeneration.current ||
      requestedScope !== currentScope.current
    )
      return;
    setEntries(data.entries);
    setTotal(data.total);
    setCounts(c);
    setConnections(l);
  }, [session, view, area, query, includeJournal, trash, scopeKey]);
  useEffect(() => {
    const t = setTimeout(
      () =>
        refresh().catch((e) => {
          if (e.status === 401)
            setSession({ authenticated: false, setup: false });
          else setError(e.message);
        }),
      180,
    );
    return () => clearTimeout(t);
  }, [refresh]);
  const syncing = useRef(false);
  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const rows = await pending();
      setPendingCount(rows.length);
      for (const row of rows) {
        await send("/entries", row);
        await dequeue(row.id);
      }
      setPendingCount((await pending()).length);
      if (rows.length) await refresh();
    } catch (e: any) {
      setPendingCount((await pending()).length);
      if (e.status === 401)
        setToast("Sign in to upload your pending captures.");
    } finally {
      syncing.current = false;
    }
  }, [refresh]);
  useEffect(() => {
    if (session?.authenticated) sync();
    const cb = () => sync();
    window.addEventListener("online", cb);
    return () => window.removeEventListener("online", cb);
  }, [session, sync]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 5000);
      return () => clearTimeout(t);
    }
  }, [toast]);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("search")?.focus();
      }
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, []);
  function navigate(v: string, a = "") {
    loadGeneration.current++;
    setEntries([]);
    setTotal(0);
    setIncludeJournal(false);
    setView(v);
    setArea(a);
    setQuery("");
    setFocus("");
    setTrash(false);
    setMode("cards");
  }
  async function quickCapture() {
    if (!capture.trim()) return;
    setBusy(true);
    try {
      await enqueue({
        id: crypto.randomUUID(),
        body: capture,
        title: "",
        category: "Inbox",
        type: "note",
      });
      setCapture("");
      setPendingCount((await pending()).length);
      setToast("Captured on this device.");
      await sync();
    } catch (e: any) {
      setError("Could not save this capture: " + e.message);
    } finally {
      setBusy(false);
    }
  }
  async function newEntry(type = "note") {
    try {
      const e = await send("/entries", {
        title:
          type === "journal"
            ? "Today, in my own words"
            : "Untitled " + (type === "project" ? "project" : "thought"),
        category:
          type === "journal"
            ? "Life areas"
            : CATS.includes(view)
              ? view
              : "Inbox",
        type,
        area: type === "journal" ? "Journal" : area,
        date: type === "journal" ? today() : "",
      });
      setSelected(e);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    }
  }
  const regular = entries.filter(
    (e) => e.category !== "Archive" && e.type !== "journal",
  );
  const redis = regular.filter(
    (e) =>
      e.category === "Ideas" &&
      !e.hidden &&
      (!e.snooze || e.snooze < new Date().toISOString()),
  );
  const oldIdea = redis.length ? redis[rediscover % redis.length] : undefined;
  if (!session)
    return error ? (
      <OfflineCapture />
    ) : (
      <div className="loading">
        <Leaf /> Opening your space…
      </div>
    );
  if (!session.authenticated)
    return (
      <Auth
        setup={session.setup}
        onDone={() => api("/session").then(setSession)}
      />
    );
  return (
    <div className="app">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("Home")}>
          <span className="brandmark">
            <Leaf size={23} />
          </span>
          <span>
            second brain<small>A little room to think.</small>
          </span>
        </button>
        <button
          className={"nav " + (view === "Home" ? "active" : "")}
          onClick={() => navigate("Home")}
        >
          <Home size={18} /> Overview
        </button>
        <div className="nav-label">YOUR SPACE</div>
        {CATS.map((c) => (
          <button
            key={c}
            className={"nav " + (view === c && !area ? "active" : "")}
            onClick={() => navigate(c)}
          >
            <Icon name={c} size={18} />
            {c}
            {c === "Inbox" && counts[c] > 0 && (
              <small className="count">{counts[c]}</small>
            )}
          </button>
        ))}
        <div className="sidebar-bottom">
          <button className="nav" onClick={() => setImportOpen(true)}>
            <Upload size={17} /> Import conversations
          </button>
          <button className="nav" onClick={() => setSettings(true)}>
            <Settings size={17} /> Settings & protection
          </button>
          <div className="private">
            <span className="status-dot" /> Your private space{" "}
            <Shield size={13} />
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="crumb">
            <button onClick={() => navigate("Home")}>Your space</button>
            <ChevronRight size={13} />
            {query ? "Search" : area || view}
          </div>
          <div className="searchbox">
            <Search size={16} />
            <input
              id="search"
              placeholder="Find a thought…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>⌘ K</kbd>
          </div>
          <button
            className="icon-button"
            aria-label="Toggle theme"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button
            className="primary compact"
            onClick={() =>
              newEntry(
                view === "Projects"
                  ? "project"
                  : area === "Journal"
                    ? "journal"
                    : "note",
              )
            }
          >
            <Plus size={16} /> New <span>thought</span>
          </button>
        </header>
        <main>
          {pendingCount > 0 && (
            <div className="notice">
              {pendingCount} capture(s) stored on this device, waiting to
              upload. <button onClick={sync}>Retry</button>
              <button
                onClick={async () =>
                  download(await pending(), "pending-captures.json")
                }
              >
                Download
              </button>
            </div>
          )}
          {error && (
            <div className="notice error" role="alert">
              {error}
              <button onClick={() => setError("")}>
                <X size={14} />
              </button>
            </div>
          )}
          {query ? (
            <>
              <div className="heading">
                <p className="eyebrow">FIND YOUR WAY BACK</p>
                <h1>Looking for “{query}”</h1>
                <p>
                  Search your notes and the full text of imported conversations.
                </p>
              </div>
              <label className="checkline">
                <input
                  type="checkbox"
                  checked={includeJournal}
                  onChange={(e) => setIncludeJournal(e.target.checked)}
                />{" "}
                Include Journal entries
              </label>
              <EntryGrid entries={entries} onOpen={setSelected} />
            </>
          ) : view === "Home" ? (
            <>
              <div className="heading home-heading">
                <p className="eyebrow">A PLACE FOR WHAT MATTERS</p>
                <h1>
                  A little less to hold
                  <br />
                  in your head<span>.</span>
                </h1>
                <p>
                  Catch a thought. Follow an idea. Pick up where you left off.
                </p>
                <div className="hero-orbit" aria-hidden="true">
                  <div />
                  <div />
                  <div />
                  <Leaf size={28} />
                </div>
              </div>
              <div className="capturebox">
                <div className="capture-top">
                  <span className="mini-icon">
                    <Plus size={18} />
                  </span>
                  <textarea
                    aria-label="Quick capture"
                    placeholder="What’s on your mind? No need to organize it yet."
                    value={capture}
                    onChange={(e) => setCapture(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter")
                        quickCapture();
                    }}
                  />
                </div>
                <div className="capture-bottom">
                  <span>LANDS SAFELY IN YOUR INBOX</span>
                  <button
                    className="primary"
                    disabled={!capture.trim() || busy}
                    onClick={quickCapture}
                  >
                    Capture thought <ArrowUpRight size={16} />
                  </button>
                </div>
              </div>
              <SectionHeading
                title="Find your space"
                subtitle="Different places. Connected thoughts."
              />
              <div className="category-grid">
                {CATS.map((c) => (
                  <button
                    className="category-card"
                    key={c}
                    onClick={() => navigate(c)}
                    style={{ "--accent": COLORS[c] } as any}
                  >
                    <div className="category-top">
                      <span className="category-icon">
                        <Icon name={c} size={23} />
                      </span>
                      <ArrowUpRight size={17} />
                    </div>
                    <h3>{c}</h3>
                    <p>{DESC[c]}</p>
                    <span className="category-count">
                      {counts[c] || 0}{" "}
                      {c === "Projects"
                        ? counts[c] === 1
                          ? "project"
                          : "projects"
                        : counts[c] === 1
                          ? "item"
                          : "items"}
                    </span>
                  </button>
                ))}
              </div>
              <div className="home-bottom">
                <section>
                  <SectionHeading
                    title="Pick up a thread"
                    subtitle="A few things you recently touched."
                  />
                  {regular.length ? (
                    <EntryGrid
                      entries={regular.slice(0, 3)}
                      onOpen={setSelected}
                    />
                  ) : (
                    <div className="empty small">
                      <Layers size={25} />
                      <h3>Your next chapter starts here.</h3>
                      <p>
                        Capture a thought or import a conversation. It doesn’t
                        need to be finished.
                      </p>
                      <button
                        className="text-button"
                        onClick={() => setImportOpen(true)}
                      >
                        Bring in your ChatGPT history <ArrowRight size={15} />
                      </button>
                    </div>
                  )}
                </section>
                <section>
                  <SectionHeading
                    title="A thought to return to"
                    subtitle="Something you might have forgotten."
                  />
                  {oldIdea ? (
                    <div className="rediscover">
                      <Lightbulb />
                      <h3>{oldIdea.title}</h3>
                      <p>{oldIdea.body.slice(0, 150)}</p>
                      <button
                        className="text-button"
                        onClick={() => setSelected(oldIdea)}
                      >
                        Follow this idea <ArrowUpRight size={15} />
                      </button>
                      <div className="rediscover-actions">
                        <button onClick={() => setRediscover((n) => n + 1)}>
                          Another
                        </button>
                        <button
                          onClick={async () => {
                            await send(
                              "/entries/" + oldIdea.id,
                              {
                                ...oldIdea,
                                snooze: new Date(
                                  Date.now() + 7 * 86400000,
                                ).toISOString(),
                              },
                              "PATCH",
                            );
                            refresh();
                          }}
                        >
                          Later
                        </button>
                        <button
                          onClick={async () => {
                            await send(
                              "/entries/" + oldIdea.id,
                              { ...oldIdea, hidden: 1 },
                              "PATCH",
                            );
                            refresh();
                          }}
                        >
                          Don’t resurface
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rediscover quiet">
                      <Leaf size={28} />
                      <p>A little space for serendipity.</p>
                      <small>
                        As you save ideas, a few will find their way back here.
                      </small>
                    </div>
                  )}
                </section>
              </div>
            </>
          ) : (
            <>
              <div className="heading category-heading">
                <p className="eyebrow">{area ? "LIFE AREAS" : "YOUR SPACE"}</p>
                <h1>
                  {trash ? "Trash" : area || view}
                  <span>.</span>
                </h1>
                <p>
                  {area === "Journal"
                    ? "A place to notice your life. One sentence is enough."
                    : area
                      ? "The notes and thoughts connected to " + area + "."
                      : DESC[view]}
                </p>
              </div>
              {view === "Life areas" && !area ? (
                <div className="area-grid">
                  {AREA.map((a) => (
                    <button
                      className={
                        "area-card " + (a === "Journal" ? "journal" : "")
                      }
                      key={a}
                      onClick={() => navigate("Life areas", a)}
                    >
                      {a === "Journal" ? (
                        <BookHeart size={26} />
                      ) : (
                        <Heart size={23} />
                      )}
                      <h3>{a}</h3>
                      <p>
                        {a === "Journal"
                          ? "Your days, in your own words."
                          : "An ongoing part of your life."}
                      </p>
                      <ArrowUpRight size={17} />
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="viewbar">
                <div>
                  <span>
                    {total} {area === "Journal" ? "entries" : "items"}
                  </span>
                  {area && (
                    <button
                      className="text-button"
                      onClick={() => navigate("Life areas")}
                    >
                      <ArrowLeft size={14} /> Life areas
                    </button>
                  )}
                </div>
                <div className="view-actions">
                  {view === "Archive" && (
                    <button onClick={() => setTrash(!trash)}>
                      {trash ? "Back to archive" : "Trash"}
                    </button>
                  )}
                  <button
                    className={mode === "cards" ? "chosen" : ""}
                    onClick={() => setMode("cards")}
                  >
                    <LayoutGrid size={16} /> Cards
                  </button>
                  {area !== "Journal" && !trash && (
                    <button
                      className={mode === "explore" ? "chosen" : ""}
                      onClick={() => setMode("explore")}
                    >
                      <Network size={16} /> Explore
                    </button>
                  )}
                  <button
                    className="primary"
                    onClick={() =>
                      newEntry(
                        area === "Journal"
                          ? "journal"
                          : view === "Projects"
                            ? "project"
                            : view === "Ideas"
                              ? "idea"
                              : "note",
                      )
                    }
                  >
                    <Plus size={15} />
                    {area === "Journal" ? "Write today" : "Add thought"}
                  </button>
                </div>
              </div>
              {mode === "explore" ? (
                <Explore
                  entries={entries.filter((e) => e.type !== "journal")}
                  links={connections}
                  focus={focus}
                  setFocus={setFocus}
                  onOpen={setSelected}
                  scope={view + area}
                />
              ) : (
                <EntryGrid
                  entries={entries}
                  onOpen={setSelected}
                  journal={area === "Journal"}
                />
              )}
              {total > entries.length && (
                <button
                  className="load-more"
                  onClick={async () => {
                    const p = new URLSearchParams({
                      category: view,
                      area,
                      offset: String(entries.length),
                      journal: area === "Journal" ? "1" : "0",
                      trash: trash ? "1" : "0",
                    });
                    const data = await api("/entries?" + p);
                    setEntries([...entries, ...data.entries]);
                  }}
                >
                  Load more ({total - entries.length})
                </button>
              )}
            </>
          )}
          <footer>
            <Leaf size={13} /> A home for your thoughts. Room for your life.
          </footer>
        </main>
      </div>
      {selected && (
        <Editor
          key={selected.id + (selected.sourceMessage || "")}
          initial={selected}
          connections={connections}
          onClose={() => setSelected(null)}
          onChange={async (e: Entry) => {
            setSelected(e);
            await refresh();
          }}
          onOpen={setSelected}
        />
      )}
      {importOpen && (
        <Importer
          onClose={() => setImportOpen(false)}
          onDone={() => {
            navigate("Inbox");
            refresh();
            setToast("Your conversations are in Inbox, ready to review.");
          }}
        />
      )}
      {settings && (
        <SettingsPanel
          onClose={() => setSettings(false)}
          onTrash={() => {
            setSettings(false);
            navigate("Archive");
            setTrash(true);
          }}
          onLogout={async () => {
            if ((await pending()).length) {
              setError(
                "Upload or download pending captures before signing out.",
              );
              setSettings(false);
              return;
            }
            await send("/logout", {});
            setSession({ authenticated: false, setup: false });
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
function OfflineCapture() {
  const [text, setText] = useState(""),
    [count, setCount] = useState(0),
    [message, setMessage] = useState("");
  useEffect(() => {
    pending().then((p) => setCount(p.length));
  }, []);
  return (
    <div className="auth">
      <div className="auth-card">
        <span className="brandmark">
          <Leaf />
        </span>
        <p className="eyebrow">OFFLINE CAPTURE</p>
        <h1>Keep the thought.</h1>
        <p>
          Your server is unreachable. Capture text here and upload it after
          reconnecting and signing in. This device queue is not a backup.
        </p>
        <label>
          What’s on your mind?
          <textarea
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <button
          className="primary"
          disabled={!text.trim()}
          onClick={async () => {
            try {
              await enqueue({
                id: crypto.randomUUID(),
                title: "",
                body: text,
                category: "Inbox",
                type: "note",
              });
              setText("");
              setCount((await pending()).length);
              setMessage("Saved on this device.");
            } catch {
              setMessage(
                "Device storage failed. Copy your thought somewhere safe.",
              );
            }
          }}
        >
          Save on this device <Plus size={15} />
        </button>
        <p className="muted">
          {message} {count} pending capture(s).
        </p>
        <div className="offline-actions">
          <button
            onClick={async () =>
              download(await pending(), "pending-captures.json")
            }
          >
            Download pending
          </button>
          <button onClick={() => location.reload()}>Reconnect</button>
        </div>
      </div>
    </div>
  );
}
function SectionHeading({ title, subtitle }: any) {
  return (
    <div className="section-heading">
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}
function EntryGrid({ entries, onOpen, journal = false }: any) {
  return entries.length ? (
    <div className={"entry-grid " + (journal ? "journal-list" : "")}>
      {entries.map((e: Entry) => (
        <button
          className="entry-card"
          key={e.id}
          onClick={() => onOpen(e)}
          style={{ "--accent": COLORS[e.category] } as any}
        >
          <div className="entry-meta">
            <span>
              {journal
                ? date(e.date || e.created)
                : e.type === "conversation"
                  ? "CHATGPT CONVERSATION"
                  : e.category}
            </span>
            <ArrowUpRight size={15} />
          </div>
          <h3>{e.title}</h3>
          <p>{e.type === "project" ? e.handoff || e.goal || e.body : e.body}</p>
          <div className="entry-foot">
            <span>
              {e.type === "project" && e.nextAction
                ? "Next: " + e.nextAction
                : date(e.updated)}
            </span>
            {e.deleted ? (
              <Trash2 size={14} />
            ) : (
              <Icon name={e.category} size={14} />
            )}
          </div>
        </button>
      ))}
    </div>
  ) : (
    <div className="empty">
      <Leaf size={28} />
      <h3>Room for something new.</h3>
      <p>
        Save a thought whenever it comes. You can figure out where it belongs
        later.
      </p>
    </div>
  );
}
function ThoughtNode({ data }: NodeProps) {
  const d = data as any;
  return (
    <div className={"thought-node " + (d.focus ? "focused" : "")}>
      <Handle type="target" position={Position.Left} />
      <span className="eyebrow">{d.entry.category}</span>
      <h3>{d.entry.title}</h3>
      <p>{d.entry.body.slice(0, 85)}</p>
      <div>
        <button onClick={() => d.onFocus(d.entry.id)}>Follow links</button>
        <button onClick={() => d.onOpen(d.entry)}>
          Open <ArrowUpRight size={12} />
        </button>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { thought: ThoughtNode };
function Explore({ entries, links, focus, setFocus, onOpen, scope }: any) {
  const [nodes, setNodes] = useState<any[]>([]),
    [limit, setLimit] = useState(6),
    [layout, setLayout] = useState<any>({}),
    [history, setHistory] = useState<string[]>([]);
  useEffect(() => {
    api("/layout?scope=" + encodeURIComponent(scope)).then(setLayout);
  }, [scope]);
  const [neighborhood, setNeighborhood] = useState<any>(null);
  const center = focus || entries[0]?.id;
  useEffect(() => {
    if (center)
      api("/graph?focus=" + encodeURIComponent(center) + "&limit=" + limit)
        .then(setNeighborhood)
        .catch(() => setNeighborhood(null));
  }, [center, limit, links]);
  const related = links.filter(
    (l: Connection) => l.fromId === center || l.toId === center,
  );
  const ids = new Set([
    center,
    ...related.slice(0, limit).flatMap((l: Connection) => [l.fromId, l.toId]),
  ]);
  const graphLinks = neighborhood?.links || links;
  const graphIds = new Set(
    neighborhood?.entries.map((e: Entry) => e.id) || [...ids],
  );
  const visible =
    neighborhood?.entries || entries.filter((e: Entry) => ids.has(e.id));
  const follow = (id: string) => {
    setHistory([...history, center]);
    setFocus(id);
    setLimit(6);
  };
  useEffect(() => {
    setNodes(
      visible.map((e: Entry, i: number) => ({
        id: e.id,
        type: "thought",
        position: layout[e.id] || {
          x:
            i === 0
              ? 380
              : 380 +
                360 *
                  Math.cos(
                    ((i - 1) * Math.PI * 2) / Math.max(1, visible.length - 1),
                  ),
          y:
            i === 0
              ? 250
              : 250 +
                235 *
                  Math.sin(
                    ((i - 1) * Math.PI * 2) / Math.max(1, visible.length - 1),
                  ),
        },
        data: { entry: e, focus: e.id === center, onFocus: follow, onOpen },
      })),
    );
  }, [entries, links, center, limit, layout, neighborhood]);
  if (!entries.length)
    return (
      <div className="empty">
        <Network />
        <h3>Your connections start with a thought.</h3>
        <p>Create notes and connect them from their Related section.</p>
      </div>
    );
  return (
    <div className="explore-shell">
      <div className="graph-toolbar">
        <span>
          <Network size={15} /> {visible.length} connected thoughts
        </span>
        <div>
          {history.length > 0 && (
            <button
              onClick={() => {
                setFocus(history[history.length - 1]);
                setHistory(history.slice(0, -1));
              }}
            >
              Back
            </button>
          )}
          <select
            aria-label="Focus thought"
            value={center}
            onChange={(e) => follow(e.target.value)}
          >
            {entries.map((e: Entry) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
          {neighborhood?.remaining > 0 && (
            <button onClick={() => setLimit(limit + 6)}>
              Show more ({neighborhood.remaining})
            </button>
          )}
        </div>
      </div>
      <div className="graph">
        <ReactFlow
          nodes={nodes}
          edges={graphLinks
            .filter(
              (l: Connection) => graphIds.has(l.fromId) && graphIds.has(l.toId),
            )
            .map((l: Connection) => ({
              id: l.id,
              source: l.fromId,
              target: l.toId,
              label: l.label,
              type: "default",
            }))}
          nodeTypes={nodeTypes}
          onNodesChange={(changes) =>
            setNodes((n) => applyNodeChanges(changes, n))
          }
          onNodeDragStop={(_, node) => {
            const value = { ...layout, [node.id]: node.position };
            setLayout(value);
            send("/layout", { scope, value });
          }}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.3}
          maxZoom={1.3}
        >
          <Background gap={26} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <div className="graph-help">
        Follow a connection, or open a card. Only a small neighborhood is shown
        at a time.
      </div>
    </div>
  );
}

function Auth({ setup, onDone }: any) {
  const [password, setPassword] = useState(""),
    [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <div className="auth">
      <div className="auth-card">
        <span className="brandmark">
          <Leaf size={28} />
        </span>
        <p className="eyebrow">YOUR PRIVATE SECOND BRAIN</p>
        <h1>{setup ? "Make yourself at home." : "Welcome back."}</h1>
        <p>
          {setup
            ? "Create your owner account. Your notes stay on your server."
            : "A little room for your thoughts is waiting."}
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await send(setup ? "/setup" : "/login", { password, token });
              onDone();
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {setup && (
            <label>
              Server setup token
              <input
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
              />
              <small>From SETUP_TOKEN in your server configuration.</small>
            </label>
          )}
          <label>
            {setup ? "Choose a password" : "Password"}
            <input
              type="password"
              minLength={12}
              maxLength={256}
              autoComplete={setup ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" disabled={busy}>
            {busy ? "Opening…" : setup ? "Create my space" : "Open my space"}
            <ArrowRight size={16} />
          </button>
        </form>
        <div className="private">
          <Shield size={14} /> Private by design. No trackers. No external AI.
        </div>
      </div>
    </div>
  );
}

function Importer({ onClose, onDone }: any) {
  const [preview, setPreview] = useState<any>(null),
    [namespace, setNamespace] = useState("personal"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<any>(null);
  return (
    <Modal
      title="Bring your conversations home"
      subtitle="From buried in a chat to within reach."
      onClose={busy ? () => {} : onClose}
    >
      <div className="import-intro">
        <Upload size={30} />
        <h3>Your history, with a fresh starting point.</h3>
        <p>
          Choose your ChatGPT export ZIP or conversations.json. Each
          conversation becomes one Inbox card, with its original messages and
          branches preserved.
        </p>
      </div>
      {!preview ? (
        <label className="dropzone">
          <Upload size={22} />
          <strong>
            {busy ? "Reading your export…" : "Choose your ChatGPT export"}
          </strong>
          <span>ZIP or JSON · up to 100 MB</span>
          <input
            type="file"
            accept=".zip,.json"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              setError("");
              try {
                if (file.size > 100 * 1024 * 1024)
                  throw new Error(
                    "File is over 100 MB. Upload conversations.json from the ZIP instead.",
                  );
                setPreview(
                  await api("/import/preview", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/octet-stream",
                      "X-File-Name": encodeURIComponent(file.name),
                    },
                    body: file,
                  }),
                );
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      ) : (
        <>
          <div className="import-stats">
            <div>
              <strong>{preview.count}</strong>
              <span>conversations</span>
            </div>
            <div>
              <strong>{preview.messages}</strong>
              <span>messages</span>
            </div>
            <div>
              <Inbox />
              <span>destination: Inbox</span>
            </div>
          </div>
          <label>
            Account label
            <input
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
            />
            <small>
              Use the same label for future exports from this account. Different
              accounts need different labels.
            </small>
          </label>
          <div className="preview-list">
            {preview.titles.map((t: string, i: number) => (
              <div key={i}>
                <FileText size={15} />
                {t}
              </div>
            ))}
            {preview.count > 8 && <small>And {preview.count - 8} more…</small>}
          </div>
          {preview.warnings.map((w: string) => (
            <p className="muted" key={w}>
              {w}
            </p>
          ))}
          {result ? (
            <div className="success">
              <Check /> {result.added} added · {result.updated} updated ·{" "}
              {result.skipped} unchanged
              {result.duplicate ? " · This export was already imported." : ""}
              <button
                className="primary"
                onClick={() => {
                  onDone();
                  onClose();
                }}
              >
                Open Inbox <ArrowRight size={15} />
              </button>
            </div>
          ) : (
            <button
              className="primary full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  setResult(
                    await send("/import/commit", { id: preview.id, namespace }),
                  );
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Preserving your conversations…" : "Import into Inbox"}
              <ArrowRight size={16} />
            </button>
          )}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="privacy-note">
        <Shield size={14} /> Processed on your server. Nothing is sent to an AI
        service. Future chats require a new export.
      </p>
    </Modal>
  );
}

function useDialogFocus(onClose: () => void) {
  const element = useRef<HTMLElement | null>(null);
  const latestClose = useRef(onClose);
  latestClose.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const getControls = () =>
      Array.from(
        element.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ) || [],
      ).filter((e) => e.offsetParent !== null);
    getControls()[0]?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        latestClose.current();
      }
      if (e.key === "Tab") {
        const controls = getControls();
        const first = controls[0],
          last = controls.at(-1);
        if (!first) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      previous?.focus();
    };
  }, []);
  return element;
}

function Modal({ title, subtitle, onClose, children }: any) {
  const dialogRef = useDialogFocus(onClose);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <button
          className="close icon-button"
          aria-label="Close"
          onClick={onClose}
        >
          <X size={19} />
        </button>
        <h2>{title}</h2>
        <p className="muted">{subtitle}</p>
        {children}
      </section>
    </div>
  );
}

function Editor({ initial, onClose, onChange, onOpen, connections }: any) {
  const [entry, setEntry] = useState<Entry>(() => {
      try {
        const draft = JSON.parse(
          localStorage.getItem("brain-draft-" + initial.id) || "null",
        );
        return draft || initial;
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
    [tab, setTab] = useState(initial.openSource ? "source" : "note"),
    [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(entry) !== JSON.stringify(saved);
  const localKey = "brain-draft-" + entry.id;
  useEffect(() => {
    api("/entries/" + entry.id + "/source").then(setSource);
    api("/entries/" + entry.id + "/attachments").then(setAttachments);
    api("/entries/" + entry.id + "/references").then(setReferences);
    api("/entries?limit=100").then((d) =>
      setRelatedOptions(d.entries.filter((e: Entry) => e.id !== entry.id)),
    );
  }, [entry.id]);
  const change = (patch: Partial<Entry>) => {
    const next = { ...entry, ...patch };
    setEntry(next);
    try {
      localStorage.setItem(localKey, JSON.stringify(next));
      setStatus("Draft saved on this device");
    } catch {
      setError(
        "Device storage is full. Keep this window open and save to the server.",
      );
    }
  };
  async function save() {
    setSaving(true);
    try {
      const next = await send("/entries/" + entry.id, entry, "PATCH");
      setSaved(next);
      setEntry((current) =>
        JSON.stringify(current) === JSON.stringify(entry)
          ? next
          : { ...current, revision: next.revision },
      );
      localStorage.removeItem(localKey);
      setStatus("Saved to server");
      await onChange(next);
    } catch (e: any) {
      setError(e.message);
      setStatus(
        e.status === 409
          ? "Conflict — draft preserved"
          : "Save failed — draft preserved",
      );
    } finally {
      setSaving(false);
    }
  }
  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(save, 1600);
    return () => clearTimeout(t);
  }, [entry]);
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
        "Your draft is saved on this device. Close without uploading it yet?",
      )
    )
      return;
    onClose();
  };
  const dialogRef = useDialogFocus(close);
  const related = connections.filter(
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
      onOpen(e);
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
            <div className="notice error">
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
                    const latest = await api("/entries/" + entry.id);
                    download(entry, "preserved-draft.json");
                    localStorage.removeItem(localKey);
                    setEntry(latest);
                    setSaved(latest);
                    setError("");
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
                    disabled={entry.type === "journal"}
                  >
                    {CATS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                {entry.category === "Life areas" && (
                  <label>
                    Life area
                    <select
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
                      value={entry.goal}
                      onChange={(e) => change({ goal: e.target.value })}
                    />
                  </label>
                  <label>
                    Where I stopped
                    <textarea
                      value={entry.handoff}
                      onChange={(e) => change({ handoff: e.target.value })}
                    />
                  </label>
                  <label>
                    Next small step
                    <input
                      value={entry.nextAction}
                      onChange={(e) => change({ nextAction: e.target.value })}
                    />
                  </label>
                  <label>
                    Status
                    <select
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
                      onClick={async () =>
                        onOpen({
                          ...(await api("/entries/" + r.sourceEntryId)),
                          openSource: true,
                          sourceMessage: r.messageId,
                        })
                      }
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
                          await api("/connections/" + l.id, {
                            method: "DELETE",
                          });
                          onChange(saved);
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
                    onClick={async () => {
                      try {
                        await send("/connections", {
                          fromId: entry.id,
                          toId: target,
                          label: relation,
                        });
                        setTarget("");
                        onChange(saved);
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
                    setShowHistory(!showHistory);
                    setHistory(await api("/entries/" + entry.id + "/history"));
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
          <button onClick={() => download(entry, "thought.json")}>
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
  const [branch, setBranch] = useState(
    initialMessage || raw.current_node || Object.keys(mapping).at(-1),
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
    if (node.message) active.unshift({ id: cursor, ...node.message });
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
        <select value={branch} onChange={(e) => setBranch(e.target.value)}>
          {Array.from(new Set([initialMessage, raw.current_node, ...leaves]))
            .filter(Boolean)
            .map((id: any, i) => (
              <option key={id} value={id}>
                {id === raw.current_node
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
            <strong>{m.author?.role || "unknown"}</strong>
            <button onClick={() => onExtract(m.id)}>
              Keep as an idea <Plus size={13} />
            </button>
          </div>
          <div className="message-text">
            {(
              m.content?.parts || [m.content?.text || "[Non-text content]"]
            ).map((p: any, i: number) => (
              <React.Fragment key={i}>
                {typeof p === "string"
                  ? p
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

function SettingsPanel({ onClose, onLogout, onTrash }: any) {
  const [protection, setProtection] = useState<any>({}),
    [imports, setImports] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/protection").then(setProtection);
    api("/imports").then(setImports);
  }, []);
  return (
    <Modal
      title="Your space, protected"
      subtitle="Clear about what is saved. Honest about what is backed up."
      onClose={onClose}
    >
      <section className="settings-section">
        <h3>
          <Shield size={18} /> Protection
        </h3>
        <div className="protection-row">
          <span>Server snapshots</span>
          <strong>
            {protection.lastSnapshot
              ? new Date(protection.lastSnapshot).toLocaleString()
              : "No snapshot yet"}
          </strong>
        </div>
        <div className="protection-row">
          <span>Separate-device backup</span>
          <strong>
            {protection.lastIndependentBackup
              ? new Date(protection.lastIndependentBackup).toLocaleString()
              : "Not configured"}
          </strong>
        </div>
        <div className="protection-row">
          <span>Off-site backup</span>
          <strong>
            {protection.lastOffsite
              ? new Date(protection.lastOffsite).toLocaleString()
              : "Not configured"}
          </strong>
        </div>
        {(!protection.lastOffsite ||
          Date.now() - new Date(protection.lastOffsite).getTime() >
            36 * 3600000) && (
          <p className="error muted">
            Off-site protection is incomplete or overdue. Configure or check the
            independent backup job.
          </p>
        )}
        <p className="muted">
          A same-device snapshot helps with recovery, but does not protect
          against losing the server. Configure the included backup job to a
          separate device and encrypted off-site storage.
        </p>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await send("/snapshot", {});
              setProtection(await api("/protection"));
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <RefreshCw size={15} />{" "}
          {busy ? "Creating snapshot…" : "Create recovery snapshot"}
        </button>
      </section>
      <section className="settings-section">
        <h3>
          <Download size={18} /> Export & sources
        </h3>
        <a className="button-link" href="/api/export">
          Download notes & source metadata (JSON)
        </a>
        <p className="muted">
          JSON includes note history and conversation data. Attachment bytes and
          original files are included in recovery snapshots; use the full
          portable export command for a complete ZIP.
        </p>
        {imports.map((i) => (
          <a className="attachment" key={i.id} href={"/api/imports/" + i.id}>
            <FileText size={15} />
            {i.name}
            <small>{date(i.created)}</small>
            <Download size={14} />
          </a>
        ))}
      </section>
      <section className="settings-section">
        <h3>Account & maintenance</h3>
        <button onClick={onTrash}>
          <Trash2 size={15} /> Open trash
        </button>
        <button onClick={onLogout}>
          <LogOut size={15} /> Sign out
        </button>
      </section>
      {error && <p className="error">{error}</p>}
    </Modal>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
if ("serviceWorker" in navigator && import.meta.env.PROD)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
