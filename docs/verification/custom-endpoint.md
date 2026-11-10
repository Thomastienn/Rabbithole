# Custom endpoint verification

TreeTutor-sh8.4, 2026-11-10. Implementation on `master`, starting HEAD
`a3127deb1bc8b3669ddb3f28b30acff24b6f5b53`. No frontend edits, dependency
changes, native adapter edits, Git staging, commits or remote operations.

The API and storage decisions are in [custom-endpoint.md](../custom-endpoint.md).
The adapter uses built-in fetch and SSE decoding, without a new SDK.

## Acceptance evidence

| Check | Result and repeatable evidence |
| --- | --- |
| Configuration and catalogue | PASS. `test/openai.test.mjs` exercises server save/status/test/clear routes, exact public status fields, URL normalization/validation, default model, duplicate/invalid/empty model catalogues and retained model selection on failure. |
| Streaming and history | PASS. Real local HTTP returns incremental deltas before completion. Follow-up request contains completed saved role history and frozen inherited context, with the new message once. Split UTF-8 bytes, CRLF/LF, comments and multiline data decode correctly; metadata and other choices stay out of output. |
| Stop and timeout | PASS. Stop saves the partial reply, reports interrupted, and closes the upstream socket. An already-aborted call sends no request. Clearing configuration interrupts an active generation. Timeout reports failure. A subsequent turn succeeds and excludes failed/interrupted assistant fragments from replay. |
| Error mapping | PASS. 400/401/403/404/429/503, disconnected transport, malformed JSON, stream error frames, premature EOF, empty replies, DONE without a finish, length/filter/tool finishes and a non-stream response fail visibly. A later turn succeeds. |
| Compaction and switching | PASS. Tests use the real OpenAI, Claude and Codex adapters, with local HTTP and synthetic CLI protocol subprocesses. Both native adapters receive the custom discussion and frozen branch context; switching back sends native discussion to the custom endpoint. Nested compaction receives its own instructions and relevant ancestor/current data, without later ancestor edits. Parent history is unchanged; failed switches restore the working native selection/session. |
| Credential file | PASS. `test/credential-boundary.test.mjs` starts and restarts actual `server/main.mjs` processes with an isolated directory and canary key. The file persists across restart at 0600 in a 0700 directory, and clear removes it. Additional integration cases repair permissive file mode, reject symlink loading, preserve unrelated targets and replace malformed settings. |
| Credential exposure | PASS. The main-entry test scans collected success/error/restart response bodies, combined stdout/stderr, every SQLite table and raw SQLite files for the canary. Hostile model metadata/IDs, errors and adjacent/repeated key echoes split across stream chunks do not expose or persist it. Compaction snapshots are filtered too. The upstream receives the canary only as Authorization, never as inference history; native process environments receive no custom key. |
| Loopback, CSRF and redirects | PASS. Each mutating settings route rejects missing CSRF, wrong content type, foreign Origin/Host and cross-site requests. Raw HTTP tests Host because Node fetch rewrites it. Catalogue and inference redirects make no request to the second local host. Main-entry tests connect to actual loopback-bound servers. |
| Explicit choice and clearing | PASS. New chats remain Claude by default. A missing Claude executable does not trigger custom inference. Clearing removes the custom catalogue entry; a saved custom conversation fails visibly without another provider being called. Reconfiguration allows continuation. A saved video retry with a cleared provider becomes failed and leaves no active job. |

## Final gates

Commands run through `rtk proxy` on Node v26.0.0:

- `node --test test/openai.test.mjs test/credential-boundary.test.mjs`: 12/12 pass.
- `npm test`: 126/126 pass, zero failed/cancelled/skipped; final run 38.61 seconds.
- `npm run build`: PASS; TypeScript and Vite v7.3.7 build, with the existing large-bundle warning.
- `npx astryx doctor --built dist`: 20 pass, 2 warn, 0 fail. Warnings concern theme/font proof for Figtree. Built-output inspection does not establish source-level UI purity.
- `git diff --check`: PASS.

## Evidence boundary

Transport, cancellation, local file permissions, SQLite persistence, process
restarts and main-entry logs are actual local runtime observations. Compatible
endpoint responses and Claude/Codex CLI replies are fixtures. These tests do
not claim native account authentication, live provider semantics, billing or
remote retention evidence. No real endpoint key or user account was used.
No browser test was needed for this server-only issue. Settings UI remains
TreeTutor-sh8.5. Exact-key filtering and canary scans have the bounded scope
described in the design note; they are not an exhaustive security audit.

The pre-existing `.beads/issues.jsonl` modification was preserved and is
refreshed by the requested local Beads export. Ralph owns the pending commit.
