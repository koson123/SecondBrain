import React, { useState } from "react";
import {
  Inbox,
  ArrowRight,
  Upload,
  X,
  Check,
  Shield,
  FileText,
} from "lucide-react";
import { api, send } from "../api";
import { Modal, PageFrame } from "../components/Dialog";
export function Importer({ onClose, onDone, page = false }: any) {
  const [preview, setPreview] = useState<any>(null),
    [namespace, setNamespace] = useState("personal"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<any>(null);
  const Frame = page ? PageFrame : Modal;
  return (
    <Frame
      title="Import ChatGPT conversations"
      subtitle="Review an export before adding it to Inbox."
      onClose={busy ? () => {} : onClose}
    >
      <div className="import-intro">
        <Upload size={30} />
        <h3>Choose an export</h3>
        <p>
          Choose your ChatGPT export ZIP or conversations.json. Each
          conversation becomes one Inbox card, with its original messages and
          branches preserved.
        </p>
      </div>
      {!preview ? (
        <label className="dropzone">
          <Upload size={22} />
          <strong>
            {busy ? "Reading your export…" : "Choose your ChatGPT export"}
          </strong>
          <span>ZIP or JSON · up to 100 MB</span>
          <input
            type="file"
            accept=".zip,.json"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              setError("");
              try {
                if (file.size > 100 * 1024 * 1024)
                  throw new Error(
                    "File is over 100 MB. Upload conversations.json from the ZIP instead.",
                  );
                setPreview(
                  await api("/import/preview", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/octet-stream",
                      "X-File-Name": encodeURIComponent(file.name),
                    },
                    body: file,
                  }),
                );
              } catch (e: any) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      ) : (
        <>
          <div className="import-stats">
            <div>
              <strong>{preview.count}</strong>
              <span>conversations</span>
            </div>
            <div>
              <strong>{preview.messages}</strong>
              <span>messages</span>
            </div>
            <div>
              <Inbox />
              <span>destination: Inbox</span>
            </div>
          </div>
          <label>
            Account label
            <input
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
            />
            <small>
              Use the same label for future exports from this account. Different
              accounts need different labels.
            </small>
          </label>
          <div className="preview-list">
            {preview.titles.map((t: string, i: number) => (
              <div key={i}>
                <FileText size={15} />
                {t}
              </div>
            ))}
            {preview.count > 8 && <small>And {preview.count - 8} more…</small>}
          </div>
          {preview.warnings.map((w: string) => (
            <p className="muted" key={w}>
              {w}
            </p>
          ))}
          {result ? (
            <div className="success">
              <Check /> {result.added} added · {result.updated} updated ·{" "}
              {result.skipped} unchanged
              {result.duplicate ? " · This export was already imported." : ""}
              <button
                className="primary"
                onClick={() => {
                  onDone();
                  if (!page) onClose();
                }}
              >
                Open Inbox <ArrowRight size={15} />
              </button>
            </div>
          ) : (
            <button
              className="primary full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  setResult(
                    await send("/import/commit", { id: preview.id, namespace }),
                  );
                } catch (e: any) {
                  setError(e.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Preserving your conversations…" : "Import into Inbox"}
              <ArrowRight size={16} />
            </button>
          )}
        </>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="privacy-note">
        <Shield size={14} /> Processed on your server. Nothing is sent to an AI
        service. Future chats require a new export.
      </p>
    </Frame>
  );
}
