# TreeTutor-y36.10 — States and overlays

Verified 2026-11-13 against the Paperback Seasonal Inks mockup in `docs/mockups/states.html`, its CSS and the parent issue's direction contract. Current branch preserved; no staging, commit or remote operations. Ralph owns the pending commit.

## Result and decisions

- Shared Astryx menus keep every action, label and sign-in path. Destructive items come last, separated from other actions. Current model/effort checks use leaf ink.
- Passage prompt: 320px maximum, raised sheet, paper border and square leaf send control. Native text selection, painted passage, corrections and keyboard/outside dismissal remain intact.
- Rename stays inline with accessible existing Save title/Cancel rename labels and compact icon actions. Deletion keeps its full consequence/count/no-undo/video-retention text and safe initial focus. Delete uses a separated neutral outline, paper fill and paper focus ring. **Decision:** the issue's failure-only rose rule overrides the mockup's rose destructive examples.
- Inherited context keeps its exact passage, question and fixed snapshot; the passage rule uses the conversation's branch-family ink. Check yourself stays a native, initially closed Reveal answer disclosure in the sandbox.
- Reply and media failure states use rose outlines and tinted fills with explicit recovery. Interrupted replies retain partial text and identify a learner Stop; canceled/interrupted states stay neutral. Existing latest-reply Retry eligibility is unchanged.
- Diagram generation failures retry their worker as before; browser rendering failures retry the saved source locally. The source and description remain readable. Keyboard focus now restores after rendering finishes rather than before the Retry button disappears.
- Tree loading uses four real, sized skeletons while already available contents stay readable. Tree/model/save failures remain visible and recover through their existing Retry actions; an initial learning-tree-list failure also has a Retry action.
- First run offers one question field and the existing provider/model/effort menu in Read and Library. Merely opening or choosing a model saves no empty tree and starts no inference. Send passes the explicit validated choice to tree creation, bypassing an unavailable Settings default without changing Settings; the first streamed reply shows the actual selected model. Invalid choices create nothing; repeated creation still reuses one unstarted chat. Failed creation/send retains the question. Ordinary New chat keeps its default behavior. Input and Send can disable independently, so model/sign-in recovery stays usable.
- Diagram, visual and video viewers keep native rendering/playback, Escape and focus return on raised paper sheets with dimmed backdrops. The visual viewer has an explicit Close action. Focus guards contain traversal through the opaque iframe because its key events do not bubble to the outer dialog.
- **Decision:** the newer video-quality specification's loading scene, progress and captions remain in force. This issue restyles its failures and viewer; it does not replace that later behavior with the older static loading specimen.

## Acceptance evidence

All evidence is from the production build through loopback HTTP, isolated SQLite and agent-browser Chromium. Providers, study data and injected network/storage failures are fixtures; playable media is a local ffmpeg MP4. These checks exercise live app behavior, not native Claude/Codex inference or provider release acceptance.

| States specimen | Live evidence in both appearances |
| --- | --- |
| Ask, passage box and corrections | `verify-passage-popup`, `verify-dialog-identity`; `states-passage-*`, `states-corrections-*`, `dialogs-passage-prompt-*` captures |
| Model, conversation, tree and map menus | `verify-states`, `verify-dialog-identity`, `verify-model-switch`; `dialogs-model-menu-*`, `states-conversation-menu-*`, `states-tree-menu-*`, `dialogs-map-menu-*` |
| Rename and delete | `verify-dialog-identity`, `verify-chat-management`; `dialogs-rename-*`, `dialogs-delete-*`, `dialogs-delete-focused-*`; narrow 390px confirmation and long titles also pass |
| Search learning trees | `verify-shell-band`, `verify-tree-search`; title match, empty/no-match, keyboard and focus return; current shell search captures |
| Composer idle, disabled and Stop | `verify-states`, `verify-first-conversation`, `verify-read`; no-model recovery menu, actual first-send SSE and retained drafts |
| Failed and interrupted replies | `verify-states`, `verify-reply-retry`; `states-replies-*`, `reply-retry-failed-*`; learner Stop has no Retry, latest failed reply retries in place |
| Visual/video/diagram failures | `verify-states`, `verify-request-failures`, `verify-diagram-rendering`, `verify-video-actions`; `states-media-failures-*`, `states-failures-narrow-*`; real HTTP worker Retry and source fallback checks |
| Inherited context and check before reveal | `verify-states`, `verify-read`; `states-context-*`, `states-check-before-reveal-*`; exact snapshot, family ink, keyboard Reveal and paper focus |
| Saving/loading failures and skeletons | `verify-states`, `verify-shell-band`; `states-save-failure-*`, `states-tree-load-failure-*`, `states-model-load-failure-*`, `states-loading-*`; failed writes/reads clear on recovery |
| Merge concepts | `verify-states`, `verify-knowledge`; `states-merge-*`; keyboard selection/submission, failed-write retention, focus return |
| Conversation node states | `verify-read`, `verify-reply-retry`, `verify-states`, `verify-narrow`; current selected/failed/interrupted/streaming nodes and fold actions remain intact |
| First run | `verify-states`, `verify-library`, new HTTP integration in `test/chat-defaults.test.mjs`; `states-first-run-*`; unavailable default, local choice, held streaming reply, settings preservation and single creation/send |
| Enlarged diagram/visual/video | `verify-states`, `verify-diagram-rendering`, `verify-visual-branch`; `states-{diagram,visual,video}-viewer-*`; forward/reverse Tab containment and Escape return in each appearance |

`states-results.json` records the state matrix, composited AA text contrast samples, first-run/streaming proof and 32 dark/light/narrow captures. `dialogs-identity-results.json` records menus, neutral delete styles, safe focus/trapping/return, paper prompt and paper focused-delete outline (dark `rgb(239, 230, 214)`, light `rgb(31, 26, 21)`). Screenshot origin metadata is embedded in all 73 changed/new verification PNGs; provenance scan reports zero missing.

Validation: `npm test` passes; `npm run build` passes and the build fingerprint is current; `git diff --check` passes. All 23 scoped browser integration scripts listed in `states-regressions.json` pass. A final visual-branch rerun exposed an offscreen opaque-frame readiness wait after reload: its helper now scrolls the mounted figure into view before waiting. Its full desktop/narrow, light/dark journey passes. The broader full verify-all collection and native-provider release journeys were not run; the build retains its existing >500kB chunk advisory.

## Review and documentation

Independent code review found and then cleared the unavailable-default creation path and incorrect first-stream model display. Acceptance checks also found and repaired narrow confirmation overflow, diagram Retry focus timing, no-model pointer recovery and iframe focus containment. Final read-only code review reports no remaining material findings at this scope.

Impeccable finish reviewer inspected 55 supplied captures and requested one material fix: replace the inherited rose focused-delete outline with paper. Both exact recaptures and computed-color assertions pass; the reviewer scored that fix **resolved**, disposition **ship** at y36.10 scope. No new visual defect hunt followed the verdict. The mechanical detector found only 15 advisory font/radius differences against the stale Slate design record, no non-advisory findings.

Documenter comparison confirms reuse of existing Paperback palette, typography, geometry, focus and state tokens; no new design primitives. `DESIGN.md` and `.impeccable/design.json` still describe Slate and remain untouched: their reconciliation belongs to TreeTutor-y36.12.
