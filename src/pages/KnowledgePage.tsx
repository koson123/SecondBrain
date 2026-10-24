import React from "react";
import { ArrowUpRight, FileText } from "lucide-react";
import { date } from "../shared";
export function KnowledgePage({ entries, onOpen }: any) {
  return entries.length ? (
    <div className="knowledge-index">
      <div className="table-heading">
        <span>REFERENCE</span>
        <span>UPDATED</span>
      </div>
      {entries.map((e: any) => (
        <button className="knowledge-row" key={e.id} onClick={() => onOpen(e)}>
          <FileText size={18} />
          <span>
            <strong>{e.title}</strong>
            <p>{e.body.slice(0, 130)}</p>
          </span>
          <time>{date(e.updated)}</time>
          <ArrowUpRight size={14} />
        </button>
      ))}
    </div>
  ) : (
    <div className="empty plain-empty">
      <h3>Your reference shelf is empty.</h3>
      <p>Keep instructions, explanations, and things you’ve learned.</p>
    </div>
  );
}
