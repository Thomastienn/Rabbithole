# Inline Mermaid rendering — TreeTutor-vm4.8

Acceptance passes. The [artifact contract](../diagram-artifacts.md) describes
the rendering boundary and routine design choices. Reproduce with:

```sh
npm test
npm run build
npx astryx doctor --built dist
node scripts/verify-diagram-rendering.mjs
node scripts/verify-passage-selection.mjs
```

The [browser results](diagram-rendering-results.json) contain ten passing checks,
source/build hashes, local capture paths and restart evidence. Full gate output
and startup preservation checks are in
[diagram-rendering-checks.json](diagram-rendering-checks.json).

| Acceptance | Verified result |
| --- | --- |
| Inline at the owning reply and conversation | Real HTTP/SSE records reconcile pending to ready without duplicates. Two saved drawings appear after the exact originating reply; a later reply, focused child and unrelated conversation have no inherited drawing. The card stays outside `Passage`. |
| Text alternative and keyboard access | Visible descriptions also supply image alternatives. Tab reaches the card, both scroll axes and the source disclosure; visible focus is checked. Enter and Space expand/collapse source. Tall and wide drawings scroll within their cards. |
| Safe rendering and CSP | Shared source checks run before the lazy import; Mermaid uses strict security, HTML labels disabled, error drawing suppressed and no bound callbacks. Output is an SVG data image, with HTML/link/script/image output rejected. Browser fixtures deliberately bypass server validation to persist four unsafe definitions; none creates active elements, requests the probe URL, executes or navigates. The original `script-src 'self'` CSP is byte-identical and produces no policy violations. |
| Honest states and fallback | Creating/rendering status, saved generation failure, actual Mermaid parse/render failure and unsafe persisted source all retain descriptions. A saved source opens automatically after render failure. Failed generation has no source to disclose under the server contract. Six supported syntax families actually draw: flowchart, sequence, class, state, ER and pie. |
| Small map payload and lazy renderer | Preview messages contain only artifact id/title/status and show `Diagram: title` rows. No source, description or worker data enters this payload. The initial map has no cards and does not request the Mermaid chunk. |
| Reopen, reload and restart | Reopen and reload restore saved drawings. Separate fixture-server PIDs **3217755 → 3219388** reopen the same SQLite file; all three originating artifacts and messages are identical. Generation-call count remains **4** across reload/restart (earlier synthetic compaction, child reply, tutor reply and diagram worker). Rendering never invokes generation. |
| Exact passage offsets | A real mouse drag selects the second `repeat 😀` in `repeat 😀 repeat 😀 end`; the saved child anchor is exactly UTF-16 **[10,19)**. Keyboard passage selection still presents the full canonical text. The existing passage regression separately passes mouse and keyboard branch creation, cancellation and focus restoration. |
| Both color schemes and narrow layout | Classic/base Mermaid appearance reads computed Astryx colors/font metrics, with serialized theme/render work and system color-scheme updates. Light/dark drawings and 390-wide containment pass. Desktop, dark and narrow captures were inspected. |

Final gates: **76/76 tests**, no skips/failures/cancellations (38.3 seconds);
production TypeScript/Vite build passes; Astryx built-output doctor reports
**20 pass / 2 existing font warnings / 0 fail**. The existing Vite chunk-size
advisory remains; the Mermaid renderer and its diagram engines are separate lazy
chunks. Impeccable detector returns `[]`; `git diff --check` passes. Mermaid was
already pinned at 12.3.0 by vm4.7, so no dependency or lockfile change was needed.
TypeScript's no-emit configuration now permits explicit `.ts` imports so Node
and the browser can share the source guard and reconciliation logic.

These are **fixture** provider results with real Chromium, production assets,
HTTP/SSE, Mermaid rendering/parsing, SQLite and process restart. The render-state
integration test substitutes the drawing callback to check ready/pending/failed
logic; the browser fixture uses the real renderer. No native Claude/Codex media
inference, isolation, semantic-quality or pending-worker recovery claim is made.
Those gates remain in TreeTutor-vm4.1. This increment adds no editing or export.

All 40 protected startup files remain byte-identical, including the prior
`server/app.mjs` viewport change, package files and workflow edits. Existing
changes in shared files were preserved. Branch and HEAD are unchanged; no files
were staged, committed or synchronized remotely. Beads and Ralph were already
initialized. Ponytail and Matt Pocock skills were unavailable in the checked
paths/tool catalog; Caveman, RTK, codebase-memory, Beads, Impeccable, Astryx and
agent-browser were used. Ralph owns the pending local commit.
