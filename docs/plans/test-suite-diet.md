# Test suite diet

Agreed with the owner on 2026-11-15. No Beads tickets; implemented directly.

## Problem

`npm test` took 63 s wall and 386 s CPU (about 7 of 20 cores, spiking to all of them) for 173
files and 619 tests. The 40 tests over 1 s held about 63% of summed test time; nearly all start
real adapters, subprocesses or servers. Many slow tests repeat the same check for Claude and
Codex. `test/http/launcher.test.mjs` alone took 60 s.

## Target

`npm test` finishes in about 20 s on 15 workers (of 20 cores; all 20 starves I/O). Changed from
4 workers on 2026-11-15: 4 took 49 s, 12 took 29 s, 15 took 21.5 s.

## Plan

1. Cap workers: `--test-concurrency=4` in `npm test`.
2. Try `--test-isolation=none` (one process). Keep only if the suite stays green and is faster.
3. Add `npm run test:slow` for real-adapter, subprocess and launcher tests (including
   `test/http/launcher.test.mjs`). `npm test` keeps unit, component and in-process tests.
4. One provider: fixture tests and the live scripts read `RABBITHOLE_TEST_PROVIDER`
   (`claude|codex`, default `claude`) and `RABBITHOLE_TEST_MODEL` (replacing `TT_*`). The
   default model is the provider's smallest. Each adapter keeps one thin contract test.
5. Audit: remove or merge a test when another test proves the same behaviour at the same or a
   cheaper level, when it is a per-provider copy, when a unit test could prove what a
   subprocess or HTTP test proves (rewrite it as a unit test), or when it checks structure
   rather than behaviour. Provider-switch tests get the same treatment. The owner approves the
   list before anything is deleted.
6. Document in `docs/agents/testing.md`, with a pointer in `.ralph-tui/prompt.hbs`:
   - the tiers, the provider env vars and how to write better tests;
   - run `test:slow` at the end of a ticket only when it changed `server/providers/`,
     `server/http/`, `scripts/start*` or the launcher;
   - when a live script fails on a usage limit, rerun it with the other provider.

The 500-line file cap stays.

## Progress

- Steps 1, 3, 4 and 6 done. Step 2 dropped: with `--test-isolation=none`, 178 tests failed on
  shared state and the run never exited.
- The launcher test's 60 s was a real start-up bug: `spawn` with `timeout` keeps its timer after
  ENOENT, so `npm start` waited 30 s to exit when `.venv-python` was missing. Fixed in
  `server/tools/python.mjs`.
- `npm test`: 49 s wall, 172 s CPU, 590 tests. `npm run test:slow`: 20 s wall, 54 s CPU, 21
  tests. Most remaining cost is start-up per file (jsdom, React, transpiling), not test bodies,
  so step 5 has to cut files, not only tests.
