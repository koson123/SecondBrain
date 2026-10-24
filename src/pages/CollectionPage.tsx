import React from "react";
import {
  Inbox,
  Archive,
  Plus,
  ArrowLeft,
  Network,
  LayoutGrid,
} from "lucide-react";
import { Explore } from "../components/Explore";
import { InboxPage } from "./InboxPage";
import { ProjectsPage } from "./ProjectsPage";
import { IdeasPage } from "./IdeasPage";
import { KnowledgePage } from "./KnowledgePage";
import { LifeAreasPage } from "./LifeAreasPage";
import { JournalPage } from "./JournalPage";
import { ArchivePage } from "./ArchivePage";
import { NavLink, changeQuery } from "../router";
const subtitles: Record<string, string> = {
  Inbox: "Captured notes and conversations, waiting to be sorted.",
  Projects: "What you’re working on. Where you stopped. What’s next.",
  "Life areas": "The ongoing parts of your life.",
  Ideas: "Keep the possibilities. Decide later.",
  Knowledge: "Things learned, figured out, and worth keeping.",
  Archive: "Finished or set aside. Still searchable.",
};
export function CollectionPage({
  route,
  entries,
  total,
  connections,
  onOpen,
  onNew,
  onMove,
  onLoadMore,
}: any) {
  const { view, area, mode, trash } = route;
  const journal = area === "Journal";
  const [focus, setFocus] = React.useState("");
  React.useEffect(() => setFocus(""), [route.path]);
  const props = { entries, onOpen, onMove, area, trash };
  const content = journal ? (
    <JournalPage {...props} />
  ) : view === "Inbox" ? (
    <InboxPage {...props} />
  ) : view === "Projects" ? (
    <ProjectsPage {...props} />
  ) : view === "Ideas" ? (
    <IdeasPage {...props} />
  ) : view === "Knowledge" ? (
    <KnowledgePage {...props} />
  ) : view === "Life areas" ? (
    <LifeAreasPage {...props} />
  ) : (
    <ArchivePage {...props} />
  );
  return (
    <div
      className={
        "collection-page collection-" +
        (journal ? "journal" : view.toLowerCase().replaceAll(" ", "-"))
      }
    >
      <div className="page-heading">
        <div>
          {area && (
            <NavLink className="back-link" href="/life">
              <ArrowLeft size={13} /> Life areas
            </NavLink>
          )}
          <p className="page-kicker">
            {journal
              ? "LIFE AREAS / PERSONAL"
              : view === "Life areas"
                ? "LIFE AREAS"
                : "COLLECTION"}
          </p>
          <h1>{trash ? "Trash" : area || view}</h1>
          <p className="page-description">
            {journal
              ? "Your record of the days."
              : area
                ? "Notes connected to " + area + "."
                : subtitles[view]}
          </p>
        </div>
        <button
          className="primary"
          onClick={() =>
            onNew(
              journal
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
          {journal
            ? "Write today"
            : view === "Projects"
              ? "New project"
              : view === "Ideas"
                ? "New idea"
                : "New note"}
        </button>
      </div>
      <div className="viewbar">
        <span>
          {total}{" "}
          {journal
            ? total === 1
              ? "entry"
              : "entries"
            : total === 1
              ? "item"
              : "items"}
        </span>
        <div className="view-actions">
          {view === "Archive" && (
            <button onClick={() => changeQuery({ trash: trash ? null : "1" })}>
              {trash ? "Archive" : "Trash"}
            </button>
          )}
          {!journal && !trash && (
            <>
              <button
                className={mode === "cards" ? "chosen" : ""}
                onClick={() => changeQuery({ mode: null })}
              >
                <LayoutGrid size={14} />
                {view === "Inbox" || view === "Knowledge" || view === "Archive"
                  ? "List"
                  : "Notes"}
              </button>
              <button
                className={mode === "explore" ? "chosen" : ""}
                onClick={() => changeQuery({ mode: "explore" })}
              >
                <Network size={14} /> Connections
              </button>
            </>
          )}
        </div>
      </div>
      {mode === "explore" && !journal && !trash ? (
        <Explore
          entries={entries.filter((e: any) => e.type !== "journal")}
          links={connections}
          focus={focus}
          setFocus={setFocus}
          onOpen={onOpen}
          scope={route.path}
        />
      ) : (
        content
      )}
      {total > entries.length && (
        <button className="load-more" onClick={onLoadMore}>
          Load more ({total - entries.length})
        </button>
      )}
    </div>
  );
}
