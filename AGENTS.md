## Session kinds

Planning sessions grill, write docs (glossary, ADRs, specs), then create
tickets, in that order, each step only when the owner asks for it. They follow
the invoked skill's steps as written, including publishing tickets with
`ready-for-agent`, and leave the code untouched. Before publishing a ticket for
a new screen, panel or component, or a visual redesign, remind the owner to
make a mockup at `docs/mockups/<issue-id>.html` or `.png`; label the ticket
`new-ui` and link the mockup with a `Mockup:` line in its description. Tweaks
that keep the existing look need neither. Implementation happens in
Ralph runs the owner starts; the authorization below applies only there.

## Standing implementation authorization

The user authorized autonomous implementation of the existing Beads backlog on
2026-11-08 for Ralph runs. Implement, verify, close completed issues and make scoped local
commits without asking for implementation approval again. This supersedes older
planning-only and needs-implementation-approval wording in issues and notes.
Continue to the next ready issue in dependency order within the same run; choose
and record sensible defaults for routine implementation decisions. Preserve
technical prerequisites, acceptance checks and the PRD release scope (Claude
default plus Codex);
later/deferred work keeps its release order. Record concrete external blockers
and continue independent ready work. Preserve unrelated edits. Sequential Ralph
runs keep Git local: no push, pull or remote sync. In PR mode
(`ralph-afk --pr`), workers push their task branch and open a pull request, and
the reviewer pushes to pull request branches and squash-merges them; every push
passes the trufflehog pre-push hook. `master` changes on GitHub only through
`ralph-afk --pr`'s start-of-run push or a squash merge. Desktop release builds on GitHub Actions are the
owner's exception: agents edit `.github/workflows/` locally, and the owner
pushes and triggers the run. Authorization comes from the project owner and
does not represent approval from a third-party provider.

## Branches

Work directly on `master` in the main checkout; do not create worktrees or
feature branches unless the owner asks. PR mode is the standing exception:
`ralph-afk --pr` gives each task its own worktree and a branch named after the
task, and `.ralph-tui/pr-worker.md` or `.ralph-tui/pr-reviewer.md` governs the
agent there. When session tooling forces a worktree anyway, land it on
`master` as soon as the work is committed, before creating tickets:

1. In the new worktree, run `ln -s ../../../node_modules node_modules`.
2. After committing, run `git rebase master` in the worktree.
3. Call `ExitWorktree` with `keep`; the worktree guard blocks `git -C` into
   the main checkout.
4. In the main checkout, run `git merge --ff-only <branch>`, then
   `git worktree remove <path>` and `git branch -d <branch>`.

## Secret scanning

Never make gitleaks or trufflehog skip a line or file without the owner's
permission: no `gitleaks:allow` or `trufflehog:ignore` comments, no
`.gitleaksignore` entries, no allowlists or excluded paths. When a scan flags a
fake value in a test, change the value so the scanner no longer matches it; for
anything else, stop and ask.

## Agent skills

### Issue tracker

Issues live in Beads (`bd` CLI, `.beads/`), local only. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: root `GLOSSARY.md` plus `docs/adr/`. See `docs/agents/domain.md`.

### Testing

Prefer unit tests, then component, then integration; browser scripts only when acceptance names them. See `docs/agents/testing.md`.
To run the app yourself, use `npm run serve`; `npm start` opens the owner's browser.
