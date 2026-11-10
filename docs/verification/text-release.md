# Text release acceptance matrix

Release issues: **TreeTutor-7t3 / TreeTutor-7t3.12**. Final verification:
**2026-11-09 America/Edmonton (2026-11-10 UTC)** on `master`, HEAD `42a1273`
plus the existing workspace changes. **All ten current PRD criteria PASS.**
Ralph owns the pending local commit; the agent has not staged or committed.

The clarified workspace is covered by a fresh **13/13 native Codex journey**,
the matching-source **18/18 provider-free scenarios**, and the reviewed native
Claude/Codex continuity evidence from TreeTutor-7t3.9. The
[final verification record](text-release-current-checks.json) identifies every
source, its date and its limits. The latest Claude attempt hit the five-hour
quota at its first reply; it remains a **FAIL**, not a new Claude acceptance pass.
Shared checks used working Codex, as the release verification order permits.

## Evidence boundaries

- **Fresh native Codex:** [13 checks](text-release-current-native-codex.json),
  started 2026-11-10T00:48:03Z. App-owned ChatGPT consent through the real Codex
  app-server, isolated synthetic learning trees and native sessions. Covers the
  current New chat flow, native recursive compaction/replies, overlap with active
  navigation, actual server restart, every saved field, concurrent semantic
  recall, nested model change and 54 collected HTTP/asset response bodies.
- **Matching-source fixtures:** [18 scenarios](text-release-fixture-checks.json),
  completed 00:37Z; the strengthened keyboard scenario passed again at 00:41Z.
  All **63 recorded source hashes match** this release workspace. Synthetic
  content/providers/catalogs; real browser input, layout, focus, HTTP/SSE, SQLite
  and process restarts. These are interaction and transport evidence, not native
  inference. The fixture report is preserved unchanged.
- **Reviewed native provider-specific evidence:** the
  [both-provider report](provider-continuity-results.json), 2026-11-09 18:52–18:54Z,
  and [its review](claude-history.md#live-provider-continuity-treetutor-7t39-2026-11-09t18521854z)
  supply Claude-default/native-login/history/resume/session isolation and nested
  Claude→Codex→Claude→Codex continuation after restart. Both provider adapters
  are byte-identical to their successful `59fe6e6` version. Model-switch,
  compaction, history-import and branch-generation routes are also unchanged;
  subsequent app/store changes concern New chat, previews and layout. The
  current Codex run verifies those revised shared behaviors. This reconciliation
  does not assert a fresh successful Claude turn or switch today.
- **Fresh local delivery:** [6 checks](text-release-current-delivery.json) against
  actual `node server/main.mjs` processes, isolated seeded storage and signed-out
  providers. Includes loopback ownership, exact restart, storage permissions,
  boundary rejections and 23 collected response bodies.
- **Fresh quality gates:** full `npm test` PASS (same 64-test suite), TypeScript/
  Vite build PASS, Astryx doctor **20 pass / 2 existing font warnings / 0 fail**,
  Impeccable detector `[]` and `git diff --check` PASS. Integration includes
  credential canaries, lifecycle/error isolation and one-minute save scheduling.

## Current PRD criteria

| PRD criterion | Result | Evidence and observed behavior |
| --- | --- | --- |
| 1. Branching | **PASS** | Mouse and keyboard exact UTF-16 passage selection, recursive creation and immediate composer focus pass in the [fixtures](text-release-fixture-checks.json). [70 geometry samples](message-row-branches-results.json) prove right-side, source-row attachment through growth, movement, folding and reopen. The [current Codex journey](text-release-current-native-codex.json) creates root → child → grandchild from exact saved passages with native compaction and replies. |
| 2. Context | **PASS** | Both new Codex summaries were reviewed against full parent/source and inherited context (review below). Exact passage/question and original histories are retained; later parent messages leave both snapshots byte-identical, including after restart. Root recalls its codename while the saved grandchild recalls its full selected passage concurrently. [Current native results](text-release-current-native-codex.json), [native compaction review](branch-compaction-live.md), [native parent/session isolation](provider-continuity-results.json). |
| 3. Navigation | **PASS** | Real pointer pan, cursor-centered wheel zoom, safe node drag/click and single beside-map panel pass; map remains interactive during a reply. Expanded return restores viewport/focus, narrow chat returns to map, actual View Transitions and reduced motion pass. [Fixtures](text-release-fixture-checks.json): map-gestures, canvas-navigation, canvas-positions, chat-sidebar, chat-expand. The [native journey](text-release-current-native-codex.json) also navigates during overlapping responses and restores browser layout after actual restart. |
| 4. Keyboard | **PASS** | The [17-step keyboard journey](keyboard-journey.md) covers New chat, self-title, text selection, recursive branches, editing, model menu, stop, three panel modes, pan, node moves, zoom/fit, subtree/bulk folds and exact-source reveal; visible focus and a 60-Tab cycle pass. Those fixtures prove interaction. The [native continuity report](provider-continuity-results.json) separately verifies Space/arrows/Enter provider-menu switching of a grandchild while another native conversation responds. |
| 5. Persistence | **PASS** | [Current native restart](text-release-current-native-codex.json): two roots/four conversations, ten original messages and all anchors, frozen snapshots, positions, viewport, folds, selection, expanded panel, provider/model/session compare exactly across actual HTTP process restart; browser state also matches. [Controlled-clock fixtures](text-release-fixture-checks.json) prove one write per dirty root/minute, zero idle writes, compact current layout and exact manual/growth-shifted positions. Both saved native sessions recall context after restart. |
| 6. Concurrency | **PASS** | Two native Codex conversations are active simultaneously while the browser opens a child; replies save to their owners. Post-restart root/grandchild recall also runs concurrently. [Current native results](text-release-current-native-codex.json). [Codex isolation](codex-history.md) and [both-provider results](provider-continuity-results.json) record distinct native sessions, own-fact recall, stop with a peer still active and resume; current integration/fixtures cover failure, stale callbacks and crash recovery. |
| 7. Provider continuity | **PASS** | The product still defaults new trees to Claude; today’s Claude attempt reaches that default flow but fails quota. Required native Claude authentication, same-session resume, independent/cancelled sessions, nested Claude→Codex transfer and post-restart Codex→Claude→Codex transfer with prior/inherited facts are explicit in the [retained native report](provider-continuity-results.json) and [review](claude-history.md#live-provider-continuity-treetutor-7t39-2026-11-09t18521854z). The [current Codex run](text-release-current-native-codex.json) additionally changes saved grandchild gpt-6.1-sol → gpt-6-astra, resumes the same session and recalls the exact inherited passage without changing the parent model. No API-key fallback. |
| 8. Local delivery | **PASS** | Actual native PIDs 3115215 → 3116512 own only 127.0.0.1:35765; SQLite is local mode 0600. The [native report](text-release-current-native-codex.json) scans 54 collected authenticated/native/asset bodies. Main-entry PIDs 3117523 → 3118011 independently own only 127.0.0.1:39569, compare every seeded field exactly after restart, and pass eight boundary rejections plus a 23-body signed-out scan. [Delivery report](text-release-current-delivery.json). Credential-canary integration also passes. |
| 9. Compact map | **PASS** | Default-collapsed navigation and compact zoom/fit/menu controls, activity/fold indicators, every message preview in order, bounded long-message ellipses, source-row branch lines, individual/bulk folds and Keep current branch pass. Fold actions retain content and active replies. [18-scenario evidence](text-release-fixture-checks.json), [source-row geometry](message-row-branches-results.json), [growth/200-conversation/8,000-message results](node-growth-and-large-maps.md). |
| 10. Compact chat and New chat | **PASS** | New chat asks for no name, immediately saves/displays one root and focuses its chat; first send titles it. [Current native run](text-release-current-native-codex.json) verifies that flow and a successful streamed first reply. [Fixtures](text-release-fixture-checks.json) add unstarted-root reuse, retry/draft retention, model-icon menu, selection-only accessible branching and revealing/opening a child of a folded parent. |

## Native summary and continuity review

Reviewed the complete two sources, exact passages, questions and generated
snapshots in [the new Codex report](text-release-current-native-codex.json),
plus the saved synthetic messages in its SQLite database. The first summary
retains eight inputs, seven comparisons, smaller-winner rounds and the reason a
larger value cannot be the overall minimum. The second carries that ancestor
context into the child question and correctly distinguishes the 4 + 2 + 1
comparisons. Neither contradicts the saved explanation. The irrelevant bracket
codename is omitted from compaction; it remains in the original root history
and is recalled after restart. Native answers explain smaller-winner elimination
and seven comparisons correctly. The grandchild’s later gpt-6-astra reply quotes
the complete original selected passage. Both summaries are compact; no
summarization replaces source history.

The retained provider-specific experiment supplies distinguishing fictional
facts: Quill-482 (root), Ember-77 (child), Kestrel-19 (grandchild), Onyx-303
(Codex segment), and Flint-64 (later Claude segment). A fresh Codex continuation
recalls Claude’s Flint-64 after the actual restart and both switch directions.
Independent Claude sessions retain their own robot/comet facts, stop does not
cancel the peer, and the root resumes without child facts. The deliberate
signed-out failure rolls back to the last working Codex provider/model/session
while retaining ordered history. These are observed native results from the
dated report, not fixture responses or assumptions from closed issue status.

## Current quota failure and remaining limits

The [current Claude attempt](text-release-current-native-claude.json),
2026-11-10T00:47:44Z, reaches New chat and fails its first inference with
`You've hit your 5-hour limit · resets 9:40pm (America/Edmonton)`.
The indicated reset is 2026-11-10T04:40Z; it is not a success guarantee. No quota
retry loop, alternative account, credential relocation or API-key substitution
was used. Codex completed the current shared checks. This quota failure does not
replace or erase the separately reviewed successful native Claude/switching
experiment and is not reported as a fresh Claude pass.

Returning ChatGPT sign-in after removal of optional `id_token_hint` has not been
interactively repeated. Current reconnect URLs are scanned, credential canaries
pass, and the existing app-owned consent completes real inference and resume;
this does not prove a fresh returning account-selector interaction. Response
scans detect specified credential patterns in collected bodies; they are not an
exhaustive security/egress audit. Physical touch and real IME remain untested;
keyboard IME events are synthetic. The existing Vite bundle advisory and Astryx
font-proof warnings remain. No later-increment media, suggestions, Vim, custom
endpoint, rename or delete feature is part of this text-release acceptance.

## Layout cadence and restore

`test/layout-save.test.mjs` uses an elapsed controlled clock: zero writes through
59,999 ms after marking, one batch per dirty root at 60,000 ms, and none over ten
idle minutes. Forty rapid interactions and changes across two trees coalesce.
Storage failures retain newer state, wait for the next minute and support manual
retry; remounting disposes the old timer. [Integration/test output](text-release-fixture-checks.json).

Browser fixtures control only the real scheduler's 60,000 ms callbacks through
`scripts/layout-clock.js`; animation, polling, input and HTTP still run normally.
`layout-restore` observes zero early POSTs, one pending timer, one batched write,
no idle writes, separate tree snapshots, folds/selection/beside viewport restored
on reload, expanded mode restored on desktop/narrow viewports, and legacy/corrupt
layout fallback. `canvas-positions` covers manual keyboard/pointer positions,
minute batching, failed-write retry and exact source rows after SQLite/HTTP reopen.

`node-growth` observes three dirty minute batches, no idle write, and exact
shifted positions after a fresh Node process loads SQLite. The covered branch
moves from y=220 to 280 on initial growth and to 388 after further growth/unfold;
its descendant shifts with it while clear neighbours stay fixed. A held pointer
drag defers automatic movement until release. Snapshot/message bytes remain
unchanged across restart. [Fresh growth stages](text-release-fixture-checks.json)
are embedded in the `verify-node-growth.mjs` entry. Unexpected close can still
lose the latest unsaved layout within the minute, as the PRD allows.

## Local listener, storage and credentials

The final delivery check uses `/tmp/treetutor-delivery-Qv7CgL/trees.sqlite`
(**0600**, directory **0700**), with synthetic data only. Both processes terminate
at the end of the check. No running learner app is stopped and no real credentials
are moved. Default learner saves, verified in [server/main.mjs](../../server/main.mjs),
are `$XDG_DATA_HOME/treetutor/trees.sqlite`, falling back to
`~/.local/share/treetutor/trees.sqlite`; `TREETUTOR_DATA_DIR` explicitly overrides
the directory. Local storage does not make inference offline: native model
requests still use the selected remote provider.

The delivery scan covers state, conversations, previews, catalog/errors,
reconnect response and every built JS/CSS asset. Its signed-out response-pattern
scan and the credential-canary integration are bounded local checks, not an
exhaustive security or egress audit. The current native Codex report separately scans 54 collected authenticated
bodies, including reconnect and assets, and proves app-owned authenticated
inference. Returning ChatGPT sign-in after removal of optional `id_token_hint`
retains the interactive-testing limitation described above.

## Scenario inventory and quality gates

[Fresh outputs](text-release-fixture-checks.json) contain **18/18 PASS**:
branch-streaming, bulk-folding, canvas-navigation, canvas-positions, chat-expand,
chat-sidebar, compact-controls, first-conversation, keyboard-journey, large-map,
layout-restore, local-delivery, map-gestures, node-growth, node-previews,
passage-selection, subtree-folding and tree-overview. No provider-free scenario
was skipped. Large-map's optional unculling performance control was already
recorded by TreeTutor-7t3.21; this issue ran the normal shipped/culling path.

**Separate from provider-free fixtures:** verify-branch-compaction.mjs,
verify-branch-streaming-live.mjs, verify-codex-history.mjs, verify-model-switch.mjs,
verify-provider-continuity-live.mjs and verify-release-journey-live.mjs have
explicit native modes. This final run executed the release journey through
native Claude (quota FAIL) and Codex (13/13 PASS); prior named-provider,
compaction, isolation and switching results are reconciled above. They were not
all rerun today. Synthetic results never substitute for their native claims.

Quality gates: **npm test 64/64**, **build PASS**, **Astryx built-output doctor
20 pass / 2 existing font warnings / 0 fail**, separate credential-boundary
integration **1/1 PASS**, and **git diff --check PASS**. Self-hosted Figtree assets
remain in the build; the existing Vite >500 kB bundle advisory remains. Built-output
doctor does not check every JSX convention. No product code or fixture
expectations needed repair on this workspace: the prerequisite work already
updated them. TreeTutor-7t3.22 strengthened the keyboard fixture with Reopen chat
via Tab/Enter, beside-mode composer focus and the following Escape return. The
final grouped pass adds native evidence and reconciles the matrix;
TreeTutor-7t3.22 supplied the fixture and measured branch-line reports.

Repeat with Node 24+, installed dependencies and agent-browser:

```sh
npm test
npm run build
npx astryx doctor --built dist
node --test test/credential-boundary.test.mjs
node scripts/verify-keyboard-journey.mjs
node scripts/verify-layout-restore.mjs
node scripts/verify-node-growth.mjs
node scripts/verify-local-delivery.mjs /tmp/treetutor-delivery-recheck.json
node scripts/verify-release-journey-live.mjs --provider=codex /tmp/treetutor-native-recheck.json
```

The native journey requires the existing app-owned ChatGPT consent and its
normal data-directory lock; run when the learner app is stopped. Claude mode
uses the official CLI's native sign-in. Each run uses separate synthetic trees
and native sessions, keeps credentials in their original location, restarts its
own server and closes its browser/processes. It does not stop a learner app.

Run every provider-free script in the inventory sequentially against the build.
`large-map` creates a temporary instrumented build to count renders; other browser
checks use `dist`. The report records actual commands and outputs. Desktop/narrow
captures were inspected. Browser evidence is headless Chromium with emulated
viewports; no physical touch device or real IME was tested. IME events in the
keyboard scenario are explicitly synthetic.

## Retained live evidence reconciled for TreeTutor-7t3.12

Earlier native runs are preserved, with their original dates and limits. Only
the provider/semantic portions are retained; obsolete workspace claims are not:

- [Claude shared journey, 12 checks](release-journey-native-claude-pass.json),
  [Codex shared journey](release-journey-native-codex-pass.json) and
  [parallel Codex verification](release-journey-final-results.json).
- [Both-provider continuity results](provider-continuity-results.json) and
  [native review](claude-history.md#live-provider-continuity-treetutor-7t39-2026-11-09t18521854z).
- [Native compaction review](branch-compaction-live.md).
- Historical failures remain failures: [Claude quota](release-journey-results.json),
  [Codex restricted runtime](release-journey-codex-results.json),
  [runner preflight](text-release-native-preflight.json),
  [Codex quota rerun](release-journey-native-codex-quota-fail.json) and the
  [explicitly fake protocol rehearsal](release-journey-protocol-results.json).

The current 13/13 Codex run now supplies the native journey on the clarified
workspace. Earlier empty-map and latest-two-line-preview interaction claims are
superseded by the matching-source fixture evidence and this new journey. The
reviewed native provider-specific results retain their stated dates and limits;
older failures remain failures. All ten text-release criteria are now reconciled
above. Media, suggestions, Vim and other later features remain outside this issue.
