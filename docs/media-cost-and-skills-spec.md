# Media cost, speed and skills

Decided with the project owner on 2026-11-15 (grilling session). Refines the [workspace and media refinement spec](workspace-media-refinement-spec.md), the [video consistency spec](video-consistency-spec.md) and the [inline visuals spec](inline-visuals-spec.md) where they conflict; everything not named here keeps its current behavior. The model role change is recorded in [ADR 0004](adr/0004-chat-model-writes-media-smart-model-reviews.md). Skill sources are shortlisted in [the skills research](research/model-skills-shortlist.md).

## Problem Statement

Media works, but it costs too much and feels slow and uneven:

- A citation chip in a reply looks clickable but only scrolls the Contents panel; the learner expects it to open the resource's page.
- Some visuals show every stage at once and still carry Previous/Next step controls that do nothing useful.
- A visual sits silent for 30 seconds or more before anything draws, because the smart model reasons at the smart effort before its first token.
- During a live video the learner often finishes a cut and then stares at a buffering screen until the next cut is ready, even though every cut is already written, narrated and audited in parallel. Cuts simply finish at different times, and playback starts as soon as cut 1 is ready.
- Asking for a 3D video still produces 2D. The plan has no dimension field, every cut writer decides the dimension again on its own, and the planner sees the chat model's paraphrased request rather than the learner's words.
- The smart model does all of a video's output-heavy work (set pieces, every cut's code, every audit fix) and every visual, which is where most of the cost goes. Recurring objects such as a satellite or a house are redrawn from scratch in every video.
- The tutor and the media models get no craft guidance beyond the app's own prompts, so replies read like a robot rather than a teacher, prose carries AI writing tells, and animations and visuals fall back on generic, sloppy patterns.

## Solution

- A citation chip opens its resource's original page in a new tab. The Resources list in Contents stays the index.
- A visual uses step controls only when its stages replace or build on each other in place; a visual that shows every stage at once has none.
- The chat model writes visuals instead of the smart model, in the same separate streaming call as today, so visuals cost chat-model rates and start drawing after the chat model's own thinking time.
- A live video starts playing once cuts 1 and 2 are both playable (or the whole video when it has two cuts or fewer). If a later cut is still not ready when the previous one ends, the player freezes on the finished cut's last frame with a small loading mark in a corner and carries on the moment the next cut is ready, instead of swapping to a separate buffering screen.
- The plan states 2D or 3D for each cut, and cut writers follow it. The planner receives the learner's own message, so an explicit request for 2D or 3D wins for the whole video; otherwise 3D is used only where space, depth, rotation or orientation is the point of the cut.
- The smart model plans each video and audits its cuts. The chat model writes set pieces and cut code and applies audit fixes. A cut audit reports issues only and never rewrites a cut; only a flagged cut goes back to the chat model for a fix.
- Set pieces go into a local **piece library** shared across all learning trees. For each recurring object a new video reuses a close match, derives a variant from one, or draws a new piece. A cut audit that finds a saved piece poor rewrites it, replacing the library entry for future videos. A read-only Pieces tab in the Videos view shows every saved piece with a live preview and its code.
- Every chat model and media model receives hidden, fixed **skills** for its kind of work: teaching and natural writing for the tutor and the video narration, Remotion, Manim and visual craft for the writers. The learner never sees or edits them; the tutor style stays the learner's own layer on top.

## User Stories

1. As a learner, I want to click a citation chip and land on the resource's original page in a new tab, so that the chip does what it looks like it does.
2. As a learner, I want the Resources list in Contents to keep listing every resource, so that I can still browse what the tutor drew on.
3. As a learner, I want a visual that already shows all its stages to have no step controls, so that I am not offered buttons that change nothing.
4. As a learner, I want a visual that animates a process stage by stage to keep its Previous/Next controls, so that I can still step through it.
5. As a learner, I want a visual to start drawing soon after the tutor asks for it, so that I am not left staring at an empty frame for half a minute.
6. As a learner, I want visuals to keep streaming into their frame as they are written, so that I see progress while the reply continues.
7. As a learner, I want my reply text to keep streaming while a visual is drawn, so that a visual never holds up the explanation.
8. As a learner, I want visuals to follow the conversation's chat model and effort, so that I control their speed and cost from the model I already chose.
9. As a learner, I want "Try a different version" on a visual to keep working, so that I can retry a weak visual.
10. As a learner, I want a live video to wait until its first two cuts are ready before it starts, so that playback does not stall right after the first cut.
11. As a learner, I want a short video of one or two cuts to start once the whole video is ready, so that it plays through without a stall.
12. As a learner, I want a late cut to freeze the video on the last picture of the cut that just ended, so that the video never blinks to a separate loading screen.
13. As a learner, I want a small loading mark while the video is frozen, so that I know the next part is on its way and nothing broke.
14. As a learner, I want playback to continue into the next cut as soon as it is ready, so that I do not have to press play again.
15. As a learner, I want the planner to see my own words, so that "make it 3D" survives the tutor's paraphrase.
16. As a learner, I want an explicit request for 3D or 2D to apply to the whole video, so that my request is honoured.
17. As a learner, I want spatial subjects such as orbits, rotation, solids and molecular structure to use 3D when I did not ask either way, so that the video explains them properly.
18. As a learner, I want ordinary explanations to stay 2D when I did not ask either way, so that videos stay quick and cheap.
19. As a learner, I want every cut of a video to follow the dimension its plan states, so that one cut does not quietly fall back to 2D.
20. As a learner, I want videos to cost less, so that I can make more of them.
21. As a learner, I want the expensive model to plan and review videos while the chat model writes their code, so that the costly output is short.
22. As a learner, I want a cut audit to point out what is wrong without redesigning the cut, so that the cut keeps what it was meant to show.
23. As a learner, I want only a flagged cut to be rewritten, so that good cuts are not paid for twice.
24. As a learner, I want a flagged cut's fix to carry the audit's issues, so that the fix addresses exactly what was wrong.
25. As a learner, I want recurring objects drawn in an earlier video to be reused when they fit, so that the app does not redraw a satellite every time.
26. As a learner, I want a recurring object that nearly fits to become a variant of a saved piece, so that reuse still adapts to the new video.
27. As a learner, I want a recurring object with no close match to be drawn new and saved, so that the library grows with my studies.
28. As a learner, I want a reused piece to take the new video's colours, so that it fits the new video's palette roles.
29. As a learner, I want a poor saved piece to be improved when an audit spots it, so that an early bad drawing does not haunt every future video.
30. As a learner, I want improvements to apply to future videos only, so that saved videos keep how they looked.
31. As a learner, I want the library to start empty, so that old pieces that do not colour by role never appear in new videos.
32. As a learner, I want the library search to run locally, so that finding pieces needs no key and costs nothing.
33. As a learner, I want the app to download only one pinned, checked embedding model, so that nothing unvetted runs on my machine.
34. As a learner, I want a video to still be made when the embedding model is unavailable or fails its check, so that the library is a saving and never a blocker.
35. As a learner, I want a Pieces tab in the Videos view, so that I can see the components the app has collected.
36. As a learner, I want each piece in the Pieces view to show its name, look, the videos that use it and when it was last improved, so that I understand where it came from.
37. As a learner, I want to open a piece and see a live preview, so that I see what it looks like.
38. As a learner, I want to read a piece's code read-only, so that I can inspect it without risk of breaking it.
39. As a learner, I want the tutor to explain like a good teacher, so that replies check my understanding and build up ideas rather than dumping facts.
40. As a learner, I want the tutor to still answer directly when I ask for an answer, so that teaching guidance never withholds help.
41. As a learner, I want the tutor to separate what it knows, what it infers and what is unknown, so that I can trust what it says.
42. As a learner, I want replies and narration free of AI writing tells, so that they read like a person wrote them.
43. As a learner, I want video narration to teach out loud the way the tutor does, so that videos explain rather than recite.
44. As a learner, I want my tutor style to keep working on top of the app's skills, so that my own preferences still apply.
45. As a learner, I want skills to stay hidden and fixed, so that I cannot break the app's craft guidance by accident.
46. As a learner, I want Remotion cuts to follow Remotion's own best practices for timing, animation and 3D, so that motion and 3D scenes look right.
47. As a learner, I want 3D-specific guidance only in 3D cuts, so that 2D cuts do not pay for rules they do not use.
48. As a learner, I want Manim cuts to follow Manim best practices, so that math animations are clean.
49. As a learner, I want visuals to avoid generic AI-looking design, so that they look made for the idea.
50. As the project owner, I want every vendored skill excerpt pinned to a commit with its licence and attribution kept beside it, so that the app stays within each licence.

## Implementation Decisions

### Citation chips and step controls

- A citation chip is a link to its resource's original page, opened in a new tab with no opener and no referrer, like the image credit already is. It no longer scrolls to the Contents entry.
- The visual prompt states that the step helper is for stages that replace or build on each other in the same place over time; a visual that shows every stage at once uses no step helper. The helper itself does not change.

### Visuals on the chat model

- A visual request takes the conversation's current chat model and effort as its selection, instead of the smart model's. The call stays a separate, detached, streaming one-shot call with its own small context (the request and earlier visual titles) and the visual skill; nothing moves into the reply stream.
- The existing rules about missing models still apply: with no usable chat model there is no reply either, so the smart-model check for skipping visuals no longer gates them.
- Explicit Retry and "Try a different version" keep their selection rules: newer visual jobs keep the selection they were frozen with.
- No separate visual effort setting is added.

### Live playback

- The live phase becomes playable only when cuts 1 and 2 are both playable, or every cut when the video has two cuts or fewer. The rest of the live phase reporting is unchanged.
- When playback reaches a cut that is not playable, the player keeps showing the previous cut's last frame with a small loading mark, holds the timeline, and resumes automatically when the cut becomes playable. The separate buffering screen is removed for this case. The mark is announced once to assistive technology, not repeatedly.

### Dimension

- Each planned cut carries a required dimension of `2d` or `3d`. The plan parser rejects a plan without it, like any other invalid plan field.
- The planner's task gains the learner's own message text (trimmed to the existing intent limit) alongside the request and intent.
- Planner rule: an explicit learner request for 2D or 3D applies to every cut; otherwise 3D only where space, depth, rotation or orientation is the point of the cut, and 2D for everything else. Manim cuts are always 2D; 3D cuts use the Remotion engine.
- The cut writer instruction drops its own dimension decision and follows the cut's stated dimension. 3D guidance in the cut writer's instructions and skill is included only for 3D cuts.

### Model roles in a video

- A video job freezes two selections at creation: the smart model (plan, cut audits, piece improvement) and the conversation's current chat model and effort (set pieces, cut code, validation repairs, audit fixes). Both are kept across attempts and Retry, as the single selection is today. Legacy jobs with one selection use it for both roles.
- Usage is metered per call under the selection that made it, so the usage history attributes cost to the right model.
- The cut audit returns either "ok" or a short list of issues (each naming what is wrong and where), never code. On issues, the chat model rewrites the cut once with the issues, the plan, the set pieces and the previous cut's last frame. A rewrite that fails validation or rendering keeps the cut as it was, as the audit's failed fix does today. The audit stays a single review per cut.
- The repair loop for cuts that fail validation or rendering stays as it is, run by the chat model.

### Piece library

- A saved piece is one exported component with: a name, its look description, its props (at least position, scale, highlight and state, as set pieces already take), its source, the palette roles it uses, the embedding of its look, the videos that use it, and when it was created and last improved. It colours itself only through palette roles, so each video's brief maps those roles to its own inks.
- Pieces are stored in the app's SQLite store. Embeddings are stored as blobs and searched with a plain cosine scan; no vector database or extension.
- Embedding model: `Xenova/all-MiniLM-L6-v2` through `@huggingface/transformers`, downloaded on first use, pinned to one commit and checked against SHA-256 hashes recorded in the repo. A mismatch or failed download refuses the model. The embedder is a single injected function from texts to vectors, so tests use a fake one.
- Flow: after the plan is saved, each recurring object's look is embedded and its top 5 library matches are fetched. The set-piece step (chat model) receives those matches with their source and, for each recurring object, chooses reuse (an existing piece as is), variant (a new piece derived from one) or new. It writes code only for variants and new pieces. Variants and new pieces are saved to the library when the video's set pieces are accepted.
- Without a usable embedder, the set-piece step receives no matches and draws every piece new; new pieces are still saved, without an embedding, and are embedded the next time the embedder is available.
- Improvement: a cut audit may also flag a saved piece used by the cut as poor. The smart model then rewrites that piece, and the rewrite replaces the library entry for future videos once it validates. The current video keeps the piece it started with. Already saved videos are rendered files and never change.
- The library starts empty; pieces from earlier videos are not imported. Only Remotion cuts use set pieces, so the library holds Remotion pieces only.
- The Pieces view is a tab in the Videos view, next to the video library. It lists saved pieces with name, look, the videos using them and last-improved time. Opening a piece shows a live preview, rendered in the same isolated, network-denied player frame the live video player uses, and its source read-only. There is no edit or delete.

### Skills

- A skill is fixed guidance text vendored into the app and added to a call's instructions by kind of work. Skills are not shown in Settings and cannot be edited. The tutor style is appended after the tutor's skills, and the fixed safety and media rules still come first.
- Instructions are ordered with the fixed text (rules, then skills) before any per-call data, so provider prompt caching covers them.
- Slots and picks, each vendored as a trimmed excerpt pinned to the commit in the research file:
  - Tutor (every chat model reply): the teaching skill from `nweii/agent-stuff` `teach-me` (MIT), softened so the tutor still explains directly when asked, plus the fact / inference / unknown rule from `ce-explain`; and the humanizer pattern list from `blader/humanizer` v3.1.0 (MIT), the 26 pattern names with one-line rules only.
  - Video planner (narration): the same teaching and humanizer skills, plus `manim-composer`'s teaching notes for plans with Manim cuts (MIT).
  - Remotion cut writer and set-piece writer: `remotion-dev/skills` general rules and timing guidance, plus its 3D guidance for 3D cuts only, under the Remotion License (free for this personal and open-source use), with the generic font and colour advice removed because the house kit fixes both.
  - Manim cut writer: the Best Practices sections of `adithya-s-k/manim_skill` `manimce-best-practices` (MIT), without its 3D, colour and config parts.
  - Visual writer: the existing visual prompt plus an excerpt of `anthropics/skills` `frontend-design` (Apache-2.0), without its two banned-look examples that resemble the house dark-paper and amber look, and with a note that the text was changed.
- Each vendored skill keeps its licence text and a source note (repository, path, commit, retrieval date, what was excluded) next to the prompts, following the existing OpenIntelligentUI attribution note. The Wikipedia "Signs of AI writing" page is not copied.

## Testing Decisions

- Tests check behaviour at the highest existing seam and never assert prompt wording beyond the presence of a rule or skill.
- **Video generation with fake providers** (prior art: the existing video job, cut, audit, pieces and repair tests and the video test kit) proves: which selection makes each call (smart for plan, audit and piece improvement; chat for set pieces, cuts, repairs and fixes); an "ok" audit leaves the cut unchanged and makes no extra call; an audit with issues produces exactly one chat-model rewrite carrying those issues; a failed fix keeps the cut; the planner task includes the learner's message; a plan without a cut dimension is rejected; 3D guidance reaches only 3D cuts; the expected skills reach each call; reuse, variant and new decisions save the right pieces; an audit flagging a piece replaces the library entry but not the current video's piece; a missing embedder still produces a video; legacy single-selection jobs still run.
- **Store in-process with a temporary database** (prior art: the store tests) proves saving pieces, storing and reading embeddings, top-5 cosine ranking, and recording which videos use a piece.
- **Embedding loader unit tests** with a fake download prove a hash mismatch refuses the model and a matching download is accepted.
- **Live player component tests** (prior art: the live player and video progress tests) prove playback waits for two playable cuts (or all cuts for short videos), freezes on the last frame with the loading mark when the next cut is not ready, and resumes when it is.
- **Visual job tests with a fake provider** (prior art: the visual detach and request tests) prove visuals use the conversation's chat selection and still stream partial markup.
- **Component tests** prove a citation chip is a new-tab link to its resource's page, and the Pieces view lists pieces and shows the preview frame and read-only source.
- No browser scripts are required. The owner judges output quality and cost by hand; there is no automated quality comparison of the old and new model split.

## Out of Scope

- An automated check that the chat model writes cuts as well as the smart model did; the owner compares by hand and reverts if needed.
- A setting to switch between the old and new model split, or a separate visual effort.
- Editing or deleting pieces from the Pieces view.
- Importing set pieces from earlier videos into the library.
- A piece library for Manim cuts or for visuals.
- Caching whole visuals or whole cuts.
- Provider embedding APIs or a vector database.
- Learner-visible or learner-editable skills, and loading skills on demand through tools.
- Re-rendering existing videos.

## Further Notes

- The research file records each skill's exact commit, licence, size and exclusions; implementation vendors from those commits and re-checks the licence files at vendoring time.
- Whether pages can take over `Ctrl+Shift+O` is a sidebar concern and is covered in the [sidebar spec](sidebar-spec.md).
- If the chat model's thinking time still makes visuals slow, the next lever is a lower effort on that one call; this spec does not add it.
