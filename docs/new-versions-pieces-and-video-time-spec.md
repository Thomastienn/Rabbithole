# New versions, piece reuse, video time and more visuals for hard ideas

Decided with the project owner on 2026-11-24 (grilling session). Terms follow `GLOSSARY.md` (learner, tutor, visual, new version, video, cut, set piece, part, piece library, smart model, chat model, video mode). Respects ADR 0002 (audited cuts and set pieces), ADR 0006 (set pieces built from parts), ADR 0013 (structured output through tool calls) and ADR 0017/0018 (markers place and carry visuals).

The prompt wordings below are proposals, not benchmarked. No ticket under this spec calls a real model (`docs/agents/testing.md`, Real models); the owner may benchmark a wording in a planning session before its ticket ships.

## Problem Statement

"Try a different version" on a visual redraws it blind. The model receives only the original request and the line "take a different approach than the previous version"; the old visual's source is wiped before the call, so the model cannot know what it is replacing, and the old one is lost. The learner cannot say what they want changed, such as "show it as a graph" or "make the labels bigger". Videos behave the same way.

The piece library almost never reuses. In 100 saved pieces, one was ever reused (a spark plug). Earth, Moon, MarsGround and six engine parts each exist twice. The video plan writes every recurring object's look before the library is searched, so a new video describes "Earth, 50 px, blue oceans" while the saved Earth is "460 px, muted oceans"; the piece writer may reuse only a piece that draws the look as is, so it draws a new one and saves it under the same name. Nothing records why a piece was or was not reused.

A video's generation time disappears once it finishes: the elapsed clock lives only in memory, and the video's Usage shows tokens only.

After a video, the tutor knows only its id, title and description. It does not know what the narration said, so it cannot refer back to it.

Replies about hard, abstract ideas, such as database normalisation or a proof, often come as text only. The tutor's visual rule lists structures, processes, quantities, comparisons and spatial ideas, and says nothing about ideas that are hard to grasp.

## Solution

"Try a new version…" on a visual or video opens a small box for an optional instruction. The new version is made from the current one: a visual's model receives the current source, a video's planner the current plan, together with the learner's instruction, or, when the box is empty, a request to take a different approach. The version it replaces is kept; a "Previous version" switch shows it again, and switching back makes it current. Only one previous version is kept.

Before the plan writes its looks, each recurring object is matched against the piece library, and the planner sees the top matches, by name and short look, so it can adopt a saved piece instead of describing a clashing one. The piece writer then reuses a saved piece as is, improves it into a new version of the same piece, or draws a new piece, and every choice is recorded with its reason. A one-time cleanup folds the existing duplicate names into one piece each.

A video records when it started and when it became playable. Its Usage shows "Made in 6 min 12 s" above the table, and the table gains a time column per stage.

After a video, later turns carry its narration script, so the tutor knows what the video said.

The tutor's visual rule gains one loose sentence: ideas that are hard to grasp deserve more visuals.

## User Stories

1. As a learner, I want "Try a new version…" to take an optional instruction, so that I can say what to change.
2. As a learner, I want the new version made from the current one, so that it fixes what I pointed at instead of starting over blind.
3. As a learner, I want an empty instruction to still give me a different take, so that I can ask for another idea without typing.
4. As a learner, I want the previous version kept, so that a worse redraw never costs me the one I had.
5. As a learner, I want one switch to go back to the previous version, so that I can compare and choose.
6. As a learner, I want switching back to make the previous version current, so that the next new version builds on the one I chose.
7. As a learner, I want only one previous version kept, so that the choice stays simple.
8. As a learner, I want visual parts, steps and branches from a visual to keep working on whichever version is current, so that asking about a part still works.
9. As a learner, I want the same "Try a new version…" on a video, so that I can redirect a video too.
10. As a learner, I want a video's new version to follow my instruction in its plan, so that a request like "slower, with more about the reactor" reaches the planner.
11. As a learner, I want a video's new version to use the current video mode, as a Retry does, so that it costs what I chose.
12. As a learner, I want the instruction box to be keyboard accessible and to submit with Enter, so that redrawing is quick.
13. As a learner, I want the same Earth in every space video, so that my library feels consistent.
14. As a learner, I want a saved piece reused when a new video needs the same object, so that videos finish sooner and cost less.
15. As a learner, I want a reused piece improved when the new video needs more of it, so that pieces get better over time.
16. As a learner, I want an improved piece saved as a new version of the same piece, so that my library holds one Earth, not many.
17. As a learner, I want saved videos to keep how they looked when a piece improves, so that old videos never change.
18. As a learner, I want my existing duplicate pieces folded into one each, so that the library view stops showing two Moons.
19. As a learner, I want the planner to see only the closest saved pieces, not the whole library, so that planning stays fast and cheap.
20. As the owner, I want every reuse, improve or new choice logged with its reason, so that I can see whether reuse works.
21. As the owner, I want the reuse choice counted per video, so that I can measure the reuse rate.
22. As a learner, I want to see how long a video took to make, so that I know what to expect next time.
23. As a learner, I want that time to end when the video became playable, not when I exported it, so that the number means generation time.
24. As a learner, I want the time each stage took next to its tokens, so that I see where the time went.
25. As a learner, I want a new version or Retry to restart the clock, so that the time matches the version I see.
26. As a learner, I want the tutor to know what a video's narration said, so that I can ask about something the video mentioned.
27. As a learner, I want the cut code and plan details kept out of the conversation, so that the tutor's context stays small.
28. As a learner, I want more visuals when the idea is hard to grasp, such as abstract maths or database theory, so that I understand it sooner.
29. As a learner, I want short factual answers and casual turns to stay text only, so that visuals appear where they help.
30. As a learner, I want the visual rule to stay a loose guide, not a quota, so that replies don't fill with forced pictures.

## Implementation Decisions

### New version of a visual

- The visual's "..." menu item "Try a different version" becomes "Try a new version…". Choosing it opens a small inline box under the visual with one optional text field (at most 500 characters), a "Make new version" button and Cancel.
- The regenerate route accepts an optional `instruction` string. It is trimmed; an empty string counts as none. It is validated at the trust boundary for length and type.
- Before the redraw, the artifact's current source, title and description move into a single `previous` slot on the artifact, replacing any earlier previous version. The frozen input keeps the original request and records the instruction.
- The visual call receives the current version's source as the version to change, plus either "Change it as the learner asks: <instruction>" or, with no instruction, the existing "take a different approach" line. The validation retry path (`previousFragment`) stays as it is.
- A "Previous version" switch appears in the visual's "..." menu while a previous version exists. Switching swaps current and previous, so the learner can switch again.
- Branches, visual parts and steps follow the current version. A branch made from a part of the other version keeps its passage text, as a branch from any edited reply does.

### New version of a video

- The video card's menu gets the same item and box. The regenerate route takes the same `instruction`.
- The video's planner receives the current plan and the instruction, or the "different approach" line when there is none. The cuts are redrawn from the new plan as today.
- The current playable cuts, plan and narration move into the single `previous` slot, so the "Previous version" switch can bring them back without redrawing. Exported MP4 files are untouched.
- Video mode is read when the new version starts, as for a Retry.

### Piece reuse

- Matching moves before looks are written. For each recurring object the plan names, the server embeds the object's name and role and takes the top 5 nearest pieces, as `nearestPieces` does now, and gives the planner their names and short looks, never their source.
- The planner's rule: when a match is the same real object, adopt the saved piece's look and name it as the piece to start from; describe a new look only for a different object or when the saved look cannot serve this video.
- The piece writer keeps its single call per object, now receiving the chosen piece's full source as input. It returns one of `reuse` (no new output), `improve` (a new version of the same piece) or `new`, with a one-line reason. Reusing moves the work from output tokens to input tokens.
- `improve` stores a new version under the same piece identity; future videos get the newest version, and saved videos keep the version they were made with. `new` creates a new piece.
- Each choice is saved with the video: piece, choice and reason. The log line names the choice and the reason.
- A one-time cleanup, run once at startup after the migration, folds pieces that share a name into one piece. It keeps the newest as the current version, keeps the others as older versions, and repoints video links. It backs up the database file first and skips itself on later starts.

### Video time

- The video job's start time and the time it became playable are saved on the artifact. A Retry or new version overwrites both. Export does not change them.
- Each stage's start and end are saved with its usage rows, so the Usage table can show a time per stage.
- The video's "..." Usage shows a line "Made in 6 min 12 s" above the table, and the table gains a Time column. A video made before this change shows no time line.

### Narration in later turns

- The artifact metadata that later turns carry for a ready video gains a `narration` field: the full narration script as plain text. Visuals gain nothing.

### Visual rule

- One sentence is added to the visual marker rule and the legacy visual rule. Proposed wording: "When an idea is hard to grasp, such as an abstract or mathematical one, lean on more visuals; the harder it is for this learner, the more a picture helps."

## Testing Decisions

- Good tests check what the learner or the next model call receives, not how it is assembled.
- **Seam 1: the media routes in process.** `createApp` with a temp database and the fake visual and video providers. Regenerate with and without an instruction. Assert the call input holds the current source and the instruction, the previous slot holds the old version, the switch swaps them, and a second new version replaces the previous slot. Prior art: `test/media/video-regenerate.test.mjs`, `test/media/visuals-prompts.test.mjs`.
- **Seam 2: piece drawing.** The piece step with fake model calls and a store holding saved pieces. Assert the planner input lists the top matches without source, that each choice creates no new piece, a new version, or a new piece, and that choices are saved with reasons. Prior art: `test/media/video-pieces.test.mjs`, `test/media/video-piece-library.test.mjs`, `test/media/video-piece-improve.test.mjs`.
- **Cleanup:** a store test with duplicate-named pieces linked to two videos. Assert one piece remains with both versions and both links, and a second run changes nothing. Prior art: `test/store/pieces.test.mjs`.
- **Time:** a store test for start and playable times surviving a restart and being overwritten by a Retry, plus a component test for the Usage time line and column. Prior art: `test/usage/usage-replies.test.mjs`.
- **Narration:** a unit test of the tutor context for a message with a ready video. Prior art: `test/media/artifacts-steps.test.mjs`.
- **Visual rule:** a unit test that both visual rules contain the new sentence.

## Out of Scope

- A full version history, or more than one previous version.
- A new version for diagrams (older Mermaid diagrams).
- Editing a visual's code by hand.
- Exhibits and reference photos, which are not set pieces.
- Any change to how cuts are audited.
- Time spent exporting an MP4.

## Further Notes

- Measured on 2026-11-24 from the owner's data: 100 pieces, 9 duplicated names, 1 reuse ever.
- The owner's preference for loose prompt wording over strict rules (rejected: "at least one visual in every math reply") applies to every prompt change in this spec.
