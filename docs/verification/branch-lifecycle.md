# Branch cancellation and restart recovery

Task: TreeTutor-7t3.8.2. Verified 2026-11-08.

Stop now finalizes its owning reply immediately as interrupted, preserving the
last saved text and ending its SSE stream. Finalization clears the heartbeat,
releases only that turn's active controller, and ignores subsequent provider
text, status, thread saves and failures. Shutdown runs this same finalization
before the store closes. Other conversations keep their own controllers and
checkpoints. Crash recovery continues to use the existing SQLite migration
from streaming to interrupted; startup does not restart inference.

## Verification

- Baseline `npm test`: 22/22 passed. New lifecycle tests reproduced stale
  callbacks changing stopped/failed replies and callbacks accessing closed
  storage before the fix.
- `node --test test/branch-lifecycle.test.mjs test/app.test.mjs`: 10/10 passed.
  Stop ends one sibling's stream before its provider settles, preserves its
  partial, and permits a new request. Late item/status/thread callbacks and a
  late rejection cannot alter either the old reply or the replacement turn's
  active ownership. The sibling completes independently.
- A separate failure test keeps both histories usable, rejects late callbacks
  after failure, completes the sibling, and submits further turns to both.
- Graceful shutdown tests two active sibling checkpoints, closes SQLite, then
  deliberately invokes old callbacks. Neither callbacks nor provider settlement
  access closed storage or alter recovered records.
- A child process runs the actual HTTP app and SQLite store with two active
  synthetic provider requests. Both partials are confirmed through HTTP before
  SIGKILL. Reopening the database preserves exact questions, partial text,
  branch context and thread ownership, changes streaming to interrupted, and
  starts no provider requests.
- Full `npm test`: 26/26 passed. `npm run build` and `git diff --check` passed.
  Build retains the existing large-bundle warning.

These checks use a deterministic provider fixture and a real local HTTP/SQLite
process crash. They do not contact ChatGPT or repeat live provider/UI checks.
Earlier independent-streaming evidence remains in `branch-streaming.md`.
