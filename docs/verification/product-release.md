# Product 1.0 release record

Issue **TreeTutor-sh8.8**, run **2026-11-10 (UTC)** on `master` at HEAD `adb6517` plus this issue's uncommitted changes.
Version set to **1.0.0**; see [CHANGELOG.md](../../CHANGELOG.md).

**Result: not releasable yet. Claude passes. Codex is blocked by an external usage limit.**
Every Claude-side and provider-free check passed. Every native Codex turn failed with
`The ChatGPT user has reached their Subscription Sharing usage limit` (no reset time given). That
leaves criterion 7 (provider continuity) and the Codex halves of the journey and media switch **FAIL / unverified**.
The external gate is filed as **TreeTutor-sh8.9**; this issue stays open behind it. Nothing has been waived.

## Providers and models actually used

| Route | Models | Outcome |
| --- | --- | --- |
| Claude Code CLI 2.1.322, native subscription sign-in (product default) | `claude-opus-5-5` (CLI default) for the release journey; CLI default plus `sonnet` in the media check; `haiku` in the first media attempt | All native turns, compactions, diagram and video workers completed |
| Codex app-server, app-owned ChatGPT consent | `gpt-6.1-sol` (catalog default) | Every turn failed on the usage limit; `gpt-5.5`, also in the catalog, is rejected as unsupported for ChatGPT accounts |
| Custom OpenAI-compatible endpoint | none configured | Fixture only (`test/fake-openai.mjs`); no live endpoint used |

No API key, other account or credential relocation was used.

## Evidence

- **Native Claude journey:** [12/12 PASS](product-release-native-claude.json), 2026-11-10T09:51Z, using `scripts/verify-release-journey-live.mjs --provider=claude`. It covers New chat, the first question, root → child → grandchild from exact passages, two concurrent native replies with navigation, one controlled-minute layout write, an **actual server process restart** with identical messages/anchors/snapshots/positions/viewport/folds/selection/panel mode/provider/model/session, browser restore, post-restart recall (codename plus exact passage, concurrently), later appends leaving history and snapshots unchanged, and a credential-pattern scan of every browser-visible body. The script's saved nested Codex model-change step only runs in Codex mode.
- **Native Codex journey:** [FAIL after 2 checks](product-release-native-codex-quota-fail.json), 10:01Z. Loopback and New chat pass; the first reply fails on the usage limit. Two earlier attempts in this run failed on script timing (fixed, see below), then on the same limit.
- **Native media in a nested child:** [15/16](media-nested-live-results.json), using `scripts/verify-media-nested-live.mjs` (new). See the media section.
- **Provider-free fixtures:** [26/26 scripts PASS](product-release-fixtures.json), each against the built `dist`. These are synthetic providers with real browser, layout, focus, HTTP/SSE, SQLite, restarts and sandboxed Remotion renders. They are **not** native evidence.
- **Clean checkout first run:** `git clone` of HEAD into `/tmp` with no `node_modules` or `dist`, then `npm start -- --port 0` with an isolated data dir. It ran `npm ci` and the build, printed preflight (Claude signed in, Codex not connected in the isolated dir), returned HTTP 200, and its only listener was `127.0.0.1:40335`. `/api/state`, `/api/models` and `/api/previews` contained no credential patterns. Stopped with SIGINT.
- **Gates:** `npm test` 127/127 (and again after the fix), `npm run build` pass (existing >500 kB chunk advisory), `npx astryx doctor --built dist` 20 pass / 2 existing font warnings / 0 fail.

## PRD acceptance criteria

| # | Criterion | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Branching | **PASS** | Native Claude root → child → grandchild from exact passages ([journey](product-release-native-claude.json)); geometry, focus and keyboard selection in fixtures `passage-selection`, `canvas-positions`, `keyboard-journey` ([fixtures](product-release-fixtures.json), [row geometry](message-row-branches-results.json)). |
| 2 | Context | **PASS** | Native compaction snapshots are frozen across later parent messages and restart. Child replies never enter the parent. The grandchild recalls its exact passage after restart ([journey](product-release-native-claude.json); also the media check's snapshot/parent comparisons). |
| 3 | Navigation | **PASS (fixture + native)** | Fixtures `map-gestures`, `canvas-navigation`, `chat-sidebar`, `chat-expand`. The native journey navigates during concurrent replies and restores the viewport after restart. |
| 4 | Keyboard | **PASS (fixture)** | `keyboard-journey`, `vim-bindings`, `model-switch` fixtures. Native keyboard provider switching was last shown in the [retained continuity report](provider-continuity-results.json) (2026-11-09) and was not rerun. |
| 5 | Persistence | **PASS** | Actual process restart with field-for-field comparison ([journey](product-release-native-claude.json)). Minute cadence and idle zero writes in `layout-restore`, `node-growth`, `canvas-positions` and `test/layout-save.test.mjs`. |
| 6 | Concurrency | **PASS (Claude)** | Two native Claude conversations generate at once and replies reach their own boxes, also after restart. Codex concurrency was not rerun (quota). |
| 7 | Provider continuity | **FAIL / blocked** | Claude default confirmed (`defaultProvider: claude`). The Claude → Codex switch submits the full history (checked at the provider boundary in the media check), but the native Codex reply failed on the usage limit. Codex → Claude, a nested Codex model change and the both-direction continuity run (`verify-provider-continuity-live.mjs`) could not run. The 2026-11-09 [both-provider report](provider-continuity-results.json) is prior evidence, not a 1.0 pass. **TreeTutor-sh8.9.** |
| 8 | Local delivery | **PASS** | Native listener loopback-only before and after restart. Clean-checkout `npm start` listens only on 127.0.0.1. The [local-delivery fixture](product-release-delivery.json) checks loopback, Host/Origin/CSRF rejections, a 0600 SQLite file in a 0700 directory, an exact restart and credential scans. The default save location is `$XDG_DATA_HOME/treetutor` (or `~/.local/share/treetutor`); inference still goes to the selected provider. |
| 9 | Compact map | **PASS (fixture)** | `compact-controls`, `node-previews`, `subtree-folding`, `bulk-folding`, `node-growth`, `large-map`, `tree-overview`. |
| 10 | Compact chat and New chat | **PASS** | Native New chat (no name, one root, focused composer, titled by the first question) in the journey. Model icon menu, selection-only actions and folded-parent child reveal in fixtures. |

## Media and suggestions

[`media-nested-live-results.json`](media-nested-live-results.json) uses native Claude in a **grandchild** (root → child → grandchild; native compaction for both branches):

| Check | Result |
| --- | --- |
| Tutor-chosen Mermaid diagram is ready under its reply in the grandchild | **PASS** (default model). The first attempt with `haiku` produced source that the safety validator rejected; it was shown as a failed artifact, as designed. |
| Requested video renders in the bubblewrap sandbox and is saved locally in the grandchild | **PASS** |
| Workers: fresh threads with their own instructions; inputs are only the frozen task fields (diagram: title/description/intent/excerpt; video: request/intent/excerpt/inheritedContext/sources), no root transcript or canary | **PASS** |
| Branch snapshots and root/child histories are byte-identical before and after diagram generation, video generation, the switch and the reopen | **PASS** |
| Tutor submissions (provider boundary) and actual Claude CLI stdin never contain worker instructions, task JSON, Mermaid source or the composition; follow-ups carry only artifact id/title/description metadata | **PASS** (Claude follow-up, Codex-bound submission, post-reopen Claude follow-up) |
| Native Codex reply after the Claude → Codex switch | **FAIL**: usage limit (TreeTutor-sh8.9) |
| Reopen (fresh Store, app and provider processes in the same Node process): trees, artifacts and snapshots identical, video file kept, no inference | **PASS** |

The diagram and video workers ran only on Claude. Codex-hosted workers are unverified.
**Suggestions did not ship.** The vm4 suggestion tasks were superseded on 2026-11-09 by the owner's Break down design, which is Phase 4 (TreeTutor-5ut, after this epic). No suggestion check applies to 1.0.

## Optional additions

| Addition | Shipped | This run |
| --- | --- | --- |
| Rich replies (Markdown, code, math, exact anchors) | Yes | `passage-selection` fixture PASS. The native journey branched from exact raw passages of Markdown-formatted Claude replies; rendering itself is asserted by fixture only. |
| Rename and delete | Yes | `chat-management` fixture PASS ([results](chat-management-results.json)). Not exercised in the native journey. |
| Custom OpenAI-compatible endpoint | Yes | `custom-endpoint` fixture PASS ([results](custom-endpoint-settings-results.json)). **No live endpoint**, so it is unverified against a real service. |
| Vim canvas bindings | Yes | `vim-bindings` fixture PASS. |
| Branch suggestions / Break down, token stats, knowledge graph | **No** | Phase 4 (TreeTutor-5ut). |

## Fixes made in this issue

- `server/codex.mjs`: a failed Codex turn now reports the provider's short reason (`Codex: <reason> Partial reply saved; try again.`), as Claude already did. Before this change the usage limit appeared only as "Codex could not complete this reply". Covered in `test/codex.test.mjs`.
- `scripts/verify-release-journey-live.mjs`: wait until a tutor-chosen diagram finishes before branching (it previously returned 409), and wait/retry while the live model catalog opens the menu.
- New `scripts/verify-media-nested-live.mjs` for the nested media and isolation checks.

## Known limitations and unverified items

- Codex native: everything after the first reply is unverified for 1.0 (TreeTutor-sh8.9). Rerun the three commands listed in that issue.
- The media reopen is an in-process Store/app/provider reopen, not a separate OS process; actual process restart is covered by the journey.
- With `haiku`, the diagram worker can produce Mermaid that the strict validator rejects. The UI shows the failure; no retry button exists for diagrams.
- Browser evidence is headless Chromium with emulated viewports; no physical touch device or real IME. Credential scans cover the specified patterns in collected bodies; they are not an egress audit.
- Existing Vite chunk-size advisory and two Astryx font warnings remain.
- Epic TreeTutor-vm4 stays open only because its optional, deferred child TreeTutor-7t3.13 (Claude eligibility clarification) is not closed. Epic TreeTutor-sh8 stays open until sh8.8/sh8.9 pass.

## Repeat

```sh
npm test && npm run build && npx astryx doctor --built dist
node scripts/verify-release-journey-live.mjs --provider=claude /tmp/claude.json
node scripts/verify-release-journey-live.mjs --provider=codex /tmp/codex.json
node scripts/verify-provider-continuity-live.mjs
node scripts/verify-media-nested-live.mjs /tmp/media.json
```
