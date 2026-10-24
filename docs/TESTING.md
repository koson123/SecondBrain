# Testing Second Brain

The suite checks normal use, malformed input, concurrency, browser failures, and recovery using synthetic data in temporary directories. It does not touch your configured data directory or offsite backup account.

## Run locally

Use Node 24 or newer, then:

```sh
npm ci
npx playwright install chromium
npm run test:all
npm run test:coverage
npm run test:scale
npm run format:check
```

`test:all` builds the production application, runs the Node tests, runs the original browser end-to-end journey, and runs the browser regression scenarios. Browser tests exercise the built files, so build again after changing the frontend. `PLAYWRIGHT_EXECUTABLE_PATH` optionally selects an existing Chromium executable.

## Coverage map

| Area | Checks |
| --- | --- |
| Account and HTTP | Setup token, password validation, concurrent setup, login/logout, sessions, cookie flags, origin checks, body limits, malformed JSON, method restrictions, reserved paths, static assets and deep links |
| Notes and collections | Creation, partial updates, duplicate IDs, optimistic revision conflicts, Unicode, all collections, project fields, Journal privacy, archive, trash, restore, pagination, dates, snoozing and rediscovery |
| Search and graph | FTS punctuation and Unicode, Journal opt-in, stable pagination, exact-entry connections, endpoint validation, deleted notes, layout validation and persistence |
| ChatGPT imports | JSON and ZIP, duplicate and changed conversations, branches, missing or unusual fields, alternate text formats, expansion limits, preview lifecycle, preserved sources and extraction references |
| Files and history | Attachment bytes, filename handling, upload limits, revision history, restoration and export contents |
| Recovery | Snapshot verification, integrity checks, missing or corrupted files, password reset, revoked sessions, paths containing spaces, atomic restore failure, portable exports/imports, and simulated restic success/failure |
| Browser editing | Slow saves while typing, overlapping requests, late responses after closing, two-tab conflicts, conflict copies/downloads, failed saves, draft corruption, storage quota failure and manual retry |
| Browser navigation | Direct links, reload, back/forward, distinct pages, project board, Journal, source branch links, theme, Escape, narrow screens and long titles |
| Browser resilience | Failed related-information requests, graph reads/writes, link deletion failure, rediscovery failure, expired sessions, offline captures and invalid queued captures |

## Bugs found and corrected

The initial expanded server regression run reproduced 21 failing checks. Several checks described different symptoms of the same bug; this is not a count of 21 independent defects.

Corrections include:

- A slow save could replace text typed while that request was in flight, and a late response could reopen a closed editor. Saves now serialize and preserve the newest draft.
- A rejected save could enter an automatic retry loop. Failed drafts remain available for explicit retry.
- Partial updates could reset flags; conflicting note IDs could silently discard a new capture. Conflicts now return an error rather than pretending the capture was saved.
- Journal archive and trash filtering could hide entries from the expected recovery view. Journal entries remain excluded from ordinary discovery/search unless requested.
- Punctuation could break search, and rediscovery only considered a recent subset of ideas.
- Some ChatGPT content formats extracted empty text; source links could select the wrong branch when original message IDs differed from mapping keys.
- A restore failure could leave a partial destination. Restore now verifies a temporary staged copy before exposing it as the destination, and checks referenced attachments and original import files.
- A repeated import reported the previous import's added count. Duplicate imports now report zero additions.
- Missing accessible control names and unhandled request failures made several browser flows unreliable.

## Verified result (24 October 2026)

- 75 Node test cases and 25 Chromium regression cases passed.
- The original browser end-to-end journey passed, including offline capture and reconnect.
- Production build, TypeScript checking and formatting checks passed.
- Instrumented Node modules: 95.43% lines, 84.02% branches and 93.44% functions.
- Capacity probe passed with 5,000 notes, 25,000 connections and 100,000 source messages.

## Measurement and limits

The Node coverage command instruments server, importer, store, routing and recovery modules. It is not React component coverage or a guarantee that every branch is correct. Browser tests provide separate behavior checks.

The capacity probe uses 5,000 notes, 25,000 connections and 100,000 imported messages. Timings are measurements from the test machine, not guarantees for your server.

These tests cannot prove that every possible bug is absent. Actual Windows execution, Safari/Firefox, real device storage eviction, a representative private ChatGPT export, and a real offsite backup/restore drill still need validation in their target environments. The restic checks use a fake executable and do not certify a live remote repository. No offsite backup is configured by running the tests.
