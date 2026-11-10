# Branch connections at source messages

Verified 2026-11-09 for `TreeTutor-7t3.20`, against PRD canvas requirements and acceptance criteria 1, 3 and 9. Prerequisite `TreeTutor-7t3.19` is closed.

`Conversation` renders each outgoing Handle inside the transcript row matching the saved `messageId`. The bottom passage list is removed. The existing edge label still contains the full selected passage, and the child's Reveal source passage control still opens the parent at the exact UTF-16 range with focus on the highlight.

Handles for the same message are evenly spaced vertically within that row. A spacing-token minimum row height keeps their centres at least one spacing-2 step apart. This adds a little row height for unusually many branches, rather than stacking their handles. A saved relation whose source message is absent from its parent's transcript retains a Handle at the node's right-side midpoint. Folding still removes outgoing Handles and hides descendant nodes and edges.

`useUpdateNodeInternals` now runs on preview and fold changes as well as source changes. Initial placement waits for preview data and a render frame before reading the Handle centre. The browser fixture caught the earlier race: React Flow had received preview data but still rendered the empty box, so its midpoint was used for placement. With the fix, the first child starts to the right with its top level with the source Handle. `placeBox` remains unchanged and can move a child downward to clear occupied space. Previously saved positions remain in place.

## Evidence and boundaries

All browser scenarios use seeded temporary SQLite data and a synthetic provider. They exercise the actual production build, Chromium layout and input, loopback HTTP/SSE, layout saving, and reopening SQLite plus the HTTP app in the same fixture process. They do **not** establish new native Claude/Codex inference, authentication, session resume, or provider-specific release acceptance. No account credentials or external inference were used.

Raw geometry and passage labels are recorded in [message-row-branches-results.json](message-row-branches-results.json): 70 samples across 14 stages, with maximum source and target endpoint errors of 0 screen pixels. Every sampled edge is checked against both its source Handle's outer edge and its target Handle's outer edge, in screen coordinates. Source Handles must lie within their message row and on the node's right edge; fallback Handles must remain at the node midpoint. The fixture allows less than one screen pixel of endpoint error. Refetching a shorter preceding reply moved the source offset from 187.171875 to 147.171875 canvas units, then back on restoration, with its edge attached throughout.

`node scripts/verify-canvas-positions.mjs` covers:

- Five question/answer turns; two branches from reply 2, a branch from reply 5, a grandchild, and a seeded stale relation with no matching parent message.
- Separate source positions within reply 2; reply 5's different row; level initial placement where space permits; no bottom passage list; exact passage accessibility labels.
- Child and parent pointer dragging, Arrow/Shift+Arrow movement, unchanged sibling coordinates and movement announcements.
- Child fold/unfold, retaining the incoming edge, and parent fold/unfold, hiding all five descendant edges.
- A new question and a gated reply through short, growing and completed SSE states. The midpoint fallback follows node growth. A changed preceding row is refetched during active polling, moving the source row and its Handles together, then restored.
- Browser reload and reopening SQLite/HTTP app; exact saved tree metadata, root messages, child anchor and context snapshot remain intact.
- Desktop/mobile resize, exact repeated/emoji source reveal with highlight focus and scrolling, and chat-arrow isolation.
- Failed layout writes and retry, placement of a new child around moved boxes without changing existing positions, and explicit rejection of stale passage offsets.

`node scripts/verify-tree-overview.mjs` also checks nested source-row Handles and keyboard activation of the grandchild's Reveal control, alongside existing generation continuity, viewport/focus return, mobile composer, immediate branch focus and separate-tree isolation.

`node scripts/verify-map-gestures.mjs` passes with the Handle selector updated to its new location. It retains wheel zoom, background pan, drag-without-opening, keyboard opening and passage-reveal coverage. `node scripts/verify-node-previews.mjs` passes the prerequisite's ordered-message, truncation, active-only polling and navigation checks.

## Quality gates

- `npm test`: 57/57 passed, including source-height/collision placement checks and HTTP/SQLite persistence coverage.
- `npm run build`: passed. Existing Vite bundle-size advisory remains.
- `npx astryx doctor --built dist`: 20 pass, 2 existing theme/font warnings, 0 fail. The existing Vite alias continues to serve Figtree locally.
- Impeccable detector on `src/TreeOverview.tsx` and `src/layout.ts`: no deterministic findings.
- Desktop 1440×900 and mobile 390×844 fixture captures reviewed under ignored `.impeccable/review/`. The final movement captures include intentional manual overlap; initial placement and new-child collision assertions separately check that automatic placement avoids overlap. Neighbour movement on growth remains outside this issue.

No staging, commit, push, pull or remote sync was performed. Existing unrelated Ralph/workflow edits were preserved. Ralph owns the pending implementation commit.
