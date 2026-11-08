# Running Ralph for TreeTutor

From this repository:

```bash
./scripts/ralph
```

This starts the existing text-release epic, `TreeTutor-7t3`, with a maximum of
10 iterations. To choose another epic or change the limit:

```bash
./scripts/ralph TreeTutor-7t3 --iterations 10
```

The launcher registers the repository's tracker using a symlink under
`~/.config/ralph-tui/plugins/trackers/` and makes Bun available on PATH.
Ralph must be installed already. The tracker uses Ralph's exported Beads
implementation; no installed Ralph files are patched. Verified with Ralph
0.12.0 and Codex CLI 0.167.0.

## What an iteration means

One iteration is one agent invocation. An invocation can exit normally while
the issue is still unfinished. `maxIterations` is a ceiling, not a promise to
perform that many attempts or finish that many issues.

The built-in tracker asks `bd ready` for the next issue. Beads excludes
`in_progress` issues from that command, so an incomplete iteration could leave
its own issue invisible to the next selection. `treetutor-beads` returns only
the issue it just selected to `open` before selecting again, provided it is
still `in_progress` and unassigned or assigned to the current actor. Guarded
updates prevent overwriting a concurrent ownership/status change. Beads then
rechecks dependencies, deferrals, and epic scope. A blocked or completed issue
is never reopened. Other workers' unfinished issues are not recovered.

Agent-process failures get up to two retries. A recoverable incomplete issue
can continue until the iteration limit. For a real external or user blocker,
the agent records the next action and sets the issue to `blocked`; other ready
work can continue. If no work is ready, Ralph stops. Inspect:

```bash
bd ready --parent TreeTutor-7t3
bd blocked
bd list --status=in_progress
```

When an external blocker is resolved, update only that issue to `open` after
recording the evidence. Do not bulk-reopen completed issues or remove real
technical prerequisites to keep the loop running.

Claude implementation follows the user's current decision in
`docs/research/claude-subscription-integration.md`: proceed with the unmodified,
user-installed Claude Code CLI and native user-owned sign-in. The old
eligibility decision is an optional follow-up outside release execution;
it does not block implementation or runtime testing. Streaming, session,
history-transfer and restart checks still require actual evidence.

## Issue structure

Executable tasks are direct children of the relevant release epic so Ralph
can display and select them. Feature acceptance issues retain their IDs and
have a `rollup` label; they depend on their component tasks. Each moved task
records its former feature in `metadata.workflow_rollup`. This avoids both
selecting an entire unfinished feature repeatedly and accidentally inheriting
an unrelated provider blocker from a broad feature parent. Existing explicit
prerequisites and completed issue statuses are preserved.

## Local testing and commits

Ralph's Codex adapter explicitly selects the workspace-write sandbox even when
the user's global Codex default is full access. `.codex/config.toml` enables
command network access in that sandbox, including localhost listeners used by
HTTP tests. Workspace filesystem restrictions remain enabled. This also allows
outbound command networking; it is not a localhost-only policy. See OpenAI's
[sandbox network documentation](https://learn.chatgpt.com/docs/agent-approvals-security).

Ralph's own automatic commit stages all changes with `git add -A`. It is
disabled here because unrelated work may already be present. Agent changes
stay in the working tree for review and a scoped local commit. The tracker
exports a local JSONL snapshot instead of calling `bd sync`.

## Verification

The workflow regression launches the actual Ralph loop with a synthetic
Codex executable in a temporary Git/Beads workspace. No model calls or real
credentials are used:

```bash
PATH="$HOME/.bun/bin:$PATH" bun .ralph-tui/workflow.test.mjs
```

It verifies three iterations: incomplete work, completion of the same issue,
then the next dependent issue. It also verifies that a blocker introduced
between attempts prevents a retry. To reproduce the original failure, pass
`beads` as the final argument; the assertion fails after one iteration.

Application fixtures also pass inside the configured Codex sandbox:

```bash
codex sandbox -c 'sandbox_mode="workspace-write"' -- npm test
```

Fixtures do not establish real-provider summary quality or latency. Those
acceptance issues remain open.

Before repair, issue records and Ralph state/configuration were backed up in
`.git/ralph-repair-20261108-021010/`. The stopped session was archived there so
the next launch uses the repaired configuration. Runtime logs, sessions and
progress stay local and are ignored by Git.
