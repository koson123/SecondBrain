import React from "react";
import { EntryGrid } from "../components/EntryGrid";
export function SearchPage({
  query,
  entries,
  includeJournal,
  onJournal,
  total,
  onOpen,
}: any) {
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="page-kicker">SEARCH</p>
          <h1>{query ? "“" + query + "”" : "Find a note"}</h1>
        </div>
        <span className="result-count">{total} results</span>
      </div>
      <label className="checkline">
        <input
          type="checkbox"
          checked={includeJournal}
          onChange={(e) => onJournal(e.target.checked)}
        />{" "}
        Include private Journal entries
      </label>
      {query ? (
        <EntryGrid entries={entries} onOpen={onOpen} />
      ) : (
        <p className="muted">
          Enter a title, phrase, or something you remember in the search field.
        </p>
      )}
    </section>
  );
}
