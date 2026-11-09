# Text release acceptance matrix

Issue: **TreeTutor-7t3.12**. Date: **2026-11-09**. **PASS: all ten current PRD criteria.**

Verified on `master`, HEAD `b2f952b` plus the pending release fixes and verification
artifacts. Ralph owns staging and the local commit. No remote operations.
Claude remains the default; Codex and switching in both directions remain supported.
Media, automatic suggestions and Vim remain later increments.

## Evidence boundaries

- **Fresh native shared journey:** [12 passing checks](release-journey-final-results.json),
  starting 20:40:48Z, using app-owned ChatGPT consent and the real Codex app-server,
  `gpt-6.1-sol`. Browser interactions plus real HTTP requests; no provider fixtures.
- **Fresh browser interactions:** [11 passing scenarios](text-release-final-checks.json),
  including the 17-step keyboard path. These use synthetic providers so interaction
  checks are deterministic; they do not prove model semantics or authentication.
- **Named-provider acceptance:** [TreeTutor-7t3.9 native results](provider-continuity-results.json)
  and [review](claude-history.md#live-provider-continuity-treetutor-7t39-2026-11-09t18521854z),
  observed 18:52–18:54Z. This is retained live evidence for Claude default, native
  authentication, history, independent sessions and nested switching in both directions.
  It was reconciled here, not rerun or replaced with the single-provider journey.
- **Fresh main-entry delivery:** [six passing checks](local-delivery-final-results.json),
  real `node server/main.mjs`, seeded synthetic content without inference.

## All ten current PRD criteria

| PRD criterion | Result | Actions, observations and evidence |
| --- | --- | --- |
| 1. Branching | PASS | Fresh native tournament root → child → grandchild produced real replies and exact source anchors without changing parent history. [Native results](release-journey-final-results.json). Mouse highlighting of repeated/emoji text, question editing, connected placement, immediate child focus and recursive keyboard branching passed in the [browser scenarios](text-release-final-checks.json): passage-selection, keyboard-journey, subtree-folding. |
| 2. Context | PASS | Both fresh native summaries were reviewed against original source, learner question and ancestor context. Child retained the eight-input tournament, smaller-winner rule and seven comparisons; nested summary retained the elimination argument and ancestor's 4+2+1 comparisons. No unsupported or contradictory facts found. Later root messages left child/grandchild anchors and snapshots identical; child messages never entered root history. After restart the grandchild recalled its entire exact selected passage. [Native results](release-journey-final-results.json); [earlier Peterson/ancestor evaluation](branch-compaction-live.md). |
| 3. Navigation | PASS | Cursor-centered wheel zoom, empty-space pan, node drag without opening, source/edge association and click-to-switch one panel passed. Map remained interactive beside chat; expanded return restored exact viewport/focus; narrow chat returned to map. Motion-enabled transitions and reduced motion both passed at 1440×900 and 390×844. [Browser results](text-release-final-checks.json): map-gestures, chat-sidebar, chat-expand. Fresh native run also navigated while replies were active and restored the expanded workspace after restart. |
| 4. Keyboard | PASS | Fresh 17-step keyboard-only journey covered tree creation, first send, exact repeated selection, recursion, question editing, model menu, stop, expand/return, canvas pan, box movement, zoom/fit, individual/bulk folds and source reveal. Focus rings and a 60-Tab cycle passed. [Results](text-release-final-checks.json), [bindings](keyboard-journey.md). Actual keyboard Claude→Codex selection during another native reply is retained in [provider evidence](claude-history.md#live-provider-continuity-treetutor-7t39-2026-11-09t18521854z). |
| 5. Persistence | PASS | Two roots/four conversations and ten original messages compared exactly across two real native HTTP server processes. Messages, exact anchors, frozen context, positions, viewport, folds, selection, expanded panel, provider/model/session all matched; digest `0d8471c6e56a`. Browser restored selection/fold/panel/viewport; resumed root recalled AMBER-HERON-42 and nested child recalled its source. [Native results](release-journey-final-results.json). Controlled-clock checks proved no pre-minute write, one batch per changed root, no idle writes, independent trees and compact ID-only layout without message copies. [Browser results](text-release-final-checks.json): layout-restore. |
| 6. Concurrency | PASS | Tournament and heap requests overlapped; browser opened another conversation while a native reply was still active; replies saved to distinct owners. Root and grandchild also recalled their own context concurrently after restart. [Native results](release-journey-final-results.json). Fixtures cover held replies, folding without cancellation, failure/stop isolation and crash recovery. Retained [both-provider evidence](provider-continuity-results.json) includes two distinct Claude sessions, one cancelled while its peer completed. |
| 7. Provider continuity | PASS, retained native named-provider evidence | TreeTutor-7t3.9 proved Claude-default roots; Claude child/grandchild inheritance, authentication/resume, independent sessions and cancellation/retry; nested Claude→Codex and Codex→Claude switches; saved history and inherited facts after real process restart; Codex model change `gpt-6.1-sol`→`gpt-6-astra`; a fresh Codex thread recalled a Claude-only fact. An active root rejected a switch with 409 and stayed on its own provider/session. Auth-loss failure preserved history and restored the working provider/model/session. [Actual results](provider-continuity-results.json), [review](claude-history.md#live-provider-continuity-treetutor-7t39-2026-11-09t18521854z). Fresh shared journey separately confirmed catalog default `claude`, Codex native authentication and saved-session recall. |
| 8. Local delivery | PASS | Both native processes owned only `127.0.0.1:41467`; main-entry processes separately owned only `127.0.0.1:43033`. Old ports refused connections between stop and restart. Local SQLite paths and private modes were observed. [Native results](release-journey-final-results.json), [delivery results](local-delivery-final-results.json). The native scan checked 51 collected bodies, including authenticated conversation streams/state/previews/catalog/reconnect and served assets; no credential patterns found. Credential-canary HTTP integration passed. Host/Origin/cross-site/CSRF/content-type and invalid callback rejection passed. Inference still uses remote providers. |
| 9. Compact map | PASS | Collapsed navigation, minus/percentage/plus/fit and menu, title/activity/fold controls, two-line question/answer previews with ellipses, individual folds and expand/collapse all passed. Keep-current preserved root path and current descendants while folding side branches, including with chat collapsed. Folding preserved content and ongoing replies. [Browser results](text-release-final-checks.json): compact-controls, node-previews, subtree-folding, bulk-folding. |
| 10. Compact chat and empty start | PASS | Fresh native tree began with zero boxes and Start conversation; its first sent question created the root. Fixtures verified close/reopen before sending, rejected send retaining draft, exactly one root on retry, compact icon model menu, selection-only passage actions and keyboard access, and new child reveal/open under a folded parent. [Native results](release-journey-final-results.json), [browser results](text-release-final-checks.json): first-conversation, passage-selection, subtree-folding. |

## Release repairs verified here

Two repairs from earlier attempts remain in this task's pending diff:

1. Expanded chat was persisted/restored as beside. The existing minute batch now
   stores all three panel modes and preserves the saved viewport. Layout HTTP/reopen
   integration and browser reload/desktop/mobile checks pass. No extra persistence
   cadence, message copies or layout history were added.
2. Returning ChatGPT authorization exposed the saved ID token through optional
   `id_token_hint` in `/api/auth`. That parameter was removed. The issued client,
   stable host, fresh PKCE/state/nonce and returning-identity checks remain. The
   [credential-bearing HTTP integration](../../test/credential-boundary.test.mjs)
   verifies access/refresh/ID canaries stay out of state, catalog, reply streams,
   transcripts, previews and reconnect URLs. Real returning sign-in after this
   small URL change was not repeated; this part has integration evidence.

No further product defects were found in this invocation. The repeatable native
scenario also supports either provider without moving credentials, fails promptly
on a failed/interrupted first reply, compares all saved fields and waits for zoom
animation to settle before testing an idle minute.

## Local listeners, storage and credential boundary

Native scenario PIDs **2571771 → 2574536** owned **127.0.0.1:41467**.
Main-entry delivery PIDs **2574466 → 2574523** owned **127.0.0.1:43033**.
`ss -Hltnp` identified each actual owner; both scenarios stopped their final server.

Native synthetic trees: `/tmp/treetutor-release-7TY6SG/trees.sqlite` (0600).
Main-entry seeded trees: `/tmp/treetutor-delivery-qfFmkf/trees.sqlite`
(0600 inside a 0700 directory). Temporary synthetic databases/sessions are retained
locally for inspection. Native Codex sessions/workspace are under the native
scenario's temporary directory; existing app-owned credentials stayed under their
original directory and lock, using the normal Auth lifecycle. Claude credentials
remain owned by its native CLI; its session-store limitation is documented in the
[provider review](claude-history.md).

Default learner saves remain `$XDG_DATA_HOME/treetutor/trees.sqlite`, falling back
to `~/.local/share/treetutor/trees.sqlite`. No learner messages were used as model
input. Initial normal server on port 4317 had no active replies; the first scenario
attempt reported ELOCKED. That instance exited before the planned SIGTERM, so no
signal was sent to it. The retry acquired the original lock without bypass or
credential relocation. Normal app was restored afterward as PID **2594044** on
**127.0.0.1:4317**, with its nine saved conversations and no active turns. The
unrelated server on port 4391 was left alone.

Credential evidence is a pattern scan of collected bodies plus an exact canary
integration and code review, not an exhaustive egress/security audit. The native
scanner includes real successful SSE replies and returning authorization response;
the main-entry scanner separately includes all built JS/CSS assets and signed-out
error bodies. Neither output includes real tokens, account identifiers, CSRF values
or provider session IDs. Published branch IDs reference synthetic local content.

## Quality gates and repeat commands

[Fresh results and full browser outputs](text-release-final-checks.json):
**npm test 52/52**, **build PASS**, **Astryx doctor 20 pass / 2 warn / 0 fail**,
**Impeccable detector zero findings**, **git diff --check PASS**.
The two existing doctor warnings concern font proof; the Vite alias and built
woff/woff2 assets confirm self-hosted Figtree. Existing >500 kB bundle advisory
remains. Built-only doctor does not inspect JSX conventions. Current desktop and
narrow expanded-restore captures were visually inspected; their synthetic fixture
intentionally lacks a model catalog, so its retry alert is expected.

Use Node 24+, installed dependencies, agent-browser and existing native provider
sign-in. Stop the owner app before native checks so its original Auth lock is free.
Do not copy authentication or substitute API keys. Claude is still the product
default when this shared verification explicitly selects Codex.

```sh
npm test
npm run build
npx astryx doctor --built dist
node scripts/verify-release-journey-live.mjs --provider=codex /tmp/treetutor-native-recheck.json
node scripts/verify-local-delivery.mjs /tmp/treetutor-delivery-recheck.json
node scripts/verify-keyboard-journey.mjs
node scripts/verify-layout-restore.mjs
node scripts/verify-map-gestures.mjs
node scripts/verify-compact-controls.mjs
node scripts/verify-node-previews.mjs
node scripts/verify-subtree-folding.mjs
node scripts/verify-bulk-folding.mjs
node scripts/verify-chat-sidebar.mjs
node scripts/verify-chat-expand.mjs
node scripts/verify-passage-selection.mjs
node scripts/verify-first-conversation.mjs
```

Run browser scenarios sequentially. Use `--provider=claude` for the shared native
journey when native Claude capacity is available. The separate two-provider
scenario is `node scripts/verify-provider-continuity-live.mjs`; it requires working
native capacity on both routes and must not be replaced with fixtures.

## Historical failures and remaining limits

The earlier [Claude quota failure](release-journey-results.json),
[Codex EROFS attempt](release-journey-codex-results.json),
[restricted-runtime checkpoint](text-release-native-preflight.json) and
[explicit fake-protocol rehearsal](release-journey-protocol-results.json) remain
unchanged. They were not passes. TreeTutor-7t3.17's permitted-runtime recovery and
the successful native journey above resolve the shared release gate. No acceptance
was weakened to bypass quota or runtime restrictions.

The shared journey ran Codex 0.167.0 / Node 26.0.0. Retained Claude live evidence
used Claude Code 2.1.319; installed version is now 2.1.321. No fresh Claude inference,
quota-availability claim or returning OAuth account-selector interaction is made.
Named-provider model lists are catalogs/aliases, not entitlement guarantees.

Keyboard and responsive evidence uses Chromium browser automation, emulated
viewports and a controlled layout clock; no physical touch device or real IME
was tested. The one-minute assertions exercise the real scheduler with only its
60000 ms timer controlled. Unexpected close can still lose the latest unsaved
layout, as the PRD allows. No release acceptance remains unresolved. Later media
and Vim deliverables were left untouched. Ponytail was found in the Claude plugin cache and applied during the resumed
verification. Matt Pocock skills were not available in the checked skill/cache
locations; no use is claimed.


## Independent resumed-run verification, 2026-11-09

The concurrently resumed Ralph invocation independently repeated the complete
shared journey using **native Codex**, with all **12 checks PASS**:
[redacted native report](release-journey-native-codex-pass.json), started
**20:42:05Z**. This corroborates the primary native report above; it is not
additional two-provider evidence. The original working app remains running.

- Real HTTP server PIDs **2577713 → 2584389**, both owning only
  **127.0.0.1:34547**; the old port refused connections between processes.
- **Two roots, four conversations, ten original messages** matched across the
  actual restart, including every anchor, frozen snapshot, position, viewport,
  fold, selection, expanded panel, provider/model and native session field.
  Comparison digest: `35a0b9ce2de0`. Browser layout also matched exactly.
- Tournament/heap requests overlapped while browser navigation stayed available.
  Concurrent resumed root/grandchild requests recalled `AMBER-HERON-42` and the
  whole exact grandchild passage, respectively. The **51 collected native
  response bodies** contained no provider credential patterns.
- Native data is retained at `/tmp/treetutor-release-Aymy2u/trees.sqlite`, mode
  **0600**. Original app-owned authentication stayed under its original lock;
  no API key or credential relocation was used.

Both native compactions were reviewed against their recorded sources. The child
snapshot preserves the codename, eight-number tournament, smaller-winner rule,
seven comparisons and learner question. The grandchild compact snapshot keeps
relevant ancestor tournament context and the elimination argument, answering its
comparison question with `4 + 2 + 1 = 7`; it appropriately omits the unrelated
codename. Both exact passages remain stored separately. Later parent replies did
not change either snapshot, and branch replies did not change parent history.
No unsupported or contradictory facts were found in these short examples.

[Independent browser and quality gates](text-release-resumed-checks.json) also
passed: **all eleven fixture scenarios**, including the **17-step keyboard
journey**, controlled-minute/idle checks, **52/52 tests**, build, Astryx
**20 pass / 2 existing warnings / 0 fail**, Impeccable detector and whitespace.
Current desktop/mobile expanded-restore fixture captures were inspected; their
missing-catalog retry notice is intentional in that fixture.

[Independent main-entry delivery](local-delivery-resumed-results.json) passed
all **six checks**: actual `node server/main.mjs` PIDs **2585693 → 2585714** on
**127.0.0.1:37143**, exact seeded restart comparison, Host/Origin/cross-site/CSRF
rejections, **23 signed-out synthetic response bodies** without credential
patterns, and private local storage at
`/tmp/treetutor-delivery-Bu0ck2/trees.sqlite` (**0600**, directory **0700**).
This complements the authenticated native response scan above.

Two attempted starts hit the normal exclusive Auth lock and made **no inference**:
[initial lock attempt](release-journey-native-codex-results.json) and
[duplicate supplementary attempt](release-journey-native-codex-model-results.json).
The successful full retry is retained separately. The second attempt proposed
repeating saved nested model switching, then was removed from the scenario
because TreeTutor-7t3.9 already directly proves that required behavior after
restart. The shipped scenario remains the exact version that passed both full
native runs; no unexecuted assertions or product edits were added by this resumed
invocation. No running owner app or other worker was killed to bypass a lock.
All ten matrix results above remain supported, with the same explicitly retained
named-provider evidence and limitations.

## Final closing rerun, 2026-11-09T22:45–22:55Z

Re-ran on HEAD `b87f54f` with no product changes:

- `npm test` 52/52 PASS; `npm run build` PASS (existing chunk-size advisory);
  `npx astryx doctor --built dist` 20 pass / 2 existing font warnings / 0 fail.
- `node scripts/verify-local-delivery.mjs` 6/6 PASS (loopback-only, exact
  restart preservation, Host/Origin/cross-site/CSRF rejection, credential-clean
  bodies, private SQLite).
- Native Codex shared journey **FAIL** at the first reply: the ChatGPT plan hit its
  usage limit ("Subscription Sharing usage limit"). That's an external quota.
  The report is kept: [release-journey-native-codex-quota-fail.json](release-journey-native-codex-quota-fail.json).
  The earlier Codex 12/12 pass still stands as Codex evidence.
- Native **Claude** shared journey (product default, `claude-opus-5-5`) **12/12 PASS**:
  [release-journey-native-claude-pass.json](release-journey-native-claude-pass.json).
  It ran root → child → grandchild from exact passages with two trees and four
  conversations. Replies overlapped while navigation was active. Layout used one
  controlled-minute write. A real restart moved PID 2761785 → 2767401 on
  loopback-only `127.0.0.1:43303`, and all 10 messages, anchors, snapshots,
  positions, viewport, folds, selection, expanded panel and provider/model/session
  were identical (digest `6ff3db1d6168`). After restart the root recalled the
  codename and the grandchild recalled its passage, both at once. 55 browser-visible
  responses were credential-pattern clean. SQLite was at `/tmp/treetutor-release-CEqGWe/trees.sqlite`, mode 0600.
  I reviewed both native summaries against their source and ancestors: they keep
  the seven-comparison / three-round facts and the elimination argument, with
  nothing contradictory.

Both providers now have native passes for the shared journey (Codex earlier,
Claude now). TreeTutor-7t3.9 supplies the both-direction switching evidence.

**Not release-ready yet.** PRD.md was revised on 2026-11-09 (commit `b87f54f`).
New chat now opens one visible, self-titling root. Nodes show the whole
conversation, and branch lines attach beside the source message. Rows 1, 9 and 10
above (and the keyboard journey's empty-map start in row 4) were verified against
the earlier wording: an empty map with Start conversation and two-line latest
previews. The native journey script still asserts that old empty-map start. These
rows need re-verification after TreeTutor-7t3.18 and TreeTutor-7t3.21, then the
TreeTutor-7t3.22 fixture recheck. Beads keeps TreeTutor-7t3.12 blocked by
TreeTutor-7t3.22. Limits that still apply: returning ChatGPT sign-in after the
id_token_hint removal was not exercised interactively, and inference uses remote
providers.
