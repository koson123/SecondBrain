import React from "react";
import { ArrowUpRight } from "lucide-react";
export function ProjectsPage({ entries, onOpen }: any) {
  const columns = [
    { name: "In progress", states: ["active", "planned"] },
    { name: "Paused", states: ["paused"] },
    { name: "Finished", states: ["completed"] },
  ];
  return (
    <div className="project-board">
      {columns.map((col) => {
        const notes = entries.filter((e: any) => col.states.includes(e.status));
        return (
          <section className="project-column" key={col.name}>
            <header>
              <h2>{col.name}</h2>
              <span>{notes.length}</span>
            </header>
            {notes.map((e: any) => (
              <button
                key={e.id}
                className="project-note"
                onClick={() => onOpen(e)}
              >
                <span className="project-state">{e.status}</span>
                <h3>{e.title}</h3>
                <p>
                  {e.handoff ||
                    e.goal ||
                    e.body ||
                    "Add an outcome and a next step."}
                </p>
                <div className="next-step">
                  <span>NEXT</span>
                  {e.nextAction || "Choose a small starting point"}
                  <ArrowUpRight size={14} />
                </div>
              </button>
            ))}
            {!notes.length && (
              <p className="column-empty">
                {col.name === "In progress"
                  ? "Choose one thing to work on."
                  : "Nothing here."}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
