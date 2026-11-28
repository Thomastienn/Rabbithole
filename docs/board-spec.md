# Board

Decided with the project owner on 2026-11-26 (brainstorm and grilling session). Terms follow `GLOSSARY.md`: learner, tutor, conversation, focused chat, branch, passage, reply, chat model, quick thinking model, tutor style, skill, tutor tool, familiarity, memory note, reads images, board, board item, learner-led, tutor-guided. Decision: ADR 0028 (board items are placed by coordinates).

`docs/board-pages-and-check-ins-spec.md` (ADR 0029) changes parts of this spec: board pages replace `clear`'s stacked areas, and check-ins come in every mode.

The evidence is on three local branches. Each has a README with its method, results and the decisions it settled:

- `prototype/edge-tts-latency`: edge-tts first byte, pipelining and failures.
- `prototype/model-latency`: first-sentence latency for the Claude Code CLI and the Codex app-server.
- `prototype/board-placement`: coordinates against relations, and the speak-first prompt. Its `index.html` plays every run.

Model quality was settled by manual runs the owner approved: Claude Sonnet at low effort. No ticket under this spec calls a real model (`docs/agents/testing.md`, Real models).

## Problem Statement

Learning in the app means reading. Long tutor replies suit an evening of reading, but some learners take ideas in best by watching someone explain at a whiteboard and asking as they go. This is especially true of learners with ADHD, who drift when nothing moves and give up when an answer takes too long to start. Today a learner can only type, wait, and read a reply that arrives all at once, with pictures that pop in whole. Nothing talks, nothing draws step by step, and they can't cut in halfway through an explanation to say "wait, what's that?".

## Solution

A conversation can switch to a **board**. The tutor talks the learner through the idea aloud, in short sentences, and draws it on the board one small piece at a time, in step with its words. The board shows pictures: shapes, arrows, math, graphs, flows, trees, tables. It carries as little text as possible, and the spoken words show as captions. Nothing pops in; every board item draws itself on.

The learner mostly watches and listens. Whenever something is unclear, they cut in, by voice once they turn the mic on, or by typing. The tutor stops at once, answers on the same board, then picks the topic up again. The learner can draw on the board with a pen to show what they mean ("this bit here?"). The tutor answers quickly: the board reacts within a fraction of a second, the first words follow in about a second, and the board is never still and silent for more than a second while the tutor is answering.

By default the board is **learner-led**: the tutor explains and never quizzes. A learner who wants it can choose **tutor-guided**, where the tutor checks in with short questions and gives a hint when the learner doesn't answer. Speech plays at 1.5× by default, and the learner can change it. Everything said on a board is an ordinary reply in the conversation, so branching, the knowledge graph and familiarity work as they do in chat.

## User Stories

### Opening and leaving

1. As a learner, I want a Board toggle in the focused chat header, so that I can switch any conversation to a board.
2. As a learner, I want the board to open empty and wait for my first question, so that the tutor never starts talking before I ask.
3. As a learner, I want the mic off when a board opens, so that it never listens without my choosing.
4. As a learner, I want the board to take the full content width while it is open, with the map hidden, so that I can watch it without clutter.
5. As a learner, I want a narrow transcript rail beside the board that I can collapse, so that I can read back what was said.
6. As a learner, I want the tutor to stop talking the moment I toggle the board off, switch conversation or close the tab, so that it never keeps talking to an empty room.
7. As a learner, I want a reply I left halfway saved up to where it was spoken, so that the conversation shows what I heard.
8. As a learner, I want to reopen a board and see it as it was at the end of the latest reply, so that I can carry on where I stopped.
9. As a learner, I want to scroll back through the board's earlier states, so that I can look again at something drawn earlier.
10. As a learner, I want a board reply in the normal chat view to show its spoken text and a small snapshot of the board, so that I can still read it there.

### Asking

11. As a learner, I want to type a question on the board, so that I can ask without speaking.
12. As a learner, I want the tutor to keep talking while I type and to stop only when I send, so that typing doesn't cut it off early.
13. As a learner, I want to turn the mic on with one button, so that I can ask by voice.
14. As a learner, I want the mic hands-free once it is on, so that I just start talking to cut in.
15. As a learner, I want a push-to-talk option in settings, so that I can use voice in a noisy room or with speakers.
16. As a learner, I want the tutor's own voice from my speakers not to count as me speaking, so that it doesn't interrupt itself.
17. As a learner, I want the tutor to stop speaking the instant I start talking, so that cutting in feels natural.
18. As a learner, I want the half-drawn item to finish quickly when I cut in, instead of freezing, so that the board stays clean.
19. As a learner, I want the tutor to answer my question and then pick the topic up again in its own words, so that I don't lose the thread.
20. As a learner, I want a pause button, so that I can stop for a moment and resume from the exact sentence.
21. As a learner, I want to say "I get this part" and have the tutor move on, so that I'm not stuck on what I already know.
22. As a learner, I want to say "slower", "again" or "go on" and have the tutor respond, so that I steer it without buttons.
23. As a learner, I want my voice recognised in my language when I set one, so that voice works beyond English.
24. As a learner, I want the speech model to download only the first time I use the mic, so that learners who never use voice don't pay for it.
25. As a learner, I want to see the download progress on the mic button and keep typing meanwhile, so that I'm never blocked.

### Watching and listening

26. As a learner, I want the first words of an answer within about a second, so that it feels like talking to someone.
27. As a learner, I want the board to react within a fraction of a second of my question, so that I know I was heard.
28. As a learner, I want the tutor never silent and still for more than a second while it answers, so that my attention doesn't drift.
29. As a learner, I want a short spoken filler about my question, such as "Ah, base cases.", only when the answer is genuinely slow to start, and never the same words twice in a row, so that it doesn't get annoying or sound canned.
30. As a learner, I want the tutor to say what it is about to draw ("let me sketch the forces"), so that I know where to look.
31. As a learner, I want one small change on the board per sentence, so that I can follow each step.
32. As a learner, I want every board item to draw itself on, write in or fade in, never pop in, so that the board feels alive and is easy to follow.
33. As a learner, I want each drawing to take about as long as the sentence that goes with it, so that what I hear and what I see match.
34. As a learner, I want speech at 1.5× by default, so that it moves fast enough to keep my attention.
35. As a learner, I want to change the speed, and have it apply instantly to both speech and drawing, so that I set my own pace.
36. As a learner, I want the speed I choose remembered, so that I set it once.
37. As a learner, I want captions of what the tutor says, in the rail or as one line under the board when the rail is collapsed, so that I can read along or watch without sound.
38. As a learner with reduced motion turned on, I want items to fade in instead of drawing on, so that the board is comfortable to watch.
39. As a learner, I want the board to keep going with captions when speech fails or I'm offline, with a short notice, so that a voice outage doesn't stop the explanation.
40. As a learner, I want the tutor to speak my language, in a voice that fits it, so that I can learn in the language I think in.
41. As a learner, I want the tutor to teach until the topic is covered and then stop and wait, so that I decide what comes next.
42. As a learner, I want the board to move to fresh space when the tutor starts a new part, with earlier parts still scrollable, so that the board never gets crowded.

### What the board shows

43. As a learner, I want shapes (circle, box, line, arrow, dot) drawn as clean marker strokes in the theme's colours, so that the board looks like the app.
44. As a learner, I want short labels and math written on the board, with math appearing term by term, so that formulas build up as they're explained.
45. As a learner, I want graphs that draw their axes first and then trace the curve, so that I see a function take shape.
46. As a learner, I want number lines, flows, trees, tables and Venn diagrams that grow one piece at a time as they're explained, so that a structure builds up step by step.
47. As a learner, I want the tutor to highlight or point at what it is talking about, so that I know where to look.
48. As a learner, I want items the tutor is done with to fade away when it erases them, so that the board stays readable.
49. As a learner, I want board items never to overlap or fall off the board, so that everything stays legible.
50. As a learner, I want a few consistent looks for emphasis (focus, muted, good, wrong, new), so that colour always means the same thing.
51. As a learner, I want the board to hold pictures and few words, so that I listen to the explanation and look at the idea.

### Drawing on the board

52. As a learner, I want a pen to draw, circle and point on the board, so that I can show what I'm asking about.
53. As a learner, I want the tutor to know which board item I circled, so that "what's this?" is answered about the right thing.
54. As a learner, I want the tutor to see what I drew in free space when its model reads images, so that I can sketch my own idea.
55. As a learner, I want the tutor to erase or keep my strokes as fits, so that I never have to tidy up.

### Learner-led and tutor-guided

56. As a learner, I want the board learner-led by default, with the tutor never asking me questions, so that I ask when I need to and feel no pressure.
57. As a learner, I want to choose tutor-guided in settings, so that the tutor checks in with short questions if I like that.
58. As a learner, I want to say "quiz me as we go" or "stop asking" on any board, so that I can switch for this board without opening settings.
59. As a learner in tutor-guided, I want the tutor to wait a few seconds for my answer, so that I have time to think.
60. As a learner in tutor-guided, I want a hint when I don't answer, then the explanation carrying on if I still don't, so that silence is never treated as failure.
61. As a learner, I want answers never graded, so that the board stays a place to explore, not a test.

### Fitting the rest of the app

62. As a learner, I want what the tutor says on a board saved as its reply in the conversation, so that the board is part of my history.
63. As a learner, I want to branch from a passage in the transcript rail, so that a side question still gets its own conversation.
64. As a learner, I want branching from the rail to pause the board and open the child conversation in normal chat, so that I decide whether the child gets a board too.
65. As a learner, I want my board questions to count for familiarity like any message, so that the tutor learns what I know.
66. As a learner, I want concepts from board replies recorded in my knowledge graph, so that board learning is remembered.
67. As a learner, I want the board to use the conversation's chat model, so that there's no extra model to choose.
68. As a learner, I want my tutor style to shape how the tutor explains on the board, so that it teaches the way I set it up.
69. As a learner, I want the tutor to know what I've already explored and understood when a board starts, so that it doesn't repeat what I know.
70. As a learner, I want the board to work the same in every browser and in the desktop app, so that it behaves the same everywhere.
71. As a learner, I want to know that my voice never leaves my machine, so that I can use voice comfortably.
72. As a learner, I want broken drawing instructions skipped silently, so that I never see raw instructions or errors on the board.

### Settings

73. As a learner, I want a Board section in Settings with Voice language, learner-led or tutor-guided, and push-to-talk, so that I set the board up once.
74. As a learner, I want Voice language to default to English, so that most learners need no setup.

## Implementation Decisions

### Board session (server)

- A new server module runs one **board session** per open board. It owns the long-lived model process, the board's history, speech recognition, voice detection, speech output, and saving.
- **Transport:** the board talks to the browser over one WebSocket per open board. Audio goes up, and board events and speech go down. A fetch request body can't stream audio in Firefox, so chat's server-sent events don't fit. `ws` becomes a direct dependency; it is already installed through another package. Chat replies stay on server-sent events.
- **Messages up:** mic audio frames (16 kHz mono PCM), typed questions, pen strokes, pause and resume, an interruption, and playback progress. Progress is reported as each sentence starts and ends playing, so the server knows the spoken point.
- **Messages down:**
  - session state: idle, listening, thinking, speaking or paused
  - each sentence with its id and text
  - each sentence's speech audio, in chunks
  - each sentence's ops, with the sentence id they belong to
  - a stop signal for interruptions
  - notices, such as voice unavailable or the speech model downloading, with progress
- **Model process:** a board uses the conversation's chat model, model and provider alike, with effort forced to low while the board is open.
  - **Claude:** one long-lived Claude Code CLI process per board session with `--input-format stream-json`. Each learner turn is written to its stdin. Spawning per turn misses the 1 s budget: about 240 ms to start the process plus the resume, with a p90 of 1.8 s in `prototype/model-latency`.
  - **Codex:** the existing long-lived app-server. It is supported, but slower: its first sentence came at about 1.2–1.7 s.
  - The process starts when the board opens, so it is warm before the first question. It stops when the board closes, or after 10 minutes idle, like the quick thinking runner.
- **Shared history:** board turns join the conversation's own provider history, so a later chat turn sees what was said on the board, and the reverse. For Claude the board process runs its own session, which gets the saved discussion in its first message. A resumed Claude Code session keeps the system prompt it was created with (CLI 2.1.332), so resuming the chat's session answered in chat format. After a board turn the conversation's session is dropped, so the next chat turn replays the saved discussion, board turns included.
- **Interruptions and history:** the provider has already received generated text that the learner never heard. So the next turn tells the model where it was cut off, naming the last sentence the learner heard, and says the rest was not heard.
- **Thinking:** the Claude CLI can't turn thinking off for Sonnet. The board relies on the speak-first prompt instead (below), and logs the thinking tokens of every request. Any value above 0 is a latency regression to investigate.

### Board prompt and skills

- The board is isolated from chat. It gets its own fixed skills and none of chat's media rules: no visuals, videos, sketches, markers, discussions, reply layouts, suggestion marks or next questions.
- The learner's tutor style still applies on top.
- **The board skills cover:**
  - the op language
  - pacing: short spoken sentences, one board change per sentence, saying what it will draw before drawing it
  - keeping text on the board minimal
  - teaching until the topic is covered, then stopping
  - learner-led and tutor-guided behaviour, and following "I get this part", "slower", "again", "go on", "quiz me as we go" and "stop asking"
  - answering a question, then picking the topic up again
  - when to start fresh space
  - how pen references arrive
- **The speak-first block** from the prototype is required. Sentence 1 comes first, then its ops, and the model places each item only when it draws it, never laying out the whole board ahead. The prototype's wording, which is in `prompts/A1.txt`:

  > PACE: you are speaking live. The learner must hear your first sentence within one second of asking.
  > - Start at once. Your very first output is sentence 1, then its ops. Do not think about or plan the lesson before writing it.
  > - Plan as you go: decide where each element goes only when you draw it, using the space that is still free. Never lay out the whole board first, in your head or in writing.

- **Tutor tools on a board** (changed 2026-11-27; v1 had none). The board gets the tutor tools a chat turn gets, without the app tools, and its context still gets the inherited context, the memory note, and the learner's explored concepts and familiarity. A tool call means seconds of silence, so the tutor says what it is doing on a spoken line before each call, in its own words. That sentence is spoken as soon as the call starts, not after it. A call with no such sentence gets a filler about the call. The state label names the running tool, and the call is saved with the reply as a chat turn's is. The Claude board serves its app tools over MCP for the process's whole life; a Codex board runs each turn with tools in a tools worker, as chat does, which costs that turn a CLI start.
- **Attachments** (added 2026-11-27). The board composer attaches files as chat's does, with the paperclip, paste or drop, and so does the first question of a tree started on the board. They go base64 in the ask message, are prepared as a chat send prepares them (PDFs, text files, images or their OCR text), and are saved on the learner's question, so the chat shows them too. The model gets their text after the question and the images with the turn. A file that cannot be attached is said as a notice, and nothing is asked. A question still needs typed words; files alone are not sent.
- **A question only the learner can answer** (their topic, their material, where they got lost) goes on a `~> ` line, so it waits without the hint and answer turns. `?> ` is only for a question about what the tutor taught.

### Op language

- The model writes one line-based stream. A `> ` line is a spoken sentence, and the op lines under it belong to that sentence. A `?> ` line is a question for the learner, and the board waits after it (see Tutor-guided). Each op is `<id> <kind> <args> [key=value]`. This syntax came from the prototype: 0 parse errors in 24 runs.
- **Placement** (ADR 0028):
  - Top-level items take `at X,Y`, their centre on a fixed 1600×900 board, with sizes in pixels: `r=` for circles, `w= h=` for boxes and components, and `size=s|m|l` for text and math.
  - Line and arrow points are board pixels, and a connector may run `from <id> to <id>`.
  - Children `on` a component use the component's own units, such as points on axes.
- **Kinds:**

| Kind | What it is | How it enters |
|---|---|---|
| `circle`, `box`, `dot`, `line`, `arrow` | shapes | the stroke draws on; a dot grows |
| `text` | a short label, a few words at most | writes in left to right |
| `math` | KaTeX | appears term by term |
| `axes` + `plot` | a graph | axes first, then the curve traces left to right |
| `numberline` + `point` | a number line | the line, then one point at a time |
| `flow` + `step` | steps with arrows | one step and its arrow at a time |
| `tree` + `node` | a hierarchy | one node and its edge at a time |
| `table` + `row` | a table | one row at a time |
| `venn` + `item` | two or three sets | one circle at a time, then the items |
| `highlight` | emphasis on an item | a sweep |
| `pointer` | attention on an item | glides to it, then fades |
| `erase` | removes items | they fade out |
| `clear` | fresh space | the camera pans to a new 1600×900 area below |

- **Looks:** `look=focus|muted|good|wrong|new`. Each maps to a theme colour in both light and dark. The model never writes colours.
- **Components:** the model gives a component's box, and the component lays out its own children inside it. A child arriving later reflows the earlier ones within the box, with animation. The prototype sized children from the whole script, which a live stream doesn't have.
- **Broken ops:** an op that doesn't parse, names an unknown id or parent, or has bad math is skipped and logged. The board carries on. The learner never sees op text or an error.
- **The guard:** after parsing, the guard checks each new item against the items still on the board. An item that overlaps another, or leaves the board, is moved to the nearest free spot and kept on the board. The prototype's measure decides what counts as an overlap: bounding boxes intersecting by more than 4 px; a label inside a shape doesn't count; a line counts only when it crosses text or math; a connector counts when it crosses anything but its own endpoints. Speak-first runs had small label-on-arrow collisions in 6 of 16 runs, so the guard is required.

### Speech output

- The board uses edge-tts through a small client of our own, reusing the library's protocol pieces. The library opens a new socket for every request and returns only whole clips. Our client:
  - opens the socket as soon as a turn starts, while the model writes its first sentence, which cut first byte from about 350 ms to about 80 ms
  - streams each sentence's audio in chunks
  - synthesizes one sentence ahead of playback
  - times out the first byte after 2.5 s and retries once
- **When speech fails**, the sentence plays as a caption only, timed by its length, and the board carries on. A notice says the voice is unavailable.
- **The voice:** one fixed voice per Voice language, from a small table; English is `en-US-AriaNeural`. There is no voice picker, and videos keep their own voice.
- **Fillers** (changed 2026-11-27; v1 had a fixed list of clips): the quick thinking model writes a filler's few words for its moment, in the Voice language, and edge-tts voices them. There is no fixed list. A turn's opening filler is written as the turn starts and names the question's topic; it plays only when the first audio hasn't started after 1 s. A later sentence the board reports late gets a connector that carries on from the last sentence, dropped if that voice comes first. A tool call without a spoken sentence before it gets one about the call. A filler never repeats the words said last and is never saved. Measured on Claude Haiku with a warm runner, writing and voicing one takes 0.9 to 1.6 s, so an opening filler is ready about when the 1 s wait ends.

### Speech recognition and voice detection

- Both run in the local server on every platform, so every browser and the desktop app behave the same.
- **Models:** they load through `@huggingface/transformers`, downloaded on first use from a pinned revision, like the knowledge-graph embedder:
  - **Moonshine base at int8 (about 63 MB)** for English
  - **Whisper base at int8 (about 77 MB)** only when Voice language isn't English
  - **Silero voice detection (about 1 MB)** for both
- **The first mic press** starts the download and shows progress on the mic button. Typing works meanwhile.
- **Audio settings:** the browser captures the mic with echo cancellation, noise suppression and auto gain on.
- **Cutting in:** when voice detection hears about 150 ms of speech while the tutor is speaking, the server sends a stop at once. End of speech is about 300 ms of silence, which is kept short because it sits in the 1 s budget. Then the utterance is recognized and sent as the learner's message.
- **Push-to-talk:** with it on, voice detection is replaced by holding Space or the mic button.
- **Desktop:** the desktop app must grant the mic permission to the app's own page.

### Board player (client)

- A new plain module turns the stream of board events into a timeline. It decides:
  - when each item enters, and for how long
  - the current speed
  - what is dropped on an interruption
  - what each state looks like (listening, thinking, speaking, paused)
- **Timing:**
  - A sentence lasts as long as its audio plays. Its ops share that time in order.
  - Before a sentence's audio length is known, it is estimated at 15 characters per second at 1.5×, as in the prototype.
  - Speed is applied on the client, with `playbackRate` and `preservesPitch`, so a change is instant. Animation durations scale with it.
- **Speed:** 1.5× by default, and the learner's choice is remembered in the browser.
- **Playback** starts on the first audio chunk of a sentence.
- **Interruptions:**
  - Audio stops at once.
  - The item being animated jumps to its finished state in about 150 ms.
  - Sentences and ops not yet started are dropped.
- **Pause** stops audio and animation, and resume continues from the exact sentence and item. Generation keeps buffering while paused.
- **Waiting:** within about 200 ms of a learner turn, the board shows that the tutor heard: the pen moves to free space, or a soft pulse shows.
- **Reduced motion:** with the system setting on, every entry is a plain fade.
- **The renderer** is SVG, with clean marker strokes in theme colours. Theme and appearance switches redraw it.

### Learner pen

- The learner gets a pen only. A finished stroke is hit-tested against the board items, and the next learner message carries references such as "circled `t1`".
- A stroke over no item is sent as a cropped image, only when the chat model reads images.
- The pen alone sends nothing: its strokes go with the next spoken or typed question.
- The learner's strokes are board items of their own, and the tutor may erase or keep them.

### Tutor-guided

- **Choosing it:** learner-led or tutor-guided is an app-wide setting, learner-led by default. The board prompt tells the tutor which one applies. A learner's spoken or typed request can switch it for the current board, and the model handles that itself.
- **Waiting:** after a `?> ` line, the board waits about 4 s, whichever mode applies.
  - If the learner says nothing, the session sends a no-answer turn and the tutor gives one hint.
  - After about 4 s more of silence, a second no-answer turn has the tutor carry on teaching, with no comment on the silence.
- **No-answer turns** are system turns. They aren't learner messages, and they aren't familiarity evidence.

### Saving and the rest of the app

- **Replies:** a board reply is saved as an assistant message whose text is the spoken sentences. Every sentence that started playing is kept, and the rest is dropped.
- **Ops:** the message also stores its op lines for the same sentences. A learner message stores its pen strokes and references.
- **The board** at any reply is the replay of every op up to it, so reopening shows the final board instantly, and scrolling back steps through earlier replies' states. Audio is not saved, and there's no audio replay.
- **The normal chat view** shows a board reply's text, plus a small snapshot rendered from its ops.
- **After each board reply**, the quick thinking model judges familiarity and records concepts, as it does for chat. It skips suggestion marks and next questions.
- **Learner messages** on a board, spoken or typed, are familiarity evidence like any message.
- **Branching:** selecting a passage in the transcript rail branches as in chat. The board pauses, and the child conversation opens in normal chat without a board.
- **Usage:** board turns count in usage history like chat turns.

### UI

- **The toggle:** a Board toggle in the focused chat header.
- **Layout while a board is open:**
  - the board at full content width
  - a narrow transcript rail that can collapse, with a one-line caption under the board when it is collapsed
  - the map hidden
- **The toolbar:** speed, pause, mic (with download progress) and pen.
- **Settings:** a new Board section holds:
  - Voice language, English by default
  - learner-led or tutor-guided
  - push-to-talk, off by default
- This is a new screen, and it needs a mockup at `docs/mockups/<issue-id>.html` before its tickets are published (label `new-ui`). The board's look is designed with Impeccable.

### Privacy

- `docs/guide/data-and-privacy.md` says that a board's spoken text goes to Edge TTS, and that the learner's voice never leaves the machine.

## Testing Decisions

Good tests here check what the learner gets: what is said, drawn, saved and sent. They don't check how the session or player is built internally. They use fake providers, a fake recognizer, fake voice detection, fake speech and a fake clock. They never call a real model, and never call real edge-tts or Hugging Face.

- **Main seam: the board session, through `createApp` in-process.** The test opens the board WebSocket, sends typed questions, fake mic frames, pen strokes and playback progress, and checks the events sent down and what the store holds. It covers:
  - sentences, ops and their order
  - interruptions saving every sentence that started and dropping the rest
  - the next turn telling the model where it was cut off
  - board turns joining the conversation's history
  - broken ops skipped and logged
  - the guard moving overlapping and off-board items
  - `clear` starting fresh space
  - the speech first-byte timeout, the retry, and the caption-only fallback
  - a filler playing only after 1 s without audio, a late connector, a tool call's filler, and never the same words twice in a row
  - the tutor-guided wait, hint and carry-on, using the fake clock
  - push-to-talk replacing voice detection
  - leaving the board mid-reply
  - pen references, and images only for models that read images
  - familiarity and concepts after a board reply, with no suggestion marks
  - thinking tokens logged
  - the speech model downloading on first mic use, with progress
  - Prior art: `test/media/videos-narration.test.mjs`, `test/media/videos-streaming.test.mjs`, `test/http/stream-updates.test.mjs` and the discussion tests (`test/http/discussions.test.mjs`, `test/media/discussion-turn.test.mjs`), with `test/support/fake-narration.mjs`.
- **Second seam: the board player, as a plain module with unit tests and no DOM.** The test feeds an event stream and asserts the timeline:
  - entry times and durations at 1×, 1.5× and 2×
  - the estimate before audio length is known
  - an interruption finishing the current item and dropping the rest
  - pause and resume at the exact item
  - the reduced-motion fades
  - the waiting cue within 200 ms
- **Op parsing and the guard** sit behind the main seam, but they get their own unit tests for every kind, every malformed line, and the overlap rules. Prior art: the sketch module tests in `docs/sketches-spec.md`.
- **The persistent Claude process** gets a slow test of its own, like `test/providers/claude-runner.slow.mjs`, because it starts a real CLI adapter. `test/providers/claude-runner.test.mjs` is the fast prior art for the in-process part.
- **The edge-tts client** is tested against a local fake socket server. It covers early open, chunked streaming, the timeout and the retry. Prior art: `test/media/narration.test.mjs`.
- **Component tests** (`test/support/render.mjs`) cover the toolbar, the Board toggle, the rail and the Board settings section.
- **Browser smoke scripts** are only for the release ticket, which plays one scripted board in real Chromium with fake model output.

## Out of Scope

- Side boards: a board opening its own branch when a question drifts. A conversation has one board in v1.
- The quick thinking model voicing the chat model's reasoning during long thinking, which matters only at higher effort.
- Local speech output (Kokoro or Piper). This is the fallback if edge-tts proves unreliable, and for offline use.
- A voice picker, and audio replay of earlier replies.
- Learner tools beyond the pen: highlighter, laser pointer and eraser.
- House-style pieces on the board, for when a recognisable object is needed.
- More components: timeline, cycle, stack and free-form figures.
- Speech-to-speech models: they are too weak at reasoning and need a GPU or an API key.
- Browser speech recognition (the Web Speech API): it doesn't work in Firefox or the desktop app.
- A board model setting separate from the chat model.

## Further Notes

- **The latency budget for a spoken question** is about 1.0–1.4 s to first audio:
  - end-of-speech detection, about 300 ms
  - recognition, about 0.1–0.3 s
  - Sonnet's first sentence, 0.66–0.84 s median
  - edge-tts on an open socket, about 80 ms

  A typed question skips the first two. The margin is thin: about 0.6 s of it is the model's first token. Codex boards will usually miss 1 s, which the waiting cue and the filler cover.
- **Streamed audio format:** Rabbithole-brd.7 tested chunked playback through MediaSource. Firefox 160's MediaSource refuses MP3 (`audio/mpeg`), so the board asks edge-tts for WebM Opus (`webm-24khz-16bit-mono-opus`). Chrome 158 and Firefox 160 play it in about 120-byte frames, starting 30–75 ms after the first chunk. Videos keep MP3. Safari is untested.
- **Untested:** how long Microsoft keeps an idle socket open.
- **edge-tts reliability:** it failed in bursts on a flaky network, with DNS and connect timeouts and sockets that opened but sent nothing. The timeout, retry and captions fallback exist for this.
- **Prototype caveats:** one or two runs per topic, Sonnet only, sizes estimated, and screenshots from headless Chromium.
- **Release order:** this follows the PRD release scope. The board ships for Claude first. Codex works but is slower.
