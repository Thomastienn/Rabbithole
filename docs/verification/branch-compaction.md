# Branch compaction quality and startup evaluation

Task: TreeTutor-7t3.6.3; parent: TreeTutor-7t3.6. Date: 2026-11-08.

## Current result: live evaluation blocked

### Latest review — 2026-11-08, TreeTutor-7t3.6.3

`rtk test node --test test/branch.test.mjs test/codex.test.mjs` and
`rtk test npm test` both pass. The earlier environment failures recorded below
did not recur. These runs use synthetic providers and a local stdio fixture;
they do not contact subscription providers. The branch test exercises failed
compaction, failed atomic insertion and successful retry with no orphan tree,
then compares the original parent record and reopens the saved child. The
recursive test checks fixed ancestor inputs, isolation and restart persistence.
The tests do not establish live summary relevance or startup latency, and the
existing question checks do not establish duplicate-free browser retry behavior.
No concrete defect was found requiring a new regression.

The dependency TreeTutor-7t3.6.2 is closed. The remaining blocker is explicit
authorization for the bounded subscription-backed evaluation below. This
issue's execution constraints preserve provider-contact permission, and PRD.md
still withholds implementation approval. The Claude decision permits its native
CLI integration route and makes eligibility clarification non-blocking; it does
not supply broader authorization for this evaluation. No provider process,
authentication inspection, sign-in, model-list request or live inference was
performed. No actual summary contents or branch startup measurements were
collected. All live acceptance checks remain unverified; the issue stays open
and blocked. After authorization, check app-owned connection status through the
supported interface, then run the three cases below with synthetic content.
Do not automatically retry the missing permission prerequisite.

No application/UI changes were made, so build and Astryx doctor were not rerun
in this review. The records below describe earlier iterations.

The selected-passage and recursive-branch implementations already exist. This
iteration made no application changes. Source review confirms that compaction
uses a fresh provider thread, the current parent's completed messages and its
fixed inherited snapshot. Source messages are preserved. The saved child stores
the exact UTF-16 selection, source message ID, question and summary atomically.
Child model calls use their own thread and inherited snapshot, without reading
live ancestors or writing child discussion into the parent.

Current checks:

Rechecked on 2026-11-08 for TreeTutor-7t3.6: build passes; Astryx built-output
doctor reports 20 passes, two existing theme/font warnings and zero failures;
`git diff --check` passes. Full tests still fail. Direct branch execution again
reports `listen EPERM`; localhost:4317 remains unreachable. An isolated
`spawnSync` invocation of the synthetic protocol fixture also returns `EPERM`.
This confirms a subprocess restriction in this runner, without establishing the
cause of each asynchronous adapter disconnect. No application code changed and
no live summary or startup measurements were obtained.

- `npm run build`: passes TypeScript and Vite; existing bundle-size warning.
- `npm test`: fails in this execution environment. Running
  `node test/branch.test.mjs` directly exposes `listen EPERM: operation not
  permitted 127.0.0.1` for both branch tests. The HTTP suite also cannot run.
- `node test/codex.test.mjs`: two fixture adapter checks fail with
  `Codex disconnected. Your saved history is available; try again.` The
  terminal-failure/process-exit check passes. The cause of the fixture exits
  was not established; this is not a live provider result.
- `curl --max-time 5 -sS http://127.0.0.1:4317/api/state`: connection failed.
  No live app state, account status or model result was obtained.

Earlier live evidence is recorded in [selected-passage.md](selected-passage.md)
and [nested-branches.md](nested-branches.md). Those results are historical, not
current measurements. They do not establish the quality or latency of the
learning-discussion cases below. No summaries or timings were collected in this
iteration, and there is no product latency threshold to claim as passed.

## Reproduce the remaining evaluation

Run the existing app in an environment that permits loopback sockets. Use its
existing app-owned ChatGPT consent, or complete the official consent flow if
disconnected. Do not copy shared CLI credentials. These checks send synthetic
learning questions using the selected subscription and leave saved test trees.

1. Run `npm test` and `npm run build`. Resolve failures before interpreting live
   results. Existing branch regressions exercise compaction failure and retry,
   failed atomic saves, unchanged parent records, fixed snapshots, recursive
   branches and storage reopen. Fixture summaries establish transport only.
2. Open `http://127.0.0.1:4317`. In browser developer tools enable Network
   recording and Preserve log. Create a tree named `Compaction evaluation`.
3. Ask: `Explain a tournament-tree mutual exclusion lock built from Peterson
   two-participant locks. Explain the role of flags and turn at each internal
   node, and how it differs from a winner-selection tournament tree. Use the
   exact phrase "tournament tree" in both explanations. Also note this unrelated
   fact: my fictional notebook is purple.` Wait for a completed answer.
4. Select the assistant's Peterson passage and ask: `Why are both flags and
   turn needed at one node? Distinguish local two-participant coordination from
   the whole tournament lock.` Save the exact selected text and question, the
   branch response's snapshot and the completed child answer. Record the
   `/branches` request duration: it includes provider setup, compaction and
   local save, and ends when the focused child becomes available. Separately
   record the subsequent `/messages` duration through completed response;
   do not label total response duration as time to first token.
5. In that child, select its discussion of a flag and ask: `If my flag is true,
   does that mean I own the entire tournament lock, or only that I am competing
   at this node?` Collect the same records and timings. Verify the compact
   ancestor context retains the tournament-lock setting and the distinction
   between competing and ownership without depending on a live root reread.
6. Return to the root and select the occurrence of `tournament tree` in its
   winner-selection explanation. Ask: `Does this tournament tree need Peterson
   locks, or are these two different uses of the same name?` Save offsets as
   well as text: repeated terminology must retain this occurrence's source
   association. Collect the same records and timings.
7. For each case inspect `GET /api/trees/:id` before and after creation/chat.
   Verify unchanged parent messages and thread, exact source message and
   `source.text.slice(start, end) === branch.text`, exact saved question and a
   nonempty compact snapshot. The child's submitted question must appear once
   in its messages. Add a later root correction, then confirm existing child
   snapshots remain byte-for-byte unchanged. Restart the app after all turns
   finish and compare saved anchors and snapshots again.
8. In a separate branch attempt, block the `/branches` request using browser
   developer tools. Submit an edited question; verify visible failure, retained
   draft and no new child. Unblock and retry once; verify exactly one new child
   and one submitted question. This is a transport-failure check. Use the
   automated branch test for provider-compaction and atomic-save failures;
   do not describe a blocked browser request as a live provider failure.

## Review and record results

For each of the three cases record model, exact passage/offsets, question,
complete snapshot, branch request milliseconds, child completion milliseconds
and a separate human review verdict. Include the root and child source messages
needed to assess relevance. Use only synthetic content; exclude credentials,
account details, CSRF tokens and provider thread identifiers from published
evidence.

Review whether the summary preserves Peterson's local participant roles,
flags/turn distinction and the intended meaning of repeated terminology. Check
that the nested summary preserves needed ancestor facts. Report omissions,
invented claims, contradictions and unrelated material (including the notebook
fact) explicitly. Verify the selected passage and question separately from the
summary; the summary need not repeat fields already carried exactly. A plausible
child answer alone does not establish summary quality.

Keep TreeTutor-7t3.6.3 and TreeTutor-7t3.6 open until actual results are recorded
and assessed. Do not substitute fixture durations for model startup timings or
infer a latency target from a small sample.
