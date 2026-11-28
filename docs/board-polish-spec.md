# Board polish: caption, draw-first, code, drawings and natural pacing

Decided with the project owner on 2026-11-27 (short grilling session). Terms follow `GLOSSARY.md`: learner, tutor, reply, board, board page, board item, check-in, spotlight, caption, drawing, sketch. Decisions in force: ADR 0028 (board items are placed by coordinates), ADR 0029 (the board is a pool of pages) and ADR 0030 (board drawings are drawn live, never reused from the piece library). This spec adds to `docs/board-spec.md`, `docs/board-pages-and-check-ins-spec.md` and `docs/board-sketches-spec.md`, and replaces the latter's Pacing section: the fixed pauses there are gone.

The pacing decisions come from a listening prototype on the local branch `prototype/board-pacing` (unmerged; see its README). It played 4 pause-prompt variants on 3 questions through the real board prompt, on the app's real board renderer, with draw-first timing and four sound fills that could be switched on and off. The owner picked variant B (the tutor pauses rarely), joined speech, fillers, room tone and pen sounds.

## Problem Statement

The board feels slow, plain and robotic.

The caption is hidden while the transcript beside the board is open, so the learner reads the history instead of what the tutor is saying now. They lose their place while watching the board.

The drawing is stretched across the whole sentence, so a picture is still being built while the tutor is already explaining it. The learner sees the board finish late and never gets a moment to look at the finished picture before the words about it go by.

The board has nothing for code: a tutor explaining a function has to fake it with text labels. Sketch components cover structure, but nothing draws an object or a scene, so pages look bare. The `highlight` op sweeps a slow grey wash under an item and leaves it there, which the spotlight already does better.

The voice stops and starts. The app adds a fixed beat after every sentence and a longer fixed pause at every page or component, so every reply has a dozen gaps of identical length. Each sentence is spoken as its own clip, so it ends on a closing intonation and cuts to complete digital silence. It sounds like a machine reading lines, not someone talking.

## Solution

The caption always shows under the board while the tutor speaks, whether the transcript is open or not.

Each sentence's drawing starts with the sentence and draws at its own natural pace, finishing early in the sentence. The learner sees the picture first and then hears it explained.

The tutor can write a code block line by line, highlighted in the theme's colours. Each line is a board item the tutor can point at and the spotlight can pick out. The tutor can also make a drawing: a small picture of a few paths, drawn stroke by stroke, in colours the app's theme offers. The `highlight` op goes; the spotlight shows where to look, and the pointer glides there quickly and fades when its sentence ends.

The app no longer adds pauses of its own. The tutor writes a pause only where the learner needs a moment, which is rarely. Sentences between pauses are spoken as one stretch of speech, so they flow into each other with natural intonation. The tutor uses natural connectors ("So,", "Okay, now", "Right,") in its own words. A filler plays when the learner would otherwise wait in silence for the next sentence's voice. A quiet room tone sits under the voice, and a soft pen sound plays while the board draws, so the board never drops into dead silence.

## User Stories

### Caption

1. As a learner, I want the sentence the tutor is saying to show under the board, so that I can read along without looking away from the drawing.
2. As a learner, I want the caption to stay under the board while the transcript is open, so that I don't have to choose between the history and what is being said now.
3. As a learner, I want the caption to change when the next sentence starts, even inside one stretch of joined speech, so that the words I read match the words I hear.
4. As a learner with the voice off, I want the caption to keep its timing, so that I can follow the board in silence.
5. As a learner, I want the caption to clear or mute when the tutor stops and waits for me, so that I know it is my turn.

### Draw first, then talk

6. As a learner, I want a sentence's drawing to start as the sentence starts, so that the picture comes with the words about it.
7. As a learner, I want the drawing to finish early in the sentence, so that I can look at the finished picture while the tutor explains it.
8. As a learner, I want a short label to appear quickly and a whole component to take a little longer, so that the drawing moves at a natural pace.
9. As a learner, I want a sentence with many items to draw them faster rather than run past its first part, so that drawing never lags behind the voice.
10. As a learner, I want a sentence with one small item never to stretch that item across the whole sentence, so that nothing crawls onto the board.
11. As a learner, I want my speed setting to scale the drawing as well as the voice, so that a faster board is faster everywhere.
12. As a learner, I want pausing the board to freeze the drawing mid-stroke and resuming to carry on, so that I miss nothing.

### Code

13. As a learner, I want the tutor to write code on the board, so that I can see the real lines while it explains them.
14. As a learner, I want code to appear line by line as the tutor talks about each line, so that I'm never reading ahead of the explanation.
15. As a learner, I want code highlighted in the theme's colours, so that keywords, strings and comments are easy to tell apart and match the rest of the app.
16. As a learner, I want the spotlight to pick out the one line the tutor is talking about, so that I know where to look in a block.
17. As a learner, I want the tutor to point at a single line, so that it can draw my eye to the line that matters.
18. As a learner, I want to circle a line of code with the pen, so that I can ask about exactly that line.
19. As a learner, I want long code split across pages rather than crammed into one block, so that it stays readable.
20. As a learner, I want code to keep its indentation, so that its structure reads correctly.

### Drawings

21. As a learner, I want the tutor to draw a small picture of an object or a scene, so that the board shows more than boxes and arrows.
22. As a learner, I want to watch the drawing being made stroke by stroke, so that it feels like the tutor is drawing for me.
23. As a learner, I want drawings to use the colours of my theme, so that they fit the board and change with the theme.
24. As a learner, I want a drawing's fills to come in after its outlines, so that it builds up the way a hand-drawn picture would.
25. As a learner, I want a drawing to arrive as fast as the rest of the board, so that I'm not waiting for a picture.
26. As a learner, I want to circle a drawing with the pen and ask about it, as with any other board item, so that it is part of the lesson.
27. As a learner, I want a drawing the tutor wrote badly to be skipped rather than break the page, so that the board keeps going.

### Highlight and pointer

28. As a learner, I want no slow grey wash sweeping under items and staying there, so that the board stays clean.
29. As a learner, I want the spotlight to be the one way the board shows what the tutor is talking about, so that I learn one signal.
30. As a learner, I want the pointer to glide to its item quickly, so that I'm not watching it travel.
31. As a learner, I want the pointer to fade when its sentence ends, so that it never lingers on something the tutor has moved past.
32. As a learner reopening an old board, I want it to replay without errors even if it used the old highlight, so that my history still works.

### Pacing

33. As a learner, I want sentences to follow one another without a fixed gap, so that the tutor sounds like a person talking.
34. As a learner, I want the tutor to pause only where an idea needs a moment to sink in, so that pauses mean something.
35. As a learner, I want pause lengths to vary with what was just said, so that the rhythm is never mechanical.
36. As a learner, I want a key sentence to stay slower but not trigger an automatic pause, so that the tutor decides when I need to stop and think.
37. As a learner, I want a pause to overlap any wait for the next sentence rather than add to it, so that pauses never make me wait longer.
38. As a learner, I want cutting in to drop any pause still to come, so that the tutor answers me straight away.
39. As a learner, I want no pause after the tutor's last line, so that the board turns to me at once.
40. As a learner, I want my speed setting to scale the tutor's pauses too, so that a faster board is faster everywhere.
41. As a learner, I want pausing the board to hold a pause where it is, so that resuming keeps the rhythm.

### Joined speech

42. As a learner, I want the sentences between two pauses spoken as one stretch, so that they flow with natural intonation instead of each ending as if it were the last.
43. As a learner, I want the first sentence of a reply to start speaking as soon as it is written, so that joining speech never delays the start.
44. As a learner, I want a stretch of joined speech to stay short, so that the voice never waits long for the tutor to finish writing.
45. As a learner, I want a formula or a key idea to keep its slower pace inside joined speech, so that it still stands out.
46. As a learner, I want the drawing, caption and spotlight to move on at each sentence inside a joined stretch, so that the board stays in step with the words.
47. As a learner, I want cutting in during a joined stretch to stop it at once, so that the tutor answers me straight away.
48. As a learner, I want the board to fall back to captions with their timing when joined speech fails, so that a voice error never stalls the board.

### Fillers and connectors

49. As a learner, I want the tutor to use natural connectors like "So," or "Okay, now" in its own words, so that it sounds like someone explaining, not a list being read.
50. As a learner, I want a short filler when I would otherwise sit in silence waiting for the next sentence's voice, so that the board never sounds stuck.
51. As a learner, I want the filler before the tutor's first sentence to keep working as it does now, so that a slow start still sounds alive.
52. As a learner, I want fillers never to repeat back to back, so that they don't sound canned.
53. As a learner, I want fillers never to appear in the transcript, so that the history holds only what the tutor said.

### Room tone and pen

54. As a learner, I want a quiet room tone under the voice while the tutor talks, so that the gaps don't drop into dead silence.
55. As a learner, I want a soft pen sound while the board draws, so that I hear the drawing happen.
56. As a learner, I want a softer wipe sound when items are erased, so that I notice the page clearing.
57. As a learner, I want no pen sound for page changes or the pointer, so that the sound means "something is being drawn".
58. As a learner, I want room tone and pen sounds to stop when the tutor waits for me, so that my turn is quiet.
59. As a learner, I want muting the board to silence room tone and pen sounds too, so that mute means silence.
60. As a learner, I want pausing the board to pause room tone and pen sounds, so that pause means silence.
61. As a learner, I want room tone and pen sounds well below the voice, so that they never compete with it.

## Implementation Decisions

### Caption

- The board's existing caption line shows the current sentence whenever the tutor speaks, no longer only while the transcript rail is collapsed. It keeps its muted state when the tutor waits. With the voice off, it follows the board player's estimate as today. No new component.

### Draw-first timing in the board player

- The board player no longer spreads a sentence's ops evenly across its audio. Ops start when their sentence starts (its offset inside a joined clip, below) and run one after another. Each takes its own length at 1×, then the learner's speed divides it.
- The lengths at 1× below came from the prototype (`drawMs`). Treat them as starting values to tune:

  ```js
  if (op.top !== undefined) return 400;                   // page or open: the slide to its page
  if (COMPONENT_KINDS.has(op.kind) && !op.on) return 900; // a component's box
  if (op.on) return 400;                                  // a component's child
  if (op.kind === 'text' || op.kind === 'dot' || op.kind === 'point') return 250;
  if (op.kind === 'pointer' || op.kind === 'erase') return 300;
  if (op.kind === 'math') return 500;
  return 450;                                             // box, circle, line, arrow, plot
  ```

  A code line takes about a child's length. A drawing path takes about a box's length, so a drawing of a dozen paths still fits early in a sentence after squeezing.
- When a sentence's ops would run past the first third of its audio (or of the caption estimate when there is no audio), they are squeezed to end there. They are never stretched. When the audio's real length arrives after the estimate, the player re-squeezes the ops not yet finished.
- Pause, resume and speed keep working through the player's existing paced clock.

### Pauses chosen by the tutor

- A new op line `pause S`, where S is in seconds of board time, belongs to the sentence above it and means "pause this long after this sentence". The op reader clamps S to 0.2–2 and skips a malformed pause with a logged error, like any bad op. It draws nothing.
- The player's fixed pauses (the beat after each sentence, and the longer pause before a page, before a component and after a key sentence) are removed. With no `pause` op, the next sentence follows straight on.
- The rules from the earlier pacing spec stay, applied to the tutor's pauses:
  - A pause counts from the end of the sentence and overlaps any wait for the next sentence. Since 2026-11-28 it counts from the clip's last spoken word (docs/board-spec.md, Pauses from the last word).
  - Cutting in drops any pause still to come.
  - The reply's last line gets no pause.
  - Speed scales a pause.
  - Pausing the board holds a pause.
  - Captions without voice keep the pauses.
- A key sentence (`!> `) keeps its slower prosody rate but no longer adds a pause.
- Prompt: the tutor writes `pause S` rarely, after an idea that needs a moment, choosing the length by weight. This is the prototype's variant B wording, about one pause per reply. The key-sentence rule drops "followed by a longer pause". The prompt also asks for natural connectors ("So,", "Okay, now", "Right,") at the start of sentences where they fit, never as filler on every line.

### Joined speech

- The server board session speaks a group of sentences as one edge-tts request instead of one request per sentence. Grouping rules:
  - The first group of a reply is its first sentence alone, so the reply's first audio starts as fast as today.
  - A later group runs over consecutive sentences until a sentence that carries a `pause` op, a change in prosody rate, the end of the reply, or a cap of 4 sentences, whichever comes first.
  - A group is spoken once it is closed. It closes when its last sentence is done (the next sentence started, or the reply ended) and one of the rules above applies.
  - Speech still runs one group ahead of playback, as it runs one sentence ahead today.
- The edge-tts client asks for word-boundary metadata and reports each word's offset alongside the audio chunks. The session maps words back to the group's sentences and sends each sentence's start offset inside the group's clip. The audio frames go under the group's first sentence id, as they do now under a sentence id.
- If boundary metadata is missing or a word cannot be matched, the session splits the clip's offsets by the sentences' share of the group's characters.
- The board player plays a group's clip once. It starts each sentence at its offset: show the caption, start its draw-first ops, and update the spotlight. A sentence's length for draw-first squeezing is the distance to the next sentence's offset, or to the clip's end.
- Cutting in stops the group's clip and drops its remaining sentences, the same as now. A failed group falls back to captions with estimates, the same as a failed sentence today.
- Stored replies keep their sentence lines unchanged, because grouping is a playback concern only. Replayed boards are not re-voiced.

### Fillers

- The board's existing filler clips (synthesized once per voice and cached) keep playing before a reply's first audio.
- They now also play when the next sentence is due but its voice hasn't arrived after about 1 s of board time. The 1 s threshold is a starting value to tune. That filler never repeats the last one, never overlaps a sentence and never enters the transcript. A filler that has started finishes before the sentence plays (changed 2026-11-27).
- The filler set may grow from the three current clips to include short connectors such as "So…", "Right," and "Mm." The prototype used "So...", "Okay,", "Right,", "Now,", "And..." and "Mm." with trimmed silence, 0.3–0.6 s each.

### Room tone and pen sounds

- Both are made in the browser with Web Audio, from no asset files, in the board's voice playback layer:
  - Room tone is soft pink noise, filtered like a quiet room. It plays while the tutor speaks or pauses within a reply and fades out when the board waits for the learner.
  - Pen sounds are band-passed noise with a slight random wobble, lasting as long as each op's draw-first length: short strokes for labels, longer for components, drawings and code lines. `erase` gets a softer wipe. `page`, `open` and `pointer` get no sound.
- Starting levels from the prototype: room tone about 40 dB below the voice, pen about 26 dB below, the wipe about 32 dB below. The owner heard both at these levels. Tuning them is a ticket-level change.
- Mute silences both. Pause suspends both. Speed changes pen-stroke lengths with the draw times. There is no new setting.

### Code block component

- It is a new board component, `code lang="py" w=W h=H`, with children `line "..." in CB` in order. Each line is a board item with its own id, so the spotlight, `pointer`, the pen and `erase` reach a single line.
- Indentation is kept: leading spaces in the line text are significant, and the component lays lines out in the board's monospace font, top-aligned.
- Lines are highlighted with Prism, which the app already ships, using the theme's colour tokens, never fixed colours. An unknown `lang` renders plain.
- The layout fits lines to the box: long lines shrink the font down to a minimum, then clip with an ellipsis. The prompt asks for about 12 lines at most per block and a new page beyond that. The app does not enforce the cap.
- Each line draws in as a child (left to right, about a child's length).
- The component joins the board's component kinds and the player's matching set, and follows the same parse, guard and overlap rules as the sketch components.

### Drawing component

- It is a new board component, `drawing w=W h=H`, with children `path "d" ink=NAME fill=NAME in DR`. The path coordinates are in the drawing's own 0–100 units on both axes, and the component scales them into its box.
- `ink=` and `fill=` take only the names `blue`, `green`, `pink`, `yellow`, `ink` and `muted`. Each maps to the theme's existing colour tokens. The four hues already exist in every theme, and diagrams use them. The names are roles, not real colours: a theme may render "pink" as purple. `fill=` may be left out for no fill. Any other value is a parse error. The prompt's "never write colours" rule makes an exception for these names on a drawing.
- Path data is validated at the parse boundary. Only SVG path commands (`M L H V C S Q T A Z`, upper or lower case), numbers, spaces and commas are accepted, with a length limit, and anything else skips the path with a logged error. This is model-written markup reaching the page, so the check is a trust boundary, not a nicety.
- Each path draws its stroke in order, then fades its fill in.
- The prompt asks for about 12 paths at most, so a reply stays fast. The guard rejects paths beyond 24 in one drawing.
- A path is a board item. The whole drawing is the unit the spotlight and the pen usually reach.
- Drawings are written live in the board reply and never looked up in the piece library (ADR 0030).

### Highlight removed, pointer faster

- `highlight` leaves the op vocabulary and the prompt. To keep saved boards working, the op reader still accepts `highlight` lines and turns them into no item: nothing is drawn and nothing is logged as an error, so later ops that name the highlighted item still resolve. The renderer's highlight wash and its CSS are deleted.
- `pointer` glides to its item in about 250 ms at 1×, scaled by speed. It fades when its sentence ends (the next sentence starts, or the tutor stops and waits), instead of on its own timer.

### Board prompt

- The op list gains `code`/`line`, `drawing`/`path` and `pause`, and loses `highlight`.
- The pacing guidance becomes the variant B wording plus the connector line. The key-sentence line loses its automatic pause.
- The existing soft limits (about seven items per page, a few words per label) stay.

## Testing Decisions

Good tests check what the learner gets: what is drawn, when each op starts and how long it takes, when each sentence starts inside a clip, how long each pause is, what is spoken as one request, when a filler plays, what is accepted or skipped. They don't check how the player, the session or the layout is built inside. They use the fake clock, fake speech and fake providers, and never call a real model or real edge-tts (`docs/agents/testing.md`).

The seams are the board's existing ones; no new seam is needed.

- **Op parsing and the guard** (server unit tests):
  - `code`/`line` and `drawing`/`path` parse.
  - A bad `lang`, a missing parent, an unknown ink name, path data with anything outside the path grammar, an over-long path and a 25th path are each skipped and logged.
  - `pause` parses and clamps.
  - `highlight` lines read as no item without an error, and later ops naming them still resolve.
  - Prior art: the existing op and component tests.
- **Board layout** (plain module, unit tests):
  - Code lines stack in order inside the box, keep indentation, and shrink and then clip long lines.
  - Drawing paths scale from 0–100 into the box.
  - Prior art: the existing layout tests for the sketch components.
- **Board player** (plain module, fake clock, no DOM):
  - draw-first:
    - ops start with their sentence, one after another, at their own lengths
    - squeezed into the first third and never stretched
    - re-squeezed when the real audio length arrives
    - scaled by speed and held by pause
  - pauses:
    - no pause without a `pause` op
    - the tutor's pause after its sentence, scaled by speed
    - overlapping a late sentence
    - dropped on cut-in
    - none after the last line
    - a key sentence with no pause
  - joined clips: each sentence starts at its offset (caption, ops, spotlight), and draw-first uses the distance to the next offset
  - pointer fades at its sentence's end
  - a filler requested when the next sentence's voice is late
  - Prior art: the board player's existing timeline and pacing tests.
- **Board session** (server, fake speech):
  - grouping:
    - first sentence alone
    - groups closed at a `pause`, a rate change, the reply end or 4 sentences
    - one request per group
  - sentence offsets mapped from word-boundary metadata, with the character-share fallback
  - cut-in stops a group
  - a failed group falls back to captions
  - Prior art: the existing board session tests with fake speech.
- **The edge-tts client** (local fake socket server): it requests word boundaries and reports word offsets with the audio. Prior art: the existing edge-tts client tests.
- **Voice playback** (unit tests with a stubbed audio context):
  - room tone starts with speech, stops on waiting, mute and pause
  - a pen sound per drawn op, at its draw length, none for page, open or pointer, and the wipe on erase
  - Prior art: the existing voice tests.
- **Component tests:**
  - the caption shows while the rail is open
  - a code block renders highlighted lines in theme tokens
  - a drawing renders its paths with theme colours and no raw colour values
  - Prior art: the board component tests and the mount helper.
- **Prompt text:** at most a unit check that the new ops and the pause wording appear and `highlight` is gone.

## Out of Scope

- Reusing saved pieces from the piece library on the board (ADR 0030).
- Stock icons.
- Fixed colours or any colour outside the named theme roles.
- Pauses inside a sentence and SSML breaks. Pauses go only between sentences.
- Settings for room tone, pen sounds or fillers, and per-sound volume controls.
- Word-by-word caption highlighting.
- Running or stepping through code on the board, line numbers, and copying code out.
- Re-voicing stored boards with joined speech.
- Any change to chat sketches, chat replies, visuals, videos or video narration.

## Further Notes

- **Mockup before tickets.** The code block and the drawing are new board UI. Before their tickets are published, the owner makes a mockup at `docs/mockups/<issue-id>.html` or `.png`. Those tickets get the `new-ui` label, a `Mockup:` line and the mockup acceptance criterion from `docs/agents/mockups.md`. The caption change, draw-first timing, pacing, joined speech, fillers, sounds, pointer and highlight removal keep the existing look and need none.
- **Prototype evidence.** The branch `prototype/board-pacing` holds the 12 scripts, the four prompt variants, the per-variant stats, the draw-first timing code and the four sound fills, and its README records what the owner chose. Variant B wrote the most sentences (about 15 per reply) and about one pause per reply. Watch whether the connector guidance keeps that from sounding run-on once joined speech is live.
- **Model mistakes the prototype surfaced**, which the guard already handles by skipping:
  - message lines in a `sequence` written without `on ID`
  - labels containing escaped quotes, such as `"\"cat\""`
  
  The prompt could warn against both, at most in a line each.
- The draw lengths, the first-third rule, the group cap of 4, the filler threshold and the sound levels are starting values. Tuning them is a ticket-level change, as long as the rules stay the same.
