# Growing conversations and large maps — TreeTutor-7t3.21

Measured on 2026-11-09 (Edmonton); JSON reports use UTC timestamps.

All conversation content and inference in these checks are **fixtures**. Browser geometry, pointer/keyboard input, the production UI, loopback HTTP/SSE, SQLite writes and the fresh server process are real. No native Claude/Codex inference or provider-specific release acceptance is claimed.

## Behaviour and defaults

- `offsetCoveredBoxes` is a pure function beside `placeBox`. Actual rectangle collisions caused by visible height growth or reveal push the covered box down, with the existing 48-unit clearance. Each pushed subtree travels together, including its hidden descendants. Uncovered neighbours keep their manual spacing. Cascades preserve the moving groups' relative positions; a stable group order handles interleaved manual layouts.
- Growing boxes stay pinned. A subtree containing a dragged box defers its offset until release. Growth and reveal causes are retained during the drag. Hidden boxes are excluded from obstacles and initial placement. Unfolding reconciles newly visible collisions without re-laying out the tree.
- Position changes enter the existing layout saver as one positions batch. `src/layoutSave.ts` is unchanged: one dirty batch per root per minute, no idle timer/writes. Browser checks control the existing 60,000 ms timer; they do **not** claim a wall-clock minute elapsed. Integration checks also verify scheduling, batching, retries and reopened storage.
- Memoized conversations retain unchanged data, child-source lists, callbacks and edges. Status polls reuse unchanged summaries. Initial handle measurements are batched, and maps over 50 nodes use React Flow's `onlyRenderVisibleElements` after full initial transcript measurement. Offscreen nodes retain measured sizes and handle offsets.
- Preview text remains limited to 512 code points plus an ellipsis per message. All messages remain in order. The live-turn cut reads only a bounded prefix instead of copying an entire long reply on each chunk.
- Fit can zoom down to 0.001, with matching saved-viewport validation, so the seeded tree fits in full. The percentage label shows fractional percentages below 1%. Selection uses cached measurements even when a node is culled, leaves room for the toolbar and brings a tall node beside chat. Selection keeps at least 20% zoom so a taller-than-screen transcript's title stays reachable. Large zoom jumps and trees over 50 nodes avoid expensive intermediate/document snapshots; ordinary viewport moves retain their animation. No layout preference was added. Shared transition names travel synchronously through React context, so the map title and chat title cannot both own the name while React Flow updates node data.

## Reproduction

```sh
npm run build
node scripts/verify-node-growth.mjs
node scripts/verify-large-map.mjs --baseline
node scripts/verify-large-map.mjs
```

`verify-node-growth.mjs` seeds a small map with a growing root, covered branch and descendant, a close but horizontally clear neighbour, and a distant neighbour. It checks a new question/reply, growth while a real pointer drag is held, release/retry, hidden growth, unfold, Fit, idle writes and exact saved positions/messages/branch context after a **fresh Node HTTP-server process** opens the same SQLite file and the browser reloads. Desktop/mobile captures are under `.impeccable/review/node-growth-*.png`. Raw geometry and save evidence: [node-growth-results.json](node-growth-results.json).

`verify-large-map.mjs` seeds an isolated SQLite database with LCG seed **721**, **200 conversations**, **20 question/answer turns each**, and **8,000 messages**. Shape/content are deterministic; generated IDs vary. It builds temporary production copies with a counter directly inside the `Conversation` function. The control differs only by disabling viewport culling; source files and shipped `dist` are not rewritten. Counts are actual function invocations, avoiding React fiber flag ambiguities. Preview requests and pending renders settle before the chunk window; status polling continues during it. A visible folded neighbour participates in the check. Both builds must report renders for only the replying conversation over 12 SSE chunks.

Pan/zoom measurements cover 119 animation-frame intervals while dispatching 60 pan steps and 60 wheel steps. Actual viewport transforms must change for each operation. Open/fold/unfold and command selection timings include browser CLI overhead. `selectUiMs` separately measures from the browser click event until the composer has focus and the full tall node fits in the available map. Fit checks every one of the 200 measured transcript rectangles inside the canvas. These are local, unthrottled headless-browser measurements on the machine below.

Raw reports: [culling-off control](large-map-baseline.json), [culling enabled](large-map-results.json).


## Recorded measurements

Machine: **12th Gen Intel(R) Core(TM) i7-12700H**, 20 logical CPUs, 15.2 GiB RAM; **linux 7.0.0-42-generic x64**; Node **v26.0.0**; **Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/157.0.0.0 Safari/537.36**. Viewport: 1440 × 900. Both reports contain the precise UTC run time and machine description.

| Measurement | Culling off | Culling on |
| --- | ---: | ---: |
| Open to loaded previews/fonts and initial measurement (ms) | 2,388.6 | 2,424.0 |
| Mounted conversation nodes at readable starting zoom | 200 | 5 |
| Mounted message rows at readable starting zoom | 8,000 | 200 |
| DOM elements at readable starting zoom | 29,822 | 2,188 |
| Pan/zoom frame p50 (ms) | 16.7 | 16.7 |
| Pan/zoom frame p95 (ms) | 16.8 | 16.8 |
| Pan/zoom worst frame (ms) | 650 | 16.8 |
| Frames over 33.4 ms / 119 | 3 | 0 |
| Collapse all, including CLI (ms) | 10,114.5 | 350.1 |
| Expand all, including CLI (ms) | 2,652.6 | 178.5 |
| Click event to focused chat and revealed tall node (ms) | 184.9 | 194 |
| Selection command plus waits, including CLI (ms) | 4,485.2 | 3,740.2 |
| Streaming window, including 12 timed 40-ms steps (ms) | 557.1 | 523.5 |
| Unrelated conversations rendered during chunk window | 0 | 0 |

Both runs: Fit contained all 200 full transcript rectangles (zoom label 0.2%); selection placed the tall root at y=75 through 599.8 within a 928 × 900 map beside chat. The preview query returned **4,876,201 bytes** for all 8,000 messages, with each message at most 513 code points including its ellipsis; query time in this run was 47.4 ms. The direct counters observed **14** replying-node function calls in the control and **13** with culling, with **zero unrelated calls** in both, including the folded visible neighbour. Its changed data field was `preview`; active-node polling can add calls alongside the 12 chunks.

The culling control drops frames, so viewport culling stays enabled. Initial loading still measures every transcript once; culling reduces steady-state DOM and interaction work, and does not eliminate that initial cost. These single-run timings include ordinary machine/CLI variability. Command selection latency includes pre-click actionability and driver waits; the browser-side click-to-reveal measurement is reported separately. No model speed is inferred from the synthetic chunk schedule.


## Final quality gates

- `npm test`: **64/64 pass** (integration coverage includes placement/growth, hidden/revealed boxes, cascades and interleaved subtrees, drag protection, coalesced HTTP layout writes, unchanged idle state and SQLite reopen).
- `npm run build`: **PASS**, with the existing large-chunk warning.
- `npx astryx doctor --built dist`: **20 pass, 2 existing theme/font warnings, 0 fail**. The warnings concern the installed neutral theme's Figtree import metadata; the app retains its self-hosted font alias and browser checks wait for loaded fonts.
- Impeccable detector on both changed frontend files: **[]**. Desktop/mobile growth and navigation captures reviewed.
- Both large-map runs and `verify-node-growth`, `verify-canvas-positions`, `verify-canvas-navigation`, `verify-tree-overview`, `verify-map-gestures`, and `verify-node-previews`: **PASS** on the final code.
- The navigation fixture checks native shared-element keyframes in both directions, rejects transition errors, waits for the measured animation to finish, and covers reduced motion, exact viewport/focus return, two concurrent replies, preserved draft and mobile composer access. The rejected opening transition reproduced during verification was fixed by synchronous shared-name ownership through context.
- Browser layout clock: three dirty minute ticks produce three writes; no idle write; exact shifted coordinates, messages and branch context remain after a new Node server opens the same database. This is controlled-clock evidence, alongside a real fresh process and browser reload.
- `git diff --check`: **PASS**. All eight protected startup file hashes match; unrelated Ralph/workflow and prior fixture/layout changes remain intact. Current branch remains `master`. No staging, commit or remote operation was performed; Ralph owns the pending commit.

Ponytail and Matt Pocock skills were unavailable in this environment. The available Caveman, RTK, codebase-memory graph, Beads, Impeccable, Astryx and agent-browser workflows were used. Beads and Ralph were already initialized.
