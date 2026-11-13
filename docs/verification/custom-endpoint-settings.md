# Custom endpoint settings and model menu — TreeTutor-sh8.5

## Edit, rename and test — TreeTutor-2li.8 (2026-11-13)

Fixture evidence (fake OpenAI-compatible servers, real built UI and HTTP); no
live endpoint tested. `node scripts/verify-custom-endpoint.mjs` PASS:

- Test on a row with a 401 fixture shows "Test failed · Custom endpoint
  rejected the API key. Check endpoint settings." with the time, announced as
  an alert; it stays after a reload and offers Test again.
- Edit opens inline; changing the base URL warns "URL changed: enter the key
  again…" and keeps Save disabled until a key is entered. Renaming without a
  key keeps the id, key and conversation provider; the key never reached the
  other host. Saving runs a test that replaces the failure with "1 model
  listed · tested today".
- Edit form fits 1280 and 390 px in light and dark without sideways scroll.
- Screenshots: `custom-endpoints-test-failed-{light,dark}.png`,
  `custom-endpoints-edit-{light,dark}.png`.
- Fixed in passing: the script's text waits used `a ?? "".includes(…)`, which
  always passed; they are now parenthesised.

Server: `test/endpoints.test.mjs` covers rename, URL change refused without a
key, URL change with a key, test success and failure, persistence of the
failure across restart and abort of an in-flight reply on edit.

## Several endpoints — TreeTutor-2li.7 (2026-11-13)

Fixture evidence only (loopback [fake-openai.mjs](../../test/fake-openai.mjs)
upstreams, synthetic Claude/Codex callbacks); no live endpoint was tested.
`node scripts/verify-custom-endpoint.mjs` after `npm run build` now checks, in
the built UI with real HTTP, SQLite and credential storage:

- Upgrade: a seeded single-endpoint `openai-endpoint.json` is listed as
  "Custom endpoint" with provider id `openai`; the old file is gone.
- Keyboard Add endpoint opens the inline form with Name focused; a
  case-insensitive duplicate name shows "Another endpoint is called … Choose a
  different name." and clears the key; the second save adds "Work gateway" as
  `openai:<uuid>`.
- The model menu groups each endpoint's models under its name. Keyboard switch
  cycles across both endpoints, Codex and Claude in a root and a depth-two
  child, before and after a server restart, each reply coming from the chosen
  upstream.
- A failing endpoint shows "Work gateway · not connected" with a settings action
  that focuses Add endpoint.
- Remove opens a confirmation dialog; Escape cancels; confirming removes only
  that endpoint and its key from the file. Its conversation keeps its content,
  fails visibly ("Selected provider is unavailable") and can switch back.
  Removing the last endpoint shows the empty state and deletes the file.
- Light and dark appearance, desktop 1280×900 and mobile 390×844: list, inline
  form and dialog have no sideways scroll and stay in the viewport
  ([light](custom-endpoints-light.png), [dark](custom-endpoints-dark.png),
  [remove light](custom-endpoints-remove-light.png),
  [remove dark](custom-endpoints-remove-dark.png)). No key appears in the page.

[endpoints.test.mjs](../../test/endpoints.test.mjs) covers add, list, remove,
migration, duplicate names, labels in the models listing, persistence across
restart and that no response body contains a key.

The sections below record the earlier single-endpoint form (TreeTutor-sh8.5);
its Save/Test connection form was replaced by the list above.

Verified 2026-11-10 on Node 26.0.0, using the built UI and isolated temporary
app-data directories. All checks below passed. See the
[browser result](custom-endpoint-settings-results.json) and
[quality-gate result](custom-endpoint-settings-checks.json).

## Evidence boundary

These are **fixtures**, not live inference. The browser uses real Chrome,
loopback HTTP, the settings routes, OpenAI-compatible adapter, SSE and SQLite.
The upstream service is [fake-openai.mjs](../../test/fake-openai.mjs); Claude and
Codex replies in the browser fixture are synthetic provider callbacks. The
integration test additionally drives the real Claude/Codex adapters through
protocol subprocess fixtures and inspects their outbound history/context.
Synthetic replies establish routing and payload preservation, not a model's
understanding, entitlement, summary quality or remote compatibility.

**No live endpoint was tested.** The owner supplied no endpoint in this task,
and the effective app-data directory (`/home/thomas/.local/share/treetutor`)
contained no `openai-endpoint.json`. Only file presence was checked; no owner
credential was read, moved or copied. No live native-account or public endpoint
request was made. Existing native-provider release evidence remains separate.

## Settings, menu and keyboard

Run `node scripts/verify-custom-endpoint.mjs` after `npm run build`.
It records its checks and temporary screenshot directory in the browser result.

- Keyboard-only: Tab to the model button, Space, Home/arrows/Enter to
  **Custom endpoint settings**; Base URL receives focus. Enter URL/key, submit
  with Enter, Tab to Test connection and Remove, and activate them. The same
  Save/Test/Remove sequence passes with mouse controls.
- Save uses the existing CSRF-protected route and refreshes the catalogue without
  selecting a provider. Test checks saved model listing and states that chat
  access may vary. Unsaved URL/key edits disable Test. Removing the endpoint
  preserves saved discussions and their explicit provider choice.
- The key input is `password`, clears after actions, unmounts when settings close,
  and reopens empty with the saved URL restored. Settings responses contain only
  `configured` and `baseUrl`. The canary never appears in rendered text or saved
  response bodies. The existing credential-boundary suite also passes.
- Requests/context and billing by the endpoint owner are stated beside the form.
  README, storage/privacy guidance and Map help describe setup and switching.
- The third menu group lists both fixture models. Unconfigured, removed,
  unauthorized, empty-catalogue and total-provider-failure cases offer an active
  settings item. Test failure names the API-key recovery path. Restoring the
  catalogue allows explicit selection again.
- Settings from Map menu focuses its heading. Closing navigation returns focus
  to a visible map or model control. On narrow screens, Escape/Return to tree
  exposes Map menu; Reopen chat returns to selection. Escape from the model menu
  returns focus to its trigger. No script-driven DOM focus/click substitutes for
  keyboard operations in these paths.
- Desktop 1280×900 and mobile 390×844: no horizontal document overflow, settings
  scroll to the inputs/actions, and the visible model menu stays inside the
  viewport. Screenshots were inspected in two bounded review passes.

## Switching and persistence

[endpoint-switch.test.mjs](../../test/endpoint-switch.test.mjs) checks the HTTP
selection/message APIs with the real three adapters, fake compatible service
and native protocol fixtures. The browser fixture repeats the matrix using
keyboard selection and sends the next question through the UI.

| Direction | Root | Depth-two child | Root after restart | Child after restart |
| --- | --- | --- | --- | --- |
| Claude → Custom endpoint | Pass | Pass | Pass | Pass |
| Custom endpoint → Codex | Pass | Pass | Pass | Pass |
| Codex → Claude | Pass | Pass | Pass | Pass |
| Claude → Codex | Pass | Pass | Pass | Pass |
| Codex → Custom endpoint | Pass | Pass | Pass | Pass |
| Custom endpoint → Claude | Pass | Pass | Pass | Pass |

Every switch preserves the original message objects and fixed branch snapshot.
The browser also compares every visible message before/after selection, then
checks that the next reply completes on the selected provider/model. Integration
checks compare the full role-ordered history sent to Chat Completions, the fresh
Claude prompt and Codex history import, plus inherited snapshot/exact passage.
The intermediate child's saved state stays unchanged. Branching through the API
on each provider inherits its model/provider; new chats still default to Claude.

Integration restart closes/reopens the HTTP app, adapters and SQLite store and
reloads credentials. Browser restart also replaces the server with a fresh PID
and repeats all six directions in both conversations (24 switches across both
runs). The result records both PIDs. Saved
URL/provider/model/history/context survive. Removing the endpoint never silently
reroutes a saved chat; the menu can reopen settings or select Claude explicitly.

## Quality gates and repairs

| Check | Result |
| --- | --- |
| `npm test` | 127/127 pass; zero failures, cancellations or skips |
| `npm run build` | Pass; TypeScript and Vite; existing large-chunk warning |
| `npx astryx doctor --built dist` | 20 pass, 2 existing theme/font warnings, 0 fail |
| `node scripts/verify-custom-endpoint.mjs` | Pass; 32 recorded fixture checks |
| `node scripts/verify-model-switch.mjs` | Pass in fixture mode; model change, restart, busy/denied/failing/saved-model recovery |
| `git diff --check`, JS syntax and local documentation links | Pass |

The first browser assertion failed because Connections had no URL field. During
implementation the failure fixture exposed focus loss when a refresh replaced
the focused menu row. The menu now loads before opening and shows a loading
state; stale catalogue responses are ignored. Closing settings also restores a
visible focus target on narrow screens. No backend/provider change was needed.

The older model-switch fixture assumed a model-only menu and immediate opening.
It now navigates by label, waits for the visible open menu (other hidden menus
remain mounted), and expects actionable recovery when loading fails. The new
fixture uses the visible menu for bounds checks and waits for completed message
rows. Recoverable fixture failures were repaired in this issue.

The doctor's font warnings are existing metadata limitations; the built CSS
contains no remote font URLs and the self-hosted Figtree alias remains intact.
Impeccable also reported an existing stale design sidecar; it was left unchanged
under the narrow UI scope. No new dependencies, CSS overrides, usage/cost UI or
multiple-endpoint support were added. Git stays on `master`; Ralph owns the
pending local commit. No staging, commit, push, pull or remote sync was performed.
