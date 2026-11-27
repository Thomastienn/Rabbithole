# Board sketches, spotlight and pacing

Decided with the project owner on 2026-11-27 (short grilling session). Terms follow `GLOSSARY.md`: learner, tutor, reply, sketch, board, board page, board item, check-in, learner-led, tutor-guided, spotlight. Decisions in force: ADR 0028 (board items are placed by coordinates) and ADR 0029 (the board is a pool of pages). This spec adds to `docs/board-spec.md` and `docs/board-pages-and-check-ins-spec.md`.

No prototype or benchmark was run for this spec. Model quality for the new ops and the prompt wording is judged in a planning session, only when the owner asks for it. No ticket under this spec calls a real model (`docs/agents/testing.md`, Real models).

## Problem Statement

The board draws slowly and plainly. It has six components (axes, number line, flow, tree, table and Venn); everything else the tutor builds by hand from boxes, circles, lines and text, placing each one with coordinates. A cycle, a stack of layers, a timeline, a bar chart or who sends what in a protocol takes many ops and many sentences. It rarely looks planned, and the learner waits through the building instead of watching the idea.

When the board does fill up, the learner cannot tell where to look. Every item stays equally bright, so the part the tutor is talking about is lost among the parts it already explained.

The voice makes it harder. Every sentence is said at the same pace and the next one follows at once, so a key idea sounds like a passing remark, and a formula comes as fast as small talk. The tutor also says more than it needs to, so there is no room to look at the drawing. A learner who takes ideas in by watching and listening gets all of it at once and struggles to follow.

## Solution

The board gets the chat's sketch kinds that it does not have yet: cycle, stack, timeline, bars, compare, parts, sequence, quadrant, pie, spectrum and equation. Each is a board component: the tutor gives its box, then adds one child per sentence, and the component lays its children out in the board's own style, reflowing as each one arrives. A sketch builds in front of the learner, in step with the words, and never appears all at once. Each child is a board item, so the tutor can highlight or point at it and the learner can circle it.

While the tutor speaks, the board uses a spotlight: the items the tutor is talking about stay bright and the rest of the page dims. The moment the tutor stops and waits, for a question, a check-in or the end of its reply, or when the learner pauses or cuts in, the whole page comes back, so the learner always gets the overview when it is their turn.

The voice breathes. The board leaves a short beat after each sentence, and a longer one before a new page, before a new component and after a key idea. It says formulas and key ideas a little slower. The tutor can mark the one sentence that carries the key idea, and it is said slowly. The prompt asks the tutor to say less and let the drawing carry more, without a word limit, and to keep each page to about seven items and each label to a few words.

## User Stories

### Sketches on the board

1. As a learner, I want the tutor to draw a cycle as a ring of stages with arrows back to the start, so that I see the loop instead of hearing it described.
2. As a learner, I want the tutor to draw a stack of layers, top first, with a short note on each, so that I see what sits on what.
3. As a learner, I want the tutor to draw a timeline with events in order, so that I see when things happened and how far apart.
4. As a learner, I want the tutor to draw bars with real numbers and units, so that I see how quantities compare.
5. As a learner, I want the tutor to draw a comparison of two things aspect by aspect, so that I see where they differ.
6. As a learner, I want the tutor to draw a whole and its parts, each with what it does, so that I see how something is made up.
7. As a learner, I want the tutor to draw a sequence of messages between actors, so that I see who sends what, in order.
8. As a learner, I want the tutor to place items on a two-axis quadrant, so that I see where each sits on two scales at once.
9. As a learner, I want the tutor to draw a pie of shares of one whole, so that I see the proportions.
10. As a learner, I want the tutor to place items in order along a spectrum between two ends, so that I see where each falls on a range.
11. As a learner, I want the tutor to write an equation and label what each symbol means, so that I can read the formula and not just see it.
12. As a learner, I want a sketch to build one piece per sentence, so that each piece arrives with the words about it.
13. As a learner, I want the earlier pieces of a sketch to move smoothly when a new one arrives and the sketch rearranges, so that the picture stays tidy as it grows.
14. As a learner, I want every piece of a sketch to stay inside the sketch's box, so that a growing sketch never spills over other items.
15. As a learner, I want sketches drawn in the board's own style and theme, so that a page reads as one drawing, not a chat card stuck on a whiteboard.
16. As a learner, I want sketches to redraw when I switch theme or appearance, so that they never show the old colours.
17. As a learner, I want the tutor to highlight or point at one piece of a sketch, so that I know which piece it is talking about.
18. As a learner, I want to circle one piece of a sketch with the pen and ask about it, so that I can ask about exactly the piece I mean.
19. As a learner, I want the tutor to erase a single piece of a sketch or the whole sketch, so that the board can move on without clutter.
20. As a learner, I want a piece the board cannot draw to be left out quietly, so that I never see a broken sketch or an error on the board.
21. As a learner who turned on reduced motion, I want sketch pieces to fade in and rearrange without movement, so that nothing slides around.
22. As a learner, I want a board I come back to later to show its sketches as they were, so that a saved board is the same board.
23. As a learner on Codex, I want sketches on the board as on Claude, so that my model choice does not decide whether I get them.

### Spotlight

24. As a learner, I want the items the tutor is talking about to stay bright while the rest of the page dims, so that I know where to look.
25. As a learner, I want a sentence that only talks, without drawing or naming anything, to keep the spotlight where it was, so that the board does not go dark between drawings.
26. As a learner, I want a whole sketch to stay bright while the tutor adds to it, so that I see the new piece in the context of the rest.
27. As a learner, I want the two items an arrow joins to stay bright with the arrow, so that I see what it connects.
28. As a learner, I want the whole page to come back to full brightness when the tutor asks me a question or checks in, so that I can see everything before I answer.
29. As a learner, I want the whole page to come back when the tutor's reply ends, so that I get the overview when it is my turn.
30. As a learner, I want the whole page to come back when I pause the board, so that I can study the whole drawing whenever I want.
31. As a learner, I want the whole page to come back when I cut in, so that I can point at anything while I ask.
32. As a learner, I want my own pen strokes never to dim, so that what I drew stays clear while I ask about it.
33. As a learner, I want an item the tutor drew as muted to stay muted, not get dimmer, so that the spotlight never hides it entirely.
34. As a learner, I want the spotlight to fade in and out gently, so that it never flickers.
35. As a learner who turned on reduced motion, I want the spotlight to change at once without fading, so that nothing animates.
36. As a learner, I want a page I look at on my own while the tutor draws elsewhere to show in full, so that the spotlight only follows the tutor's page.
37. As a learner, I want page thumbnails and snapshots to show the full page, never a dimmed one, so that they show what the page holds.
38. As a learner, I want a board I come back to later to show every page in full, so that a saved board never opens dimmed.
39. As a learner, I want the spotlight always on without a setting to manage, so that the board just works.

### Pacing and voice

40. As a learner, I want a short beat after each sentence, so that I can take it in before the next one starts.
41. As a learner, I want a longer pause before the tutor opens a new page or starts a new drawing, so that I notice the change of topic.
42. As a learner, I want a longer pause after a key idea, so that it has time to sink in.
43. As a learner, I want the tutor to say a formula a little slower than the rest, so that I can follow it as it is written.
44. As a learner, I want the tutor to say the key idea of a part slowly, so that it stands out from the sentences around it.
45. As a learner, I want my speed setting to scale the pauses as well as the voice, so that a faster board is faster everywhere.
46. As a learner, I want pausing the board to hold a pause where it is, so that resuming carries on with the same rhythm.
47. As a learner, I want cutting in to drop any pause still to come, so that the tutor answers me straight away.
48. As a learner, I want a sentence that arrives late to start as soon as it is ready, not after an extra pause, so that pauses never add to waiting.
49. As a learner, I want captions to keep the same pauses when the voice is unavailable, so that the board keeps its rhythm without sound.
50. As a learner, I want the tutor to say less and let the drawing carry the rest, so that I am not listening to a stream of words while I try to watch.
51. As a learner, I want the tutor's sentences to stay natural, not clipped to a word or two, so that it still sounds like someone explaining.
52. As a learner, I want each page to hold only a handful of items, so that a page never becomes a wall of drawings.
53. As a learner, I want labels on the board to stay a few words long, so that I watch the picture rather than read it.
54. As a learner in learner-led or tutor-guided mode, I want the same pacing and spotlight, so that the board feels the same whichever way it runs.
55. As a learner speaking another Voice language, I want the same pauses and slower key ideas, so that pacing does not depend on my language.

### The tutor

56. As the tutor, I want one op per sketch kind and one child op per piece, in the board's existing op style, so that I can draw a sketch without placing each piece myself.
57. As the tutor, I want a sketch to lay out its own pieces inside the box I give it, so that I only choose where the sketch goes.
58. As the tutor, I want a line kind that marks the key sentence, so that I can ask for it to be said slowly.
59. As the tutor, I want to see on the board pages list what each sketch holds, so that I can build on a sketch I drew earlier.

## Implementation Decisions

### Sketch kinds as board components

- Eleven new board components, each a parent op with a box (`at`, `w`, `h`) and a child op that adds one piece, following the existing pattern of `flow` with `step` and `table` with `row`. Names and arguments, in the op language's style (the benchmark may still tune them):

  | Component | Parent arguments | Child | Child arguments |
  | --- | --- | --- | --- |
  | `cycle` | box | `stage "label" in ID` | in order; the last leads back to the first |
  | `stack` | box | `layer "name" note="…" in ID` | top first |
  | `timeline` | box | `event "label" when="…" in ID` | in order |
  | `bars` | box | `bar "label" value=N unit="…" in ID` | unit optional |
  | `compare` | `vs="A\|B"`, box | `aspect "name" values="a\|b" in ID` | one value per side |
  | `parts` | `whole="…"`, box | `part "name" note="…" in ID` | note optional |
  | `sequence` | `actors="A\|B\|C"`, box | `send "message" by=A to=B in ID` | without `to=` it is a note on its actor |
  | `quadrant` | `x="low..high" y="low..high"`, box | `spot "label" X,Y in ID` | X and Y from 0 to 10 |
  | `pie` | box | `slice "label" value=N in ID` | shares of one whole |
  | `spectrum` | `ends="low..high"`, box | `place "label" note="…" in ID` | in order along it |
  | `equation` | `"symbols separated by spaces"`, box | `symbol "s" means="…" in ID` | `s` is one of the equation's symbols |

- Each child is a board item with its own id, so `highlight`, `pointer`, `erase`, pen marks and the board pages list reach it, as they reach a flow's steps today.
- The board session checks each child the way it checks the existing ones: a child whose component is missing, of another kind or on another page, a value outside its kind's range (a quadrant coordinate above 10, a negative bar or slice, a symbol not in the equation, an actor not in the sequence), or a missing required argument is skipped and logged.
- The guard treats a sketch's box like any component's box for the overlap and off-board rules. Default boxes exist per kind, as they do for the current components.
- The client lays out every new kind from all the children drawn so far, as it does for flow, tree, table and Venn: a new child reflows the earlier ones inside the box, with animation, and the reduced-motion fade otherwise.
- **Look: board style, chat geometry.** Each kind's arrangement follows the chat sketch kind of the same name (where pieces sit and how they connect), but every piece is drawn as board items in the board's strokes, fonts, theme colours and draw-on animation. Pure layout helpers are shared with the chat sketches only where they split out without changing what chat draws. Chat sketch output must not change.
- A sketch keeps its children readable inside its box up to about eight children; past that the layout shrinks them to a minimum size rather than overflow. The prompt asks for at most about eight.
- Sketch children support `look=` like any drawn item.
- The board's own `axes`, `numberline`, `flow`, `tree`, `table` and `venn` cover the chat kinds `plot`, `line`, `flow`, `tree`, `grid` and `venn`, so those are not added again.

### Spotlight

- The spotlight lives only in the board player and the renderer. It never changes an item's saved look, the stored board, the board pages list, the history the model sees, page thumbnails or snapshots.
- **Lit items:** the top-level items on the tutor's open page that the most recent sentence with ops drew or named. Naming covers `highlight`, `pointer`, a connector's two ends and a child's `in`/`on` component; an `erase` lights nothing. A child keeps its whole component lit. A sentence without ops, or with only an `erase`, keeps the lit set it inherited.
- **Dimmed items:** every other top-level item on that page, drawn at reduced opacity with a short fade. An item whose look is `muted` keeps its muted look and is not dimmed further. Learner pen strokes never dim.
- **Spotlight off (full page):** when the tutor's reply ends, which includes a `?> ` question and a `~> ` check-in, since both end the reply; while the learner has the board paused; from the moment the learner cuts in; and whenever the board shows a saved board that is not playing. A page the learner views on their own mid-reply always shows in full.
- The spotlight comes on again with the next sentence that draws or names something.
- With reduced motion on, dimming and undimming happen at once.
- There is no setting for it.

### Pacing

- **Pauses** sit between sentences in board time, so the learner's speed scales them and pause holds them. Defaults (board time at 1.5×, tuned later without changing the rules):
  - a beat of about 300 ms after each sentence
  - about 900 ms before a sentence whose ops open a page (`page`, `open`) or start a new top-level component, and after a key sentence
  - the longer of the two when both apply, never both added
- A pause counts from the end of the sentence. A next sentence that is not ready yet starts as soon as it is ready if the pause has already passed, so pauses never stack on waiting.
- Cutting in drops any pause still to come, with the sentences after it. A reply's last sentence gets no trailing pause: the board goes straight to waiting for the learner.
- Captions without voice keep the same pauses.
- **Slower sentences:** the edge-tts client takes a per-sentence prosody rate instead of the fixed `+0%`. Defaults: about `-15%` for a key sentence and about `-10%` for a sentence whose ops draw `math` or an `equation` or its symbols; a sentence that is both takes the slower rate, never the sum. Every other sentence stays at `+0%`. The learner's speed still multiplies on the client. The caption estimate before audio length is known follows the same rate.
- Filler clips keep their own pace.
- **Key sentence:** a new spoken line kind starting `!> `, read by the script reader as a spoken sentence marked as key. It is said slowly and followed by the longer pause. It is stored and replayed like the other line kinds. A `?> ` question and a `~> ` check-in are never key.

### Board prompt

- OPS lists the eleven new components and their children in the style of the existing entries.
- FORMAT replaces "Keep it under 20 words" with wording that asks for short, plain spoken lines that say less than writing would and let the drawing carry the rest, without any word count and without asking for single words.
- FORMAT adds the `!> ` line: for the sentence that carries a part's key idea, used sparingly.
- PACING and BOARD ask, softly, for about seven top-level items per page (a sketch counts as one), erasing finished items or opening a new page beyond that, and for labels of a few words. There are no hard caps: the guard does not refuse an eighth item or a long label.
- A sketch is suggested where a shape fits (a loop, layers, an order in time, quantities, a comparison, parts, an exchange, two scales, shares, a range, a formula), with one child per sentence.
- The board pages list describes a sketch by its kind and the labels of its children, so the tutor can build on it.

## Testing Decisions

Good tests here check what the learner gets: which items are drawn where, what dims and when, how long each pause is, and what rate each sentence is spoken at. They do not check how the player or the layout is built internally. They use the fake clock, fake speech and fake providers, and never call a real model or real edge-tts.

- **Op parsing and the guard** (server unit tests): every new parent and child kind parses; each malformed child (missing or wrong component, out-of-range value, unknown symbol or actor, missing argument) is skipped and logged; a sketch's box goes through the overlap and off-board rules; the `!> ` line reads as a key sentence. Prior art: the existing op and component tests for flow, tree, table and Venn.
- **Board layout** (plain module, unit tests): for each new kind, its children land inside the box, in order, without touching each other; adding a child reflows the earlier ones; more than eight children shrink to the minimum size and still stay inside. Prior art: the existing layout tests for flow, tree, table and Venn. The chat sketch tests stay unchanged and passing, which proves chat output did not move.
- **Board player** (plain module, fake clock, no DOM):
  - spotlight: the lit set after each sentence, inheritance across a sentence without ops, a component lit by its child, connector ends lit, pen strokes and muted items, and full page at reply end, `?> `, `~> `, pause and cut-in
  - pacing: the beat after a sentence, the longer pause before a page, a new component and after a key sentence, the longer of two never the sum, no trailing pause, speed scaling, pause holding a pause, cut-in dropping it, a late sentence not waiting extra, captions keeping pauses
  - Prior art: the board player's existing timeline tests.
- **The edge-tts client** (local fake socket server): the SSML of a normal sentence carries `+0%`, a key sentence and a math sentence carry their slower rates, and a sentence that is both carries the slower one. Prior art: the existing edge-tts client tests.
- **Prompt text** gets at most a unit check that the new ops and the `!> ` line appear and the 20-word rule is gone. Whether the model uses them well is a benchmark question, not a ticket test.
- **Component tests** only if a new kind needs rendering behaviour that the layout module cannot show; browser smoke scripts are not part of this work.

## Out of Scope

- Relative placement of top-level items ("right of t1", regions or a grid). ADR 0028 tested relations against coordinates and kept coordinates.
- Hard caps on items per page or words per label. The caps are prompt wording only.
- A setting to turn the spotlight off or change how much it dims.
- The model choosing a rate or pause for every sentence. It marks only key sentences; the app decides everything else.
- SSML breaks, speaking styles, pitch changes or a voice picker.
- Re-adding the chat kinds the board already covers (`plot`, `line`, `grid`, `flow`, `tree`, `venn`).
- Expanding a board sketch into a visual, as chat sketches can.
- Any change to chat sketches, chat replies, videos or video narration.

## Further Notes

- **Mockup before tickets.** The eleven sketch kinds are new board UI, and the spotlight is a new look for the board. Before their tickets are published, the owner makes a mockup at `docs/mockups/<issue-id>.html` or `.png`; those tickets get the `new-ui` label, a `Mockup:` line and the mockup acceptance criterion from `docs/agents/mockups.md`. The pacing, the edge-tts rate and the prompt wording need no mockup.
- **Benchmark, if the owner asks.** Op names, the `!> ` line and the prompt wording for talking less are untested on real models. A planning-session benchmark on Claude Sonnet and Codex, like the sketch syntax benchmark, would settle them before release.
- The pause lengths and rates above are starting values. Tuning them is a ticket-level change, as long as the rules stay the same.
