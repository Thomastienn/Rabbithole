# Diagram recovery and isolation evidence (TreeTutor-vm4.1)

Date: 2026-11-10. Builds on [diagram-artifacts.md](diagram-artifacts.md) (vm4.7)
and [diagram-rendering.md](diagram-rendering.md) (vm4.8).

## Defect fixed

A process stop or crash during generation left the artifact `pending` forever.
`Store` now fails orphaned pending artifacts on open (`server/store.mjs`). The new
test fails without the change and passes with it.

## Integration checks (fixture providers, real HTTP/SSE, SQLite, parser)

| Acceptance | Test (`test/artifacts.test.mjs`) | Result |
| --- | --- | --- |
| Restart restores the same artifact, no replay, no duplicate, chat usable | `restart fails orphaned pending artifacts once…` | PASS |
| Stopped job's late events cannot publish into another conversation; B keeps running | `a stopped job cannot publish late results…` | PASS |
| Worker permissions (actual launch args/env, Codex tool-request denial) | `claude/codex adapter generates diagrams…` | PASS |
| Failed/invalid/timeout/Stop leave chat usable; late callbacks ignored | vm4.7 tests | PASS |
| Provider switch and compaction get ready id/title/description only | vm4.7 test | PASS |
| Inline keyboard-accessible card, text alternative, reload/restart identity | vm4.8 browser fixture + `test/artifact-render.test.mjs` | PASS (vm4.8) |

`npm test` 78/78 PASS; `npm run build` PASS (existing chunk-size advisory);
`npx astryx doctor --built dist` 0 fail; `git diff --check` PASS.

## Live native check (Claude CLI, subscription sign-in, model haiku)

`node scripts/verify-diagram-live.mjs docs/verification/diagram-live-results.json`
— 15/15 PASS, see [diagram-live-results.json](diagram-live-results.json).

Transcript isolation: the tutor chose the diagram unprompted by format; the
worker's whole input was the four-field task, without an unrelated canary
message, the learner text, conversation id or tutor session; the follow-up tutor
prompt held artifact id/title/description but no source, intent, excerpt or
worker prompt; tutor native transcripts never contain the Mermaid source.

Worker permissions, recorded separately: the launched worker had `--tools ''`,
`--max-turns 1`, strict empty MCP, no setting sources, slash commands disabled
and no API-key environment; its native session transcript has no `tool_use`.
Restart reopened identical messages/artifacts with zero CLI launches.

Limits: live check used Claude only (shared checks permit either provider);
Codex worker permissions are verified with the protocol fixture. Native diagram
quality was not judged beyond a successful parse.
