# Saved branching overview

Verified 2026-11-08 for `TreeTutor-7t3.7.1` against the built app.

Saved-tree navigation now lists roots. Each overview follows saved parent links to display its root and descendants once, with visible connections and the selected passage on child boxes. Connection metadata retains source message ID and UTF-16 offsets, including repeated passages. The state endpoint supplies this metadata without transcripts or inherited context snapshots.

Opening a box uses the existing chat. Returning by button or Escape keeps the mounted overview and restores the originating Open control. React Flow retains measured node state; focus waits for node initialization. The hidden overview uses container opacity, `inert`, and `aria-hidden` so its controls cannot paint over or receive input within the focused chat. The required React Flow stylesheet is bundled as inline CSS alongside the existing application styles.

## Reproduce

Run `npm test`, `npm run build`, then `node scripts/verify-tree-overview.mjs`. The browser check requires `agent-browser` and its installed browser. It starts an isolated loopback server, a temporary SQLite database, and its own browser session. All content and delayed provider replies are synthetic; no account or provider credentials are used.

The browser check passed:

- A root, child and grandchild produce three boxes and two connections.
- Opening the root, starting a reply, and returning preserves the exact viewport transform and focuses its Open control. Reopening receives the original generation's completion, with only one user message and one generation.
- At 390×844, the composer remains inside the viewport and the document has no horizontal overflow.
- Selecting a passage, entering a question, and submitting with Tab/Enter opens the new child with composer focus. Returning shows the fourth box.
- Selecting another saved root shows only that tree's box and no connections.

The integration suite passed 17 tests, including a new state-endpoint/restart check for nested source links and repeated-passage offsets. Build passed. `npx astryx doctor --built dist` and `npx astryx doctor --built .` reported zero failures. Advisories remain for the theme package's font import (the existing Vite alias serves Figtree locally), source styling conventions, and bundle size. The Impeccable source detector reported no deterministic findings. A fresh visual review found and then confirmed resolution of the hidden-overview overlay in recaptured desktop (1440×900) and mobile (390×844) screenshots under `.impeccable/review/` (ignored local artifacts).

This verifies navigation with a synthetic provider. It does not establish new live provider behavior, movable/persisted box positions, exact passage-handle geometry, or final transition motion; those remain separate tasks. Panning and zooming survive focused-chat navigation within the mounted tree; this increment does not persist the viewport across page reloads.
