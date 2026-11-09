# Node previews: every message (TreeTutor-7t3.19)

Date: 2026-11-09. All evidence below is **fixture** (synthetic SQLite store, fixture provider, headless browser via agent-browser). No live provider was needed: the preview path never calls a provider.

## Behaviour

- `GET /api/previews?id=…` returns, per conversation, its messages in order as `{ id, role, text, status }`, read from `messages` on every request. Each text is cut at 512 code points with `…` (SQLite `substr`/`length` count code points; the client's live-turn cut uses `Array.from`, so both agree). No preview table or column; 500-id bound unchanged.
- `Conversation` (src/TreeOverview.tsx) renders one row per message with `data-message=<id>` and `data-role`. Questions: primary colour, medium weight, inline-start rule. Answers: secondary colour. Each row clamps to 3 lines and carries a screen-reader `Question:`/`Answer:` prefix. A trailing question shows `No reply yet.`. The node grows; there is no inner scroll area.
- Live turns: the in-flight question and streaming reply in `turns` are merged as the last rows via `withTurn`; streaming shows `Replying…` (`Thinking…` before text), failed/interrupted show `Reply failed.`/`Reply interrupted.` on that row.
- While replies run, the 1.5 s poll requests only the replying conversations; all visible conversations are loaded once when the visible set or active set changes.

Decision: kept the 512-code-point cut. Three-line clamp (up from two) because rows are now per message; the bound keeps each response small while the clamp sets what is shown.

## Checks

- `node --test test/preview.test.mjs`: order, ids, 512 cut on astral characters (🌳), empty conversation, streaming/failed/interrupted after reload, no extra tables. Pass.
- `npm test`: 56/56 pass.
- `node scripts/verify-node-previews.mjs`: PASS — rows in message order with matching `data-message` ids, prefixes, 3-line clamp, distinct question rule, no `overflow-y: auto|scroll` inside the node, unanswered, failed, streaming, interrupted, polling only the active root id, source reveal, reload.
- `npm run build`: pass. `npx astryx doctor --built dist`: 0 fail, 2 pre-existing theme-font warnings (Figtree external import).
