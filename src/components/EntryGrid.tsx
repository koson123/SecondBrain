import React from "react";
import { ArrowUpRight, Leaf, Trash2 } from "lucide-react";
import { COLORS, date, Icon } from "../shared";
import { type Entry } from "../api";
export function EntryGrid({ entries, onOpen, journal = false }: any) {
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
      <h3>No notes here yet.</h3>
      <p>
        Save a thought whenever it comes. You can figure out where it belongs
        later.
      </p>
    </div>
  );
}
