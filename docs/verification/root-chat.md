# Root chat increment verification

Task: TreeTutor-7t3.5. Date: 2026-11-07 America/Edmonton.

## Verified

- Eleven automated tests pass: isolated tree histories, ordered original messages, SSE partial/final replacement, provider failures and retry, SQLite reopen, interrupted recovery, loopback address, Origin/Host/CSRF rejection, missing trees, UTF-8 split across request chunks, malformed JSON, concurrent independent turns and stop isolation; OAuth state/PKCE/nonce freshness, denied/replayed/expired/mismatched-client rejection, protected credential permissions, refresh serialization/rotation; stdio event routing, authoritative final text, saved-thread resume, failed turns and subprocess exits.
- Node 26.0.0 and installed Codex 0.167.0: generated protocol schema; real isolated app-server initialized and created a thread using `openai_chatgpt_plan`, read-only sandbox, networkAccess false. Synthetic placeholder token; no inference, credential extraction or shared-login mutation.
- Built React/TypeScript/Vite UI successfully. Astryx built-output doctor has zero failures. Its font-import warning reflects the upstream package metadata: Vite aliases that import to locally bundled Figtree. Browser resource inspection confirms no external resources.
- Live `ss -ltnp` shows Node listening on 127.0.0.1:4317 only.
- Browser test on separate temporary data directory at 4318: keyboard tree creation with Tab/Enter; question submission with Enter; visible unauthenticated provider failure; original question and failed response preserved; second tree isolated. Desktop 1440x1000 and mobile 390x844 screenshots inspected. Mobile tree navigation collapses to retain composer space; keyboard focus moves to a newly created chat.
- Impeccable detector returned no findings. Finish review initially requested mobile composer and tree-load recovery fixes; both fixes subsequently scored resolved with disposition ship. Browser-injected tree-load failure also recovered through Retry; keyboard tree creation focused Your question.

## Pending — do not claim full acceptance

User must complete TreeTutor's official ChatGPT consent flow at http://127.0.0.1:4317. No valid app-owned subscription credential was present during these checks. Real streamed inference, model entitlement and semantic continuation after process restart have not been demonstrated. Fixture tests and initialized threads do not establish live inference success. Keep Beads issue open until those checks pass.

Full text release also depends on separate branching, canvas and Claude tasks. No claim of full PRD completion.
