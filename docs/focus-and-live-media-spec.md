# Focused chat polish, logging and live media

Decided with the project owner on 2026-11-13/14 (grilling session). Refines the [video quality refresh](video-quality-spec.md), the [video flow proposal](video-flow-proposal.md) and the [inline visuals spec](inline-visuals-spec.md) where they conflict; everything not named here keeps its current behavior. Terms follow `GLOSSARY.md`; **cut** and **focus mode** were added in this session.

## Problem Statement

The focused chat feels cluttered: the first-question composer draws nested focus outlines around its placeholder, the turn rail's quick-jump lines touch the scrollbar, and the closed contents rail is a cramped vertical strip with a small, hard-to-hit button. The top bar is always visible, so the learner cannot read or chat without distraction.

When TreeTutor runs from `npm start`, the terminal shows almost nothing after the address line, so the learner cannot tell what the server is doing, whether a model call or video failed, or why.

The reply usage line and chat details count only chat and suggestion tokens. Visuals and videos, often the most expensive work, are missing there, so the learner cannot see what media costs.

Visuals appear all at once after a wait, with nothing to watch while they are built. Videos are worse: they wait for the whole reply to finish, are written as one composition and rendered one frame at a time, and take around five minutes for a one-minute video. The result is a single continuous scene with overlapping elements, stiff motion and modest resolution that feels like stitched images. Math explanations in particular lack the fluid equation and graph animation learners expect. Nothing on screen guides the eye to what the narration is talking about.

## Solution

- **Focused chat polish.** The composer shows one focus ring on its outer box. The turn rail sits clear of the scrollbar. The contents rail is replaced by a single large floating button at the top left. A **focus mode** hides the top bar on any page; a small tab at the top edge and a keyboard shortcut bring it back, and the choice is remembered.
- **Server logging.** `npm start` prints one plain line per meaningful event: API requests, model calls, media job stages, warnings and errors with their cause.
- **Media usage in chat.** The reply usage line and chat details include visual and video tokens, labelled by task.
- **Progressive visuals.** A visual's markup streams into its sandbox as the smart model writes it, so the learner watches it being built; its scripts run once it is complete.
- **Videos as cuts, played live.** A video starts as soon as the chat model's request closes, mid-reply. The smart model writes a short plan with a style brief, then the cuts are written and narrated in parallel. The video plays live in the sandbox as soon as its first cut is ready, sharp at any size, while later cuts finish. A 1080p MP4 renders in the background for the video library and downloads.
- **Emphasis tools.** Cuts can use a cursor (optionally with a label bubble) that glides between targets in step with the narration, and a sketch pen that draws hand-drawn circles, underlines, arrows and freehand strokes.
- **Manim cuts.** The smart model can choose Manim for a math cut. TreeTutor installs a pinned Manim for itself on first run, and Manim cuts share the house look.

## User Stories

### Focused chat polish

1. As a learner, I want the first-question composer to show a single focus ring when I click into it, so that the input looks clean instead of boxed several times.
2. As a learner, I want the placeholder text to have no outline of its own, so that it reads as a hint and not a separate control.
3. As a keyboard learner, I want the composer's single focus ring to remain clearly visible, so that I still know where focus is.
4. As a learner, I want the turn rail's quick-jump lines to sit a little left of the scrollbar, so that I can use either without hitting the other.
5. As a learner, I want the closed contents rail replaced by one floating button at the top left of the focused chat, so that the reading area is not narrowed by an empty strip.
6. As a learner, I want the contents button to be large enough to hit easily, so that opening contents never takes two tries.
7. As a learner, I want the contents button to show a tooltip, so that I know what it opens.
8. As a learner, I want the contents button to stay available in focus mode, so that I can navigate the learning tree without bringing the top bar back.
9. As a learner, I want a button in the top bar that hides it, so that I can enter focus mode with one click.
10. As a learner, I want a small tab at the top edge while the top bar is hidden, so that I can bring it back with one click.
11. As a learner, I want `Ctrl+Shift+F` to toggle focus mode, so that I can switch without the mouse.
12. As a learner, I want focus mode to work on every page (focused chat, map, knowledge graph, video library, usage), so that the behavior is predictable.
13. As a learner, I want focus mode remembered after a reload, so that I do not have to hide the top bar every session.
14. As a screen-reader learner, I want the hide button and the top-edge tab to have clear names and expanded state, so that I know whether the top bar is shown.
15. As a learner on a narrow window, I want focus mode and the contents button to keep working with the narrow drawer, so that small screens are not broken.

### Server logging

16. As a learner running `npm start`, I want a line for each API request with method, path, status and time, so that I can see the server is alive and responding.
17. As a learner, I want static files and keepalive polling left out of the log, so that real activity is not buried.
18. As a learner, I want a line when a model call starts and finishes, with its task, provider, model, tokens and time, so that I can see what the tutor is doing and how long it takes.
19. As a learner, I want failed model calls logged with the provider's error cause, so that I can fix a sign-in or endpoint problem.
20. As a learner, I want each media job's stages logged (plan, cuts written, narration, live-ready, MP4 render progress every 25%, saved, failed), so that I know where a video is and where it broke.
21. As a learner, I want warnings (such as a missing video browser or an unusable Manim) logged with what to do next, so that I can repair my setup.
22. As a learner, I want logs printed only to the terminal, never to log files, so that nothing accumulates on disk.
23. As a learner, I want logs never to include my questions, replies or credentials, so that the terminal does not leak private content.

### Media usage in chat

24. As a learner, I want the reply usage line to include tokens used by visuals in that reply, so that I see the full cost of an answer.
25. As a learner, I want the reply usage line to include tokens used by a video started from that reply, so that I can compare video cost to chat cost.
26. As a learner, I want media usage labelled by task (chat, suggestions, visuals, videos), so that I know which part costs the most.
27. As a learner, I want chat details to total visual and video tokens for the conversation, so that I can judge whether media is worth it.
28. As a learner, I want retried visuals and video cuts counted in usage, so that the totals reflect what was actually spent.
29. As a learner, I want media usage that is still running to appear once each call reports it, so that the totals are not stuck until everything finishes.
30. As a learner, I want unreported usage shown as not reported rather than zero, so that I am not misled.

### Progressive visuals

31. As a learner, I want a visual to start appearing as soon as its markup begins arriving, so that I am not staring at a placeholder.
32. As a learner, I want the visual to build up visibly as more markup arrives, so that I can follow it being constructed.
33. As a learner, I want the visual's interactive scripts to run only once it is complete, so that half-finished code never misbehaves.
34. As a learner, I want partial markup to stay in the same isolated sandbox with no network or app access, so that streaming does not weaken safety.
35. As a learner, I want a visual that fails midway to show its failure state with Retry, so that a broken partial visual does not linger as if it were finished.
36. As a learner, I want Stop during the reply to stop a streaming visual, matching today's rule, so that Stop behaves the same.

### Videos as cuts, played live

37. As a learner, I want a video to start as soon as the chat model asks for it, while the reply is still streaming, so that it is ready sooner.
38. As a learner, I want Stop to cancel a video only while the reply is still streaming, as with visuals, so that stopping is consistent.
39. As a learner, I want a video made of several cuts with smooth transitions, so that it feels edited rather than one long scene.
40. As a learner, I want every cut to share one look (layout areas, colors for each idea, recurring objects and the same terms), so that parallel cuts still feel like one video.
41. As a learner, I want each cut to continue from where the previous cut ended, so that transitions are continuous.
42. As a learner, I want the video to start playing as soon as its first cut is ready, so that I wait seconds, not minutes.
43. As a learner, I want later cuts to keep loading while earlier ones play, with a brief waiting state if I catch up, so that playback never shows broken content.
44. As a learner, I want the live video to stay sharp at any player size and on full screen, so that text and lines are never blurry.
45. As a learner, I want each cut narrated separately with a deliberate pause between cuts, so that transitions do not clip the speech.
46. As a learner, I want subtitles in a 120px band at 1080p with at most two lines, so that the visuals have more room.
47. As a learner, I want a failed cut retried on its own, so that one bad cut does not restart the whole video.
48. As a learner, I want a cut that breaks the style brief rejected and rewritten, so that colors, fonts and terms stay consistent.
49. As a learner, I want a 1080p MP4 rendered in the background, so that the video library and downloads have a file.
50. As a learner, I want the video library to play the MP4 once it is ready and the live version until then, so that a new video is watchable at once.
51. As a learner, I want progress to show the real phases (planning, writing cuts, narrating, playable, saving the file), so that I know what is happening.
52. As a learner, I want existing videos left as they are, and "Try a different version" to make a new one in the cut format, so that nothing I saved changes.
53. As a learner, I want the live video to run in an isolated sandbox with no network or app access, so that model-written code cannot reach my data.
54. As a learner, I want the plan and style brief kept short but clear, so that videos are written faster and cost fewer tokens without losing consistency.

### Emphasis tools

55. As a learner, I want a cursor that glides to what the narration is talking about, so that I can follow the explanation's focus.
56. As a learner, I want the cursor to show a short label bubble when it helps and none when it does not, so that it guides without clutter.
57. As a learner, I want a sketch pen that circles, underlines, draws arrows to or scribbles over what matters, so that key parts stand out like a teacher marking a board.
58. As a learner, I want cursor and sketch motion timed to the narration, so that what I hear and what is marked match.
59. As a learner, I want cursor and sketch to look the same in every cut, including Manim cuts, so that the video feels consistent.
60. As a learner, I want marks to fade when the narration moves on, so that the frame does not fill with old scribbles.

### Manim cuts

61. As a learner, I want math explanations to use Manim for equations, transforms and graphs when the smart model chooses it, so that math animates fluidly.
62. As a learner, I want Manim installed for TreeTutor automatically on first run, so that I do not manage a Python setup by hand.
63. As a learner missing system libraries, I want startup to tell me the exact install command, so that I can fix it in one step.
64. As a learner, I want chat, visuals and non-video features to keep working when Manim is unusable, so that one missing library does not block learning.
65. As a learner, I want Manim cuts to use the same dark-paper ground, palette, fonts, margins and subtitle space, so that they blend with the other cuts.
66. As a learner, I want Manim cuts to render in the same sandbox as other rendering, so that model-written Python cannot reach my files or the network.
67. As a learner, I want a Manim cut playable in the live video once its clip is rendered, so that a video mixing engines still starts quickly.

## Implementation Decisions

### Focused chat polish

- The composer's focus ring lives on the outer composer only; the inner textarea and its placeholder lose their own outline. The ring keeps the existing solid paper focus ring at least 2px wide.
- The turn rail gains a right offset that clears the scrollbar plus a small gap.
- The closed-contents `aside` rail is removed. A floating icon button (large size, about 40px, tooltip "Show contents", `aria-expanded`) overlays the top left of the focused chat and takes no layout width. The open contents panel is unchanged.
- **Focus mode** is a saved preference in the existing preferences module, applied at the shell. The top bar has a hide button; while hidden, a small top-edge tab restores it. `Ctrl+Shift+F` toggles it from any page and must not fire inside text inputs or the composer, or clash with existing vim bindings. The narrow drawer layout keeps working.

### Server logging

- One small logger module formats plain single-line entries (time, level, area, message, key fields). It is passed to `createApp` as an injected `log` function defaulting to stdout and stderr, so tests can capture lines. There are no levels flag and no log files.
- Request logging wraps the HTTP handler and skips static assets and keepalive or polling routes.
- Model calls are logged where usage is already metered, so every task (chat, suggestions, compaction, visual, video plan, cut) is covered in one place.
- Media jobs log stage changes and MP4 render progress at 25% steps.
- Log entries carry ids, task names, models, counts and durations, never learner text, model output or credentials. Provider error messages are logged as reported.
- The existing startup lines stay.

### Media usage in chat

- Usage events already record the `diagram` (visuals and diagrams) and `video` tasks. The reply usage line and chat details now also read media usage attributed to the reply (the visual's or video's originating reply message) and show it by task, tokens only.
- No pricing or dollar amounts.

### Progressive visuals

- The visual generation path already receives streamed deltas from the provider. It forwards accumulated partial markup to the client while the visual is pending.
- The client writes partial markup into the existing sandbox iframe progressively, with scripts held back. On completion the final, fully sanitized fragment replaces the partial one and its scripts run.
- Partial markup passes the same sanitizer as final markup. No JSONL or operation format: the model keeps writing plain HTML/SVG/JS.
- Failure or Stop discards the partial render and shows the existing failure state.

### Videos as cuts, played live

- **Start time:** a video request starts when its request block closes during streaming, joining the visual queue rule. Stop cancels it only while the reply streams.
- **Plan:** the smart model first returns a compact plan: title, description, a style brief and an ordered list of cuts, each with purpose, narration text, intended engine (Remotion or Manim) and a short end-state description. The prompt asks for brevity without vagueness.
- **Style brief:** layout areas, palette role for each recurring idea, recurring objects with names and positions, and exact terms. Every cut-writing call receives the brief, its own cut, and the previous cut's end state.
- **Parallel cuts:** cut code and per-cut narration (edge-tts) are produced in parallel. Each cut's duration comes from its measured narration plus a fixed pause. A cut failing validation (brief colors, fonts or imports outside the kit) or rendering is retried alone, within the existing attempt budget.
- **Frame:** 1920×1080 at 30 fps; the subtitle band is 120px with at most two lines. The kit's frame constants and the Three canvas size change to match.
- **Live playback:** `@remotion/player` plays the composed cuts inside an isolated sandbox iframe with an opaque origin and no network, like visuals. The player shell bundles the kit; each cut's compiled code is loaded into it as it becomes ready. Playback starts when cut 1 is ready and waits on a buffering state at an unready cut.
- **MP4:** once all cuts are ready, the existing sandboxed Remotion render produces a 1080p MP4 for the video library and downloads, with concurrency above 1. The library plays the live version until the MP4 is saved.
- **Progress phases:** planning, writing cuts (n of N), narrating, playable, saving. They replace today's planning, narrating, rendering and saving mapping; the bar still never moves backward.
- **Storage:** a video artifact stores its plan and an ordered list of cuts (engine, code or clip, narration timing, status). Existing single-composition videos keep their MP4 and are not migrated.

### Emphasis tools

- The kit gains a `Cursor` (targets in frame space with times aligned to sentence frames, optional label bubble) and a `Sketch` (circle, underline, arrow and freehand strokes with a hand-drawn wobble, drawn progressively and fading out).
- They render as one Remotion overlay layer above every cut, Manim cuts included, so there is one implementation and one look. The prompt tells the model Manim cuts rarely need them.
- Targets are given in the shared 1920×1080 frame space.

### Manim cuts

- `npm start` creates a project-local Python environment with `uv` on first run and installs a pinned Manim, alongside the existing npm install step. If Cairo/Pango development headers or LaTeX are missing, startup stops with the exact `apt` or `brew` command.
- A Manim house kit (Python) sets the dark-paper ground, palette, Archivo and Literata, frame margins and subtitle space.
- A Manim cut is Python scene code from the smart model, rendered by Manim inside the bubblewrap sandbox to a clip at 1080p30 and placed on the cut timeline as a video element.
- If Manim is unusable at runtime, the video fails with a clear message and a log warning; chat and visuals keep working.
- An ADR records the decision to make videos planned cuts played live and to require Manim as a Python engine.

## Testing Decisions

- Tests check external behavior only: what the HTTP API returns and streams, what is stored, what usage is recorded, what lines are logged and what components show. They do not check internal call order or private helpers.
- **Main seam: `createApp` in-process with fake providers, fake narration and a fake render engine.** It covers:
  - a video starting at request close;
  - plan parsing into cuts;
  - parallel cut writing and single-cut retry;
  - style-brief rejection;
  - per-cut narration timing with pauses;
  - Manim engine selection and its unusable path;
  - streamed partial visual markup and its failure and Stop paths;
  - usage events per cut and per visual attempt;
  - logged lines through the injected `log`.
  - Prior art: `test/media/videos-jobs.test.mjs`, `videos-requests.test.mjs`, `videos-failures.test.mjs`, `visuals-queue.test.mjs`, `visuals-failures.test.mjs`, `artifacts-stop.test.mjs`, with `test/support/fake-narration.mjs` and `video-kit.mjs`.
- **Unit tests:**
  - the reply usage line and chat details totals with media tasks;
  - the log line formatter, including redaction of learner text;
  - the partial-markup sanitizer;
  - plan and style-brief validation;
  - cursor and sketch frame-space timing math.
  - Prior art: `test/media/narration.test.mjs`, `diagram-parser.test.mjs`, `test/usage`.
- **Component tests in jsdom:**
  - the composer has no inner outline class;
  - the floating contents button (name, expanded state, opening contents);
  - the focus mode toggle, tab, shortcut and saved preference;
  - the live player switching to the MP4 once ready.
  - Prior art: `test/chat/navigation.test.mjs`, `test/shell/themes.test.mjs`, `test/shell/chat-settings.test.mjs`.
- **Real render:** a short real Remotion and Manim cut render runs only in `npm run test:render`, never in `npm test`.
- **Not covered:** pixel checks (turn rail clearance, single visible focus ring, subtitle band height) need a real browser. List them under "Not covered" in `docs/agents/testing.md`.

## Out of Scope

- Dollar pricing or per-model price settings.
- Log files, log levels, log rotation or a log viewer in the app.
- A JSONL or operation-stream format for visuals.
- Re-rendering or migrating existing videos.
- Cursor or sketch tools native to Manim.
- Cloud or distributed rendering (Remotion Lambda).
- Auto-installing system packages (Cairo, Pango, LaTeX).
- Auto-hiding the top bar on hover without a toggle.

## Further Notes

- The work splits into seven ticket groups: focused chat polish, server logging, media usage in chat, progressive visuals, videos as cuts played live, emphasis tools, and Manim cuts. Emphasis tools and Manim cuts depend on videos as cuts; the rest are independent. Issues are not created yet.
- Live playback is what removes most of the wait and the resolution problem: the composition renders as live DOM/SVG in the browser. The MP4 is only for keeping and sharing.
- The project-owner reference point is DeepTutor's video quality and speed. Public sources found in this session show it uses Manim for math animation; its exact video stack was not confirmed.
- On the development machine, a wheels-only `pip download manim` failed, so at least one Manim dependency builds from source on Linux. Hence the Cairo/Pango header check.
