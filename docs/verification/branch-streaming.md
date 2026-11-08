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

## Concurrent-conversation acceptance

Rollup task: TreeTutor-7t3.8. Reverified 2026-11-08 after both implementation
tasks closed. Existing implementation satisfies the rollup without further
application changes.

| Acceptance criterion | Current evidence |
| --- | --- |
| Two conversations stream while navigation remains usable | `node scripts/verify-branch-streaming.mjs` passes with two sibling turns and a third conversation in another tree; `node scripts/verify-canvas-navigation.mjs` passes desktop/mobile navigation, focus and draft retention during two replies. |
| Output stays with its originating conversation across tree/focus changes | Streaming browser check interleaves events with identical provider item IDs, holds stale reads across navigation and completion, and verifies only the selected conversation's output appears. |
| One failure does not stop another conversation | Full `npm test` passes 26/26, including sibling failure/completion and retry, isolated Stop with late callbacks, graceful shutdown, and SIGKILL recovery with no inference replay. See [lifecycle evidence](branch-lifecycle.md). |
| Completed messages reopen correctly | Browser check returns to each sibling and reloads with singular user messages and correct completed replies; HTTP/SQLite tests compare saved records after database reopen. |

Live `node scripts/verify-branch-streaming-live.mjs` passed again at
2026-11-08T22:31:41.189Z using existing app-owned authentication and synthetic,
isolated data. Peak provider concurrency was two, with distinct threads.
Copper grove completed on `gpt-6.1-sol` in 15,601 ms (442 text events, 2,139 saved
characters); Silver grove completed on the same model in 13,681 ms (418 text
events, 2,035 saved characters). Both recalled their own grove facts, omitted
the sibling's name, and persisted exact user/final reply text. Active requests
cleared. This establishes live Codex concurrency; navigation, failure and
restart checks use deterministic providers. It does not establish Claude
concurrency or cross-provider continuity, tracked separately.

`npm run build` and `git diff --check` pass. `npx astryx doctor --built dist`
reports zero failures. Existing bundle-size and font-verification warnings
remain.
