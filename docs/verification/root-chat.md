# Root chat increment verification

Task: TreeTutor-7t3.5. Date: 2026-11-07 America/Edmonton.

## Verified

- Eleven automated tests pass: isolated tree histories, ordered original messages, SSE partial/final replacement, provider failures and retry, SQLite reopen, interrupted recovery, loopback address, Origin/Host/CSRF rejection, missing trees, UTF-8 split across request chunks, malformed JSON, concurrent independent turns and stop isolation; OAuth state/PKCE/nonce freshness, denied/replayed/expired/mismatched-client rejection, protected credential permissions, refresh serialization/rotation; stdio event routing, authoritative final text, saved-thread resume, failed turns and subprocess exits.
- Node 26.0.0 and installed Codex 0.167.0: generated protocol schema; real isolated app-server initialized and created a thread using `openai_chatgpt_plan`, read-only sandbox, networkAccess false. Synthetic placeholder token; no inference, credential extraction or shared-login mutation.
- Built React/TypeScript/Vite UI successfully. Astryx built-output doctor has zero failures. Its font-import warning reflects the upstream package metadata: Vite aliases that import to locally bundled Figtree. Browser resource inspection confirms no external resources.
- Live `ss -ltnp` shows Node listening on 127.0.0.1:4317 only.
- Browser test on separate temporary data directory at 4318: keyboard tree creation with Tab/Enter; question submission with Enter; visible unauthenticated provider failure; original question and failed response preserved; second tree isolated. Desktop 1440x1000 and mobile 390x844 screenshots inspected. Mobile tree navigation collapses to retain composer space; keyboard focus moves to a newly created chat.
- Impeccable detector returned no findings. Finish review initially requested mobile composer and tree-load recovery fixes; both fixes subsequently scored resolved with disposition ship. Browser-injected tree-load failure also recovered through Retry; keyboard tree creation focused Your question.

## Initially pending — resolved by the live checks below

User must complete TreeTutor's official ChatGPT consent flow at http://127.0.0.1:4317. No valid app-owned subscription credential was present during these checks. Real streamed inference, model entitlement and semantic continuation after process restart have not been demonstrated. Fixture tests and initialized threads do not establish live inference success. Keep Beads issue open until those checks pass.

Full text release also depends on separate branching, canvas and Claude tasks. No claim of full PRD completion.

## Follow-up verification — 2026-11-07

- Re-ran all eleven automated tests, TypeScript/Vite build and Astryx built-output doctor: tests/build pass, doctor has zero failures. Existing font metadata warnings and Vite bundle-size warning remain.
- The previously documented server was no longer running. Started the app again and verified HTTP 200 from `/api/state` and a Node listener bound only to `127.0.0.1:4317`.
- State reports ChatGPT disconnected, zero saved trees and no active turns. Live inference and restart continuation still require the user's official ChatGPT consent; no shared CLI credentials were used. Task remains open and dependent work remains blocked.

## Consent readiness — TreeTutor-7t3.14

- At 2026-11-07T21:19:34-06:00, started the existing app with `npm start` after confirming port 4317 had no listener. `ss -ltnp` then showed its Node process listening only on `127.0.0.1:4317`.
- `/api/state` returned HTTP 200 and `auth.connected: false`. Only the HTTP status and connection boolean were reported; no credential files were inspected or copied.
- User action remains required: open http://127.0.0.1:4317, choose **Continue with ChatGPT**, and review and complete official consent. Consent was not attempted on the user's behalf, and no consent failure was observed. Leave TreeTutor-7t3.14 open until the app reports connected; live inference and restart proof remain separate tasks.

## Consent handoff readiness — TreeTutor-7t3.14.1

- At 2026-11-07T21:22:03-06:00, port 4317 had no listener, so restarted the existing app with `npm start`. Verified its Node listener at `127.0.0.1:4317` only; `/api/state` returned HTTP 200 and `auth.connected: false`.
- The readiness subtask is complete. Parent TreeTutor-7t3.14 remains blocked on official account consent; no credential files were inspected and no account sign-in or inference was attempted.
- Remaining ready leaf task TreeTutor-7t3.15 requires a concrete Claude resolution route. Blanket task authorization supplies neither an account consent result nor a chosen provider-contact recipient/channel or an explicit revised product scope. Existing provider requirements and downstream verification dependencies remain intact.

## Consent completed — TreeTutor-7t3.14

- At 2026-11-07T21:25:30-06:00, the existing app's `/api/state` reported `auth.connected: true`. This supersedes the earlier disconnected observations. Only the connection boolean was reported; no credential files or private account details were inspected.
- `ss -ltnp` verified the existing Node process listening only at `127.0.0.1:4317`. The agent did not perform sign-in on the user's behalf. Source review confirms the app persists consent only after its OAuth callback validates state, registration, identity and plan-use scope; the live connection result resolves the consent prerequisite, not model entitlement.
- All eleven automated tests passed with Node 26.0.0. Live inference and restart continuation remain separate verification tasks; no inference result is claimed by this consent check.

## Live Codex reply — TreeTutor-7t3.5.1

- Environment: Node 26.0.0, Codex CLI 0.167.0, existing loopback server at `127.0.0.1:4317`. App-owned consent was connected before the request; no shared CLI credentials were read. Local storage is `/home/thomas/.local/share/treetutor/trees.sqlite`, with isolated Codex sessions under the same directory's `codex/sessions`.
- Created the saved tree `Verification: synthetic maple 2026-11-07` through the existing HTTP API. Synthetic question: “For this synthetic learning exercise, remember that our fictional maple tree is named Lumen and has 17 branches. Explain in two short sentences what a tree node is, mentioning Lumen.”
- Real subscription inference returned HTTP 200 and 35 SSE text events before `done` with status `completed`. First text arrived after 2,950 ms; completion took 3,851 ms. The recorded model in this synthetic thread's turn metadata was `gpt-6.1-sol`; no model override was requested. Provider configuration remained `openai_chatgpt_plan`, with no API-key substitution.
- Final answer: “A tree node is an element that holds information and can connect to child nodes. Lumen could be a root node with 17 child nodes, one for each branch.” Assertions verified the original question and final streamed answer exactly matched the saved messages fetched afterward.
- An isolated agent-browser session opened the saved synthetic tree. Targeted DOM checks confirmed its title, original question and final answer were rendered. Streaming was verified through SSE, while the browser check covered the saved completed result. No account details or unrelated learner content were reported.
- Consent and this live reply now pass. Restart continuity, independent history transfer, branching, canvas navigation and Claude eligibility remain pending under their separate tasks. Earlier failure/retry checks remain fixture evidence, not a live provider-failure demonstration.

## Saved-tree restart continuity — TreeTutor-7t3.5.2

Verified 2026-11-07, approximately 21:28 America/Edmonton, against the existing app-owned ChatGPT connection and real Codex subscription inference. No shared CLI credentials were read. This supersedes the earlier pending restart check; it does not establish branching, provider switching, canvas, keyboard journey or full release acceptance.

Two new synthetic trees were created through `POST /api/trees`, with questions submitted through `POST /api/trees/:id/messages`. Both replies streamed to `done: completed`; cedar produced 48 text events in 3,349 ms and birch 39 in 3,007 ms. Their provider thread IDs differed. The original histories were:

| Tree | Original question, preserved exactly | Completed original answer, preserved exactly |
| --- | --- | --- |
| Verification: restart cedar 2026-11-07 | For this synthetic exercise remember that the fictional cedar is named Orin and has exactly 23 branches. Briefly explain a root node, mentioning those facts. | A root node is the starting point of a tree structure and has no parent. In this fictional example, the cedar named Orin has exactly 23 branches; Orin’s base represents the root node, from which the branches extend. |
| Verification: restart birch 2026-11-07 | For this synthetic exercise remember that the fictional birch is named Vela and has exactly 41 branches. Briefly explain a leaf node, mentioning those facts. | A leaf node is a node with no children. In this fictional example, the birch Vela has exactly 41 branches; any branch tip with no further branches is a leaf node. |

- Before restart, fetched both complete tree records through `GET /api/trees/:id` and saved synthetic snapshots outside the repository. Confirmed no active turns. Sent SIGTERM to the verified project server PID 215005, asserted that process exited, then started `node server/main.mjs` with the same default data directory. The replacement PID was 222848. A subsequent `ss -ltnp` confirmed its listener at `127.0.0.1:4317` only. Existing authentication was retained without repeating consent.
- Reopened both trees through HTTP after that actual process restart. Deep equality assertions passed for each entire pre/post tree record: title, ID, creation time, provider thread, message IDs, ordering, original text, final answers and completed statuses. Storage remained `~/.local/share/treetutor/trees.sqlite`, with provider session history in the app's isolated `codex` directory.
- Asked cedar: “What is the name of my fictional tree and exactly how many branches does it have? Answer from our earlier conversation in one sentence.” Real streamed answer: “Your fictional tree is named Orin, and it has exactly 23 branches.” Completion took 2,985 ms with 17 text events. Assertions checked Orin/23, absence of Vela/41, unchanged original messages and an entirely unchanged birch record. This establishes semantic continuation, beyond a resumed thread identifier.
- For a controlled live transport failure, asked birch: “For this synthetic test, explain binary trees in about 2000 words, with numbered examples.” After receiving its first text event, sent SIGTERM only to the replacement server's isolated stdio Codex child PID 222859. No account, credential, network or unrelated Codex process was modified. SSE reported “Codex disconnected. Partial reply saved; try again.” and `done: failed`. Fetching the saved record confirmed the original two messages remained exact, the new question remained exact, and the failed assistant's 22 characters exactly matched the last streamed partial text. The active-turn list cleared. This is an induced subprocess disconnect, not evidence of a natural provider outage or entitlement failure.
- Retried in birch with: “Please retry with just one sentence: what is the name of my fictional birch and exactly how many branches does it have? Use our earlier conversation.” The app restarted its provider subprocess and completed: “Your fictional birch is named Vela and has exactly 41 branches.” Assertions checked Vela/41, absence of Orin/23, unchanged provider thread, exact preservation of all four earlier messages including the failed reply, and an unchanged cedar record. Retry appends a new question and reply; it does not replace failed messages.
- All eleven automated tests passed again. This increment changes verification documentation only; no application or UI code changed. Live reopening was checked through HTTP, not a new browser session. The replacement loopback server remains running with both synthetic trees available.

## Root-chat acceptance reconciled — TreeTutor-7t3.5

Reviewed 2026-11-07 after both live-verification prerequisites closed. The earlier pending observations above are historical; root-chat acceptance is now met by the following evidence:

| Acceptance criterion | Evidence |
| --- | --- |
| Two isolated trees survive restart | TreeTutor-7t3.5.2 compared complete cedar and birch records before and after an actual server restart; real follow-up replies recalled each tree's own facts. |
| Root chat streams replies and preserves originals | TreeTutor-7t3.5.1 verified real SSE text and completed saved originals; TreeTutor-7t3.5.2 checked original records remain exact during continuation and retry. |
| Server binds only to loopback | Fresh listener inspection found Node PID 222848 at `127.0.0.1:4317` only. `/api/state` returned HTTP 200, connected authentication, three saved trees and no active turns. |
| Request failure leaves saved history usable | TreeTutor-7t3.5.2 induced a provider subprocess disconnect, verified saved original/partial messages, then completed a real retry without changing the other tree. |
| Keyboard tree creation and chat work | The initial browser check above used Tab/Enter to create a tree and Enter to submit a question; composer focus, visible failure and preserved history were checked. This is root-chat keyboard evidence, not the later full branching keyboard journey. |

Fresh quality gates passed: all eleven automated tests, TypeScript/Vite build and Astryx built-output doctor (zero failures). Existing bundle-size and font metadata warnings remain. This reconciliation adds no application changes or new inference requests; live reply/restart results refer to the recorded prerequisite runs. Close the root-chat feature and unblock its dependents. Branching, canvas, imported history, Claude eligibility and full text-release acceptance remain separate work.
