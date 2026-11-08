# Independent branch streaming

Task: TreeTutor-7t3.8.1. Verified 2026-11-08.

## Change

Each local turn retains its owning conversation and persisted user/reply IDs independently of selected focus. Navigation merges saved checkpoints with the latest owning stream. Polling skips locally streamed conversations and rejects reads superseded by navigation or turn completion. A navigation read crossing turn completion reloads the saved conversation. The server already scopes generation, checkpoints and cancellation by conversation; no new background service was needed.

## Deterministic checks

- `npm test`: 22/22 pass. New sibling-branch fixture interleaves three turns (two siblings and another root), reuses provider item IDs across owners, rejects a duplicate submit, checks saved partial text after every event, verifies SSE/user/reply ownership, and compares complete records after SQLite reopen. Reconciliation checks verify stable message IDs, no duplicates and replacement of stale partial text.
- `node scripts/verify-branch-streaming.mjs`: built app in an isolated agent-browser session and temporary database. Submit both sibling branches, advance interleaved partial replies, hold an older navigation response, submit in another tree, return to each branch, finish all turns and reload. Also hold navigation across turn completion to check a completed checkpoint cannot regress. User messages remain singular and output stays with its owner.
- `node scripts/verify-canvas-navigation.mjs`: existing desktop/mobile browser journey passes, including drafts, focus, two background replies, view transitions, reduced motion and mobile composer reachability. Existing layout and controls are preserved.
- `npm run build`, `git diff --check`: pass. Impeccable detector found no deterministic issues. `npx astryx doctor --built dist`: zero failures. Existing large-bundle and font-verification warnings remain.

## Live provider check

`node scripts/verify-branch-streaming-live.mjs` passed at 2026-11-08T22:26:13Z. It acquired the app's credential-directory lock and used existing app-owned ChatGPT consent, with synthetic branch snapshots and isolated temporary SQLite/provider history. No shared CLI credentials or API-key fallback were used. The two sibling conversations had distinct provider threads; observed provider `turn/started`/`turn/completed` notifications established two overlapping turns.

| Branch | Model | Duration | SSE text events | Saved characters | Result |
| --- | --- | --- | --- | --- | --- |
| Copper grove | gpt-6.1-sol | 13,185 ms | 444 | 2,171 | completed |
| Silver grove | gpt-6.1-sol | 13,385 ms | 446 | 2,105 | completed |

Each reply recalled its own fictional grove name/material/count and omitted the sibling's fictional name. Original questions and final replies matched saved records exactly; saved checkpoints were checked during streaming, and active turns cleared. Synthetic snapshots were seeded directly for this focused concurrency check; this run does not repeat live compaction. Live concurrency was checked through HTTP/provider notifications; navigation was checked in the deterministic browser fixture. Failure, Stop and interrupted-restart acceptance belong to TreeTutor-7t3.8.2.
