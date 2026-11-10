# Inline video status and player evidence (TreeTutor-vm4.10)

Date: 2026-11-10. Builds on the vm4.9 generation worker.

## What changed

- `src/VideoCard.tsx`: video artifact entry under its reply. States Preparing, Rendering
  (progress bar only when the renderer reported progress), Ready (title, text
  description, native `<video controls preload="metadata">`, no autoplay, full chat width,
  16:9 frame) and Failed (server reason). The card is `aria-live="off"` inside the chat
  log; only its `role="status"` line (`<title>: <state>`) announces, so progress ticks
  stay silent. While pending, a 16:9 placeholder reserves the player's space so completion
  does not shift the conversation.
- Server: running jobs report `phase`/`progress` in memory (`server/app.mjs`), merged into
  `GET /api/trees/:id` and previews; `/api/state` lists `videos` (conversations with running
  jobs) so the client keeps polling after the reply ends. The sandboxed renderer prints
  5 % progress steps (`server/video-render.mjs`). Media endpoint supports single byte
  ranges (206/416) for native seeking.
- Map transcript row: `Video: <title> · preparing…|rendering…|ready|failed`.
- Chat Escape handler ignores events from a focused `<video>`.

## Evidence

| Check | Kind | Result |
| --- | --- | --- |
| `npm test` (85 tests) incl. phase/progress/state/previews/Range test and real renderer progress | integration fixture + live sandboxed Remotion render (no provider) | PASS |
| `scripts/verify-video-player.mjs` → [video-player-results.json](video-player-results.json), 9 checks | browser fixture: synthetic tutor/worker providers, real sandboxed render, production build, headless Chrome 157 | PASS |
| `npm run build` | build | PASS (existing chunk-size advisory) |
| `npx astryx doctor --built dist` | build doctor | 0 fail (2 existing Figtree font warnings) |

Browser checks: Preparing entry under its own reply in a nested child; chatting in
another conversation while it runs, with the map row reporting rendering and no card
there; Rendering without a bar before progress; focus in composer, mid-conversation
scroll and message count unchanged when the video completes; exactly two status texts
(Rendering → Ready) while progress values changed; paused, non-autoplay, 16:9 player
inside the chat width with its description; keyboard: Tab reaches the player, Space
play/pause, ArrowRight seek, ArrowUp/Down volume, fullscreen button reached by
Shift+Tab and Enter, Escape keeps chat open, no key prevented by app handlers; finished
video only in its original conversation; reload replays the ready video with no
provider call.

## Limits

- Chrome only. Chrome has no native fullscreen or mute key; fullscreen is reached
  through the native control's button. The fixture's button position assumes the
  Chrome 157 control layout.
- Screen-reader output itself was not observed; announcement behaviour is inferred from
  live-region structure (one status text change per state).
- No native provider run in this task (vm4.9 recorded a live Claude end-to-end render).
- Cancel, Retry, Interrupted and Unavailable remain TreeTutor-vm4.3.
