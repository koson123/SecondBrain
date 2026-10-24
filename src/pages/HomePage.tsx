import React from "react";
import { Inbox, Lightbulb, ArrowUpRight, ArrowRight } from "lucide-react";
import { CATS, date, Icon } from "../shared";
import { NavLink } from "../router";
import { routeFor } from "../routes.mjs";
import type { Entry } from "../api";

export function HomePage({
  capture,
  setCapture,
  onCapture,
  busy,
  counts,
  entries,
  onOpen,
  idea,
  onAnother,
  onLater,
  onHide,
}: any) {
  const stamp = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/Denver",
  }).format(new Date());
  return (
    <div className="desk-page">
      <div className="page-heading">
        <div>
          <p className="page-kicker">{stamp}</p>
          <h1>Desk</h1>
        </div>
      </div>
      <div className="desk-top">
        <section className="scratchpad">
          <div className="paper-label">
            <span>LOOSE NOTE</span>
            <span>01</span>
          </div>
          <textarea
            aria-label="Quick capture"
            placeholder="Something to remember…"
            value={capture}
            onChange={(e) => setCapture(e.target.value)}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "Enter") onCapture();
            }}
          />
          <div className="scratchpad-bottom">
            <span>Ctrl + Enter · goes to Inbox</span>
            <button disabled={!capture.trim() || busy} onClick={onCapture}>
              Save to Inbox <ArrowRight size={15} />
            </button>
          </div>
        </section>
        <nav className="desk-index" aria-label="Collections">
          <div className="index-heading">
            CONTENTS <span>6 collections</span>
          </div>
          {CATS.map((c, i) => (
            <NavLink key={c} href={routeFor(c)} className="index-row">
              <span className="index-number">0{i + 1}</span>
              <span>{c}</span>
              <small>{counts[c] || "—"}</small>
              <ArrowUpRight size={14} />
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="desk-bottom">
        <section>
          <div className="section-heading">
            <h2>Recent notes</h2>
            <span>Pick up where you stopped</span>
          </div>
          {entries.length ? (
            <div className="recent-list">
              {entries.slice(0, 3).map((e: Entry) => (
                <button
                  className="recent-row"
                  key={e.id}
                  onClick={() => onOpen(e)}
                >
                  <Icon name={e.category} size={18} />
                  <span>
                    <strong>{e.title}</strong>
                    <small>
                      {e.category}
                      {e.nextAction ? " · Next: " + e.nextAction : ""}
                    </small>
                  </span>
                  <time>{date(e.updated)}</time>
                  <ArrowUpRight size={14} />
                </button>
              ))}
            </div>
          ) : (
            <div className="empty plain-empty">
              <p>No notes here yet.</p>
              <NavLink href="/imports">
                Import your ChatGPT history <ArrowRight size={14} />
              </NavLink>
            </div>
          )}
        </section>
        <section>
          <div className="section-heading">
            <h2>Worth another look</h2>
            <button className="text-button" onClick={onAnother}>
              Another
            </button>
          </div>
          {idea ? (
            <article className="pinned-note">
              <span className="pin" />
              <span className="paper-label">FROM IDEAS</span>
              <button className="pinned-title" onClick={() => onOpen(idea)}>
                {idea.title}
              </button>
              <p>{idea.body.slice(0, 150)}</p>
              <div className="note-actions">
                <button onClick={() => onOpen(idea)}>
                  Open <ArrowUpRight size={13} />
                </button>
                <button onClick={onLater}>Later</button>
                <button onClick={onHide}>Hide</button>
              </div>
            </article>
          ) : (
            <div className="empty rediscover-empty">
              <Lightbulb size={20} />
              <p>Older ideas will turn up here.</p>
              <small>Save a possibility in Ideas to give it a place.</small>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
