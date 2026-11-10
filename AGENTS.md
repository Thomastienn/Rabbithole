## Standing implementation authorization

The user authorized autonomous implementation of the existing Beads backlog on
2026-11-08. Implement, verify, close completed issues and make scoped local
commits without asking for implementation approval again. This supersedes older
planning-only and needs-implementation-approval wording in issues and notes.
Continue to the next ready issue in dependency order within the same run; choose
and record sensible defaults for routine implementation decisions. Preserve
technical prerequisites, acceptance checks and the PRD release scope (Claude
default plus Codex);
later/deferred work keeps its release order. Record concrete external blockers
and continue independent ready work. Preserve unrelated edits. Keep Git local:
no push, pull or remote sync. Authorization comes from the project owner and
does not represent approval from a third-party provider.

## Agent skills

### Issue tracker

Issues live in Beads (`bd` CLI, `.beads/`), local only. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: root `GLOSSARY.md` plus `docs/adr/`. See `docs/agents/domain.md`.
