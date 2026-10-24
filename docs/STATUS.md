# Implementation status

## Working in the initial release

- Six categories, Journal nested in Life areas, calm responsive Overview, light/dark themes.
- SQLite persistence, one owner, password hashing, sessions, origin checks, throttled sign-in, authenticated attachment downloads.
- Quick capture, editable entries, project handoffs, Journal dates, category changes, archive, reversible trash, history restore.
- Full-text note and conversation search, Journal excluded unless explicitly requested.
- Typed links, bounded cross-category graph neighborhoods, persisted positions, connection lists, focus selection.
- Inbox import of JSON or ZIP ChatGPT exports, preview, account namespaces, original upload retention, source branches/roles, duplicate handling, revised source history, manual message extraction and source links.
- IndexedDB pending captures, local editor drafts, conflict rejection and recovery-copy actions, offline text capture screen, pending export.
- Consistent snapshots, manifests, verified restore, portable ZIP export/import, Docker packaging, separate-device/off-site restic runner.

## Not yet complete compared with the full blueprint

- No semantic/AI search, AI summaries, transcription, or automatic ChatGPT synchronization.
- No embedded media extraction from ChatGPT ZIPs; original archive remains downloadable.
- No streaming or resumable large import job; current bounded imports are atomic and safe to retry.
- No full-network clustered overview, saved board history, global browser navigation history for graph focus, or layout-reset undo.
- Search is paginated FTS; no dedicated fuzzy aliases or date/source filter controls yet.
- Area names are initial fixed navigation choices; arbitrary editable areas/multiple memberships are not yet implemented.
- Editor uses plain text/Markdown source, with no rich-text preview. Untrusted HTML remains text.
- Offline mode captures text; it does not provide a full offline library or queued attachment uploads.
- Local draft storage is browser-local, unencrypted, and should be used only on a trusted device. No shared-device mode yet.
- No automated stale-backup notification or host-down monitor is configured. restic jobs require a real repository, scheduler, credentials, and independent alerts.
- No automatic local-snapshot pruning or attachment garbage collection; monitor disk use.
- Not yet validated against the owner’s actual ChatGPT export, homelab, reverse proxy, or target-device performance at the blueprint’s large fixture sizes.

No real personal content is seeded. API and desktop/mobile browser checks use synthetic examples, including offline capture and reconnect. Do not present this initial release as a production deployment until deployment and independent recovery have been verified.
