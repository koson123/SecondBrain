import React from "react";
import { Archive, ArrowUpRight } from "lucide-react";
import { date } from "../shared";
export function ArchivePage({ entries, onOpen, trash }: any) {
  return entries.length ? (
    <div className="archive-list">
      {entries.map((e: any) => (
        <button key={e.id} onClick={() => onOpen(e)}>
          <Archive size={17} />
          <span>
            {e.title}
            <small>{trash ? "In trash" : e.type}</small>
          </span>
          <time>{date(e.updated)}</time>
          <ArrowUpRight size={14} />
        </button>
      ))}
    </div>
  ) : (
    <div className="empty plain-empty">
      <h3>{trash ? "Trash is empty." : "Nothing archived yet."}</h3>
      <p>
        {trash
          ? "Deleted entries can be restored here."
          : "Finished and inactive notes stay available here."}
      </p>
    </div>
  );
}
