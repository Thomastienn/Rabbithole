# Diagram artifacts — TreeTutor-vm4.7

The server-side increment passes its acceptance checks. The contract and limits
are in [diagram-artifacts.md](../diagram-artifacts.md); command output and source
hashes are in [diagram-artifacts-checks.json](diagram-artifacts-checks.json).

| Acceptance | Evidence |
| --- | --- |
| Request creates one saved ready artifact on the originating reply | HTTP/SSE/SQLite test checks pending → ready, exact ownership/source/metadata and a second SQLite connection reading the saved result. The directive streams character by character without exposing its prefix. Ordinary code fences retain exact final text. |
| Worker receives only a frozen minimal task | Test asserts exactly four task fields and only provider/model/null-thread/instructions on the worker selection. Tutor session id, unrelated transcript, current question, branch data and credentials are absent. Attempted worker session/model saves do not change the tutor. |
| Invalid and executable results fail honestly | 22 rejection cases cover malformed syntax, interactive directives, raw/encoded HTML, config/frontmatter, external assets, CSS/Markdown links, ASCII/multibyte and streaming overflow, too many items, empty output, provider errors and incomplete generation. Rejected source and private diagnostic canaries are absent from saved artifacts and HTTP results. Six malformed request cases never invoke a worker. Chat remains usable. |
| Valid source really parses | Six additional definitions cover flowchart, sequence, class, state, ER and pie syntax through the installed Mermaid parser and its DOM sanitizer in a real Node worker. No mocked validator or generated executable file. |
| Ownership is enforced | Own scoped GET succeeds; foreign tree, parent/child and unscoped GET fail. Client attachment attempts reject without messages or links. Internal cross-conversation insertion fails, and foreign-id finalization cannot change the owner record. |
| Tutor history, switching and compaction contain metadata only | Next-turn and both-direction switch fixtures receive ready id/title/description, with no source, task intent/excerpt, worker transcript or failed-artifact details. Compaction receives the same projection; the child receives no foreign artifact. Canonical reply text stays separate from the metadata projection. |
| Abort and bounds work | Stop and a short injected deadline release HTTP turns even when the fixture ignores cancellation; failed records have no source. Late callbacks cannot overwrite records. A partial directive is hidden on Stop and its native session discarded. Codex protocol test checks pre-abort makes no request and interrupt releases a stalled turn without a terminal event. |
| Both provider adapters work | Real `Claude` and `Codex` classes launch fixture subprocesses using their native stream-json/JSON-RPC protocols. Distinct session/thread ids, dedicated worker instructions, model selection and metadata-only history imports are checked. Existing no-tools and subscription authentication paths are preserved. |

Final gates: `npm test` passes **75/75** with no skips; `npm run build` passes;
`npx astryx doctor --built dist` reports **20 pass / 2 warn / 0 fail**. The two
existing warnings concern proving the external Figtree font load. Vite retains
its existing large-chunk advisory. `git diff --check` passes. No previously
locked dependency version changed; Mermaid 12.3.0 and JSDOM 29.1.1 are pinned.

These are fixture integration results with real local HTTP, SQLite, parsing and
process execution. They establish protocol wiring and server behavior. They do
not establish live Claude/Codex model behavior, semantic diagram quality, browser
rendering or crash recovery. No native inference, browser fixture, authentication
change or credential relocation ran here. Rendering belongs to TreeTutor-vm4.8;
pending-work restart/failure recovery and native media evidence belong to
TreeTutor-vm4.1.

The 31 protected startup files remain byte-identical, and the pre-existing
`server/app.mjs` viewport change remains intact. The current branch is `master`.
No staging, agent commit, remote operation, new issue or next-task work occurred.
Ralph owns the pending implementation commit after the issue close/export.
