# Video consistency and reliability

Decided with the project owner on 2026-11-14 (grilling session). Terms follow `GLOSSARY.md`. Refines [focus and live media](focus-and-live-media-spec.md) and [video quality](video-quality-spec.md) where they conflict, and records its trade-off in [ADR 0002](adr/0002-audited-cuts-and-set-pieces.md). Everything not named here keeps its current behavior.

## Problem Statement

Videos fail too often, and when they fail the learner cannot tell why. The Remotion cut validator rejected almost every real cut, so every recent video failed with "Video cut breaks the style brief colors or fonts." (fixed in TreeTutor-tq7). The Manim validator has the same flaw. A Manim cut is only checked when it renders, after every other cut has been written, narrated and partly rendered. When a render fails, the repair call gets a fixed hint instead of the real error, so the second try is a guess. One failed cut fails the whole video, and Retry throws away the plan and every good cut and starts over, spending the same tokens again. The error names neither the cut nor the cause.

Videos that do finish look inconsistent. The plan names recurring objects only by name, position and colour, so each cut writer draws its own satellite or house and the objects change from cut to cut. Nothing checks a cut's layout after it is written: labels overlap, text runs into the subtitle strip, details are missing or unnecessary, and pen marks miss what they point at. The sketch pen is sometimes used to draw content, such as a house, instead of emphasising a point. Every cut dips to dark before the next, even when the scene simply carries on.

## Solution

- **Rules the model can follow.** The cut and Manim instructions explain exactly what the validator checks, so most cuts pass on the first try. The Manim validator, like the Remotion one, checks only literal colour and font text and accepts any expression built from kit values.
- **Early checks.** Every cut, Remotion or Manim, is checked the moment it is written. A failing cut gets one automatic repair that sees the exact error.
- **Set pieces.** The plan describes each recurring object's look. Before cuts are written, one call writes the video's set pieces as shared components; every Remotion cut uses them instead of drawing its own. Manim cuts follow the written descriptions.
- **Cut audit.** Each written cut gets one cut audit before it becomes playable. The audit sees the cut's code, still frames of the cut, the set pieces and the previous cut's last frame, and aligns the cut to the plan. It fixes overlaps, inconsistency, missing or unnecessary detail, and moves pen marks onto what the narration is talking about. Cut audits run at the same time for all cuts, so playback still starts with cut 1.
- **Joins.** The plan marks each cut as a continuing cut or a scene change. A continuing cut follows the previous cut with a hard cut. A scene change uses a transition the plan chooses.
- **Purposeful pen.** The pen is for emphasis, like a presenter underlining the point being made, and a visible pen tip draws each mark live.
- **Honest failure and cheap Retry.** A failed video names the cut and the reason. Retry keeps the plan and every good cut and rewrites only the failed ones.

## User Stories

1. As a learner, I want a requested video to finish rather than fail on a style technicality, so that I get the explanation I asked for.
2. As a learner, I want the model told the exact colour, font and import rules up front, so that cuts pass the check on the first try and cost fewer tokens.
3. As a learner, I want a Manim math cut that uses loop variables, helper functions, `t2c` or colour lookups by key to pass the check when it only uses kit colours, so that math cuts stop failing for no visible reason.
4. As a learner, I want a Manim cut that uses a foreign colour such as `'#ff0000'` or `RED`, or a non-house font, to still be rejected, so that every video keeps the house look.
5. As a learner, I want a bad Manim cut found right after it is written, so that its repair happens while other cuts are still being written instead of minutes later.
6. As a learner, I want a failed cut's repair to see the exact error with private paths removed, so that the second try fixes the actual problem.
7. As a learner, I want each cut tried at most twice, so that a broken video does not loop and spend tokens forever.
8. As a learner, I want a failed video to say which cut failed and why, for example "Cut 4 of 9: fill: 'white' is not a kit color", so that I know what went wrong.
9. As a learner, I want the failure message to tell me that Retry keeps the other cuts, so that I know retrying is cheap.
10. As a learner, I want Retry to keep the plan, narration and every good cut and rewrite only the failed cuts, so that a retry costs one or two calls instead of the whole video again.
11. As a learner, I want "Make a different version" to still start a fresh plan, so that I can get a genuinely different video.
12. As a learner, I want recurring objects such as a satellite, a router or a character to look the same in every cut, so that the video feels like one story instead of unrelated slides.
13. As a learner, I want set pieces defined once per video before cuts are written, so that every cut writer uses the same drawing.
14. As a learner, I want Manim cuts that show a set piece to follow its written description, so that a character or object stays recognisable even in a math cut.
15. As a learner, I want every cut checked for overlapping labels, text running off the frame and content in the subtitle strip before I see it, so that the video is readable.
16. As a learner, I want every cut checked for missing or unnecessary detail against what its narration says, so that each cut shows what is being explained and nothing distracting.
17. As a learner, I want each cut's start checked against the previous cut's end, so that objects do not jump between cuts.
18. As a learner, I want cut audits to align every cut to the plan rather than to each other, so that two audits running at once still meet at the same positions.
19. As a learner, I want cut audits for all cuts to run at the same time, so that waiting for audits does not make playback stall between cuts.
20. As a learner, I want cut 1 to start playing as soon as it has been audited, so that I still watch the video while the rest is prepared.
21. As a learner, I want an audit that breaks a cut to be discarded and the cut kept as it was before the audit, so that the audit can only improve a video, never fail it.
22. As a learner, I want Manim cuts audited from frames of their rendered clip, so that math layouts get the same check as other cuts.
23. As a learner, I want a failed cut's repair to also check continuity with the previous cut and the set pieces in the same call, so that one call fixes both and saves tokens.
24. As a learner, I want audit frames sent at a modest size and count, so that audits do not eat my token budget.
25. As a learner, I want a cut that continues the same scene to follow with a hard cut and no fade, so that it looks like one unbroken shot.
26. As a learner, I want a scene change to use a transition suited to the moment, such as a fade, slide, wipe, flip, clock wipe or iris, so that changes of scene feel intentional.
27. As a learner, I want the same joins and transitions in the live player and the saved MP4, so that what I watched is what the video library keeps.
28. As a learner, I want the sketch pen to underline, circle, point at or freehand-mark the thing the narration is talking about, so that I know where to look.
29. As a learner, I want the pen never used to draw the content itself, so that the pen stays a pointer and the cut carries the picture.
30. As a learner, I want a visible pen tip to draw each mark as if a person were drawing live, so that emphasis feels natural.
31. As a learner, I want pen marks placed where the point actually is in the finished cut, so that the pen never circles empty space.
32. As a learner, I want reduced motion respected for the pen tip and transitions as it is for other motion, so that the video stays comfortable.
33. As a learner, I want the video's progress phases to reflect set pieces and audits, so that I can tell the video is still working rather than stuck.
34. As a learner, I want cancel to stop set-piece writing, snapshots, audits and repairs as it stops other video work, so that cancelling is immediate and free.
35. As a learner, I want a video interrupted by an app restart during an audit to be marked interrupted like any other, so that nothing is left half-published.
36. As a learner, I want old saved videos to keep playing unchanged, so that new rules do not break my video library.
37. As the project owner, I want each audit, repair and set-piece call metered as video usage, so that usage history shows what a video cost.
38. As the project owner, I want renderer diagnostics stripped of private paths before any model sees them, so that private file locations never reach a provider.

## Implementation Decisions

- **Manim validator.** Uses the same rule as the fixed Remotion validator: it rejects only literal colour and font text in style positions, such as hex, `rgb()`, `hsl()`, common CSS colour names, Manim colour constants that are not from the kit, and fonts other than the house fonts. Any expression built from kit values passes, including loop variables, parameters, `t2c` dictionaries and lookups by variable key. Its errors name the offending argument, as the Remotion validator now does. The import, scene-shape, config, camera and disallowed-call rules are unchanged.
- **Early Manim check.** A check-only mode of the Manim entry point runs the validator in the existing render sandbox with no render. The cut writer calls it straight after a Manim cut is written, so Manim cuts use the same write-time repair path as Remotion cuts. The render-time check stays as defence in depth.
- **Instructions mirror the validator.** The Remotion cut and Manim instructions each gain one short rule block. It states that colour and font literals are checked; that colours come only from `colors.<role>`, `palette.<neutral>` or `series`; that fonts come only from `fonts.heading` or `fonts.reading`; and which imports are allowed. Each rule is worded as the validator checks it.
- **Attempts.** Each cut keeps two tries: the first write and one repair. A failed write-time check, a failed render and a failed snapshot all spend the repair. The repair input carries the error message. For render failures this is the first line of the diagnostic with absolute paths removed, instead of today's fixed hint.
- **Merged repair.** A repair is also that cut's audit. Its input holds the error, the failed code, the set pieces, the style brief and the previous cut's last frame (when that frame exists), with instructions to fix the error and check continuity. A repaired cut gets no further audit.
- **Plan schema.** Each recurring object gains a `look` description: shape, parts, proportions and size in frame pixels. Each cut gains a `join` of `continue` or `scene`. A cut whose join is `scene` gains a `transition`: one of `fade`, `slide`, `wipe`, `flip`, `clockWipe`, `iris`, plus a direction where the effect takes one. Cut 1's join is always `scene`. The plan validator rejects unknown values. Plans saved before this change, which have no joins, read as `scene` with today's fade.
- **Set pieces.** A new stage runs between the plan and cut writing. One Smart model call writes a single shared module that exports one React component per recurring object, typed by name, accepting at least position, scale and a highlight or state prop. It passes the same validator as cuts. Each Remotion cut workspace gets that module, and the cut instructions require using its components for every recurring object. If set-piece writing fails twice, the video fails with a named error, as a cut does. Manim cuts receive the `look` descriptions only.
- **Snapshots.** A new injectable snapshot step renders still frames of a staged cut in the existing render sandbox: one at the end of each narration sentence plus the cut's last frame, at 960×540. A Manim cut is rendered first, and its frames come from the rendered clip. Snapshots are private workspace files, and the existing cleanup removes them.
- **Cut audit.** Once a cut is written and narrated, it is snapshotted and audited. All cuts' audits run at the same time. Each audit is one Smart model call with images. It receives the cut's code, its snapshots, the set pieces, the style brief, the cut's plan entry, the previous cut's planned end state and the previous cut's last frame from before that cut's audit. The plan is the target: the audit moves whatever deviates from the plan's positions, `look` and end state, and leaves alone whatever already matches. It may also change the cut's emphasis marks to sit on the content they point at. It returns either "no change" or full replacement code with optional replacement marks. Replacement code goes through the validator and the next stage. If the replacement fails the check or the render, the cut from before the audit is used. An audit never fails a video.
- **Playable.** A cut becomes playable only after its audit is settled: no change, fix accepted, or fix discarded. This changes the "playable once written and narrated" rule of ADR 0001 and is recorded in ADR 0002.
- **Phases.** The live phases gain set-piece writing and auditing, with the existing counts-only details ("auditing cut 3 of 9"). Phases still only advance.
- **Joins in playback.** The cut wrapper and the live player read each cut's join. A continuing cut has no exit or entry fade: the previous cut holds its end state through the pause and the next starts directly. A scene change plays the chosen transition from `@remotion/transitions` one cut at a time: the outgoing cut plays the transition's exiting side over its pause, then the incoming cut plays its entering side. They never overlap. The final MP4 join uses the same timing, so the saved video matches what played live. Reduced motion turns every transition into the existing short fade.
- **Dependency.** Add `@remotion/transitions` pinned to the installed Remotion version.
- **Pen.** The sketch tools stay as circle, underline, arrow and freehand. The plan and cut instructions say the pen exists to emphasise what the narration is currently about, like a presenter marking a slide, and must never draw content. The overlay draws a pen tip that rides the end of the stroke while a mark draws, then lifts away. Under reduced motion the tip is hidden.
- **Retry.** Retry on a failed video, without "different version", reuses that attempt's saved plan, set pieces, written cuts, narration and timing. Every cut not marked failed is kept. Only failed cuts, and set pieces if they failed, are written again, followed by their audits. Retry still creates a new attempt, so ownership, cancel and late-output rules are unchanged. Media from the previous attempt is copied into the new attempt's workspace, never shared. "Make a different version" keeps today's fresh plan.
- **Failure messages.** A failed video's stored error has the form "Cut N of M: <reason>. Retry keeps the other cuts." for cut failures, and "Set pieces: <reason>. Retry keeps the plan." for set-piece failures. The reason is the validator, render or provider message with private paths removed. Provider and sign-in failures keep their existing next-step wording.
- **Metering.** Set-piece, snapshot-audit and repair calls are metered as `video` usage with stage values `pieces`, `audit` and `repair` beside the existing `plan` and `cut`.

## Testing Decisions

- Test external behaviour only: what the app stores, plays, reports and sends to the provider. Do not test internal call order or helper shapes.
- **The app's video job (main seam).** Run through the existing test environment with a fake provider and fake render, narration and Manim, as the live, recovery and failure video tests do. Add one new injectable fake, `videoSnapshot`, beside `videoRender`, returning small still images. Cover:
  - set pieces written once and staged into every Remotion cut;
  - a Manim cut rejected right after writing and repaired before rendering;
  - the repair input carrying the error with paths removed;
  - an audit's fix replacing a cut before it becomes playable;
  - a broken audit fix falling back to the cut from before the audit;
  - a merged repair skipping the audit;
  - audits starting together, not one after another;
  - Retry rewriting only the failed cut and making no plan call;
  - a different version still planning fresh;
  - the "Cut N of M" error;
  - cancel during set pieces, snapshots and audits;
  - joins and transitions present in the live cut data.
- **Plan and validator (pure).** The existing plan and validator tests and the Manim validation script cover the new plan fields and the Manim validator rule, with realistic passing patterns and foreign-colour and foreign-font failures.
- **Kit timing (pure).** The existing emphasis and live-player tests cover the pen tip's position along the stroke and its lift, and the exiting and entering progress of each join type, including reduced motion.
- **Instruction text.** As the visual prompt tests do, assert that the cut and Manim instructions contain the validator rule block, and that the plan and cut instructions state the pen's purpose.
- No browser or E2E tests. The real render runs only under the existing render test script.

## Out of Scope

- True overlapping transitions with both cuts on screen at once (deferred).
- A cheaper model for cut writing, set pieces or audits. All video calls stay on the Smart model.
- A whole-video audit after all cuts are done, or more than one audit pass per cut.
- An automatic layout measurement check before the audit.
- Re-auditing a cut the learner has already watched.
- Changes to visuals, Mermaid diagrams, narration voice or subtitles.
- The other feedback items from the same session: visual streaming status, map and chat switching, error wording elsewhere, preset defaults, the top bar button and the hover popup.

## Further Notes

- The Remotion validator fix shipped separately as TreeTutor-tq7 and is the model for the Manim fix.
- Codex reports no token counts for video calls, so the token saving from cheap Retry and early checks cannot be shown in usage history for Codex yet.
- Audit images are about 400 tokens each at 960×540. A nine-cut video with about four sentences per cut sends about 45 images, roughly 18k tokens.
