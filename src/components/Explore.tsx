import React, { useState, useEffect } from "react";
import { ArrowUpRight, Network } from "lucide-react";
import { api, send, type Entry, type Connection } from "../api";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  applyNodeChanges,
  type NodeProps,
} from "@xyflow/react";
function ThoughtNode({ data }: NodeProps) {
  const d = data as any;
  return (
    <div className={"thought-node " + (d.focus ? "focused" : "")}>
      <Handle type="target" position={Position.Left} />
      <span className="eyebrow">{d.entry.category}</span>
      <h3>{d.entry.title}</h3>
      <p>{d.entry.body.slice(0, 85)}</p>
      <div>
        <button onClick={() => d.onFocus(d.entry.id)}>Follow links</button>
        <button onClick={() => d.onOpen(d.entry)}>
          Open <ArrowUpRight size={12} />
        </button>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { thought: ThoughtNode };
export function Explore({
  entries,
  links,
  focus,
  setFocus,
  onOpen,
  scope,
}: any) {
  const [nodes, setNodes] = useState<any[]>([]),
    [limit, setLimit] = useState(6),
    [layout, setLayout] = useState<any>({}),
    [history, setHistory] = useState<string[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    api("/layout?scope=" + encodeURIComponent(scope))
      .then((value) => {
        if (!cancelled) setLayout(value);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);
  const [neighborhood, setNeighborhood] = useState<any>(null);
  const [flow, setFlow] = useState<any>(null);
  const center = focus || entries[0]?.id;
  useEffect(() => {
    let cancelled = false;
    setNeighborhood(null);
    if (center)
      api("/graph?focus=" + encodeURIComponent(center) + "&limit=" + limit)
        .then((value) => {
          if (!cancelled) setNeighborhood(value);
        })
        .catch(() => {
          if (!cancelled) setNeighborhood(null);
        });
    return () => {
      cancelled = true;
    };
  }, [center, limit, links]);
  const related = links.filter(
    (l: Connection) => l.fromId === center || l.toId === center,
  );
  const ids = new Set([
    center,
    ...related.slice(0, limit).flatMap((l: Connection) => [l.fromId, l.toId]),
  ]);
  const graphLinks = neighborhood?.links || links;
  const graphIds = new Set(
    neighborhood?.entries.map((e: Entry) => e.id) || [...ids],
  );
  const visible =
    neighborhood?.entries || entries.filter((e: Entry) => ids.has(e.id));
  const follow = (id: string) => {
    setHistory([...history, center]);
    setFocus(id);
    setLimit(6);
  };
  useEffect(() => {
    setNodes(
      visible.map((e: Entry, i: number) => ({
        id: e.id,
        type: "thought",
        position: layout[e.id] || {
          x:
            i === 0
              ? 380
              : 380 +
                360 *
                  Math.cos(
                    ((i - 1) * Math.PI * 2) / Math.max(1, visible.length - 1),
                  ),
          y:
            i === 0
              ? 250
              : 250 +
                235 *
                  Math.sin(
                    ((i - 1) * Math.PI * 2) / Math.max(1, visible.length - 1),
                  ),
        },
        data: { entry: e, focus: e.id === center, onFocus: follow, onOpen },
      })),
    );
  }, [entries, links, center, limit, layout, neighborhood]);
  const signature = nodes.map((n) => n.id).join("|");
  useEffect(() => {
    if (!flow || !signature) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() =>
        flow.fitView({ padding: 0.25, maxZoom: 1.05, duration: 0 }),
      );
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [flow, signature]);
  const options = [
    ...new Map([...entries, ...visible].map((e: Entry) => [e.id, e])).values(),
  ] as Entry[];
  if (!entries.length)
    return (
      <div className="empty">
        <Network />
        <h3>Your connections start with a thought.</h3>
        <p>Create notes and connect them from their Related section.</p>
      </div>
    );
  return (
    <div className="explore-shell">
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      <div className="graph-toolbar">
        <span>
          <Network size={15} /> {visible.length} connected thoughts
        </span>
        <div>
          {history.length > 0 && (
            <button
              onClick={() => {
                setFocus(history[history.length - 1]);
                setHistory(history.slice(0, -1));
              }}
            >
              Back
            </button>
          )}
          <select
            aria-label="Focus thought"
            value={center}
            onChange={(e) => follow(e.target.value)}
          >
            {options.map((e: Entry) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
          {neighborhood?.remaining > 0 && (
            <button onClick={() => setLimit(limit + 6)}>
              Show more ({neighborhood.remaining})
            </button>
          )}
        </div>
      </div>
      <div className="graph">
        <ReactFlow
          onInit={setFlow}
          nodes={nodes}
          edges={graphLinks
            .filter(
              (l: Connection) => graphIds.has(l.fromId) && graphIds.has(l.toId),
            )
            .map((l: Connection) => ({
              id: l.id,
              source: l.fromId,
              target: l.toId,
              label: l.label,
              type: "default",
            }))}
          nodeTypes={nodeTypes}
          onNodesChange={(changes) =>
            setNodes((n) => applyNodeChanges(changes, n))
          }
          onNodeDragStop={(_, node) => {
            const value = { ...layout, [node.id]: node.position };
            setLayout(value);
            send("/layout", { scope, value })
              .then(() => setError(""))
              .catch((e) =>
                setError("Position is only saved in this tab: " + e.message),
              );
          }}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.3}
          maxZoom={1.3}
        >
          <Background gap={26} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <div className="graph-help">
        Follow a connection, or open a card. Only a small neighborhood is shown
        at a time.
      </div>
    </div>
  );
}
