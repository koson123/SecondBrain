import React, { useState, useEffect } from "react";
import { Inbox, Plus, Download, Leaf } from "lucide-react";
import { download } from "../shared";
import { pending, enqueue } from "../queue";
export function OfflineCapture() {
  const [text, setText] = useState(""),
    [count, setCount] = useState(0),
    [message, setMessage] = useState("");
  useEffect(() => {
    pending().then((p) => setCount(p.length));
  }, []);
  return (
    <div className="auth">
      <div className="auth-card">
        <span className="brandmark">
          <Leaf />
        </span>
        <p className="eyebrow">OFFLINE CAPTURE</p>
        <h1>Offline capture</h1>
        <p>
          Your server is unreachable. Capture text here and upload it after
          reconnecting and signing in. This device queue is not a backup.
        </p>
        <label>
          What’s on your mind?
          <textarea
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        <button
          className="primary"
          disabled={!text.trim()}
          onClick={async () => {
            try {
              await enqueue({
                id: crypto.randomUUID(),
                title: "",
                body: text,
                category: "Inbox",
                type: "note",
              });
              setText("");
              setCount((await pending()).length);
              setMessage("Saved on this device.");
            } catch {
              setMessage(
                "Device storage failed. Copy your thought somewhere safe.",
              );
            }
          }}
        >
          Save on this device <Plus size={15} />
        </button>
        <p className="muted">
          {message} {count} pending capture(s).
        </p>
        <div className="offline-actions">
          <button
            onClick={async () =>
              download(await pending(), "pending-captures.json")
            }
          >
            Download pending
          </button>
          <button onClick={() => location.reload()}>Reconnect</button>
        </div>
      </div>
    </div>
  );
}
