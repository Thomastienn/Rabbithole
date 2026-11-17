# Issue tracker: Beads

Issues and specs for this repo live in Beads (`bd` CLI, data in `.beads/`). Keep Git and Beads local: no push, pull or remote sync.

New issues use `Rabbithole-`, set as `issue-prefix` in `.beads/config.yaml`. Existing `TreeTutor-` IDs stay valid; do not rename them.

The database's own `issue_prefix` is still `TreeTutor`, and bd cannot change it: `bd config set` refuses, unsetting it stops all creation, and `bd rename-prefix` only accepts lowercase and would rename every issue. So every `bd create` passes `--force`. A new epic also passes `--id Rabbithole-<three lowercase letters or digits>`, after checking with `bd show` that the ID is free. Children take `--parent` without `--id` (bd rejects both together) and get the epic's prefix.

## Conventions

- One feature = one epic (`bd create --type epic`); each implementation ticket is a child (`--parent <epic-id>`), never one combined ticket.
- Do not create full-suite gate tickets. When every epic is out of ready work, `ralph-afk` makes a gate epic (label `gate:backlog`) whose one task runs `npm test` and `npm run test:slow`, reviews the commits since the last gate, and fixes every failure and defect itself; it closes only when both suites pass.
- Order tickets with dependencies (`--deps blocked-by:<id>` or `bd dep add <blocked> <blocker>`); `bd ready` lists the unblocked frontier.
- Size each ticket for one Ralph run: up to 200k context, under one hour. Label `commit-sized` and `context-200k`. Merge work that fits one run instead of splitting it.
- Labels: one or more `area:*` (canvas, chat, design, providers, …) and one `phase:*` (`text-release`, `later`, …). Reuse existing labels (`bd label list-all`) before inventing one.
- Longer specs go in `docs/<feature>-spec.md`; link from the epic with `--spec-id`.
- Put acceptance criteria in `--acceptance`; design notes in `--design`. Acceptance criteria state the behaviour, not which checks to run; `docs/agents/testing.md` decides the checks.
- Conversation history goes in comments: `bd comments add <id> "…"`.

## When a skill says "publish to the issue tracker"

Create the epic and children with `bd create` (or `bd create --graph plan.json` for many tickets with dependencies).

## When a skill says "fetch the relevant ticket"

`bd show <id>` (add `--json` for structured output); `bd comments <id>` for history.

## Wayfinding operations

- **Map**: the epic's description (Notes / Decisions so far / Fog).
- **Child ticket**: child issue of the epic, labelled `type:research|prototype|grilling|task`.
- **Blocking**: Beads dependencies.
- **Frontier**: `bd ready --parent <epic-id>`; lowest ID wins.
- **Claim**: `bd update <id> --status in_progress` before any work.
- **Resolve**: add the answer as a comment, `bd close <id> --reason "…"`, then append a gist plus the ID to the epic's Decisions so far.
