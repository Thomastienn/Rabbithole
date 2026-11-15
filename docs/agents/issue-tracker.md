# Issue tracker: Beads

Issues and specs for this repo live in Beads (`bd` CLI, data in `.beads/`). Keep Git and Beads local: no push, pull or remote sync.

## Conventions

- One feature = one epic (`bd create --type epic`); each implementation ticket is a child (`--parent <epic-id>`), never one combined ticket.
- Order tickets with dependencies (`--deps blocked-by:<id>` or `bd dep add <blocked> <blocker>`); `bd ready` lists the unblocked frontier.
- Size each ticket for one Ralph run: up to 200k context, under one hour. Label `commit-sized` and `context-200k`. Merge work that fits one run instead of splitting it.
- Labels: one or more `area:*` (canvas, chat, design, providers, …) and one `phase:*` (`text-release`, `later`, …). Reuse existing labels (`bd label list-all`) before inventing one.
- Longer specs go in `docs/<feature>-spec.md`; link from the epic with `--spec-id`.
- Put acceptance checks in `--acceptance`; design notes in `--design`.
- Conversation history goes in comments: `bd comments add <id> "…"`.

## When a skill says "publish to the issue tracker"

Create the epic and children with `bd create` (or `bd create --graph plan.json` for many tickets with dependencies).

Then make each new epic wait for the one released before it: `bd dep add <new-epic> <previous-epic>`. Ralph works on ready epics, oldest first, so a blocked epic and its children wait. `ralph-afk` closes epics whose children are all closed with `bd epic close-eligible` before each task, which unblocks the next epic; `ralph` and `ralph --agent codex` take the oldest ready epic unless given an epic ID.

## When a skill says "fetch the relevant ticket"

`bd show <id>` (add `--json` for structured output); `bd comments <id>` for history.

## Wayfinding operations

- **Map**: the epic's description (Notes / Decisions so far / Fog).
- **Child ticket**: child issue of the epic, labelled `type:research|prototype|grilling|task`.
- **Blocking**: Beads dependencies.
- **Frontier**: `bd ready --parent <epic-id>`; lowest ID wins.
- **Claim**: `bd update <id> --status in_progress` before any work.
- **Resolve**: add the answer as a comment, `bd close <id> --reason "…"`, then append a gist plus the ID to the epic's Decisions so far.
