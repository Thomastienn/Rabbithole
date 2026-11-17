# Running Ralph for TreeTutor

## Quick reference: what to run next

Work is split into three phases. Each phase is a Beads epic; a task's ID prefix
names its phase.

| Run in this order | Phase | Task prefix |
| --- | --- | --- |
| `ralph` | 1 · Text release | `TreeTutor-7t3.*` |
| `ralph TreeTutor-vm4` | 2 · Learning aids: diagrams, videos, suggestions, Vim | `TreeTutor-vm4.*` |
| `ralph TreeTutor-sh8` | 3 · Product 1.0: rich replies, rename/delete, custom endpoint, release | `TreeTutor-sh8.*` |

Start the next phase when the current one has no open tasks. A run stops at its
iteration limit, so repeat the same command until the phase is done. To check:

```bash
bd list --type epic --status open     # the phases still open
bd list --parent TreeTutor-7t3        # tasks of one phase and their status
bd ready                              # what an agent can start now
bd blocked                            # what is waiting, and on what
```

If a task is marked blocked for a provider limit or sign-in, fix that, then
`bd update <id> -s open` and run the phase again. The task table for each phase
is under [Issue structure](#issue-structure).

`ralph` and `ralph-afk` are global commands from `~/thomas_config`
(`ralph-tui/bin/`, documented in its `docs/ralph.md`): agents and their models,
takeover, and unattended runs across usage limits with `ralph-afk`. Run them
from this repository:

AGENTS.md records standing user authorization to implement the existing backlog,
verify results and commit locally without repeated implementation-approval
questions. Older planning-only issue notes are superseded. Each Ralph invocation
finishes its selected issue; the loop continues with ready issues in dependency
order until its iteration limit or no ready work. Technical dependencies and
PRD release deferrals still apply. The current configured iteration limit is in
`.ralph-tui/config.toml`; a single run is not a guarantee that every task finishes.

```bash
ralph
```

This starts the existing text-release epic, `TreeTutor-7t3`, using the iteration
limit in `.ralph-tui/config.toml`. To choose another epic or change the limit:

```bash
ralph TreeTutor-7t3 --iterations 10
```

### Unattended handoff

Use `--takeover` when a scheduled launch must stop the previous Ralph and start
the requested agent without someone present:

```bash
# At 03:55 today, stop the existing runner and start configured Claude.
sleep "$(( $(date -d '03:55' +%s) - $(date +%s) ))" && ralph --takeover
# To start Codex instead:
ralph --agent codex --takeover
```

Choose a future time for the sleep command and keep only one timer per handoff.
The Linux helper validates `.ralph-tui/ralph.lock` against the live process,
hostname and checkout before signalling anything. It gives Ralph 30 seconds to
stop gracefully, then terminates remaining child agents and escalates to KILL
after 5 seconds if necessary. It waits for the old process tree to stop before
launching the replacement. An interrupted task's own claim is preserved for
`beads-resume` to recover pending edits; closed/blocked tasks and changed owners
are left alone. Pending edits do not block the replacement runner.

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

PRD.md requires Claude (default) plus Codex and both-direction provider switching
for the text release. Shared interaction checks can use either working provider;
provider-specific checks retain their own live evidence requirements.

## Issue structure

Executable tasks are direct children of their phase epic. Since 2026-11-09 each
task is intended for one agent invocation in a 100k–150k context window: plan
about 100k of working context and keep the rest for startup, tools, verification
and repair. These are scope estimates; no model context setting is changed, and
naturally smaller work should finish early. Run the phases in order, one epic
per launch: `ralph`, then `ralph TreeTutor-vm4`, then
`ralph TreeTutor-sh8`.

| Phase epic | Tasks in order | Scope |
| --- | --- | --- |
| 1 `TreeTutor-7t3` Text release | `7t3.18`, `7t3.19`, `7t3.20`, `7t3.21` | New chat as a visible self-titling root; whole conversation in each map node; branch lines beside their source message; node growth and large maps |
| | `7t3.22`, `7t3.12` | Fixture re-verification, then the live provider journey and final ten-criterion matrix |
| 2 `TreeTutor-vm4` Learning aids | `vm4.7`, `vm4.8`, `vm4.1` | Mermaid: isolated worker and artifacts, inline rendering, recovery and acceptance |
| | `vm4.9`, `vm4.10`, `vm4.3` | Video: generation, status and player, retry/cancel/restart and acceptance |
| | `vm4.11`, `vm4.5` | Suggestions: grounded offers, then durable decisions, quality review and acceptance |
| | `vm4.6` | Optional Vim navigation, mapping agreed 2026-11-09 |
| 3 `TreeTutor-sh8` Product 1.0 | `sh8.2`, `sh8.3`, `sh8.4`, `sh8.5` | Rich replies, rename/delete, custom OpenAI-compatible endpoint (accepted 2026-11-09) |
| | `sh8.6`, `sh8.7`, `sh8.8` | First-run packaging and user guide, whole-product polish, final acceptance record |

The retained grouped tasks (`7t3.12`, `vm4.1`, `vm4.3`, `vm4.5`) now own the
second half of their feature plus its inherited acceptance; their notes name the
slices that took the first half.

Each task carries its work order, starting points and inherited acceptance.
Former implementation slices and acceptance-only rollups are closed through
Beads supersede links to the retained task; their original bodies and history
remain readable. Supersession moves unfinished work rather than asserting it
passed. The old workspace epic `TreeTutor-b1z` is consolidated into `TreeTutor-7t3`.
Each task ends with the size check, the format check and `npm run test:affected`,
which runs only the fast and slow tests its change reaches. When every epic is out
of ready work, `ralph-afk` makes a gate epic (label `gate:backlog`) whose task
runs `npm test` and `npm run test:slow`, reviews the commits since the last
gate, and fixes every failure and defect itself; it closes only when both pass. It makes one only if a task closed after the last gate
closed and no gate is open, so a gate never triggers another.
Keep internal implementation, repair and acceptance steps in one invocation;
split only for an independent deliverable, an external/user gate or demonstrated
context pressure. Resume an unfinished grouped task from a concrete checkpoint.

External actions remain explicit: `TreeTutor-kf5` resolves the last observed
native Claude quota gate; `TreeTutor-vm4.6.1` records the user's exact Vim mapping
agreement, given on 2026-11-09; `TreeTutor-sh8.1` records the owner's acceptance of
the three additions the same day. Optional eligibility clarification `TreeTutor-7t3.13` stays deferred
and non-blocking. All later implementation tasks wait for the text release;
video also waits for Mermaid, and Vim waits for the mapping agreement.

Restart an existing Ralph session before using the grouped backlog and prompt;
a paused session retains its compiled prompt and task display. Preserve pending
application edits: pending changes are allowed when the next run starts. Ralph is
already initialized in this checkout; `ralph-tui init` is for a fresh setup.

## Local testing and commits

Ralph's Codex adapter defaults to workspace-write independently of the global
Codex default. The owner authorized `agentOptions.sandbox = "danger-full-access"`
with `fullAuto = false` in `.ralph-tui/config.toml` so native verification can
write the existing app-owned data directory and its sibling lock directory.
Commands have the user's normal filesystem access; this does not restrict
outbound networking. No credentials need to be moved. Restart Ralph after
changing this setting; an existing session retains its resolved configuration.

The agent performs implementation, checks and Beads updates;
Ralph's engine commits after the completion signal. `autoCommit = true`
is enabled at the user's request. The agent must not attempt staging/committing
or treat read-only Git metadata as an implementation blocker. Ralph's automatic
commit uses `git add -A`, including pre-existing pending edits; the user chose
this mode after that behavior was explained. Pending edits do not block startup
or trigger a separate commit. When exactly one unfinished issue is ready to
resume, the tracker selects it first; otherwise normal ready-task selection
continues. Ralph commits all pending edits after the selected task completes.

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

It verifies that staged and unstaged edits allow startup without an early commit,
then three iterations: incomplete work, completion of the same issue, then the
next dependent issue, and that a new run resumes an issue left `in_progress`
with leftover edits. It first starts the actual project sandbox using
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
