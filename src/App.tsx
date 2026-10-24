import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Home,
  Search,
  Plus,
  Upload,
  Settings,
  Sun,
  Moon,
  X,
  Check,
  Shield,
  ArrowRight,
} from "lucide-react";
import { api, send, type Entry, type Connection } from "./api";
import { pending, enqueue, dequeue } from "./queue";
import { CATS, Icon, today, download } from "./shared";
import { go, useRoute, NavLink, changeQuery } from "./router";
import { routeFor } from "./routes.mjs";
import { Auth } from "./components/Auth";
import { Editor } from "./components/Editor";
import { OfflineCapture } from "./pages/OfflinePage";
import { HomePage } from "./pages/HomePage";
import { CollectionPage } from "./pages/CollectionPage";
import { SearchPage } from "./pages/SearchPage";
import { Importer } from "./pages/ImportPage";
import { SettingsPanel } from "./pages/SettingsPage";

function BrandMark() {
  return (
    <svg
      viewBox="0 0 32 32"
      width="27"
      height="27"
      fill="none"
      aria-hidden="true"
    >
      <path d="M8 8 24 12 13 25 8 8" stroke="currentColor" strokeWidth="1.5" />
      <circle
        cx="8"
        cy="8"
        r="3"
        fill="var(--bg)"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle
        cx="24"
        cy="12"
        r="3"
        fill="var(--bg)"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle
        cx="13"
        cy="25"
        r="3"
        fill="var(--bg)"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export default function App() {
  const route = useRoute();
  const { view, area, query } = route;
  const [session, setSession] = useState<any>(null),
    [entries, setEntries] = useState<Entry[]>([]),
    [total, setTotal] = useState(0),
    [counts, setCounts] = useState<Record<string, number>>({}),
    [connections, setConnections] = useState<Connection[]>([]),
    [selected, setSelected] = useState<Entry | null>(null),
    [search, setSearch] = useState(query),
    [capture, setCapture] = useState(""),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [pendingCount, setPendingCount] = useState(0),
    [busy, setBusy] = useState(false),
    [theme, setTheme] = useState(
      localStorage.getItem("brain-theme") || "light",
    ),
    [rediscover, setRediscover] = useState(0),
    [discoveryEntry, setDiscoveryEntry] = useState<Entry | null>(null),
    [loadedScope, setLoadedScope] = useState("");
  const scope = JSON.stringify([view, area, query, route.journal, route.trash]);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const generation = useRef(0);
  const syncing = useRef(false);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("brain-theme", theme);
  }, [theme]);
  useEffect(() => {
    api("/session")
      .then(setSession)
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setSearch(query);
    document.title =
      (area ||
        { Home: "Desk", Imports: "Import conversations" }[view] ||
        view) + " · Second Brain";
  }, [view, area, query]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("search")?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const params = useCallback(
    (offset = 0) => {
      const p = new URLSearchParams({
        journal: route.journal || area === "Journal" ? "1" : "0",
        trash: route.trash ? "1" : "0",
        limit: "60",
        offset: String(offset),
      });
      if (view === "Home") p.set("active", "1");
      if (CATS.includes(view)) p.set("category", view);
      if (area) p.set("area", area);
      if (query) p.set("q", query);
      return p;
    },
    [view, area, query, route.journal, route.trash],
  );
  const refresh = useCallback(async () => {
    if (!session?.authenticated) return;
    const request = ++generation.current;
    const at = scope;
    const [data, stats, links] = await Promise.all([
      api("/entries?" + params()),
      api("/stats"),
      api("/connections"),
    ]);
    if (request !== generation.current || at !== scopeRef.current) return;
    setEntries(data.entries);
    setTotal(data.total);
    setCounts(stats);
    setConnections(links);
    setLoadedScope(at);
  }, [session, scope, params]);
  useEffect(() => {
    const timer = setTimeout(
      () =>
        refresh().catch((e) => {
          if (e.status === 401)
            setSession({ authenticated: false, setup: false });
          else setError(e.message);
        }),
      120,
    );
    return () => clearTimeout(timer);
  }, [refresh]);
  const sync = useCallback(async () => {
    if (syncing.current) return;
    syncing.current = true;
    try {
      const rows = await pending();
      setPendingCount(rows.length);
      for (const row of rows) {
        try {
          await send("/entries", row);
          await dequeue(row.id);
        } catch (error: any) {
          if (error.status === 401) {
            setSession({ authenticated: false, setup: false });
            throw error;
          }
          if (!error.status || error.status >= 500) throw error;
          setError(
            "A pending note could not upload: " +
              error.message +
              " Download pending notes to keep a separate copy.",
          );
        }
      }
      setPendingCount((await pending()).length);
      if (rows.length) await refresh();
    } catch (e: any) {
      setPendingCount((await pending()).length);
      if (e.status === 401) setToast("Sign in to upload pending notes.");
    } finally {
      syncing.current = false;
    }
  }, [refresh]);
  useEffect(() => {
    if (session?.authenticated) sync();
    const online = () => sync();
    window.addEventListener("online", online);
    return () => window.removeEventListener("online", online);
  }, [session, sync]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);
  // Entry URLs can be refreshed or opened in a new tab; back/forward also
  // restores the selected entry. Journal bodies are never used by Home.
  useEffect(() => {
    let cancelled = false;
    if (!route.entryId) {
      setSelected(null);
      return;
    }
    if (!session?.authenticated) return;
    api("/entries/" + encodeURIComponent(route.entryId))
      .then((e) => {
        if (!cancelled)
          setSelected({
            ...e,
            openSource: !!route.sourceMessage,
            sourceMessage: route.sourceMessage,
          });
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [route.entryId, route.sourceMessage, session?.authenticated]);
  function openEntry(e: Entry) {
    setSelected(e);
    changeQuery({ entry: e.id, source: e.sourceMessage || null });
  }
  async function newEntry(type = "note") {
    try {
      const e = await send("/entries", {
        title:
          type === "journal"
            ? today()
            : type === "project"
              ? "Untitled project"
              : "Untitled note",
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
      openEntry(e);
      await refresh();
    } catch (e: any) {
      setError(e.message);
    }
  }
  async function quickCapture() {
    if (!capture.trim()) return;
    setBusy(true);
    try {
      await enqueue({
        id: crypto.randomUUID(),
        title: "",
        body: capture,
        category: "Inbox",
        type: "note",
      });
      setCapture("");
      setPendingCount((await pending()).length);
      setToast("Saved to the device queue.");
      await sync();
    } catch (e: any) {
      setError("Could not save: " + e.message);
    } finally {
      setBusy(false);
    }
  }
  async function moveEntry(e: Entry, category: string) {
    try {
      await send(
        "/entries/" + e.id,
        { ...e, category, type: category === "Projects" ? "project" : e.type },
        "PATCH",
      );
      await refresh();
      setToast("Moved to " + category);
    } catch (e: any) {
      setError(e.message);
    }
  }
  const visible = loadedScope === scope ? entries : [];
  const regular = visible.filter(
    (e) => e.category !== "Archive" && e.type !== "journal" && !e.deleted,
  );
  const idea = discoveryEntry;
  useEffect(() => {
    let cancelled = false;
    if (view === "Home" && session?.authenticated) {
      api("/rediscover?offset=" + rediscover)
        .then((data) => {
          if (!cancelled) setDiscoveryEntry(data.entry);
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [view, session?.authenticated, rediscover, entries]);
  if (!session)
    return error ? (
      <OfflineCapture />
    ) : (
      <div className="loading">Opening Second Brain…</div>
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
        <NavLink className="brand" href="/" aria-label="Second Brain home">
          <BrandMark />
          <span>
            Second Brain<small>PERSONAL NOTEBOOK</small>
          </span>
        </NavLink>
        <NavLink
          className={"nav " + (view === "Home" ? "active" : "")}
          href="/"
        >
          <Home size={17} /> Desk
        </NavLink>
        <div className="nav-label">COLLECTIONS</div>
        {CATS.map((c) => (
          <NavLink
            key={c}
            href={routeFor(c)}
            className={"nav " + (view === c ? "active" : "")}
            aria-current={view === c ? "page" : undefined}
          >
            <Icon name={c} size={17} />
            <span>{c}</span>
            {c === "Inbox" && counts[c] > 0 && (
              <small className="count">{counts[c]}</small>
            )}
          </NavLink>
        ))}
        <div className="sidebar-bottom">
          <NavLink
            className={"nav " + (view === "Imports" ? "active" : "")}
            href="/imports"
            aria-label="Import conversations"
          >
            <Upload size={17} />
            <span>Import conversations</span>
          </NavLink>
          <NavLink
            className={"nav " + (view === "Settings" ? "active" : "")}
            href="/settings"
            aria-label="Settings & protection"
          >
            <Settings size={17} />
            <span>Settings & protection</span>
          </NavLink>
          <div className="private">
            <Shield size={12} /> Stored on your server
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="crumb">
            <NavLink href="/">Notebook</NavLink>
            <span>/</span>
            {area || { Home: "Desk", Imports: "Import" }[view] || view}
          </div>
          <form
            className="searchbox"
            onSubmit={(e) => {
              e.preventDefault();
              go(
                "/search" +
                  (search.trim()
                    ? "?q=" + encodeURIComponent(search.trim())
                    : ""),
              );
            }}
          >
            <Search size={15} />
            <input
              id="search"
              aria-label="Search notes"
              placeholder="Search notes"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd>Ctrl K</kbd>
          </form>
          <button
            className="icon-button"
            aria-label="Toggle theme"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
          >
            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
          </button>
          <button
            className="primary compact"
            aria-label="New note"
            onClick={() =>
              newEntry(
                area === "Journal"
                  ? "journal"
                  : view === "Projects"
                    ? "project"
                    : "note",
              )
            }
          >
            <Plus size={15} />
            <span>New note</span>
          </button>
          <select
            className="mobile-nav"
            aria-label="Go to page"
            value={view}
            onChange={(e) => go(routeFor(e.target.value))}
          >
            <option value="Home">Desk</option>
            {[...CATS, "Imports", "Settings", "Search"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </header>
        <main>
          {pendingCount > 0 && (
            <div className="notice">
              {pendingCount} pending capture(s) on this device.{" "}
              <button onClick={sync}>Retry upload</button>
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
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={14} />
              </button>
            </div>
          )}
          {view === "Home" ? (
            <HomePage
              capture={capture}
              setCapture={setCapture}
              onCapture={quickCapture}
              busy={busy}
              counts={counts}
              entries={regular}
              onOpen={openEntry}
              idea={idea}
              onAnother={() => setRediscover((n) => n + 1)}
              onLater={async () => {
                if (!idea) return;
                try {
                  await send(
                    "/entries/" + idea.id,
                    {
                      ...idea,
                      snooze: new Date(Date.now() + 7 * 86400000).toISOString(),
                    },
                    "PATCH",
                  );
                  await refresh();
                } catch (e: any) {
                  setError(e.message);
                }
              }}
              onHide={async () => {
                if (!idea) return;
                try {
                  await send(
                    "/entries/" + idea.id,
                    { ...idea, hidden: 1 },
                    "PATCH",
                  );
                  await refresh();
                } catch (e: any) {
                  setError(e.message);
                }
              }}
            />
          ) : CATS.includes(view) ? (
            <CollectionPage
              route={route}
              entries={visible}
              total={loadedScope === scope ? total : 0}
              connections={connections}
              onOpen={openEntry}
              onNew={newEntry}
              onMove={moveEntry}
              onLoadMore={async () => {
                const at = scope;
                const data = await api("/entries?" + params(entries.length));
                if (scopeRef.current === at)
                  setEntries((old) => [...old, ...data.entries]);
              }}
            />
          ) : view === "Search" ? (
            <SearchPage
              query={query}
              entries={visible}
              total={loadedScope === scope ? total : 0}
              includeJournal={route.journal}
              onJournal={(yes: boolean) =>
                changeQuery({ journal: yes ? "1" : null }, true)
              }
              onOpen={openEntry}
            />
          ) : view === "Imports" ? (
            <Importer
              page
              onClose={() => go("/")}
              onDone={() => {
                go("/inbox");
                setToast("Conversations imported into Inbox.");
              }}
            />
          ) : view === "Settings" ? (
            <SettingsPanel
              page
              onClose={() => go("/")}
              onTrash={() => go("/archive?trash=1")}
              onLogout={async () => {
                if ((await pending()).length) {
                  setError(
                    "Upload or download pending captures before signing out.",
                  );
                  return;
                }
                await send("/logout", {});
                setSession({ authenticated: false, setup: false });
              }}
            />
          ) : (
            <div className="empty">
              <h1>Page not found</h1>
              <NavLink href="/">
                Back to your desk <ArrowRight size={14} />
              </NavLink>
            </div>
          )}
        </main>
      </div>
      {selected && (
        <Editor
          key={selected.id + (selected.sourceMessage || "")}
          initial={selected}
          connections={connections}
          onClose={() => changeQuery({ entry: null, source: null }, true)}
          onChange={async (e: Entry) => {
            setSelected(e);
            await refresh();
          }}
          onOpen={openEntry}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}
