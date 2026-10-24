import React from "react";
import { ArrowUpRight } from "lucide-react";
export function JournalPage({ entries, onOpen }: any) {
  const sorted = [...entries].sort((a, b) =>
    (b.date || b.created).localeCompare(a.date || a.created),
  );
  return (
    <div className="journal-page">
      <div className="journal-rule">
        <span>PRIVATE ENTRIES</span>
        <span>No prompts required.</span>
      </div>
      {sorted.length ? (
        sorted.map((e: any) => {
          const stamp = new Date(
            (e.date || e.created.slice(0, 10)) + "T12:00:00",
          );
          return (
            <article className="journal-row" key={e.id}>
              <time>
                <strong>{stamp.getDate()}</strong>
                <span>
                  {stamp.toLocaleDateString("en-US", {
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </time>
              <button onClick={() => onOpen(e)}>
                <h2>{e.title}</h2>
                <p>{e.body || "An unwritten entry."}</p>
                <span>
                  Read entry <ArrowUpRight size={14} />
                </span>
              </button>
            </article>
          );
        })
      ) : (
        <div className="journal-blank">
          <span className="journal-margin" />
          <h2>A blank page.</h2>
          <p>Write about today, or a day you want to remember.</p>
          <div />
          <div />
          <div />
        </div>
      )}
    </div>
  );
}
