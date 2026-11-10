# Video cancel, retry and restart recovery evidence (TreeTutor-vm4.3)

Date: 2026-11-10. Completes the requested-video flow on top of vm4.9 (isolated generation) and vm4.10 (inline player).

## What changed

- Artifact statuses gain `canceled` and `interrupted` (`server/store.mjs`). Older databases
  (Mermaid-only or vm4.9 schema) are rebuilt in place, copying every existing column.
- Restart: pending videos become `interrupted` (diagrams still `failed`). No job restarts
  on its own. `app.stop()` aborts running jobs with a stop reason that leaves them pending,
  so the next start marks them interrupted rather than failed.
- `POST /api/trees/:id/artifacts/:artifact/cancel`: only a pending video in that
  conversation. Marks it canceled and aborts the running attempt.
- `POST /api/trees/:id/artifacts/:artifact/retry`: for failed, canceled, interrupted or
  unavailable videos. It reuses the same row and the same frozen `input` with a new
  `attempt`, and adds no message. Any other state gets a 409. A new learner request
  creates a new job.
- Late events: publishing requires the row to be pending with the same attempt, and
  `finishVideo` matches the attempt. Output from a canceled or superseded attempt cannot
  publish or overwrite the result. A runner deletes its in-memory entry only if that
  entry is still its own.
- Unavailable: if a ready video's file is missing or unreadable, `GET /api/trees/:id` and
  previews report `available: false`. The card shows "Video unavailable" and a Regenerate
  button.
- `src/VideoCard.tsx`: a single button switches between Cancel, Retry and Regenerate in
  place, so keyboard focus survives state changes. Statuses: canceled, interrupted,
  unavailable. Map row shows the status.

## Evidence

Fixture, `npm test` (89/89), `test/videos.test.mjs`:
- cancel is scoped to its conversation (wrong conversation 404, second cancel 409). Another chat replies while a job runs. Retry gives a new attempt with the same input, no new message, and a 409 while it runs. The canceled attempt's late render output arrives first and does not publish. The retry publishes. A changed request makes a new job.
- render failure → composition (invalid output) failure → save failure → success, all on one row and request, each with an honest reason and no published file on failure. Tutor history has no errors or private work.
- restart from a pre-vm4.3 schema: pending → interrupted, ready + file → ready, ready without file → `available:false` in tree and previews. Zero provider calls on reopen. Retry of ready media is 409. Regenerate and Retry render.
- stop during render → pending → interrupted after reopen.
- Existing vm4.9 isolation tests still pass: worker gets only the frozen input, symlink and out-dir escapes are rejected, and the sandbox blocks home, app data, repo and network and confines writes. The real sandboxed render ran.

Browser fixture `scripts/verify-video-recovery.mjs` (5/5, results in
`video-recovery-results.json`). It uses synthetic providers, real sandboxed Remotion
renders, the production build and headless Chrome:
- after a restart, Interrupted + Retry and Unavailable + Regenerate appear with no inference replayed.
- Retry by keyboard turns into Cancel and keeps focus. Cancel then shows Canceled with focus kept on Retry, and the late render does not publish.
- a second Retry renders a paused 1 s video inline with no new message. Regenerate makes the lost video ready. Only 3 isolated worker calls ran and the tutor was never called.
- `scripts/verify-video-player.mjs` re-run 9/9 (status sequence, keyboard playback, focus and scroll kept, reload).

`npm run build` PASS. `astryx doctor --built dist`: 0 fail (2 font warnings, also present before).

## Limits

Chrome only. No native provider ran in this task; the live Claude end-to-end render is
recorded in vm4.9. A focused Cancel button loses focus to the body when its job completes
in the background, because the button is removed when the player appears. Corrupt but
readable media shows as ready; only missing or unreadable files show Unavailable.
