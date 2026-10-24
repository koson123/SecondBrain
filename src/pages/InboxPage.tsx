import { MessageSquare } from "lucide-react";
import React from "react";
import { Inbox, Archive, ArrowUpRight, Upload, FileText } from "lucide-react";
import { date } from "../shared";
import { NavLink } from "../router";
export function InboxPage({ entries, onOpen, onMove }: any) {
  return (
    <section className="inbox-page">
      <div className="inbox-caption">
        <span>Review a little at a time. Nothing needs a label yet.</span>
        <NavLink href="/imports">
          <Upload size={14} /> Import conversations
        </NavLink>
      </div>
      {entries.length ? (
        <div className="inbox-stack">
          {entries.map((e: any) => (
            <article className="inbox-row" key={e.id}>
              <span className="inbox-source">
                {e.type === "conversation" ? (
                  <MessageSquare size={18} />
                ) : (
                  <FileText size={18} />
                )}
              </span>
              <button className="inbox-content" onClick={() => onOpen(e)}>
                <strong>{e.title}</strong>
                <p>{e.body.slice(0, 160)}</p>
                <small>
                  {e.type === "conversation" ? "ChatGPT conversation" : "Note"}{" "}
                  · {date(e.created)}
                </small>
              </button>
              <div className="inbox-actions">
                <select
                  aria-label={"Move " + e.title}
                  value=""
                  onChange={(ev) => {
                    if (ev.target.value) onMove(e, ev.target.value);
                  }}
                >
                  <option value="">Move to…</option>
                  {[
                    "Ideas",
                    "Projects",
                    "Knowledge",
                    "Life areas",
                    "Archive",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <button
                  aria-label={"Open " + e.title}
                  onClick={() => onOpen(e)}
                >
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty plain-empty">
          <h3>Inbox is clear.</h3>
          <p>New captures and imported conversations land here.</p>
          <NavLink href="/imports">
            Import a ChatGPT export <ArrowUpRight size={14} />
          </NavLink>
        </div>
      )}
    </section>
  );
}
