# Later learning and media increments

Issue: **TreeTutor-vm4**. Reviewed **2026-11-09** against the current
[PRD](../../PRD.md), AGENTS.md, local Beads records and application source.
**Blocked; no later increment is release-ready.** Standing implementation
authorization applies, but the text-release prerequisite and explicit Vim
mapping decision remain in force.

## Scope and required release evidence

| Increment | Agreed scope and owner | Required evidence before release | Current result |
| --- | --- | --- | --- |
| Mermaid | `TreeTutor-vm4.1`, after `TreeTutor-7t3.12`. Tutor-chosen diagrams use a separate runtime subagent and appear in the originating chat. Only the finished artifact ID, title and concise description enter tutor context. | Minimal frozen task/result contract; transcript isolation and actual worker permissions checked separately; safe rendering and ownership validation; keyboard-accessible inline diagram and text alternative; persistence, failed/interrupted jobs, late events, provider transfer and compaction checks. | PRD and grouped issue define scope. No artifact worker, renderer, persistence or runtime evidence exists in the reviewed application. |
| Remotion | `TreeTutor-vm4.3`, after Mermaid and closed design decision `TreeTutor-vm4.2`. The [selected video design](../video-flow-proposal.md) requires explicit learner requests, isolated generation, a saved local file and paused native playback. | Bounded workspace without tutor credentials or unrelated learning files; controlled network and execution checks; validated local output and same-origin ownership; inline status and keyboard playback without focus/scroll theft; continued chatting; cancel, retry, superseded attempts, interruption, missing files and restart without automatic inference. | Design agreed; worker, render, playback and recovery evidence remain absent. |
| Automatic suggestions | `TreeTutor-vm4.5`, after the text release and closed design decision `TreeTutor-vm4.4`. The [selected suggestion design](../branch-suggestions-proposal.md) offers zero to three grounded passages after a saved completed reply. Choosing opens an editable question; only submission creates a branch. | Exact canonical UTF-16 anchors, repeated text/emoji and invalid-candidate rejection; once-per-reply evaluation; durable dismissals and accepted-child reuse; failure/restart/late-event handling; isolated generation metadata; unchanged manual branching, concurrency and focus; recorded relevance review across the agreed learning examples. | Design agreed; automatic evaluation, durable suggestion state and quality/accessibility evidence remain absent. |
| Vim bindings | `TreeTutor-vm4.6`, after the text release, closed standard-keyboard task `TreeTutor-b1z.4` and blocked decision `TreeTutor-vm4.6.1`. The [exact proposal](../vim-bindings-proposal.md) is pending explicit owner agreement. | First record the chosen mapping, activation and editing boundaries. Then verify opt-in aliases, disabled mode, reload/tree changes, focus/help and the standard keyboard journey; exclude text/read-only selection, IME, nested/provider controls, menus/dialogs, browser modifiers and native media keys. | Scope is proposed, not agreed. No aliases or preference control implemented; no runtime acceptance claimed. |

The four grouped implementation issues remain open. Older closed implementation
subtasks carry `workflow_rollup`/`supersedes` records: their closure moved scope
into these groups and does **not** establish implementation or verification.
The optional Claude eligibility follow-up `TreeTutor-7t3.13` remains deferred
and non-blocking; it is not a prerequisite for this work.

## Current source boundary

Static inspection, assisted by the codebase-memory architecture and symbol
queries, found the existing text paths:

- [ChatPage.tsx](../../src/ChatPage.tsx) displays reply text and exposes manual
  passage selection and the editable branch form. It has no artifact player,
  suggestion group or Vim preference.
- [TreeOverview.tsx](../../src/TreeOverview.tsx) handles standard arrows and
  Shift+arrows for pan/move, plus focused-node activation and toolbar controls.
  Proposed letter aliases are absent.
- [app.mjs](../../server/app.mjs) implements messages, stop, manual branches,
  position, layout and model changes. Compaction runs only when branching is
  submitted; ordinary reply completion does not launch suggestion or media work.
- [store.mjs](../../server/store.mjs) persists conversations, messages, branches
  and compact layout. No artifact jobs, files or suggestion decisions are stored.
- [claude.mjs](../../server/claude.mjs) and
  [codex.mjs](../../server/codex.mjs) instruct a text-only tutor. Existing provider
  processes and branch compaction are not evidence of isolated media subagents.
  [package.json](../../package.json) has no Mermaid or Remotion dependency.

These are source observations, not live media, provider, accessibility or worker
permission tests.

## Blocking evidence and resumption

`TreeTutor-7t3.12` is blocked on external native-provider gate
`TreeTutor-7t3.17`. The [text release matrix](text-release.md) and
[retained recheck](text-release-recheck.json) record the latest attempt at
**2026-11-09T19:56:50Z**: Claude is connected but its bounded turn hits the
five-hour usage limit; the alternative app-owned Codex data lock fails with
`EROFS` before inference. The indicated Claude reset at 23:40Z / 16:40 Edmonton
is not proof of restored capacity. This review did not rerun native requests or
move authentication/runtime storage.

Resolution requires a permitted native subscription route to complete a bounded
turn and saved-session resume, followed by the complete text learning,
concurrency, actual-restart field comparison, semantic recall and authenticated
response scan already owned by `TreeTutor-7t3.12`. Its fixture and seeded-delivery
passes and historical Claude/Codex continuity results retain their stated
boundaries; none certifies the failed combined native journey.

After that release passes, Mermaid and suggestions can proceed independently;
video follows Mermaid. Vim also needs the owner's explicit acceptance of the
proposal, a standard-controls-only decision, or revisions confirmed through
`TreeTutor-vm4.6.1`. Silence and standing implementation authorization do not
resolve that product decision. Keep each increment's implementation and evidence
in its existing grouped issue, and reconcile all four here before closing the
umbrella. No new implementation microtasks are needed.

## Checks in this review

Fresh static checks cover local evidence links, grouped scope and decision
states, release dependency direction, superseded-task semantics and preservation
of unrelated work. `TreeTutor-vm4` now explicitly depends on the existing text
release issue so the scheduler cannot select it before that prerequisite closes.
No text-release issue gains a dependency on later media, suggestions or Vim.

No application/UI code changed. `npm test`, build, Astryx doctor, browser checks,
native inference, media rendering and worker-permission checks were not rerun
for this documentation/tracker review. The existing reports remain prior
evidence, with fixture versus native limits preserved. Acceptance is unfinished;
the umbrella stays blocked and is not closed on planning evidence.
