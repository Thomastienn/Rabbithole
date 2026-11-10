# Break down verification

Issue **TreeTutor-5ut.10**, 2026-11-10 UTC, `master` at `89d9eaa` plus this
issue's working changes. Reviewed all 60 stories in
[the agreed spec](../break-down-spec.md), [PRD](../../PRD.md) and
[GLOSSARY](../../GLOSSARY.md).

**Not complete: native Claude acceptance is blocked by quota (TreeTutor-5ut.12).**
Native Codex passes usage, suggestions, passage branching and knowledge graph
updates. Fixture checks exercise both adapters. Fixtures do not replace the
missing native Claude journey. The umbrella epic remains open; the deferred
embedding pre-filter (TreeTutor-5ut.11) remains deferred.

## Evidence boundaries

| Evidence | Route and result |
| --- | --- |
| [Initial native attempt](break-down-native-initial.json) | Native Claude Haiku failed with `You've hit your 5-hour limit · resets 8:20am (America/Edmonton)`. Native Codex tutor and Luna suggestion calls completed, but Luna supplied six mismatched passage offsets; strict validation discarded them all. Graph extraction and usage still saved. |
| [Native Codex after repair](break-down-native-codex-results.json) | **10/10 PASS**, real app-server using existing app-owned ChatGPT consent. Tutor `gpt-6.1-sol`, suggestions `gpt-6-luna` (confirmed from the live model catalog and actual call). Seven exact passages, native branch compaction, child reply and two child passages, asked/met evidence, isolated histories and identical persistence after reopening. |
| [Shared checks](break-down-checks.json) | HTTP/SSE/SQLite integration over fake Claude stream-json and Codex app-server CLIs; client mapping tests; built-app browser fixtures. Detailed run results distinguish fixtures from inference. |
| `test/suggestions.test.mjs` | **16/16 PASS** after repair: lifecycle, model pins/default/off, signed-out choices, exact anchors, usage, concurrency, isolation, graph reuse, warning, evidence, corrections, merge and rollback. |
| Full gates | **149/149 tests PASS**, production TypeScript/Vite build PASS; Astryx doctor **20 pass, 0 fail**, two existing theme/font warnings. Impeccable detector returned `[]` for the changed UI helper. |

The native Codex root reports 3,985 input / 117 output / 4,224 cache-read tokens;
its Luna call reports 6,206 / 333 / 3,328. Its child reports 8,274 / 46 / 0,
with suggestions 5,651 / 127 / 3,328. Daily totals are 24,116 input / 623 output /
10,880 cache-read across two tutor replies, including their suggestion calls.
The branch-compaction call is outside these totals, consistent with the existing
token-stat scope. No counts are inferred from text.

The native graph has seven concepts, three topics and six links. Frontend has
two met events and one asked event; HTML and CSS were reused in the child rather
than duplicated. The child receives the exact raw `**Frontend**` passage and a
native fixed inherited-context snapshot. Parent messages remain byte-identical.

## Repairs and decisions

1. **Supply authoritative word offsets to the suggestion model.** The initial
   Luna output copied real passages but counted their offsets incorrectly
   (the first passage was 18 UTF-16 units long but claimed end 17). The request
   now includes derived `{text,start,end}` word metadata, including raw Markdown
   and UTF-16 offsets. The model chooses boundaries from it; existing exact-slice,
   surrogate and overlap validation still discards incorrect output. Nothing is
   re-anchored and no second model call is added. This increases prompt size in
   proportion to reply length and favors word boundaries. Reported usage includes
   that cost. The two-adapter HTTP regression failed before the repair and passed
   afterward; it includes an astral character, Markdown, a whole numbered section
   and a deliberately mismatched output that must still be dropped. The native
   Codex journey also changed from no valid passages to seven.
2. **Name missing suggestion usage.** A completed suggestion call with no reported
   usage previously left only the tutor's counts visible. The existing token line
   now appends `suggestion usage unavailable`; no-suggestion replies retain their
   usual line. Pending calls also use unavailable until counts arrive. Existing
   aggregation and storage stay unchanged. A client regression failed before the
   change and passed afterward; the built-app check covers its visible wording.
3. Reused the existing integration and focused browser seams. No new dependency,
   page, graph visualization, backfill, model fallback or credential relocation.
   The browser checks use headless Chromium with desktop/phone viewport emulation;
   DOM live-region evidence does not prove speech from a particular screen reader.

## Every spec story

**F** = fixture integration/client checks in the shared results; **B** = built-app
browser fixture; **C** = native Codex report. A **FOLLOW-UP .12** result means the
implementation has passing shared/Codex evidence but still lacks the required
Claude counterpart. All such rows refer to the same external gate,
**TreeTutor-5ut.12**, not separate implementation tasks.

| # | Story | Result and evidence |
| --- | --- | --- |
| 1 | Usage under final tutor responses | **FOLLOW-UP .12**; F usage/turn tests, B token line, C saved root and child usage. |
| 2 | Separate input/output/cache-read | **FOLLOW-UP .12**; F adapter mappings and visible line, C all three fields reported. |
| 3 | Suggestion cost with its reply | **FOLLOW-UP .12**; F sums and missing-count regression, B unavailable wording, C both suggestion usage records. |
| 4 | Daily total in Settings | **PASS F/B/C**; local midnight filter, both kinds of call included, displayed Settings total. |
| 5 | Missing usage is unavailable | **PASS F/B**; missing tutor/suggestion counts, failed/canceled replies; native Claude failure saved null usage. |
| 6 | Usage survives reopening | **PASS F/C**; exact saved root/child records across app/store/provider reopen. |
| 7 | Warn past about 2k concept-name tokens | **PASS F/B**; below/above-threshold integration and visible warning. Count is explicitly approximate (JSON characters/4), not provider-reported usage. |
| 8 | Underline unfamiliar terms | **FOLLOW-UP .12**; F anchoring, B dotted marks, C HTML/CSS and other passages. |
| 9 | Underline whole sections | **FOLLOW-UP .12**; F numbered `1. Frontend` section; C Frontend/Backend heading passages. |
| 10 | No fixed suggestion cap | **PASS F + source**; prompt asks for as many as needed; parser/rendering retain all valid nonoverlapping candidates without a count cap. |
| 11 | Automatic after saved replies | **FOLLOW-UP .12**; F one detached call per saved completed reply; C root and child. |
| 12 | Never underline streaming text | **PASS F/B**; unfinished replies have no suggestion record; pending record draws no ranges. |
| 13 | No suggestions for failed/partial/canceled replies | **PASS F**; all lifecycle cases; native Claude failed reply has none. |
| 14 | Dotted unexplored style | **PASS B**; computed dotted decoration in passage-branching check. |
| 15 | Subtle/readable underlines | **PASS B + source**; existing neutral decoration, unchanged reply text/typography and desktop/phone passage controls. |
| 16 | No focus/scroll/open on arrival | **PASS B**; delayed arrival preserves composer focus, draft and an actually scrolled transcript; opens no passage box. |
| 17 | Nonblocking failure note | **PASS F/B**; failed status persists and `Suggestions unavailable` appears. |
| 18 | Highlighting works pending/failed | **PASS F/B**; keyboard selection opens empty passage box in both states; failure also permits real HTTP branch creation. |
| 19 | Restore saved suggestions without inference | **PASS F/C**; saved records identical on reopen; inference counter unchanged. |
| 20 | Provider/model switches do not rerun old replies | **PASS F**; HTTP switches retain saved suggestions and do not start calls. |
| 21 | No backfill of older replies | **PASS F**; restart, toggling off/on and old replies leave previous records absent. |
| 22 | Settings switch | **PASS F/B**; keyboard toggle, persistence, no new calls while off, saved marks retained. |
| 23 | Concurrent suggestions, chat usable | **PASS F**; two delayed calls overlap while another tutor request completes. |
| 24 | Suggestion work stays out of tutor history | **FOLLOW-UP .12**; F both-adapter import/compaction isolation; C fresh-thread calls and clean tutor/compaction inputs. |
| 25 | Choose suggestion model in Settings | **PASS F/B**; keyboard searchable pin selection; global persistence and cross-provider pins over HTTP. |
| 26 | Default Haiku / Codex Luna | **FOLLOW-UP .12**; F both defaults; C exact live `gpt-6-luna`; Claude inference blocked despite available catalog/sign-in. |
| 27 | Default follows each signed-in provider | **PASS F/C**; default/unpin tests and signed-out validation; native Codex follows its own catalog. |
| 28 | Click underline opens empty box above passage | **PASS B**; bounding-box geometry, empty input and no child before submit. |
| 29 | Highlight opens same box | **PASS B**; pointer drag and keyboard exact raw selection. |
| 30 | Short prompt such as explain | **PASS B/C**; `explain` creates a child from the source passage. |
| 31 | Child receives passage and inherited context | **FOLLOW-UP .12**; F frozen recursive context; C real compaction and child continuation. |
| 32 | Empty prompt cannot send | **PASS F/B**; API rejects blank; empty Enter creates no child. |
| 33 | Enter sends; Escape closes | **PASS B**; submit, cancel and restored underline focus. |
| 34 | Child on map and opens in chat | **FOLLOW-UP .12** for native branching; B existing map/chat child flow, C saved branch relation and child reply. |
| 35 | Explored underline solid | **PASS B**; computed solid decoration after child save. |
| 36 | Reopen existing child | **PASS B/F**; activation navigates to saved child, conversation count unchanged. |
| 37 | Highlight can create second branch | **PASS B/F**; second child from highlighted `ute` inside explored mutex, original reference unchanged. |
| 38 | Manual highlight wins overlap | **PASS B/F**; real pointer selection and canonical Markdown offset mapping. |
| 39 | Tab and Enter reach/open underlines | **PASS B**; actual Tab traversal plus Enter activation; one stop per passage in client mapping checks. |
| 40 | Descriptive names, single polite announcement | **PASS F/B**; named controls and one mutation of the pre-mounted status region on arrival. Not a physical screen-reader test. |
| 41 | Failure keeps typed prompt | **PASS B/F**; failed compaction keeps `fail me`, saves no child, retry succeeds. |
| 42 | Same at recursive depth | **PASS B/F**; keyboard grandchild, exact passage and explored reference at each depth. |
| 43 | Global graph across learning trees | **FOLLOW-UP .12** for native graph path; F cross-tree Claude→Codex reuse/restart, B cross-tree Knowledge evidence, C root/child global graph. |
| 44 | Group concepts into topics | **PASS F/B/C**; HTTP graph, Knowledge rows, three native topics. |
| 45 | Multiple topics per concept | **PASS F/B**; cross-topic memberships retained, displayed in each group. |
| 46 | related/builds on links | **PASS F/B/C**; validation, displayed links and six native links. |
| 47 | met/asked/used evidence | **FOLLOW-UP .12** for native graph path; F distinct source events and deduplication, C met/asked events. |
| 48 | Familiarity informs suggestions | **PASS F**; evidence weights and relevant familiarity values sent to later calls; B corrections reach next inputs. |
| 49 | Both learner corrections | **PASS F/B**; passage and Knowledge controls, Enter/Space, saved state and restart. |
| 50 | Corrections outrank inference | **PASS F/B**; known=1/unknown=0 despite later inferred events; next suggestion inputs use correction. Underline suppression itself is a model instruction, not a server filter. |
| 51 | Ignoring is weak evidence | **PASS F**; +0.05 once when asking on; lower than met/asked/used, no double counting. |
| 52 | Corrections on passage textbox | **PASS B/F**; tagged concept controls keep prompt/focus, create no branch or inference; untagged/manual text does not guess a concept. |
| 53 | Reuse concepts with different names | **PASS F/C**; fixture Peterson wording reuse, case-insensitive matching and merge aliases; native HTML/CSS reuse. Unknown synonym matching remains model-dependent. |
| 54 | Merge duplicates | **PASS F/B**; topics, incoming/outgoing links, deduplicated evidence, aliases and passage references; rollback on failure. |
| 55 | Same suggestion call builds graph | **FOLLOW-UP .12**; F two calls total (tutor+suggestion), C graph extraction in root and child suggestion calls. |
| 56 | Store graph locally | **PASS F/C**; isolated local SQLite, persistence across reopen; graph inputs still go to selected inference provider as designed. |
| 57 | Separate Knowledge tab | **PASS B**; map/chat hidden while Knowledge active; returning retains learning state. |
| 58 | Topics/concepts/familiarity/evidence list | **PASS B/F**; multi-topic rows and cross-tree event counts, empty/error/retry states. |
| 59 | Correction/merge in Knowledge | **PASS B/F**; both corrections and searchable merge with saved result. |
| 60 | Keyboard-accessible Knowledge | **PASS B**; Arrow/Home/End tabs, Enter/Space corrections, Tab/search/select/submit/Escape merge, visible focus and restoration. |

## Remaining gate and exact retry

**TreeTutor-5ut.12** records the new native Claude quota failure and the observed
reset: **2026-11-10 08:20 America/Edmonton (15:20 UTC)**. Model availability and
storage/runtime access work; the provider explicitly refuses inference. One
bounded request established the limit. Repeating other Claude models before reset
would not supply new evidence. Codex was used for every independent shared check
and its full native path, without substituting it for Claude-specific acceptance.

After the reported reset or an account-side quota change, stop the app to release
its authentication-directory lock and run:

```sh
node scripts/verify-break-down-live.mjs docs/verification/break-down-native-results.json
```

The script uses a fresh temporary database, existing native sign-ins, fresh
suggestion threads, and both providers. It makes no changes to real learning
trees. It reports each failure and continues the independent provider. The
Codex-only invocation used for repair was:

```sh
node scripts/verify-break-down-live.mjs docs/verification/break-down-native-codex-results.json --codex-only
```

Once both providers pass, update the FOLLOW-UP rows and issue notes, append the
final result to `.ralph-tui/progress.md`, close TreeTutor-5ut.10, and export Beads.
Do not stage or commit here; Ralph performs the pending commit. The full Product
1.0/provider-continuity release checks are separate issues and were not rerun or
closed by this phase verification.
