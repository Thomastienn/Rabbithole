# Selected passage increment verification

Task: TreeTutor-7t3.6.1. Date: 2026-11-07 America/Edmonton.

## Automated checks

All 13 tests pass with `npm test`. The branch regression rejects mismatched text/offsets, unknown source IDs, split surrogate pairs and empty questions. Synthetic compaction failure and a SQLite trigger that aborts branch insertion leave no child and preserve the parent. Successful creation saves the exact anchor, question, fixed snapshot and inherited provider/model; child discussion and later parent messages leave the snapshot unchanged. Reopening SQLite preserves those records. Adapter checks assert model pinning and inherited context in both new and resumed Codex thread requests.

`npm run build` passes. Astryx built-output doctor reports zero failures; its existing theme/font metadata warnings remain, with Figtree bundled through the existing local alias. Vite reports its bundle-size warning. Impeccable detector returned no findings for ChatPage.tsx. Standards/spec reviews found one stale-selection edge case, corrected by clearing empty captures, and requested the live checks below.

## Live checks with synthetic learner content

Used the existing app-owned ChatGPT consent and Codex app-server. No shared CLI credentials were copied or changed.

- Created a root through the browser with keyboard submission. Asked it to remember the fictional tree Luma with 37 branches and return exactly `🌲 same phrase and same phrase`.
- Entered native read-only passage selection through the keyboard. End followed by Ctrl+Shift+Left twice selected the second `same phrase`, UTF-16 offsets 19–30. Tab/Enter opened the passage preview and editable question before any child existed.
- Submitted a question asking for inherited tree facts. Compaction returned `The fictional tree is named Luma and has 37 branches.` Child and parent both recorded `gpt-6.1-sol`; the child used its own provider thread and replied with Luma/37. The saved anchor retained the exact source message ID, text and offsets. Parent record remained identical.
- Exercised ordinary transcript selection through a browser DOM Range and mouseup event for the full emoji (offsets 0–2). This is programmatic pointer-path evidence, not a physical drag test.
- Injected a browser fetch failure for branch submission. The alert appeared, edited question remained exact and tree count stayed at five. Restored fetch, edited the question and retried; a second child completed with Luma/37. Server-side compaction and save failures are covered by the regression test, separately from this synthetic browser transport failure.
- Updated the parent to Nova with 99 branches. Entire existing child record stayed identical. Asked the first child for its original inherited facts; it replied `The original fictional tree is named Luma and has 37 branches.` Its saved branch snapshot stayed identical and the entire parent record stayed identical during that child turn.
- Compared full synthetic parent and first-child records before and after an actual server restart. IDs, source anchor, compact snapshot, provider/model, original messages and statuses matched exactly. Browser reload reopened a saved child with existing chat controls and Return to parent conversation.
- Inspected desktop 1440×1000 and mobile 390×844 screenshots. Corrected long child navigation labels to grow with wrapped text; confirmed final desktop/mobile views retain readable content and reachable composer. Screenshots remain outside the repository because the account UI includes personal details.
- Final listener: Node bound to `127.0.0.1:4317` only. Server remains running with synthetic verification conversations available.

Recursive ancestor compaction, canvas placement, summary-quality evaluation and latency targets remain separate Beads tasks. These checks establish this focused root-to-child flow, not full text-release acceptance.
