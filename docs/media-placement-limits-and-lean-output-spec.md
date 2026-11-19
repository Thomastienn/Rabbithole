# Media: pinned 3D labels, stall limits, finishes, visual placement, video offers and leaner output

Decided with the project owner on 2026-11-19 (grilling session). Decision records: ADR 0014 (visual calls carry their place) and ADR 0015 (the tutor decides when a video is wanted). Builds on ADRs 0001, 0002, 0004, 0006 and 0013. Terms: GLOSSARY.md (house style, focal object, next question, visual, cut, set piece, cut audit, video plan terms). Everything not named here keeps its current behaviour.

## Problem Statement

In 3D cuts, labels and pen marks drift off what they point at. Labels are HTML laid over the 3D scene at fixed screen spots, pen marks are pixel positions the planner writes before any code exists, and the camera always moves, so within seconds a label names empty space.

Long or slow videos fail on the clock, not on quality. The whole video has a fixed 20-minute deadline for planning (stretched to 4 minutes a cut only once a plan exists), a custom endpoint kills any request after 5 minutes even while it is still streaming, and visuals and diagrams still stop at 5 minutes in the running app although a recent change meant to raise them. A slow model writing a detailed cut is cut off mid-stream, and a timeout fails the whole video.

3D objects look plain. Every surface is one flat colour under one fixed light rig, with no reflections, no shadows and no surface detail, so a metal engine, a wooden guitar and a fabric sail all read as the same plastic.

Visuals land at the end of replies. On custom endpoints the server runs a response's tool calls after its text, so a tutor that writes the whole reply and then calls `show_visual` gets its visual at the bottom. One tutor even wrote a "[show_visual pending]" placeholder inside a `:::figure` where it wanted the visual, and the learner saw that text.

Videos lean 3D. Recent unasked videos mixed 2D and 3D cuts for topics a flat drawing would explain, because the planner's rule allows 3D for anything with "space", and nothing tells it 3D costs more.

Real requests for videos are refused. A server regex on the learner's words refused "can u quicky a short video how to play, just 2d video", and the tutor invented "the video tool didn't launch, ask again with …". Any request in another language is refused the same way, and the refusal is logged nowhere.

Output tokens go where nobody can see. An audit fix averages 17.3k output tokens against 3.7k for writing the cut, retries rewrite whole visuals and set pieces, reasoning tokens are counted but never shown apart from text, and some endpoints skip the end-of-reply tool call so every reply makes two extra quick-model calls.

## Solution

Labels and pen marks in 3D cuts follow their object. A label or mark names a point or set piece in the scene, and the kit keeps it on that object every frame while the camera moves, so labels stay crisp HTML and still point true. The cut audit checks 3D cuts for labels or marks off their target.

Videos and visuals stop only when a model stalls. A call ends only after 5 minutes without new output, however long it has been running; the whole-video deadline goes, leaving a 2-hour runaway guard. Visuals and diagrams follow the same rule.

3D objects get the house style's finishes and surface patterns. The kit lights every 3D scene with soft environment light and soft ground shadows, and the model picks a finish (matte, plastic, metal, glass, glow) and optionally a surface pattern (wood grain, brushed metal, panel lines, fabric weave, stone, tiles, bands) by name. Patterns are soft and low contrast and take the object's own colours.

A visual lands where the tutor meant it. `show_visual` names the last few words of reply text it follows and, optionally, the side it sits on beside the section after it. The app places it there even when the call came after the whole reply.

Videos default to 2D. The planner uses 3D only for a cut whose point cannot be shown flat, knowing 3D costs more; 2D cuts may add layered depth or an isometric view, or stay flat.

The tutor decides when a video is wanted. It starts one only when sure; when the learner only hints at one, or still does not follow after the explanation, it may offer "a video of this" as a next question, as a last resort. App tool refusals are logged.

Output tokens shrink without caps. Usage shows reasoning tokens apart from text; audit fixes, visual retries and set-piece rewrites send patches instead of whole rewrites; the end-of-reply call is made reliably so replies stop paying for extra quick-model calls. No new output caps, and no stream is stopped for being long.

## User Stories

### Pinned labels and marks in 3D

1. As a learner, I want a label in a 3D cut to stay beside the object it names while the camera orbits, so that I always know which part is which.
2. As a learner, I want a pen circle or arrow in a 3D cut to stay on its object while the camera moves, so that the emphasis matches what the narration is explaining.
3. As a learner, I want 3D labels to stay as sharp and readable as 2D labels, so that text never tilts, blurs or hides behind objects.
4. As a learner, I want a label to follow an object that bobs, spins or drifts, so that idle motion never leaves a label behind.
5. As a learner, I want a label whose object turns behind something to fade rather than float over the wrong thing, so that I am never misled about what it names.
6. As a learner, I want the camera to keep moving in 3D cuts, so that scenes keep feeling alive while labels stay true.
7. As the owner, I want the cut audit to flag a 3D label or mark that is off its object, so that drift is caught before a cut plays.
8. As the owner, I want a 3D pen mark in the plan to name its target object instead of pixel positions, so that the planner never guesses where a moving object will be on screen.
9. As the owner, I want the plan check to reject a 3D pen mark with no target, so that the planner fixes that one call instead of a cut drawing a mark on nothing.
10. As the owner, I want 2D cuts to keep pixel pen marks, so that the 2D pipeline does not change.

### Stall limits instead of deadlines

11. As a learner, I want a long, detailed video to finish even when it takes more than 20 minutes, so that the length of my video is never decided by a clock.
12. As a learner using a slow model, I want a call that is still writing to keep going, so that slow but working models are never cut off mid-cut.
13. As a learner, I want a call that has gone silent for 5 minutes to stop, so that a stuck provider does not hold my video forever.
14. As a learner, I want planning to have the same stall rule as cuts, so that a big plan for a long video is not cut off at a fixed time.
15. As a learner, I want visuals and diagrams to follow the same stall rule, so that a slow model can finish a rich visual.
16. As the owner, I want a 2-hour runaway guard on a whole video, so that a model that keeps producing output in a loop cannot run up cost forever.
17. As the owner, I want the raised visual and diagram limits to actually apply in the running app, so that settings changed in code are not silently overridden.
18. As a learner, I want Retry after a stall to keep finished cuts, as it does today, so that one stuck call does not waste the work already done.
19. As a learner, I want a stalled video's card to say the model stopped responding, so that I know it was the provider, not my request.

### Finishes and house-style patterns

20. As a learner, I want 3D scenes lit with soft environment light, so that objects have gentle reflections and read as solid.
21. As a learner, I want soft ground shadows under 3D objects, so that objects sit on the scene instead of floating.
22. As a learner, I want metal objects to look like metal and glass like glass, so that I can tell materials apart at a glance.
23. As a learner, I want a wooden guitar to show wood grain and a spacecraft to show panel lines, so that objects are recognisable without becoming photoreal.
24. As a learner, I want surface patterns to stay soft and low contrast, so that scenes stay clean and on house style.
25. As a learner, I want patterns to take the object's own colours, so that true colours such as Earth's blue and palette roles still decide what I see.
26. As the owner, I want finishes and patterns chosen by name, so that richer looks cost almost no extra output tokens.
27. As the owner, I want no photo textures, downloads or node graphs, so that videos stay in the house style and need nothing fetched.
28. As the owner, I want set pieces in the piece library to keep their finishes and patterns when reused, so that a reused guitar keeps its wood grain.
29. As a learner, I want 3D cuts to keep playing smoothly live in the browser, so that the new lighting does not make playback stutter.

### Visual placement

30. As a learner, I want a visual to appear right after the passage the tutor wrote it for, so that the picture sits beside its explanation.
31. As a learner, I want visuals placed correctly on custom endpoints, Claude and Codex alike, so that placement does not depend on my provider.
32. As a learner, I want several visuals in one reply each placed at its own passage, so that they do not pile up at the bottom.
33. As a learner, I want a visual beside its explanation on the left or right when the tutor chooses, so that figure layouts still work for visuals.
34. As a learner, I want no placeholder text such as "[show_visual pending]" in replies, so that I only see the tutor's words and the visual.
35. As a learner, I want a visual whose anchor the tutor misquoted to still appear, at the end of that part of the reply, so that it is never lost.
36. As a learner, I want the anchor match to ignore small differences in case and spacing, so that minor slips still land in place.
37. As a learner, I want images from image search to keep their figure layout, so that nothing about images changes.
38. As the owner, I want the tutor prompt to stop mentioning the retired visual block inside figures, so that models are not invited to write placeholders.
39. As a learner, I want placement to stay the same when I reopen a conversation, so that a visual never moves after it lands.

### 2D by default

40. As a learner, I want videos to stay 2D unless 3D makes the point clearer, so that videos are quicker and cheaper and still clear.
41. As a learner, I want a 3D cut when the point is rotation, hidden depth or 3D structure, so that spatial ideas still get 3D.
42. As a learner, I want "make it 3D" to still give mostly 3D cuts, so that an explicit ask is honoured.
43. As a learner, I want "just 2D" to give only 2D cuts, so that an explicit ask is honoured.
44. As a learner, I want 2D cuts to sometimes use layered depth or an isometric view, so that flat drawings can still show depth when it helps.
45. As a learner, I want a 2D cut to stay fully flat when that is clearest, so that depth is never forced.
46. As the owner, I want the planner told that 3D cuts cost more, so that it weighs cost when choosing.

### The tutor decides about videos

47. As a learner, I want a video when I ask for one in my own words, typos and slang included, so that I am never told to rephrase.
48. As a learner who writes in another language, I want my video asks honoured, so that videos are not English-only.
49. As a learner, I want the tutor never to start a video I did not want, so that I do not wait for or pay for one.
50. As a learner who only hints at wanting a video, I want it offered as a next question, so that one click starts it.
51. As a learner who still does not follow after an explanation, I want the tutor to sometimes offer a video, so that a different way of seeing it is one click away.
52. As a learner, I want at most one video offer per reply and none in replies that already hold a visual, so that offers stay rare and useful.
53. As a learner, I want choosing the video offer to ask for the video in the conversation, so that it reads like any other question I asked.
54. As the owner, I want refused app tool calls logged with their reason, so that I can see why a video, visual or discussion did not start.
55. As the owner, I want the "a video stands alone in its reply" rules kept, so that a reply never mixes a video with other media.

### Leaner output

56. As the owner, I want usage to show reasoning tokens apart from written output, so that I can see whether a call spent its tokens thinking or writing.
57. As the owner, I want a video's token breakdown to show reasoning per stage, so that I can find the stage that thinks the most.
58. As the owner, I want audit fixes to send a patch only, so that fixing a cut does not rewrite the whole cut.
59. As the owner, I want an audit fix whose patch fails to go to the normal repair loop, so that a failed patch does not trigger a costly whole rewrite inside JSON.
60. As the owner, I want visual retries to send a patch against the failed fragment, so that a small fix does not regenerate the whole visual.
61. As the owner, I want a set-piece rewrite after a failed check to send a patch, so that one broken piece does not re-emit every piece.
62. As the owner, I want a reply's suggestions, next questions and verdict to arrive in the tutor's own end-of-reply call on every endpoint, so that replies stop paying for two extra quick-model calls.
63. As the owner, I want to know why some endpoints skip the end-of-reply call, so that the fix targets the real cause.
64. As the owner, I want no new output caps and no stream stopped for length, so that a model writing a more detailed cut or visual is allowed to.
65. As the owner, I want the existing 64 KiB check on cuts and visuals kept as it is, so that a looping model is still caught without limiting real detail.
66. As the owner, I want new kit helpers that shorten cut code only after reasoning and output are measured, so that effort goes where the tokens actually are.

## Implementation Decisions

### Pinned labels and marks

- The kit gains a pure screen projection: given the cut's camera keys, a frame, the canvas size and field of view, and a 3D point, it returns the point's position in the 1920×1080 frame and whether it is in front of the camera. It reuses the existing `cameraAt` path, so it needs no per-frame hook inside the canvas and matches the camera exactly.
- The kit gains a `Pin` component used outside the `ThreeCanvas`, in the HTML layer: it takes the camera keys and a 3D point (or a function of the frame, for objects with idle motion) and places its children at the projected position, fading when the point goes behind the camera or off frame.
- Pen marks in 3D cuts target a set piece name (and optionally a named part point the cut writer exports) instead of x and y. The plan tool's mark accepts `target` for 3D cuts; the plan check rejects a 3D cut's mark without `target` with a plain error for that call, and keeps x and y for 2D cuts.
- The cut writer resolves a target to a 3D point and renders the mark through the same projection, so cursor and pen marks follow the camera.
- `CUT_3D` guidance changes from "keep HTML labels where they stay true … not pinned beside a moving 3D object" to "pin every label and mark to its object with the kit's `Pin`"; titles and legends may stay unpinned. The `focal-object` skill keeps its wording.
- The cut audit gets a 3D addendum: in 3D cuts, flag a label or mark that is not on its object in the stills or contact sheet.
- The camera keeps its always-moving rule.

### Stall limits

- Every model call (Claude CLI, Codex, custom endpoint) ends only after 5 minutes without new output. Claude and Codex already use idle timers; the custom endpoint's hard 5-minute request limit becomes an idle limit reset by every streamed chunk, including reasoning and tool-call chunks.
- The whole-video deadline and its per-cut stretch are removed. A 2-hour runaway guard on the whole video remains, enforced in the same place the deadline is today, and its failure says the video ran over two hours.
- Visual and diagram whole-run limits follow the same rule: stall only, plus the same runaway guard. The app-level defaults that override the generator defaults are removed so one value applies.
- Sandbox render, snapshot, narration and Manim budgets keep their current derived values; they measure work, not model speed.
- A stalled call fails with a message saying the model stopped responding, matched by the video card's failure reasons so it shows inline. Retry keeps finished cuts, as today.

### Finishes and patterns

- The kit's `Lights` gains soft environment lighting (generated in the kit, no file) and soft ground shadows on a shadow-catching ground plane. Shadow and environment quality are fixed, chosen for smooth live playback.
- The kit exposes a small material helper: a finish name (matte, plastic, metal, glass, glow), a colour expression (palette role, neutral or true colour) and an optional pattern name (wood, brushed metal, panel lines, fabric, stone, tiles, bands). It returns a material whose colour is the given colour and whose pattern is a greyscale texture drawn on a canvas inside the kit, multiplied by that colour, with a matching subtle relief.
- Patterns are generated once per name and reused; they are deterministic so every frame and every render looks the same.
- `PIECES_3D`, `PIECE_IMPROVE_INSTRUCTIONS` and `CUT_3D` tell writers to build materials with the helper instead of raw colour-only materials, and still forbid loaders, files and textures of their own. The house-style skill's 3D line names the finishes and patterns and keeps "no photoreal textures, noise or clutter".
- The colour validator accepts the helper's colour argument through the same palette, neutral and true-colour bindings it checks today.
- Set pieces store their helper calls in their source, so the piece library keeps finishes and patterns on reuse.

### Visual placement

- `show_visual` gains a required `after` (the last few words of reply text the visual follows, at most about 120 characters) and an optional `side` (`left` or `right`).
- When a native call arrives after text in the same model response, the server places the visual at the end of the first match of `after` in that response's text: exact first, then ignoring case and runs of whitespace, then the end of that response's text. When the tutor stopped at the call (text after the call arrives in a later round), the position stays the text streamed so far, as today.
- With `side`, the visual is shown beside the section that follows its position, using the existing figure rendering; without it, the visual sits in the flow.
- The `<tool_call>` text path already knows the call's place; it accepts and stores `side` the same way and ignores `after` unless the call sits at the end of the text.
- The tutor prompt's reply-layout line stops mentioning visual blocks inside `:::figure`; `:::figure` is described for images only, and `show_visual`'s description explains `after` and `side`.
- Stored artifacts keep `position`; `side` is stored with the artifact. Reloading uses the stored values.

### 2D by default

- The planner rule becomes: default `2d`; use `3d` only for a cut whose point cannot be shown flat, such as rotation, hidden depth or 3D structure; 3D cuts cost more, since every set piece then needs a 3D form and renders are heavier. Explicit 2D and 3D asks keep their current handling.
- The 2D line of the house-style skill, which every Remotion cut writer gets, allows layered depth (parallax layers) or an isometric view where it helps, and says flat is fine.

### Video decisions

- The server's learner-text check before `make_video` is removed, with its refusal message.
- `make_video`'s description: start a video only when sure the learner wants one, in any wording or language; when the learner only hints at one or still does not follow after the explanation, do not start one, offer it instead as a next question, as a last resort.
- `record_turn`'s next questions may include one video offer, worded as the learner asking for a video of the idea. Rules in its description: at most one per reply, never in a reply holding a visual or discussion. Choosing it sends it as the learner's message, as any next question does.
- Every refused app tool call (video, visual, discussion, record_turn) is logged at warn level with tool name, reply id and refusal reason, without input values.

### Leaner output

- Usage records reasoning tokens as their own column: custom endpoints from `completion_tokens_details.reasoning_tokens`, Codex from its reasoning output count, Claude where its usage reports them. Output keeps its current total meaning. Existing rows have none.
- The usage views (the video token breakdown and the usage history totals) show reasoning beside output where known.
- An audit fix is one patch call; if the patch fails to apply or validate, the cut goes into its normal repair attempts with the audit's issues as the repair note, and the whole-code-inside-JSON fallback is removed.
- A visual retry sends the previous fragment and the failure and asks for a patch; a patch that fails falls back to a whole fragment, as cut repairs do today.
- A set-piece module that fails its check is repaired by patch first, whole module second, matching cut repairs.
- Investigate why some custom endpoints (seen on `github/auto` through Omniroute) skip `record_turn`, then fix the cause, such as prompt wording, tool ordering or an endpoint that drops the last tool call. Until then the quick-model fallback stays.
- No `max_tokens`, no new size caps and no early stream stop. The 64 KiB check stays as it is.
- Kit helpers to shorten cut code are deferred until reasoning and output per stage have been measured.

## Testing Decisions

- Good tests check behaviour a caller sees: where a visual lands in the stored reply, what a plan check returns, which calls a video makes, what usage records. They do not assert prompt wording beyond the one line a decision depends on, nor private helpers.
- Seams, highest first and reusing existing ones:
  - The reply send path with the fake OpenAI endpoint, as in the existing show-visual loop and show-visual tests: visual placement with `after` and `side`, several calls in one response, misquoted anchors, the tutor stopping at the call, and refused tool calls being logged.
  - The video pipeline with the video kit and fake providers, as in the existing video jobs and cut tests: no whole-video deadline, the runaway guard, audit fix patch-only handing over to repair, set-piece patch repair, stall failure message and Retry keeping cuts.
  - The custom endpoint provider with the fake endpoint and fake timers: the idle limit resets on every chunk and fires after 5 silent minutes; reasoning tokens are read.
  - Plan tool validation as plain functions: 3D marks need `target`, 2D marks keep x and y.
  - The kit projection as a pure function: a point at the camera target projects to the frame centre, a point behind the camera reports hidden, projections follow `cameraAt` across frames.
  - The material helper as a pure function: the same name gives the same texture, the colour comes from the given expression.
  - `make_video` through the media calls tests: a request with no trigger words starts a video; `record_turn` accepts one video offer and rejects a second or one beside a visual.
- Visual quality of finishes, patterns and pinned labels is judged by the owner by hand on real videos; no browser test is added.

## Out of Scope

- Photo textures, CC0 texture libraries, downloaded assets and node-graph materials.
- In-scene 3D text.
- Stopping or freezing the camera for labels.
- Any new output cap, token budget or `max_tokens` setting, and stopping streams early.
- Lowering effort for cut writers or adding a writer effort setting.
- New kit helpers for common cut code, until measurement shows where tokens go.
- A "Start this video?" confirmation card.
- Omniroute's "no model endpoints available given user constraints" error: it is the endpoint's own configuration.
- Re-rendering existing videos or moving visuals already stored.

## Further Notes

- Evidence from the owner's data on 2026-11-19: the guitar visual's position was 2721, the reply's full length, with the placeholder at offset 162; the refused video ask was "can u quicky a short video how to play, just 2d video"; the largest stored cut is 11.7 KB and the average 7 KB; audit fixes averaged 17.3k output tokens over 14 calls.
- `docs/custom-endpoint.md` still says tool calls are out of scope for custom endpoints; update it with this work.
- The token breakdown in a video's card and usage history totals gain a reasoning figure only; the look stays the same, so no mockup is needed.
