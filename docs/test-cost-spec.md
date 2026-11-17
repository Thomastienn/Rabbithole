# Test cost: tests by change, full suite per epic, fewer pointless tests

Decision record: ADR 0007.

## Problem Statement

Every Ralph task ends by running the whole fast test suite: about 200 files and 740 tests on eight workers. A run of twenty tasks therefore runs the full suite twenty times. The machine strains under memory and CPU load, and the agent spends tokens reading test output that has nothing to do with its change. Part of the suite proves nothing a learner or caller would notice. Some tests assert exact prompt wording or fixed labels. Some only check that a component renders, or that a removed feature stays removed. Others grep source files. Browser scripts save screenshots and result files into a tracked evidence folder that nobody reads, which now holds about 25 MB and 480 files. Live-provider scripts and real-tool scripts exist that the owner never runs.

## Solution

A task ends by running only the tests its change reaches, plus the cheap size and format checks. Each epic ends with one gate ticket that runs the full fast and slow suites. The testing guide bans the kinds of test that cannot catch a real regression. A one-off cleanup removes the existing tests of those kinds. The live-provider scripts, the real-tool scripts and all verification evidence output are deleted. What remains is the smoke set of browser scripts against fake providers, run before a release.

## User Stories

1. As the owner, I want each Ralph task to run only the tests its change reaches, so that a run does not repeat the full suite for every ticket.
2. As the owner, I want my machine to stay responsive during a Ralph run, so that I can keep working while it runs.
3. As the owner, I want agents to spend fewer tokens on test output, so that runs cost less and keep more context for the work.
4. As a Ralph agent, I want one command that runs the tests affected by my uncommitted changes, so that I do not have to guess which tests cover my change.
5. As a Ralph agent, I want that command to include new, untracked files, so that a test I just added and the module it covers are both picked up.
6. As a Ralph agent, I want a change to a source module to select every test that imports it, directly, through other modules or through a support kit, so that callers in other areas are not missed.
7. As a Ralph agent, I want a change to shared test support or to the package manifest to run the full suite, so that a change that can reach any test is checked everywhere.
8. As a Ralph agent, I want the command to select affected slow tests too, so that a provider or server change still runs its slow coverage.
9. As a Ralph agent, I want the command to say clearly when nothing is affected, so that an empty selection is not mistaken for a failure.
10. As a Ralph agent, I want the size and format checks to stay in every task, so that oversized or unformatted files never reach the automatic commit.
11. As the owner, I want every epic to end with a full-suite gate ticket, so that a breaking change is caught within one epic.
12. As a Ralph agent, I want the gate ticket to depend on every other ticket in its epic, so that dependency order makes it run last.
13. As a Ralph agent working the gate ticket, I want to fix the failures I can fix and file the rest as tickets, so that the epic does not close on a red suite.
14. As a ticket writer, I want the tracker guide to say that every new epic gets a gate ticket, so that I do not forget it.
15. As a ticket writer, I want acceptance criteria to state the behaviour, not which checks to run, so that the testing guide alone decides how to check it.
16. As a Ralph agent, I want the testing guide to say a test must fail on a regression a learner or caller would notice, so that I do not write tests that only mirror the source.
17. As a Ralph agent, I want the guide to ban assertions on exact copy, labels and prompt wording, so that a wording edit does not break tests.
18. As a Ralph agent, I want the guide to ban render-only tests, so that component tests check what a learner can do, not that markup exists.
19. As a Ralph agent, I want the guide to ban tests of constants and pass-through code, so that trivial code carries no tests.
20. As a Ralph agent, I want the guide to ban a second test at a costlier level for behaviour already covered at a cheaper one, so that behaviour is tested once.
21. As a Ralph agent, I want the guide to ban tests that check a removed feature stays removed, so that Git history alone records removals.
22. As a Ralph agent, I want the guide to ban tests that grep source files, except the theme token lint, so that tests check behaviour rather than text.
23. As a Ralph agent, I want the guide to say a test reaches the code it covers through imports, so that the affected-tests command can find it.
24. As a Ralph agent, I want the guide's memory limits to match the real test command, so that the guide does not mislead me.
25. As the owner, I want the existing wording-only tests deleted and copy assertions stripped from mixed tests, so that the suite stops failing on prose edits.
26. As the owner, I want fixed-label text assertions removed and computed-text assertions kept, so that UI tests check counts, names and state, not static copy.
27. As the owner, I want the retired-feature tests deleted, so that the suite does not carry checks for features that no longer exist.
28. As the owner, I want source and stylesheet grep tests deleted, except the theme token lint, so that refactors do not break tests that check no behaviour.
29. As the owner, I want duplicate tests collapsed to one, so that the same behaviour is not run several times.
30. As the owner, I want render-only tests deleted, so that each remaining component test checks an interaction or a computed result.
31. As the owner, I want the live-provider browser scripts deleted, so that code nobody runs does not go stale in the repository.
32. As the owner, I want the real render, Python sandbox and OCR scripts deleted, along with the gated real-render tests, so that no expensive real-tool check is left behind.
33. As the owner, I want the existing argument-level tests of the Python and render sandboxes kept, so that the sandbox boundary is still checked cheaply.
34. As the owner, I want browser scripts to stop writing screenshots and result files, so that pass or fail comes only from the exit code and the summary table.
35. As the owner, I want the tracked evidence folder removed from the repository, so that clones and searches no longer carry 25 MB of images nobody reads.
36. As a reader of the changelog, I want the release evidence link to keep working, so that the first release record is not lost.
37. As a Ralph agent, I want the prompt and the docs to stop telling me to save or restore evidence files, so that I do not spend effort on them.
38. As the owner, I want the smoke browser scripts against fake providers kept for releases, so that the built bundle is still checked in a real browser before a release.

## Implementation Decisions

- **Affected-tests selector (new module).** A plain function takes the changed paths and a way to read files. It returns the test files that reach any changed path through imports, or a marker meaning "run everything". It follows static imports, dynamic imports with a literal path, extensionless relative imports and TypeScript or TSX sources, the same resolution the test loader allows. Package imports are ignored. Any changed path under shared test support, or the package manifest, means "run everything". A changed test file selects itself.
- **Affected-tests command.** A new package script reads the changed paths from Git: tracked changes against `HEAD` plus untracked files that are not ignored. It calls the selector and runs the selected files with the same test runner, loader, worker count and memory scope as the fast suite. Selected fast and slow test files run together. With nothing selected, it prints that no tests are affected and exits successfully.
- **Per-task gate.** The Ralph prompt's testing instruction changes from "run the full fast suite once at the end" to "run the size check, the format check and the affected-tests command at the end". The rule of running only covering test files while working stays. The separate slow-suite trigger for provider and server areas is removed, because the affected-tests command selects slow files itself.
- **Epic gate.** The tracker guide and the Ralph workflow guide say that each epic's last child is a full-suite gate ticket. It is blocked by every other child, and it runs the full fast suite and the slow suite. Its acceptance: both suites pass, or every remaining failure is fixed or filed as a ticket.
- **Testing guide rules.** The guide gains the behaviour rule, the banned kinds listed in user stories 16 to 23, and the import-reachability rule. The theme token lint stays as the only allowed source-scanning test. The tier text is updated for the affected-tests command and the epic gate. The memory and swap limits are corrected to match the real test command.
- **Acceptance wording.** The tracker guide says acceptance criteria state the behaviour, and the testing guide decides the checks. No open ticket needs rewording today. The only open items are an epic whose children are closed and a bug ticket with no acceptance criteria.
- **Cleanup.** Removals follow the banned kinds. A mixed test keeps its behaviour assertions and loses only its copy assertions. Fixed-label text assertions go. Assertions on computed text, such as counts, names and state, stay. Starting lists from the audit are in each cleanup ticket's design notes. Each candidate is checked against the rules before it is removed.
- **Scripts and evidence.** These are deleted: the live-provider browser scripts and their live-provider helper, the live set in the smoke runner, the real-render package script and its gated real-render tests, and the real Python and real OCR scripts with their package scripts. The verify output helper and every screenshot and result-file write in the browser scripts are deleted too. Scripts report only through their exit code and the smoke runner's table. The tracked evidence folder is removed and its ignore entry dropped. The release evidence report moves into the docs folder, so the changelog link still resolves. The README, the two specs that told agents to save screenshots there, and the Ralph prompt are updated.
- **Kept.** The smoke browser scripts against fake providers stay, run before a release. The argument-level Python and render sandbox tests stay. So do the theme token lint, the computed-style tests and the migration schema fixture.

## Testing Decisions

- A good test fails when something a learner or caller would notice breaks. It reaches its code through imports and does not assert wording, markup presence, constants or source text.
- The affected-tests selector gets one unit test against a small temporary file tree. The tree holds a source module, a module that imports it, a support kit that imports that, and test files importing each of them, plus one unrelated test. The test checks five things:
  - A change to the deepest module selects every test that reaches it, and not the unrelated one.
  - A changed test selects itself.
  - Extensionless and dynamic imports are followed.
  - A change under shared test support or to the package manifest returns "run everything".
  - A change nothing reaches returns an empty selection.
- Prior art: the size-check script test drives a script's plain function against temporary files, and the existing script tests live in the scripts test area.
- The command wrapper (Git and the test runner) is not unit-tested. Its acceptance is that it runs and passes on the ticket's own change.
- Cleanup and deletion tickets add no tests. Their acceptance is a green fast suite and a search showing the removed items are gone.

## Out of Scope

- Remote CI. Git stays local.
- Rewriting kept tests for style, or merging small test files.
- Moving subprocess-based tests between the fast and slow tiers.
- Speeding up the remaining suite: the test runner, the worker count and the app boot shared by the support kits all stay as they are.
- Deleting the smoke browser scripts, the argument-level sandbox tests or the theme token lint.
- Rewording closed tickets that mention the evidence folder or the removed scripts.

## Further Notes

The audit sampled the suite by search and spot reads, not a full read. The counts are estimates: about 15 to 20 wording-only tests, about 65 copy lines in mixed tests, about 82 text assertions in UI tests (some of them computed), 2 retired-feature files plus 4 tests, about 9 source greps, about 10 duplicates and about 8 to 12 render-only tests. One full fast run took 43 seconds of wall time on the owner's machine. The largest single test process peaked at about 500 MB.

Accepted risks:

- A breaking change can stay undetected until its epic's gate.
- An upgrade to the real sandbox, renderer or OCR engine can break real behaviour while the argument-level tests still pass.
