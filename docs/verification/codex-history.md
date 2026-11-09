# Codex supplied history and independent sessions

Task: TreeTutor-7t3.4.1. Live run began 2026-11-08T21:34:19.167Z.
User explicitly authorized next-task implementation, necessary consent, and a local commit.
This supersedes the issue's earlier authorization blocker.

## Reproduce

Requires Node 24+, installed Codex CLI (tested: 0.167.0), dependencies, and existing
TreeTutor-owned ChatGPT consent. Stop TreeTutor before running:

```sh
node scripts/verify-codex-history.mjs
```

This is an explicit live check, excluded from `npm test`. It sends five synthetic
turns using the existing `Auth` token lifecycle. It takes the same data-directory
lock as the app to protect token refresh, creates an isolated temporary Codex
home/workspace, and closes that transport before releasing the lock. It does not
read shared CLI credentials, copy authentication into the temporary home, or edit
learner trees. Temporary synthetic provider sessions remain under the OS temp
directory; no tokens, account identifiers, or provider thread IDs are printed.
`TREETUTOR_DATA_DIR` and `XDG_DATA_HOME` follow the app's existing conventions.

## Supported request shape

Checked the installed CLI's generated JSON schema with
`codex app-server generate-json-schema --out <temporary-directory>`.
The [official app-server documentation](https://learn.chatgpt.com/docs/app-server#inject-items-into-a-thread)
also documents raw history injection and its persistence.

1. Initialize stdio using TreeTutor client metadata; acknowledge `initialized`.
2. `thread/start` with `cwd`, `approvalPolicy: "never"`, `sandbox: "read-only"`,
   tutor `baseInstructions`, fixed branch snapshot/selection, and optional model.
3. For a fresh thread with completed saved history, `thread/inject_items`:

```json
{
  "threadId": "<new thread>",
  "items": [
    { "type": "message", "role": "user", "content": [{ "type": "input_text", "text": "Assign our fictional learning tree a name." }] },
    { "type": "message", "role": "assistant", "content": [{ "type": "output_text", "text": "Our fictional tree is named Aster-731." }] }
  ]
}
```

4. Save the thread reference only after successful injection. `turn/start` sends
   only the new question in `input: [{type: "text", text, text_elements: []}]`.
   Existing threads use `thread/resume`; their history is not injected again.
5. Route events by thread and turn. Stop uses `turn/interrupt` for that owner.

The adapter previously omitted saved discussion on a fresh provider thread.
It now imports completed messages in order with their roles. Interrupted/failed
assistant fragments are excluded. A failed import starts no inference and saves
no incomplete thread reference, so retry can import into a fresh thread.

## Actual live results

The question itself contains none of the recall facts: “From our prior discussion
and inherited context, what is our fictional tree name, grove material, and exact
number of trees? Answer in one sentence. Do not guess missing facts.”

Names occur only in supplied assistant history. Separate fixed snapshots contain
`copper / 47` for A and `silver / 83` for B. No prior real model turn created either
name. All five turns used `gpt-6.1-sol` through `openai_chatgpt_plan`.

| Turn | Status | Elapsed ms | Text deltas | Characters |
| --- | --- | ---: | ---: | ---: |
| A fresh, imported history | completed | 3622 | 25 | 109 |
| A long lesson, stopped | interrupted | 3108 | 1 | 1 |
| B fresh, independent long lesson | completed | 60350 | 2391 | 10659 |
| A resumed after transport restart | completed | 2489 | 25 | 109 |
| B resumed after transport restart | completed | 2441 | 24 | 103 |

A's fresh answer and restart answer were identical:
“Our fictional tree is named Aster-731, the grove material is copper, and the grove
contains exactly 47 trees.”

B's lesson began: “Beryl-962 is our fictional learning tree. Its inherited home,
the silver grove, contains exactly 83 trees.” Its restart answer was:
“Our fictional tree is Beryl-962, the grove material is silver, and the grove
contains exactly 83 trees.”

Assertions passed for distinct provider threads, actual overlapping `turn/started`
events, B still active when A was interrupted after its first delta, A's
`interrupted` terminal status, and B's independent `completed` terminal status.
B's complete answer contained no A name; A's outputs contained no B name.
After closing/restarting the isolated transport, both sessions resumed and
recalled their own three facts. Script printed `result: PASS` and exited zero.

`model/list` returned nine non-hidden catalog entries: `gpt-6.1-sol` (default),
`gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-sol`, `gpt-6.1-terra`,
`gpt-5.6-terra`, `gpt-5.6-luna`, and `gpt-5.5`. Only successful inference with
`gpt-6.1-sol` establishes access in this run; catalog presence does not prove
entitlement to the others.

## Automated checks and limits

Focused Codex/HTTP fixture tests, full `npm test`, TypeScript/Vite build, and
`git diff --check` passed. New fixture regressions verify role order, exclusion
of incomplete replies, one-time import before the current question, and no
saved reference/inference after rejected import. Fixtures prove transport
construction; the separate live run above proves semantic recall and overlap.
Build retains its existing bundle-size warning. No UI changes were made.

This is a small synthetic experiment against CLI 0.167.0, not a guarantee for
arbitrary histories, token limits, or future protocol versions. Restart means
provider subprocess restart with persisted synthetic sessions, not browser or
SQLite restart. Claude transfer, provider/model switching UI, and full release
verification remain separate Beads tasks. No API-key fallback was used.

## Rollup review: TreeTutor-7t3.4, 2026-11-09

Reviewed the completed TreeTutor-7t3.4.1 experiment against the current PRD,
`server/codex.mjs`, `server/app.mjs`, `server/store.mjs`, and their focused tests.
The installed CLI is still **0.167.0**. The current
[official app-server API overview](https://developers.openai.com/codex/app-server/#api-overview)
confirms the injection, resume, interruption and catalog methods used here.
Documentation describes the protocol; the historical live experiment above
provides semantic evidence. No new provider requests were made in this review.

| Requirement | Evidence reviewed | Result and boundary |
| --- | --- | --- |
| Supplied role history and separate inherited context | Live A/B recall above; current fresh-thread import and branch-instruction fixtures | Verified by the 2026-11-08 live run. Import is still one-time, ordered, and limited to completed messages; rejected injection saves no thread or starts inference. |
| Fixed snapshots and parent/child isolation | Branch and recursive-branch tests; Codex new/resumed-thread fixtures | Current checks pass for later parent edits, unchanged stored snapshots, exact selection, and exclusion of child discussion from parent history. These mutation checks use synthetic providers. |
| Independent overlapping inference and stop | Distinct live A/B threads with overlapping turn events; A interrupted while B completed | Verified by the prior live run, including own-fact recall and absence of the other session's name. Current lifecycle checks also pass for stale callbacks and retry. |
| One conversation's failure leaves its sibling intact | Branch lifecycle test with a rejected request, late callbacks, sibling completion and retry | Current deterministic check passes. No deliberate live provider failure was induced; cancellation is the live isolation case. Loss of the shared app-server process is a shared transport failure. |
| Restart continuity | Prior live A/B transport restart; current store, model and branch lifecycle tests | Live recall survives a provider subprocess restart. SQLite reopen and process-crash recovery pass with fixture providers; these do not establish a full live browser/database restart journey. |
| Supported models | Nine catalog entries and successful `gpt-6.1-sol` requests above | Historical catalog, not a fresh entitlement claim. The separate [model-switch evidence](model-switch.md) also records successful requested `gpt-6-astra` inference and retained context after transport restart/browser reload. |

Checks run for this review:

```sh
rtk test node --test test/codex.test.mjs test/branch.test.mjs test/branch-lifecycle.test.mjs test/model.test.mjs
rtk test npm test
rtk npm run build
rtk git diff --check
```

All passed. Build retains the existing Vite bundle-size warning. No product code,
UI, authentication, or live verification scripts changed. Repeating the same
five-turn live experiment would add no evidence for the remaining prerequisite.

### Unresolved prerequisite: Claude evidence

**The Codex evidence is sufficient for its part of this issue; the complete
rollup remains blocked.** Current PRD release scope includes Claude, and this
issue explicitly requires TreeTutor-7t3.4.2. Its tracker status is `closed`, but
its notes and [Claude verification record](claude-history.md) explicitly report
unverified semantic transfer, resume and session isolation after a native
subscription quota failure. Closure alone does not establish acceptance. The
older rollup note saying Claude is deferred is superseded by the current PRD
and task instructions. TreeTutor-7t3.1 is completed documentation research, not
additional live proof.

Existing external prerequisite **TreeTutor-kf5** records the provider's reported
quota reset at **2026-11-09T10:50Z**. At review time (08:44Z), that reset was still
in the future. Resolution requires recovered native subscription quota and a
successful bounded preflight, then completing TreeTutor-7t3.4.2: Codex-to-Claude
history plus separate fixed-context recall, exact-session resume, independent
Claude sessions with cancellation/failure isolation, and the resulting Claude
discussion supplied back to a fresh Codex thread. The final Codex leg requires
normal authorized app-data write access and the existing Auth lock/lifecycle.
Quota recovery alone does not complete those checks. Other issues were left
unchanged; the prerequisite's premature closed status needs reconciliation when
its work resumes. No API-key fallback, token copying, or alternate account is
part of the resolution. Do not close this rollup until that evidence exists.

### 2026-11-09 rollup closure (Codex-only scope)

The current acceptance criteria state that Claude transfer and isolation belong
to TreeTutor-7t3.4.2 and do not gate this Codex-only review. The "Unresolved
prerequisite: Claude evidence" section above is therefore superseded for this
issue; it stays as the record of the Claude gap, which TreeTutor-7t3.4.2 and
TreeTutor-kf5 still track.

Re-run with installed `codex-cli 0.167.0`: focused Codex/branch/lifecycle/model
tests 19/19, full `npm test` 44/44, `npm run build` (existing bundle-size warning)
and `git diff --check` all pass. These are fixture checks. The live semantic proof
is still the 2026-11-08T21:34Z run recorded above, covering supplied history plus
separate snapshot recall, overlapping independent sessions, stop isolation and
transport-restart continuity. That run was not repeated. Request-failure isolation
and process-crash recovery remain fixture-only.
