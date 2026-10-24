import React from "react";
import { ArrowUpRight } from "lucide-react";
import { date } from "../shared";
export function IdeasPage({ entries, onOpen }: any) {
  return entries.length ? (
    <div className="idea-board">
      {entries.map((e: any, i: number) => (
        <button
          key={e.id}
          className={"idea-slip paper-" + (i % 3)}
          onClick={() => onOpen(e)}
        >
          <span className="slip-top">
            <span>{date(e.created)}</span>
            <ArrowUpRight size={15} />
          </span>
          <h3>{e.title}</h3>
          <p>{e.body}</p>
          <span className="slip-footer">A POSSIBILITY</span>
        </button>
      ))}
    </div>
  ) : (
    <div className="empty">
      <h3>An idea doesn’t have to be a plan.</h3>
      <p>Keep possibilities here until you want to do something with them.</p>
    </div>
  );
}
