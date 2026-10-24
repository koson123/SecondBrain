import React, { useState, useEffect } from "react";
import {
  Download,
  Settings,
  RefreshCw,
  Trash2,
  Shield,
  FileText,
  LogOut,
} from "lucide-react";
import { date } from "../shared";
import { api, send } from "../api";
import { Modal, PageFrame } from "../components/Dialog";
export function SettingsPanel({
  onClose,
  onLogout,
  onTrash,
  page = false,
}: any) {
  const [protection, setProtection] = useState<any>({}),
    [imports, setImports] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api("/protection").then(setProtection);
    api("/imports").then(setImports);
  }, []);
  const Frame = page ? PageFrame : Modal;
  return (
    <Frame
      title="Settings & protection"
      subtitle="Account, exports, and backup status."
      onClose={onClose}
    >
      <section className="settings-section">
        <h3>
          <Shield size={18} /> Protection
        </h3>
        <div className="protection-row">
          <span>Server snapshots</span>
          <strong>
            {protection.lastSnapshot
              ? new Date(protection.lastSnapshot).toLocaleString()
              : "No snapshot yet"}
          </strong>
        </div>
        <div className="protection-row">
          <span>Separate-device backup</span>
          <strong>
            {protection.lastIndependentBackup
              ? new Date(protection.lastIndependentBackup).toLocaleString()
              : "Not configured"}
          </strong>
        </div>
        <div className="protection-row">
          <span>Off-site backup</span>
          <strong>
            {protection.lastOffsite
              ? new Date(protection.lastOffsite).toLocaleString()
              : "Not configured"}
          </strong>
        </div>
        {(!protection.lastOffsite ||
          Date.now() - new Date(protection.lastOffsite).getTime() >
            36 * 3600000) && (
          <p className="error muted">
            Off-site protection is incomplete or overdue. Configure or check the
            independent backup job.
          </p>
        )}
        <p className="muted">
          A same-device snapshot helps with recovery, but does not protect
          against losing the server. Configure the included backup job to a
          separate device and encrypted off-site storage.
        </p>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await send("/snapshot", {});
              setProtection(await api("/protection"));
            } catch (e: any) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <RefreshCw size={15} />{" "}
          {busy ? "Creating snapshot…" : "Create recovery snapshot"}
        </button>
      </section>
      <section className="settings-section">
        <h3>
          <Download size={18} /> Export & sources
        </h3>
        <a className="button-link" href="/api/export">
          Download notes & source metadata (JSON)
        </a>
        <p className="muted">
          JSON includes note history and conversation data. Attachment bytes and
          original files are included in recovery snapshots; use the full
          portable export command for a complete ZIP.
        </p>
        {imports.map((i) => (
          <a className="attachment" key={i.id} href={"/api/imports/" + i.id}>
            <FileText size={15} />
            {i.name}
            <small>{date(i.created)}</small>
            <Download size={14} />
          </a>
        ))}
      </section>
      <section className="settings-section">
        <h3>Account & maintenance</h3>
        <button onClick={onTrash}>
          <Trash2 size={15} /> Open trash
        </button>
        <button onClick={onLogout}>
          <LogOut size={15} /> Sign out
        </button>
      </section>
      {error && <p className="error">{error}</p>}
    </Frame>
  );
}
