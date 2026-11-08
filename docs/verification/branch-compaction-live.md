# Live branch compaction evaluation

Task: TreeTutor-7t3.6.3. Run: 2026-11-08T21:39:46.868Z.
The current user authorized implementation, bounded provider contact and a local
commit. This supersedes the earlier authorization blocker recorded in Beads.

## Reproduce

Stop TreeTutor, then run with Node 24+, dependencies, installed Codex CLI and
existing TreeTutor-owned ChatGPT consent:

```sh
node scripts/verify-branch-compaction.mjs
```

This explicit live script is excluded from `npm test`. It uses the existing
`Auth` lifecycle and app data-directory lock, including normal token refresh.
It creates a private temporary SQLite database, Codex home and workspace, then
starts the real HTTP app on an ephemeral loopback port. It sends only synthetic
learning content and never opens or changes learner trees. `TREETUTOR_DATA_DIR`
and `XDG_DATA_HOME` follow the app conventions. Temporary synthetic sessions and
the database remain under the OS temporary directory. No credentials are copied
into the temporary Codex home. Published output excludes account information,
CSRF values and provider thread identifiers; source message IDs are local,
synthetic SQLite references.

The final JSON report contains full source answers, exact UTF-16 selection
offsets/text, questions, complete summaries, child answers, model and timings.
The checked-in [results](branch-compaction-results.json) are the actual successful
run, not fixture output. CLI: Codex 0.167.0; runtime: Node 26.0.0. Every inference
used `gpt-6.1-sol` through the existing ChatGPT-plan adapter.

## Results and review

| Case | Branch request ms | Child completion ms | Summary review |
| --- | ---: | ---: | --- |
| Peterson local coordination | 7942 | 10810 | Retains local interest flags, `turn` tie-breaking, wait condition, subtree representatives and root acquisition. |
| Nested flag versus ownership | 7344 | 5709 | Retains inherited tree structure and root-entry rule; distinguishes a true flag from ownership at either node or whole tree. |
| Repeated tournament terminology | 7656 | 8698 | Retains both meanings and explains winner selection independently of Peterson locks. |

Reviewed complete summaries against their source messages and inherited context.
No unrelated notebook color, invented learner facts or contradictory claims were
found in the three summaries. The nested summary makes the source's ownership
implication explicit: the flag alone does not establish ownership. The repeated
term's summary makes the distinction between comparison and locking explicit.
These are supported syntheses of the supplied discussion. No summary defect was
identified requiring product changes or a new regression.

The first two selections intentionally include surrounding fragments; exact
stored substrings remain unchanged. The repeated term occurs several times in
the source. Its selected winner-selection occurrence is at UTF-16 offsets
1382–1397, with the exact source message reference retained. The question also
explicitly asks for that meaning. This verifies the stored occurrence association;
it does not establish that the compactor can disambiguate a bare repeated phrase
without a clarifying question or surrounding text.

Branch time measures the real `/branches` request through response headers after
compaction and atomic save. Child completion measures sending `/messages`,
consuming the full response and fetching the saved child. Neither is time to
first token. These sequential calls reuse a running transport. Root completion
took 12757 ms; there is no approved latency target or statistical performance
claim from this three-case sample.

## Failure, isolation and restart

Before the first successful branch, the script aborted real provider compaction
after its first text delta. The existing adapter sent `turn/interrupt`. After
2613 ms the branch route returned HTTP 500; the tree count and complete parent
record remained unchanged, and the active-request map was empty. Retrying the
same anchor/question performed fresh live compaction and created exactly one
child. Sending its question once saved exactly one user message.

Assertions also passed for exact saved selection/question/source association,
unchanged parent history after branch creation and child chat, fixed snapshots
after a later live root correction, and identical full HTTP records after
closing the provider transport, reopening SQLite and restarting the HTTP app. The script
printed `result: PASS` and exited zero. It does not test browser draft retention,
UI retry, or a resumed model turn after this restart; those are separate checks.

An earlier attempt completed all three live cases but its restart assertion
compared SQLite null-prototype rows with JSON objects. That checker bug was
fixed by comparing HTTP records before and after restart. Only the full passing
rerun is published in the results artifact.

Full `npm test`, TypeScript/Vite build, script syntax and diff checks passed.
The existing bundle-size warning remains. No product or UI code changed.
