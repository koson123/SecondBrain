# Private second brain — implementation plan

Status: ready for staged implementation. No app has been built or deployed by this planning task.

## 1. Outcome and settled requirements

Build an independent, private, self-hosted personal knowledge application that catches ideas quickly, preserves conversation history, helps the owner resume unfinished work, and brings forgotten material back into view without overwhelming him.

The experience should feel like a calm visual workspace. Connected cards and spatial exploration are central, supported by excellent search and straightforward lists. Reading long notes remains possible, but a wiki article is not the primary interaction model.

Settled requirements:

- Six top-level categories: Inbox, Projects, Life areas, Ideas, Knowledge, Archive.
- Journal is inside Life areas, never a seventh top-level category.
- This is an independent project, with no integration or dependency on another project.
- Self-hosted storage and access; no public publishing by default.
- Computer and phone support, with fast capture and progressive disclosure.
- Preserve original imported conversations alongside linked, useful extracts.
- Automatic versioned backups, a separate physical copy, encrypted off-site protection, and verified restores.
- Readable exports and no dependency on AI for ordinary use.

Success means: a fleeting thought can be captured, a forgotten idea can be rediscovered, and a project can be resumed without searching through multiple old chats. Visual complexity, note count, and time spent organizing are not success measures.

## 2. Product boundaries

First complete release: one owner account; capture; editing; categories; optional images and attachments; projects; Journal; typed connections; card and focused graph views; search; controlled chat imports; version history; export; private deployment; backup and recovery.

Later, only if useful: local transcription, semantic search, AI-assisted summaries and link suggestions, calendar integration, and additional capture entry points.

Do not begin with multiplayer, a native iOS app, public sharing, an AI agent controlling the system, an unrestricted browser scraper, a complex scheduling suite, or a 3D animated universe. These add maintenance and failure modes before the core has earned trust.

Working name: “Second Brain.” Naming and branding do not block development.

## 3. Information model and category behavior

Categories are navigation and organization, while entry types control useful fields. One item can appear in several meaningful contexts without duplicating its content.

| Category | Purpose | Default view |
| --- | --- | --- |
| Inbox | Unprocessed captures, with original creation date and source | Compact cards, oldest unprocessed available |
| Projects | Chosen work with an outcome and next action | Active project cards |
| Life areas | Ongoing responsibilities and personal life | Area cards, including Journal |
| Ideas | Possibilities without an obligation | Visual cards, optional interest/status filters |
| Knowledge | Reusable explanations, instructions, and research | Searchable cards/list |
| Archive | Inactive or completed material and preserved source records | Search/list, with archived status explicit |

Inbox processing assigns a destination or archives an item. It never deletes the original capture silently. An idea can become a project by creating a linked project, preserving the idea’s original identity and history. Archiving is a reversible state, not a move that breaks links. Trash is separate from Archive.

An area can contain related projects and notes through membership links. Journal is a special area with entries underneath it. Faith, Health, School, and Finances can be seeded as editable area names; no sensitive personal content is automatically populated.

## 4. Visual language

Default concept: dark warm-neutral background, gently elevated cards, restrained category accents, soft edges, clear typography, and limited animation. Include a light theme. Final colors can change during prototype review without changing the architecture.

- Body text at least 16px in reading views; comfortable line length and spacing.
- Color supplements labels and icons; it never carries meaning alone.
- A card shows a title, up to two preview lines, type/status, and optional thumbnail.
- Images are optional. Use a simple category icon when none exists; do not automatically send content to an image service.
- Calm density is default: six category entry points, three Continue cards, one Rediscover card.
- Hide advanced metadata, graph controls, and maintenance settings until requested.
- Respect reduced-motion settings; no continuous drifting, pulsing, or celebratory animation.
- Empty states explain one next action rather than presenting fake productivity data.
- Avoid streaks, guilt-inducing badges, public activity counts, and a growing wall of overdue ideas.

## 5. Screens and navigation

### 5.1 Home

Desktop: compact left navigation, central workspace, global search, and one Capture action. The main surface contains a capture field, six category cards, Continue, and Rediscover. Narrow layouts stack these elements and collapse navigation.

Home answers three questions: What do I want to save? Where do I want to go? What would I like to pick back up?

A discreet status menu reports last successful local backup, off-site backup, and pending device captures. A failed protection check becomes a clear, readable notice. The system must never show “backed up” merely because an edit saved to the server.

### 5.2 Category screen

Cards and List are always available; Explore is available for connected material. Keep search/filter controls collapsed until needed. Default sorting is appropriate to the category, and saved preferences persist.

Projects initially show active items with “where I stopped” and next action. Ideas show possibilities without due dates by default. Knowledge supports topic and source filters. Archive searches preserved information without cluttering current work.

### 5.3 Explore canvas

Use a 2D card canvas, blending a constellation’s discovery with a board’s readable cards.

- Start with the selected entry and up to six nearest relevant connections.
- “Show more” reveals additional connections in batches; show the remaining count.
- Selecting a node updates the focus without opening every adjacent branch.
- Separate Expand from Open so a click has a predictable result.
- A desktop side panel opens the selected entry; a mobile sheet/page offers the same content.
- Back/forward restores previous focus, filters, zoom, and pan.
- Fit selection, return to center, and breadcrumb controls prevent getting lost.
- Dragged positions persist per board/view. Reset layout is reversible.
- Manually arranged boards and automatically laid-out neighborhoods have separate layout records.
- A full-network overview is optional and filtered. With large collections, show grouped summaries first and load more detail on demand.
- Journal and raw conversation-message nodes stay out of the broad graph by default.
- Search results can open a focused neighborhood directly.

Connection labels appear on selection or request, rather than crowding every line. Differentiate confirmed links from optional suggestions; suggestions do not enter the permanent graph until accepted.

Keyboard navigation and a Connections list provide access to everything without requiring dragging or interpreting a graph.

### 5.4 Entry panel/editor

Show title, content, save status, a small Related section, and source references. Put full metadata, history, and export in secondary controls. Support Markdown text with safe rendering, lists, checkboxes, links, images, and attachments. Start with a reliable editor instead of a large custom rich-text engine.

Save states: Saving locally, Pending upload, Saving to server, Saved to server, Conflict, and Save failed. These must reflect actual acknowledgement. Autosave after a short pause; retain a local draft until the server confirms the revision.

Renaming does not break links because internal relationships use stable IDs. Unresolved links can create a placeholder after an explicit action; the app must not manufacture hundreds of empty notes from imported text.

### 5.5 Project page

Default fields: desired outcome, state, current handoff/where I stopped, next action, related material, and decisions. States: planned, active, paused, completed, archived. Dates are optional. A project may contain a small checklist without becoming a full task-management product.

Finishing a work session should require only updating the handoff and next action. Changes to decisions preserve previous versions and their sources.

### 5.6 Life areas → Journal

Open Journal from Life areas. Default to a readable date-ordered entry list with Write today and optional calendar navigation. Multiple entries per day are allowed. Dates can be changed for retrospective writing; preserve original creation timestamps.

An entry can be one sentence. Optional prompts: What happened? What is on my mind? What do I want to remember? Do not require mood tracking, prompts, or a daily streak.

Journal entries are excluded from Home previews, Rediscover, external processing, and the global graph by default. They remain accessible within Journal and can be included in search through an explicit scope control. Search snippets respect that choice. Linking to an entry does not expose its contents in unrelated cards automatically.

These are visibility controls inside the app, not protection against a person who controls the server. Server-side encryption and host security need separate treatment.

### 5.7 Search

Begin with title/body full-text search plus filters for category, type, status, date, and source. Support aliases, e.g. a nickname for an idea. Rank exact title matches and meaningful matches before incidental mentions. Show the matching excerpt, date, and source type so results are recognizable.

Group raw conversation hits beneath a conversation result rather than flooding the list with messages. Search includes preserved content according to scope, with Archive explicitly labeled. Deleted material stays excluded. Offer a clear zero-results state and the ability to broaden scope.

Semantic search is a later enhancement. Ordinary search must stay useful without an embedding model, vector service, or network call.

### 5.8 Import, export, and maintenance

Settings contain account/session management, imports, exports, backup details, trash, storage use, and recovery instructions. Maintenance should not dominate normal navigation.

## 6. Daily workflows

### Capture a thought

Open Capture → type anything → save locally immediately → send to server → land in Inbox. Title and categorization are optional; derive a provisional title from the opening text. Optional browser attachment upload happens after the basic capture is safe. Initial offline capture is text-only; media capture remains online-only until attachment queueing is tested.

### Sort without committing

Open Inbox → keep in Ideas, attach to a project/area, make a Knowledge note, or archive. No mandatory tagging. “Maybe someday” must not become an overdue task.

### Resume work

Open Continue or a project → read handoff → follow next action → update handoff when stopping. Relevant source conversations are one step away.

### Rediscover

Show one eligible idea at a time. Options: Open, Another, Later, and Stop resurfacing. Use deterministic age/review rules initially; no AI needed. Favor material not shown recently, honor dismissals and snooze dates, and exclude Journal, trash, and raw chat messages. A dismissed idea is not deleted.

### Review

An optional weekly review view offers Inbox, active projects, and a few older ideas. No push notifications or scheduled messages are created by this plan. Notifications can be configured later with an explicit destination.

## 7. Conversation import and trustworthy extraction

The initial input is a user-supplied data export or supported conversation file. Do not assume automatic access to the entire ChatGPT account or continuous synchronization. An import feature preserves provided data; it does not itself back up future chats that have not been exported.

Import workflow:

1. Upload into private staging; validate format, file size, path safety, and available disk space.
2. Detect the supplied export schema from the actual sample. Unsupported schemas produce an explanation, not a guessed conversion.
3. Preview conversation count, date range, attachments available, and warnings.
4. Commit import jobs with resumable progress and a report of successes/skips/errors.
5. Preserve the untouched original input and checksums.
6. Store conversations and messages with original IDs, timestamps, author roles, ordering, and branch relationships when present. Do not silently flatten alternative branches into one supposed history.
7. Index source text for search. Missing images or attachments remain marked as missing.
8. Support manual extraction into an idea, decision, project handoff, or knowledge note, linked to exact source message IDs and selected text.

Use import fingerprints and source identifiers to make repeat imports idempotent. A changed conversation may add new messages or preserved revisions; it must not duplicate every previous message or erase old source content. Conflicting IDs across different accounts/source namespaces remain distinct.

Future assisted extraction creates reviewable proposals. Store the producer (manual or model), source range, creation date, and review status. Separate the owner’s words from assistant suggestions. Never mark an assistant recommendation as an accepted decision unless the source supports that conclusion or the owner confirms it. Extracted summaries never replace source records.

## 8. Data architecture

Proposed starting architecture: TypeScript frontend with React and a custom card interface; React Flow for focused graph/board interactions; a Node.js API serving the built frontend; SQLite with full-text indexes on a local persistent disk; private filesystem storage for attachments and original imports. Pin compatible package versions and confirm licenses during scaffolding rather than assuming version numbers in this plan.

Why: a single-owner application can start with one server process and one database, with no separately operated search or graph database. A graph is represented by entry and connection records; a specialized graph database is unnecessary for the planned scope. Reassess using measured performance if scope changes.

| Entity | Main data |
| --- | --- |
| User/session | Owner identity, password hash, expiring sessions, recovery metadata |
| Entry | Stable ID, title, body, type, state, timestamps, revision, deleted timestamp |
| Category/area | Stable ID, name, ordering, display settings, parent when relevant |
| Membership | Entry-to-category/area placement without content duplication |
| Connection | From/to IDs, relationship type, creator, timestamps, review state |
| Entry revision | Recoverable content and metadata revision with actor/source |
| Attachment | Hash, MIME type, size, storage key, original filename, owning references |
| Source/conversation/message | Original identifiers, roles, branches, content, timestamps |
| Source reference | Link from a derived entry to a specific source range |
| Import job | Fingerprint, parser version, progress, warnings, result counts |
| Board/layout | Scope, positions, viewport, pinned nodes, layout version |
| Review state | Last shown/reviewed, snooze, rediscovery preferences |
| Backup run | Destination label, snapshot ID, time, verification state, error summary |

All timestamps are stored in UTC and displayed in the configured user timezone, initially America/Denver. Journal day grouping follows that timezone. Use explicit schema migrations, foreign keys, transactions, and tested restore compatibility. Derived search indexes and thumbnails can be rebuilt; original content cannot.

Suggested code organization: frontend, API, shared validation/types, database/migrations, import adapters, backup/export scripts, integration tests, and operator documentation. Source should be version-controlled separately from private application data. No personal exports or backup credentials go into source control.

## 9. API and save semantics

Plan resource endpoints for entries, connections, categories/areas, revisions, attachments, search, projects, Journal queries, imports, exports, and protection status. Every content endpoint requires authentication; health checks reveal no private information.

Use optimistic concurrency: updates carry their base revision. A stale update gets a conflict response, not silent last-writer-wins. Offer both versions and preserve a conflict copy. Creating a capture uses a client-generated operation ID so reconnect retries cannot duplicate it.

Connections and memberships are validated against the same owner and committed transactionally. Batch graph requests fetch a bounded neighborhood with pagination. Uploads use temporary files, limits, checksums, atomic finalization, and cleanup of abandoned staging files. Permanent attachment deletion happens only after references and retention are checked.

## 10. Offline behavior and device safety

Build an installable web experience with a cached application shell and an IndexedDB text-capture queue. A first visit requires connectivity and HTTPS. Do not promise access to the entire library offline in the first release.

- Pending captures persist across reloads and retry only after authentication/connectivity returns.
- A visible pending count distinguishes device-only data from server data.
- Conflict-safe retries use operation IDs and base revisions.
- Expired login pauses uploads without discarding drafts.
- Browser storage can be cleared or evicted; local queues are temporary protection, not backups. Offer download of pending captures and request persistent storage when supported.
- Signing out with pending captures offers export/sync before clearing data. Shared-device mode avoids retaining sensitive caches.
- Explicitly select any later offline reading cache; Journal is not silently cached wholesale.

## 11. Privacy and security

One owner account, no open registration, hashed password, secure HttpOnly session cookies, session revocation, CSRF protection, login throttling, and a tested recovery process. Expose through HTTPS on the private network/VPN; no public port forwarding by default.

Sanitize rendered Markdown/HTML and treat imported content as untrusted data. External links cannot execute scripts. Block automatic remote image loads by default so opening a private note does not leak its viewing activity. Serve sensitive attachments through authenticated routes, not a public static folder.

Use restrictive filesystem permissions and a non-root application process where practical. Bundle fonts/assets locally and omit analytics or third-party tracking. No external AI calls by default. Redact sensitive content, tokens, and passwords from logs; log request IDs, operation status, and timings rather than note bodies.

Private hosting is not end-to-end encryption: the running server needs to read stored notes. Encryption at rest for the host is a deployment decision; encrypted off-site backups are required. Keep backup recovery keys separately from the server and its encrypted repository.

## 12. Backup and disaster recovery design

Protection has distinct layers: device draft, server save, revision history, separate-device backup, and encrypted off-site backup. Show their actual state independently.

Proposed starting schedule, adjustable after storage sizing:

| Layer | Frequency / retention | Purpose |
| --- | --- | --- |
| Local drafts | On editing | Protect against navigation/reload interruptions |
| Server revisions | Each meaningful saved revision, with bounded coalescing | Undo mistakes; deletion recovery |
| Separate-device backup | Hourly; retain 48 hourly and 30 daily recovery points | Limit host/device failure loss |
| Encrypted off-site backup | Nightly; retain 30 daily, 12 weekly, 12 monthly points | Survive loss of the homelab/site |
| Integrity check | Weekly metadata checks; rotating data reads monthly | Detect repository problems |
| Restore exercise | Before launch, after material changes, then quarterly | Demonstrate recovery works |

Use application-consistent backup bundles. Briefly gate mutations during database snapshot/manifest generation; finish active uploads or exclude uncommitted ones. Create a SQLite backup through a supported backup mechanism, capture a manifest of all referenced immutable attachment/import hashes, and keep those objects until the bundle is complete. Do not copy a live database file casually and assume it is consistent.

Back up database, referenced objects, original exports, schema/app version, configuration needed for recovery, and a checksum manifest. Protect necessary secrets separately in an encrypted recovery package. Exclude rebuildable caches, while documenting how to regenerate them.

Restic is the proposed snapshot/retention engine. Final backend configuration waits for the chosen destination. A separate local disk on the same host is weaker than a separate device; snapshots inside the VM are not the independent copy. If supported, use separate backup credentials and deletion protection so a compromised app cannot erase all historical backups.

Track exit status, snapshot creation, checksum/integrity results, last success, and backup age. Failure warnings remain until resolved. An independent monitor/notification route is needed to report a completely failed host; an in-app banner cannot do that. Select that route during deployment without automatically sending messages.

Recovery targets: at most about one hour of server-acknowledged changes lost for an isolated host failure if hourly separate-device jobs are healthy; up to one nightly interval for complete site loss if off-site jobs are healthy. Device-only drafts are outside those guarantees. Measure restore time in the exercise; aim for recovery within half a day once replacement hardware/access are available. These are design targets, not zero-loss promises.

Restore drill: provision isolated test storage → restore selected snapshot → verify manifest and DB integrity → start matching app version → open representative notes, Journal, links, original messages, and attachments → record result → document any missing dependency. Test an older retained snapshot too. Do not connect the test instance to production backup/prune jobs.

## 13. Export and exit strategy

Export a versioned archive with Markdown entries, JSON metadata/connections/memberships, layouts, revisions as an optional history bundle, source records, original imports, attachments, and a manifest/readme. Use stable IDs and relative links so renames are safe. Mark absent attachment bytes clearly.

Test reimport of the portable export into a clean instance and compare entry counts, connection counts, content hashes, and samples. A readable export is valuable, but not a substitute for a full recovery backup. Source exports and application backups serve different purposes and must be labeled separately.

## 14. Implementation sequence and completion gates

| Phase | Work | Gate before proceeding |
| --- | --- | --- |
| 0 — Scaffold | Source repo, package versions, scripts, schema design, config validation, local run instructions | Clean start from documented commands; no private data in fixtures |
| 1 — Interaction prototype | Home, categories, card layouts, focused Explore, side panel, Journal under Life areas | Desktop/mobile layouts reviewed; keyboard/reduced-motion behavior works |
| 2 — Durable core | Database migrations, auth, entry CRUD, revisions, attachments, categories, connections, first export/snapshot command | Save/reload/restart persists content; unauthorized access fails; sample backup restores |
| 3 — Everyday use | Project handoffs, Journal, full-text search, Inbox processing, archive/trash, rediscovery | Capture/find/resume/journal flows pass end-to-end checks |
| 4 — Visual navigation | Persistent layouts, bounded neighborhoods, labeled edges, graph filters, preview panel, mobile alternative | Navigation stays understandable with a realistically sized fixture dataset |
| 5 — Offline capture | Cached shell, text queue, idempotent sync, conflict resolution, pending export | Airplane/reconnect/reload/conflicting edit scenarios preserve content |
| 6 — Conversation archive | Actual export schema adapter, staged preview, source preservation, branch-safe records, deduplication, manual extraction | Repeated import adds no duplicates; interrupted jobs resume; exact source links open |
| 7 — Homelab release | Container packaging, HTTPS/VPN route, separate-device/off-site schedules, alerts, recovery guide | Restore exercise succeeds; off-site target and key recovery validated |
| 8 — Optional assistance | Local transcription/semantic search/summary proposals, only after a specific need | Core remains usable with assistance disabled; journal scope and provenance honored |

Phases 1 and 4 are distinct: first establish how it feels with sample data; later harden visual navigation against real data. Protection commands appear in phase 2 so real notes are not introduced into an unprotected prototype.

Each phase produces a runnable checkpoint, updated run instructions, evidence of relevant checks, and an honest list of unfinished behavior. Do not present fixture content, a disconnected save button, or mock backup status as working functionality.

## 15. Verification plan

Automated tests focus on failure-prone behavior rather than mirroring UI markup:

- Entry saves, stale revision conflicts, undo/restore, archive vs trash, and stable links after rename.
- Search scope, Journal exclusions, source role handling, and archive labeling.
- Auth on every API/attachment route, sanitized imported content, upload/path traversal limits.
- Import retries, duplicate exports, revised conversations, branches, missing media, malformed files, and job interruption.
- Offline queue persistence, expired sessions, retry idempotency, and two-device conflicts.
- Consistent backup with concurrent writes/uploads, failed destination, corrupted sample object, retention selection, and clean restore.
- Portable export/reimport equivalence.

Manual browser checks: desktop plus phone-sized touch layout, keyboard-only navigation, visible focus, readable contrast, reduced motion, zoomed text, empty states, failed saves, and long titles/content. Capture/export/restore are release blockers; decorative refinements are not.

Performance fixtures: 5,000 normal notes, 25,000 connections, and a separate 100,000-message conversation dataset as test workloads, not capacity guarantees. Test bounded graph loading, search pagination, import memory, and responsiveness. Aim for ordinary navigation/search feedback within roughly 500ms on the selected host for typical queries; profile before changing databases. Record actual host and measurements.

## 16. Deployment and operations

Prepare container build, Compose definition, example configuration without secrets, health checks, documented persistent volumes, and one-command local start. SQLite data belongs on a local host disk, not an unsupported shared network database mount. Backups can go to network destinations independently.

Use a dedicated deployment directory and backup identity. Provisional sizing: 2 vCPUs and 2–4GB RAM, adjusted after measurement; original exports/media determine disk needs. Do not choose an IP, modify firewall rules, assume a free VM ID, or alter an existing service without checking current homelab state at deployment time.

An upgrade procedure takes and verifies a recovery point before migrations, records the image/version, and documents rollback by restoring the matching data snapshot. Never run an older application blindly against a newer schema. Provide disk-space monitoring and graceful refusal of oversized imports before storage fills.

## 17. Execution defaults and unresolved deployment details

Development can start with these defaults: independent app; single owner; six agreed categories; Journal under Life areas; muted dark theme with light option; focused 2D canvas; text-first offline capture; no external AI; sample-only content until durable storage/protection are working; ordinary full-text search first.

Details needed later, not blockers for building the app:

| Detail | Needed when | Safe behavior until resolved |
| --- | --- | --- |
| Target homelab host and access method | Deployment | Run local development/test only |
| Separate physical backup destination | Real-data launch | Report protection incomplete; keep test content disposable |
| Encrypted off-site destination | Protected launch | Provide backend-neutral configuration; do not claim off-site safety |
| Recovery-key storage | Off-site configuration | Do not rely on a key stored only on the protected server |
| Independent failure-alert route | Deployment | In-app status works, external host-down alert remains incomplete |
| Actual conversation export | Import validation | Use clearly labeled synthetic fixtures; no claims of historical completeness |
| Final app name and aesthetic adjustments | Prototype review | Use working name and documented visual defaults |

This plan is sufficient to begin implementation. Network access to the owner’s actual server and a chosen off-site location are required to finish deployment and protection, not to start building. No account, paid service, public deployment, or server change has been created by this document.

## 18. Design references and technical documentation

Inspiration is selective; these examples are not claims that their owners use this proposed architecture or backup policy.

- Steph Ango, linked notes, personal capture, and rediscovery: https://stephango.com/vault
- Jacky Zhao, personal hypertext garden: https://jzhao.xyz/
- Quartz, local/global graph behavior: https://quartz.jzhao.xyz/features/graph-view
- Gwern, previews and progressive detail: https://gwern.net/design
- Maggie Appleton, rough thoughts and developed connected notes: https://maggieappleton.com/roam-garden
- Simon Willison, source archives and personal data exploration: https://simonwillison.net/2020/Nov/14/personal-data-warehouses/
- PARA organization: https://fortelabs.com/blog/para/
- React Flow implementation reference: https://reactflow.dev/learn
- SQLite consistent backup mechanism: https://www.sqlite.org/backup.html
- IndexedDB device queue foundation: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- Restic snapshots/backup reference: https://restic.readthedocs.io/en/stable/040_backup.html
