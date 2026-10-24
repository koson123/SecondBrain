# Second Brain

A private, self-hosted visual home for thoughts, projects, knowledge, and journals. Built around six categories: **Inbox · Projects · Life areas · Ideas · Knowledge · Archive**. **Journal lives inside Life areas.**

No external AI, tracking, hosted database, or public note publishing. The public repository contains application code and synthetic test fixtures only. Keep all actual notes, exports, attachments, passwords, and backup keys outside Git.

## Run locally

Requires Node.js 24+ and npm.

```bash
npm ci
cp .env.example .env
# Edit .env: set a long random SETUP_TOKEN and your exact APP_ORIGIN.
# Example token generator: openssl rand -hex 32
npm run build
npm start
```

Open **http://localhost:3000**. Create the owner account using your setup token and a password of at least 12 characters. Owner creation is disabled without a matching server setup token. There is no open registration. Once the owner exists, the setup endpoint cannot create another account.

The example configuration is for HTTP on your own computer. For real use, put the app behind HTTPS on your home network/VPN, set `APP_ORIGIN` to the exact URL (including scheme and port), and set `COOKIE_SECURE=true`. Do not expose the port publicly. The app listens on loopback by default.

For frontend development, run the API as above and `npm run dev` in a second terminal. Set `APP_ORIGIN=http://localhost:5173` while using the Vite development URL.

## Pages and navigation

Each section has its own URL and page component. You can bookmark it, open it in a new tab, refresh it, and use browser Back/Forward:

| Page | URL | Layout |
| --- | --- | --- |
| Desk | `/` | Capture pad, collection index, and recent notes |
| Inbox | `/inbox` | Review list with direct Move to actions |
| Projects | `/projects` | In progress, Paused, and Finished columns |
| Life areas | `/life` | Journal notebook and ongoing-area index |
| Journal | `/life/journal` | Dated entries with a writing margin |
| Ideas | `/ideas` | Paper notes on a pinboard |
| Knowledge | `/knowledge` | Reference index |
| Archive | `/archive` | Compact archived-note list |
| Import | `/imports` | ChatGPT export preview and import |
| Settings | `/settings` | Account, exports, and protection |
| Search | `/search?q=...` | Search results with optional Journal scope |

Notes have shareable-with-yourself URLs such as `/ideas?entry=...` (authentication is still required). `?mode=explore` preserves the Connections view. Source-message links include the source ID in the URL. This remains a React application, with dedicated routes and modules rather than one file of state-switched views. `src/main.tsx` only mounts the application; page implementations live in `src/pages/`, and the editor, graph, authentication, and dialogs live in `src/components/`.

The updated visual design uses a paper-and-ink notebook style, a capture sheet, and different layouts for different kinds of content. Light and dark themes are supported. No database migration or deletion is required for the interface update.

## Everyday use

- **Capture:** type a note on Desk. It goes to Inbox; categorization is optional.
- **Organize:** open a card, choose a category, and add optional connections.
- **Projects:** record the outcome, where you stopped, and the next small step.
- **Journal:** Life areas → Journal → Write today. Entries are excluded from normal search, rediscovery, and broad connection lists by default.
- **Explore:** open a category’s Connections view. Start with one thought and a small neighborhood. Follow links, open notes, and drag cards; positions are saved per view. Cross-category links are included. Use the focus selector to start somewhere else.
- **Rediscover:** the Desk surfaces eligible Ideas. Snooze or stop resurfacing without deleting.
- **Search:** searches note content and the full imported conversation text. Explicitly enable Journal search when wanted.
- **History:** entries autosave after a pause and preserve revisions. Stale edits are rejected; download your draft, reload the latest revision, or save a conflict copy.
- **Attachments:** authenticated downloads, maximum 20 MB per file. Files are downloaded rather than executed/rendered inline.

## Import a ChatGPT export into Inbox

1. Open **Import conversations**.
2. Choose the original ChatGPT export ZIP or `conversations.json` extracted from it (100 MB maximum).
3. Review the conversation/message counts, example titles, and warnings.
4. Choose a stable account label, e.g. `personal`. Use a different label for another account.
5. Choose **Import into Inbox**.

Each conversation becomes **one Inbox card**. Open it → **Original conversation** to read messages and switch between conversation branches. Use **Keep as an idea** on a message to create a linked Idea with an exact source reference. This is a manual extraction, not an AI interpretation or confirmed decision.

Original upload bytes, message authors, parent/child relationships, alternate branches, and revised source snapshots are preserved. Reimporting identical data does not duplicate cards. Changed conversations update the source without overwriting your own card edits or moving processed cards back into Inbox. A transaction prevents partial imports; if a connection fails after commit, re-preview/reimport safely.

ZIP media stays preserved in the original ZIP, available under Settings → Export & sources. This release does **not** extract/render embedded media. JSON-only imports have no attachment bytes. HTML-only exports and unfamiliar schemas fail with a clear error. No automatic account synchronization: future chats need another export.

Preview staging expires after an hour; a restart requires selecting the file again. There is no long-running resumable importer yet; imports run atomically within the configured limit. Very large exports need splitting or a later streaming adapter.

## Offline capture

After an initial online load, the installed/cached app can offer a text-only capture screen if the server is unreachable. Captures go into IndexedDB and retry after you reconnect and sign in. The interface distinguishes device-only captures from server saves. Download pending captures before clearing browser data or changing devices.

The full note library is not cached for offline browsing. Browser storage can be evicted. Offline queues and local editing drafts are convenience protection, **not backups**. HTTPS is required for service-worker/PWA features outside localhost.

## Data and backups

`DATA_DIR` defaults to `./data` and contains SQLite, immutable content-addressed objects, staging, and snapshots. Place the live database on local disk. Do not commit this directory or use a network-mounted live SQLite database.

### Local recovery snapshot

Use Settings → Create recovery snapshot, or:

```bash
npm run snapshot
```

Creates an SQLite-consistent snapshot with source uploads, attachments, and a SHA-256 manifest under `DATA_DIR/snapshots`. A snapshot on the same device does not protect against device loss. Snapshots can contain login credentials and private notes; protect their permissions and encrypt external copies.

### Restore into a new directory

```bash
npm run restore -- /absolute/path/to/snapshot /absolute/path/to/new-data
```

The target must not exist. The command verifies checksums and SQLite integrity, copies the data, and clears sessions. Stop the production app, point `DATA_DIR` at the verified replacement, restart, and sign in with the restored password. Keep the previous directory intact until the restored installation is checked.

### Complete portable export

```bash
npm run portable-export -- /secure/location/secondbrain.zip
npm run portable-import -- /secure/location/secondbrain.zip /new/empty-data-directory
```

The ZIP includes readable Markdown notes, relationship metadata, original imports, attachment bytes, and a restorable database. It is **not encrypted**; write it to protected storage or encrypt it. The Settings JSON download is a content/metadata export, not a complete attachment backup.

### Automatic independent backups

See [deployment and recovery](docs/DEPLOYMENT.md). `scripts/backup.sh` creates a consistent snapshot, sends it through restic to a configured separate-device/off-site repository, and checks the repository. No destination is preconfigured and no backup safety is claimed before configuration and a restore drill.

## Docker

```bash
cp .env.example .env
# Configure setup token, HTTPS APP_ORIGIN, and COOKIE_SECURE=true.
docker compose up -d --build
```

Compose binds only to `127.0.0.1:3000` and uses a persistent named volume. Put a reverse proxy on the same host in front of it. If the proxy runs elsewhere or in another container network, adapt binding/networking intentionally while keeping access private. The image runs as the unprivileged `node` user. You must separately configure an independent backup of the persistent data.

## Checks

```bash
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

Tests exercise auth/origin rejection, idempotency, conflicts, Journal search isolation, JSON/ZIP imports, source revisions, roles/branches, source extraction, attachment persistence, and verified restore/corruption rejection. No real personal export is included in tests.

## Implementation status

### Blank page or asset MIME errors on Windows

Pull the latest `feat/private-second-brain` branch, stop the old server, run `npm run build`, then `npm start` and reload `http://localhost:3000` with Ctrl+Shift+R. The server uses platform-aware path containment for Windows backslashes and POSIX slashes. Missing hashed assets return a real 404 instead of the application HTML. Run the app through its Node server, not by opening HTML directly or using Live Server.

This is a working initial implementation, not a claim that every item in the [blueprint](docs/BLUEPRINT.md) is complete. See [status and follow-ups](docs/STATUS.md) for remaining work and deployment prerequisites.

Stack: React + TypeScript + Vite; React Flow for spatial exploration; Node.js HTTP API; built-in SQLite/FTS5; JSZip for controlled imports/portable exports. Dependencies are pinned in `package-lock.json`. No graph database or external search service is required.
