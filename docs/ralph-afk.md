# Unattended Ralph across usage limits

`scripts/ralph-afk` keeps the backlog moving while nobody is present. Start it
once, in tmux or with `nohup`:

```bash
./scripts/ralph-afk                      # whichever of Claude or Codex has usage
RALPH_AFK_SCHEDULE='00-07=codex 07-24=claude,codex' ./scripts/ralph-afk
./scripts/ralph-afk TreeTutor-vm4 TreeTutor-sh8   # only these epics, in this order
```

It is the only launcher, so Ralph's single-session lock never blocks it. Each
cycle it starts one `--takeover --iterations 1` run (one task) and waits for it
to end. A Ralph already running in this checkout, including an interactive one,
is stopped by that first takeover. A second `ralph-afk` is refused.

Before each run it sends a one-word prompt to the real CLI using Claude Haiku
or Codex `gpt-6-luna`, with effort explicitly set to `low` for both probes,
and uses the first scheduled agent that answers. It stays on the agent that ran
last and switches only when that agent stops answering. Ralph 0.12.0's own
`fallbackAgents` handling is not used: it does not recognise the subscription
"usage limit" errors, so a limited agent fails every few seconds until the
iteration limit. If no scheduled agent answers, or a run ends within two
minutes (limit reached at once, startup failure, crash), it waits
`RALPH_AFK_WAIT` seconds (default 600) and checks again, which also covers a
limit that resets while you sleep.

During a run it repeats the same one-word availability probe every
`RALPH_AFK_WAIT` seconds (default 600, ten minutes). If
the CLI stops answering (usage limit, auth or network), it stops that Ralph and
its child agents through the takeover helper, then checks the scheduled agents
again immediately. The next available agent resumes the unfinished task and
pending edits through `beads-resume`. This also works when Ralph stays alive
after a mid-task limit. Task output mentioning limits does not trigger a switch.
Each probe uses the provider; it times out after 180 seconds and forces termination
5 seconds later if needed. Shutdown waits up to another 40 seconds before
refusing an overlapping run. If the stop fails, the supervisor keeps that run
and tries again after the next probe.
Cheap-model probes can miss a limit specific to the working model.

With no arguments it works the epics listed in `.ralph-tui/epics`, top to
bottom: each cycle takes the first epic that has a
ready or in-progress issue, so it moves to the next phase by itself. It stops
when none of them has one; blocked issues that need you do not count.

`.ralph-tui/epics` is the only place the runner scripts read epic IDs from: one
per line, `#` for comments. `./scripts/ralph` and `./scripts/ralph-codex` use
its first line when no epic is given.

`RALPH_AFK_SCHEDULE` is a space-separated list of `FROM-TO=agents` windows in
local hours, with agents tried in order. An hour outside every window runs
nothing. Write a window that crosses midnight as two (`22-24=codex 00-06=codex`).
The schedule is read when a task starts; a running task is not interrupted at a
window boundary. Models come from `RALPH_CLAUDE_MODEL` (default `opus`) and
`RALPH_CODEX_MODEL`.

Takeover, the tracker and the dirty-start guard are described in
[ralph-workflow.md](ralph-workflow.md).
