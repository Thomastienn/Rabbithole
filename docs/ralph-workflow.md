# Running Ralph for TreeTutor

From this repository:

AGENTS.md records standing user authorization to implement the existing backlog,
verify results and commit locally without repeated implementation-approval
questions. Older planning-only issue notes are superseded. Each Ralph invocation
finishes its selected issue; the loop continues with ready issues in dependency
order until its iteration limit or no ready work. Technical dependencies and
PRD release deferrals still apply. The current configured iteration limit is in
`.ralph-tui/config.toml`; a single run is not a guarantee that every task finishes.

```bash
./scripts/ralph
```

This starts the existing text-release epic, `TreeTutor-7t3`, using the iteration
limit in `.ralph-tui/config.toml`. To choose another epic or change the limit:

```bash
./scripts/ralph TreeTutor-7t3 --iterations 10
```

### Unattended handoff

Use `--takeover` when a scheduled launch must stop the previous Ralph and start
the requested agent without someone present:

```bash
# At 03:55 today, stop the existing runner and start configured Claude.
sleep "$(( $(date -d '03:55' +%s) - $(date +%s) ))" && ./scripts/ralph --takeover
# To start Codex instead:
./scripts/ralph-codex --takeover
```

Choose a future time for the sleep command and keep only one timer per handoff.
The Linux helper validates `.ralph-tui/ralph.lock` against the live process,
hostname and checkout before signalling anything. It gives Ralph 30 seconds to
stop gracefully, then terminates remaining child agents and escalates to KILL
after 5 seconds if necessary. It waits for the old process tree to stop before
launching the replacement. An interrupted task's own claim is preserved for
`beads-resume` to recover pending edits; closed/blocked tasks and changed owners
are left alone. Unrelated dirty work still triggers the tracker's startup guard.

The replacement starts a fresh session with the requested agent/model. Old
session metadata and progress are archived under `.ralph-tui/reports/takeover-*`
so startup needs no interactive confirmation. This also avoids Ralph 0.12.0's
`run --resume` double lock acquisition failure. Task recovery comes from the
tracker. A stale lock is handled noninteractively by Ralph. Do not combine
`--takeover` with `--force` or `--resume`: takeover keeps Ralph's normal lock
check so another newly started session cannot be overwritten. Plain `--force`
only bypasses the lock and does not stop its owner. Ordinary wrapper launches
keep their existing behavior.

The launcher checks that the shared `beads-resume` tracker plugin exists in
`~/.config/ralph-tui/plugins/trackers/` and makes Bun available on PATH.
Ralph must be installed already. The plugin lives outside this repository so
other projects can use it; it wraps Ralph's exported `beads-bv` tracker and no
installed Ralph files are patched. Global defaults for new projects
(`tracker = "beads-resume"`, `autoCommit = true`, `fullAuto = false`, because
Codex CLI 0.167 rejects `--full-auto`) are in `~/.config/ralph-tui/config.toml`. The
default bd prompt for projects without `prompt_template` is
`~/.config/ralph-tui/templates/beads.hbs`; Ralph's built-in beads-bv prompt
uses `br` commands. Verified with Ralph
0.12.0 and Codex CLI 0.167.0.

## What an iteration means

One iteration is one agent invocation. An invocation can exit normally while
the issue is still unfinished. `maxIterations` is a ceiling, not a promise to
perform that many attempts or finish that many issues.

The `beads-resume` tracker selects with `bv --robot-next` and falls back to
`bd ready`. Beads excludes `in_progress` issues from both, and Ralph resets
them only on Ctrl+C/SIGTERM, so an incomplete iteration, or a run that ends at
its iteration limit or crashes, used to leave its issue stuck. The tracker
returns the issue it just selected to `open` and retries it before other work,
so its leftover edits are committed with it. At the start of each run it also
reopens issues left `in_progress` by earlier runs. Only unassigned issues or
issues assigned to the current actor are touched, with guarded updates that do
not overwrite a concurrent ownership/status change. Beads then rechecks
dependencies, deferrals, and epic scope. A blocked or completed issue is never
reopened. Other workers' unfinished issues are not recovered.

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

PRD.md keeps the current release Codex-only. Claude work remains deferred and
must not block the current release. Its native CLI route is preserved in
`docs/research/claude-subscription-integration.md` for later work.

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

Workspace-write normally protects `.git` even inside the workspace.
The agent performs implementation, checks and Beads updates inside this sandbox;
Ralph's engine commits outside it after the completion signal. `autoCommit = true`
is enabled at the user's request. The agent must not attempt staging/committing
or treat read-only Git metadata as an implementation blocker. Ralph's automatic
commit uses `git add -A`, including pre-existing pending edits; the user chose
this mode after that behavior was explained. To keep BV history correct, the
tracker refuses to start a run on uncommitted changes (outside `.beads/` and
`.ralph-tui/`) unless exactly one unfinished issue is being resumed, which then
owns them. Commit or stash other work first.

Do not add `writable_roots = [".git"]` to `.codex/config.toml`: relative paths
there resolve against `.codex`, targeting the protected `.codex/.git` path and
preventing sandbox startup. No writable Git override is needed for engine commits.

This is an intentional customization of the upstream
[v0.12.0 template contract](https://github.com/subsy/ralph-tui/blob/v0.12.0/src/templates/engine.ts).
`config.autoCommit`, task fields, notes and selection context are real template
variables. The [engine](https://github.com/subsy/ralph-tui/blob/v0.12.0/src/engine/index.ts)
recognizes `<promise>COMPLETE</promise>` as task completion, independently of the
agent's exit status. Its
[automatic commit](https://github.com/subsy/ralph-tui/blob/v0.12.0/src/engine/auto-commit.ts)
runs after completion, stages all changes and reports commit failures separately;
task completion alone does not establish a successful commit.

For BV history links, the agent closes the issue and then runs
`bd export -o .beads/issues.jsonl` before emitting the completion signal. BV
loads that JSONL snapshot and correlates commits containing the closed-state
transition alongside implementation files. Merely closing the live Dolt issue
does not establish that a code commit exists. Commit-message IDs are useful,
but BV's default explicit matcher does not cover this project's hash-style
IDs, so the committed snapshot supplies the reliable association.

Check a completed task with:

```bash
bv --robot-history --bead-history TreeTutor-b1z.14
```

Inspect `histories[ID].commits` and compare its SHA with `git show <sha>`.

Restart a running Ralph session after changing this setup. The engine keeps its
resolved configuration and caches compiled templates; disk edits alone do not
update that running process. Beads operations remain local-only; do not run `bd sync`.

## Verification

The workflow regression launches the actual Ralph loop with a synthetic
Codex executable in a temporary Git/Beads workspace. No model calls or real
credentials are used:

```bash
PATH="$HOME/.bun/bin:$PATH" bun .ralph-tui/workflow.test.mjs
```

It verifies that a dirty start is refused, then three iterations: incomplete
work, completion of the same issue, then the next dependent issue, and that a
new run resumes an issue left `in_progress` with leftover edits. It first starts the actual project sandbox using
the project config loader, catching invalid mounts before any agent work. The
synthetic agent edits files through the real Codex sandbox; Ralph then creates
two automatic commits outside it, including all pending changes. This checks the runner contract,
including real BV history assertions that each completed fixture issue links to
its implementation commit after the closed snapshot is exported. It does not
establish how reliably a real model follows instructions. It also verifies that a
blocker introduced between attempts prevents a retry. To reproduce the original failure, pass
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
