# Each task runs the tests its change reaches; the full suite runs once per epic

Superseded in part by ADR 0010: the full suite now runs once per backlog, not once per epic.

Every Ralph task ran the whole fast suite at its end, so a run of twenty tasks ran about 740 tests twenty times. Most of those runs proved nothing about the task, and they cost machine memory, wall time and agent tokens. We decided that a task ends by running only the tests its change reaches, found by following imports from each test file to the changed files, together with the cheap size and format checks. The full fast and slow suites run once per epic, in a final gate ticket that depends on every other ticket in the epic. A change to shared test support or to the package manifest still runs the full suite, because it can reach any test. We also stopped writing tests that cannot catch a regression a learner or caller would notice: exact wording, render-only checks, constants, retired-feature checks, source greps and screenshots kept as evidence. Live-provider and real-tool scripts were removed, since nobody ran them. We accepted that a breaking change can sit undetected until its epic's gate, and that real sandbox and renderer behaviour is now checked only through the arguments the code builds, in exchange for task gates that cost seconds instead of the whole suite.

## Considered Options

- Keep the full suite at the end of every task. It is the safest option, but it repeats the same 740 tests for every ticket.
- Let the agent pick the covering tests by judgement. This is already the rule while working, and it misses callers in other areas.
- Map test folders to source folders. This does not work here: one test folder covers both the browser and the server side of an area, some source folders have no test folder, and about half the tests boot the whole app.
- Run the full suite in remote CI. Git stays local in this project, so there is no CI to run it.
