import React from "react";
import { BookOpen, ArrowUpRight } from "lucide-react";
import { AREA } from "../shared";
import { NavLink } from "../router";
import { routeFor } from "../routes.mjs";
import { EntryGrid } from "../components/EntryGrid";
export function LifeAreasPage({ entries, onOpen, area }: any) {
  return (
    <>
      {!area && (
        <div className="life-index">
          <NavLink href="/life/journal" className="journal-cover">
            <span className="binding" />
            <span className="journal-cover-label">PERSONAL</span>
            <BookOpen size={27} />
            <h2>Journal</h2>
            <p>Days, thoughts, and things to remember.</p>
            <span className="journal-open">
              Open journal <ArrowUpRight size={16} />
            </span>
          </NavLink>
          <div className="area-folders">
            {AREA.filter((a) => a !== "Journal").map((a, i) => (
              <NavLink key={a} href={routeFor("Life areas", a)}>
                <span>0{i + 1}</span>
                <h2>{a}</h2>
                <ArrowUpRight size={17} />
              </NavLink>
            ))}
          </div>
        </div>
      )}
      {entries.length > 0 && (
        <div className="area-notes">
          <h2>{area ? "Notes" : "Notes across your life areas"}</h2>
          <EntryGrid entries={entries} onOpen={onOpen} />
        </div>
      )}
      {area && !entries.length && (
        <div className="empty plain-empty">
          <p>No notes in {area} yet.</p>
        </div>
      )}
    </>
  );
}
