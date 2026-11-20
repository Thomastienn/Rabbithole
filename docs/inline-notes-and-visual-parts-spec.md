# Inline notes, visual markers and visual parts

Decided with the project owner on 2026-11-20 (grilling session). Terms follow `GLOSSARY.md` (tutor, learner, reply, suggestion, groundwork, next question, brief explanation, quick thinking model, visual, visual part, step, passage, branch, branch family, address, custom endpoint). Decisions: ADR 0016 (the tutor marks its notes inline) and ADR 0017 (a marker in the text places each visual). Refines the [visual asking and motion spec](visual-asking-and-motion-spec.md) where they conflict: picking visual parts returns, now required for every object and always on.

## Problem Statement

A reply can show the same visual twice at its end. On 2026-11-20 a Claude Sonnet reply about nuclear power drew "How a nuclear plant makes electricity" twice, 13 seconds apart, both after the last line, because the tutor answered a second time after its `record_turn` call.

On Claude, visuals land at the end of the reply instead of beside the text they explain: four of Claude Sonnet's last six visuals sit at 95 to 100 percent of their reply. The tutor quotes the words a visual follows, and a quote that crosses bold text matches nothing.

Suggestions and groundwork appear only after the whole reply and its notes call have arrived. The learner meets an unfamiliar term midway through reading and has nothing to click; groundwork, which the learner may need before the text, arrives after it. Handing the notes to the quick thinking model instead took about 15 seconds.

Every quick thinking call on Claude starts a new model process, so each brief explanation waits for a start-up. Brief explanations are also long, about 100 words of plain text, when the learner wants something read at a glance.

In a formula, any selection picks the whole formula, so the learner cannot ask about one term or one line of a worked solution. In a visual, the learner can only ask about the whole thing, never about one component or one of its details.

## Solution

- **Notes while reading.** The tutor writes groundwork as a hidden first line, marks each suggestion where it writes the term and ends with a hidden section of next questions, the same for every provider. Groundwork shows as the reply begins, each underline appears with its term and next questions follow about a second after the text. The quick thinking model writes the hidden notes (concepts, links, the concept each suggestion names, the verdict) in the background.
- **No repeated answers.** The end section ends the reply: the server stops the tutor's run there, so it never answers twice. A second visual with a title already used in the same reply is refused as a safety net.
- **Visuals where they belong.** The tutor writes a visual marker in its text exactly where the visual goes, inside `:::wide` or `:::figure` too, and the visual lands there.
- **Quick thinking always ready.** The quick thinking model never waits for a start-up on any provider; each call starts with clean context.
- **Short brief explanations.** A brief explanation is a few short sentences read in a second or two, with bold or italics where a key word needs it.
- **Select inside formulas.** Selecting inside a formula works like selecting text and asks about just that term or line.
- **Point at visual parts.** Hovering a visual draws a subtle rectangle and a name around the part under the pointer; one click asks about it, from a whole component down to its details.

## User Stories

### Notes while reading

1. As a learner, I want groundwork offered as soon as a reply begins, so that I can learn what I need before reading the text that assumes it.
2. As a learner, I want a suggestion underlined the moment its term appears, so that I can branch from an unfamiliar term while I am still reading.
3. As a learner, I want to open a suggestion while the reply is still streaming, read its brief explanation and write my branch question, so that I do not lose the thought; the branch is created once the reply finishes.
4. As a learner, I want next questions to appear about a second after the reply text ends, so that I can keep going without waiting.
5. As a learner, I want no next questions after a casual turn, so that small talk stays small.
6. As a learner, I want never to see a marker, bracket or note syntax in a reply, so that replies read as plain prose.
7. As a learner, I want copied reply text free of markers, so that what I copy is what I read.
8. As a learner, I want a reply that ends to be finished at once, so that I can ask my next question without waiting for a hidden extra round.
9. As a learner, I want the tutor never to repeat its answer, so that a reply never holds the same text or visual twice.
10. As a learner using any provider, I want notes to arrive the same way, so that switching models never changes how the app behaves.
11. As a learner using a weaker model, I want a reply whose notes went missing to still get suggestions, groundwork and next questions afterwards, so that I am never left without them.
12. As a learner, I want my familiarity and the knowledge graph to keep updating after each reply, so that later groundwork and suggestions still fit me.
13. As a learner, I want suggestions on a reply I reopen to stay where they were, so that a saved conversation reads the same later.

### Visuals

14. As a learner, I want each visual right after the text it illustrates, so that I see it where the explanation needs it.
15. As a learner, I want a visual at the very end only when it illustrates the closing text, so that visuals do not pile up at the bottom.
16. As a learner, I want a visual beside its text when the tutor sets it in a figure, so that I read both together.
17. As a learner, I want a visual at full width when the tutor sets it wide, so that a detailed visual has room.
18. As a learner, I want several different visuals in one reply when the idea needs them, so that a complex idea can be shown in steps.
19. As a learner, I want never to see the same visual twice in one reply, so that a repeat never wastes my attention.
20. As a learner, I want a later reply to be free to show a visual with an earlier title, so that the tutor can revisit an idea.
21. As a learner, I want visuals saved before this change to stay where they were, so that old conversations look the same.

### Quick thinking

22. As a learner, I want a brief explanation to appear without waiting for a model to start, so that it feels instant.
23. As a learner, I want quick thinking just as fast whichever provider I chose, so that no provider is the slow one.
24. As a learner, I want switching quick thinking models or model profiles never to make me wait, so that I can change models freely.
25. As a learner, I want a brief explanation I am waiting for to go ahead of background work, so that hidden notes never delay it.
26. As a learner, I want the app to free its memory while I am away, so that an idle app does not hold a model process for hours.

### Brief explanations

27. As a learner, I want a brief explanation of a few short sentences, so that I can skim it in a second or two.
28. As a learner, I want a key word in a brief explanation shown in bold or italics where it helps, so that I catch the point at a glance.
29. As a learner, I want inline code and math in a brief explanation rendered, so that a formula reads as a formula.
30. As a learner, I want the brief explanation styled the same in the suggestion popup and above the branch question box, so that it looks the same wherever I see it.
31. As a learner, I want brief explanations I already saved to stay as they are, so that nothing I read before changes.

### Formulas

32. As a learner, I want to drag across part of a formula like text, so that I can ask about one term such as `mc^2`.
33. As a learner, I want to select one line of a worked solution, so that I can ask about that step alone.
34. As a learner, I want a selection that cuts through a fraction, root or superscript to widen to the whole term, so that what I ask about is always a complete expression.
35. As a learner, I want the highlight to show the widened term before I ask, so that I know exactly what I am asking about.
36. As a learner, I want a selection from text into a formula to work too, so that I can ask about a sentence and its equation together.
37. As a learner, I want a branch from part of a formula to underline just that part, so that I can see later what I asked about.

### Visual parts

38. As a learner, I want hovering a visual to draw a subtle rectangle around the part under my pointer, so that I can see what I would ask about.
39. As a learner, I want the part's name shown beside the rectangle, so that I know what the tutor calls it.
40. As a learner, I want one click on a part to open the ask box for it, just as clicking an underline does, so that asking about a visual feels like asking about text.
41. As a learner, I want the part picked to be the smallest one under my pointer, so that I can point straight at a detail.
42. As a learner, I want to pick a whole component by pointing at its own area, so that I can ask about the big part too.
43. As a learner, I want a trail such as "Nuclear plant › Reactor › Control rods" in the ask box, so that I can widen my question to a larger part.
44. As a learner, I want the visual's buttons, sliders and drag handles to keep working, so that picking never breaks an interactive visual.
45. As a learner, I want the Ask button to stay for the whole visual, so that I can still ask about everything at once.
46. As a keyboard user, I want to move between parts and narrow or widen my pick from the ask box, so that I can ask about a part without a pointer.
47. As a learner, I want parts in 3D visuals too, so that I can point at an object in a 3D scene.
48. As a learner, I want the child conversation to know exactly which part I picked and where it sits, so that the tutor answers about that part.
49. As a learner, I want a part I branched from to keep a subtle rectangle in its branch family ink, so that I can see what I already asked about.
50. As a learner, I want that rectangle on every step that still draws the part, so that it stays marked while the scene continues.
51. As a learner, I want returning to a branch's source to open the visual at the step where I picked the part, so that I see it as I saw it.
52. As a learner, I want my branches kept when I try a different version of a visual, so that nothing I asked is lost.
53. As a learner, I want the rectangle shown in a new version only where it still draws the same part, so that it never marks the wrong thing.
54. As a learner, I want a brief explanation for a part or formula selection only when I ask for one, so that picking stays instant.
55. As a learner, I want older visuals and diagrams to keep their whole-visual Ask, so that they still work as before.

## Implementation Decisions

### Inline notes (ADR 0016)

- The tutor marks notes with double brackets:
  - `[[groundwork: name; name]]` once, before any reply text, with at most three concept names. The server ignores a groundwork marker that comes after reply text.
  - `[[term]]` around a suggestion where it is written. The term stays in the reply and only the brackets are stripped; the suggestion's passage is the term's place in the stripped text. A suggestion is one to six words, as the current notes reader requires.
  - `[[next: question]]` for each of up to three next questions, and `[[video offer: question]]` for the rare video offer.
  - `[[end]]` closes the end section and is always written, with no next questions after a casual turn. Chosen default: the explicit `[[end]]` lets the server tell "nothing to offer" from "the model ignored the format".
- One streaming stripper in the reply parser removes markers as deltas arrive. It holds back an unfinished `[[` at a delta's end until it closes. An unclosed marker at the end of its line loses its brackets and stays as plain text. Markers inside code spans, code blocks and math are left as text.
- Each marker is sent to the client as it closes, through the existing groundwork, suggestions and next-question events. Suggestions grow during the stream and become ready when the reply finishes. Stored reply text never contains markers.
- The current notes reader's validation and limits carry over to the markers: duplicates are skipped and lengths and counts are bounded.
- The tutor still receives the concept neighbourhood so groundwork reuses known concept names.
- When `[[end]]` arrives, the server runs any tool calls already in that model response, finishes the reply as completed and aborts the provider run. Text after `[[end]]` is dropped. An adapter whose run the server ended reports the reply as completed, not interrupted, and sums usage from each model message, since a stopped run reports no final summary.
- The next turn must resume the conversation's session after a stopped run, on Claude and on Codex. Check this when implementing.
- `record_turn` is removed: its tool definition, reader, prompt rules, the forced `tool_choice` call for custom endpoints, and its section in `docs/custom-endpoint.md`. The app-call guard that refused calls after `record_turn` goes with it.
- After every completed reply, one quick thinking call writes the reply's concepts with topics, the links between them and the concept each suggestion names. The verdict keeps its own background call. If a completed reply had no `[[end]]`, that call also marks suggestions, groundwork and next questions, through the existing notes path.
- Models without native tool calling keep the Hermes-style `<tool_call>` text for media calls; their notes use the same markers.
- Opening a suggestion while the reply streams shows its brief explanation and the branch question box. A question sent before the reply finishes waits and creates the branch when the reply completes, so the child's inherited context covers the whole reply. Chosen default, not settled in the grilling session: branching from a partial reply would compact text that is still changing.

### Visual placement and duplicates (ADR 0017)

- `show_visual` gains a required `name`, a short slug of at most 40 characters, and loses `after` and `side`.
- The tutor writes `[[visual: name]]` where the visual goes. The server records each visual marker's position in the stripped text:
  - A visual lands at the marker with its name, whether the marker came before or after the call.
  - A visual whose marker has not arrived yet shows at the call's position, and moves to the marker once it arrives.
  - A marker with no call in the reply is dropped when the reply finishes.
- Layout rules: `:::wide` holds one image or visual marker, and `:::figure` sets an image or visual marker beside its text. This undoes `b723f35`'s images-only rule for `:::wide` and ADR 0014's for `:::figure`.
- A `show_visual` whose title matches one already called in the same reply, ignoring case and whitespace, is not drawn. The tutor gets "already shown; continue your reply without repeating it", and the refusal is logged. A reply is the whole answer to one learner message, across all its model responses.
- The `queued; continue your reply where you stopped, without repeating any text.` result stays.
- Stored visuals keep their saved position and side.

### Quick thinking runner

- One rule for every provider: a quick thinking call never waits for a start-up, and each call starts with clean context and names its own model and effort.
- Only the provider of the chosen quick thinking model keeps a runner, and switching to another provider closes the old one.
  - Codex already meets the rule with one `app-server` and a fresh thread per call.
  - A custom endpoint needs nothing.
  - Claude keeps one headless CLI process started ahead of time and waiting for its first message. If Claude Code can clear a session and switch models inside a running process, the runner reuses that process. Otherwise it replaces the process in the background after each call. Check which is possible when implementing.
- Where a runner's system prompt is fixed when it starts, the task's instructions move into the call's message.
- Calls a learner waits for, such as brief explanations and the compaction for a branch being created, take the ready runner first. A background call (hidden notes, titles, verdicts) uses the runner when it is free, or starts its own process as today.
- The runner closes after 10 minutes without a quick thinking call; the next call starts it again.

### Brief explanations

- The prompt asks for one paragraph of a few short sentences that a learner can skim in a second or two, saying what the term is or why it holds in this reply. Bold, italics, inline code and inline math are allowed; headings, lists and links are not. There is no word count.
- Brief explanations render with the reply's inline markdown renderer in the suggestion popup and above the branch question box.
- Saved brief explanations stay as they are.

### Formula selection

- Math nodes carry source offsets taken from KaTeX's parse tree, in place of one atomic offset for the whole formula.
- A selection inside a formula maps to the smallest LaTeX span covering the selected symbols. The span widens to whole groups: fractions, roots, scripts, `\left…\right` pairs and environment rows.
- The passage is that LaTeX substring, and the highlight snaps to the widened span. A selection crossing text and formula applies the same rule at each end.
- KaTeX's parse tree is not a public API, so pin the version and cover the mapping with unit tests.

### Visual parts

- The visual writer wraps every meaningful object in a group carrying its visual part name, nested up to three levels:
  - SVG and HTML: a group or container element with a name attribute.
  - three.js: the object's name plus a part flag.
- Names are short and in the learner's language, and controls are never named as parts. This is required for every new visual and every "Try a different version".
- The sandbox reads the part tree and posts it to the host with names, nesting and bounds. Picking is always on:
  - Hovering hit-tests the smallest named part under the pointer. It uses elements in SVG and HTML and a raycast against named objects in three.js.
  - The host draws a subtle rectangle at the part's on-screen bounds and a small name label.
  - Controls never pick: buttons, inputs, selects, sliders, elements with their own pointer handlers, and the step-through Previous and Next.
  - One click opens the floating ask box with that part as its source.
- The sandbox is untrusted. The host accepts only bounded part messages, following the existing height-message validation: at most three names per trail, bounded length, no control characters, and bounds inside the frame.
- The ask box shows the trail, and choosing an earlier entry widens the source to that ancestor. The whole-visual Ask button stays. From the ask box, arrow keys move between parts at the current level, Enter narrows to a child and the trail widens.
- Branches gain the picked part's trail and step as new nullable fields. The label is the part's name. The child's source is the part's name, its trail, and the visual's title and description.
- A branched part keeps a subtle rectangle in its branch family ink on every step that draws it. Returning to the source or clicking the address chip opens the visual at the stored step and brings the rectangle into view. The rectangle shows only where the current version has a part with the same trail.
- Older visuals without a part tree, Mermaid diagrams and plain canvas visuals keep only the whole-visual Ask. Visuals have no native text selection.
- A brief explanation for a visual part or formula selection comes only on request, as for a passage the learner selected.

## Testing Decisions

- A good test drives a reply, a selection or a pick the way a learner or the server would, and asserts what the learner sees or what the server stores. It never asserts how a module is built. Shared provider behaviour runs on one provider (`TEST_PROVIDER`).
- Streaming stripper and markers: unit tests on the reply parser, with markers split across deltas, unclosed markers, markers in code and math, and positions in the stripped text. Prior art: `test/media/diagram-parser.test.mjs`, `test/media/tolerant-requests.test.mjs` and `test/media/record-turn.test.mjs`, which is replaced.
- End of reply, placement and the duplicate guard: integration through the send route with a scripted fake provider. Assert events in order, marker-free stored text, the run stopped at `[[end]]`, a visual at its marker, and the duplicate refused. Prior art: `test/providers/show-visual-loop.test.mjs`, `test/providers/tool-loop.test.mjs` and `test/chat/suggestions-notes.test.mjs`.
- Hidden notes and the fallback: `test/chat/suggestions-calls.test.mjs`, `test/chat/suggestions-knowledge.test.mjs` and `test/http/verdicts.test.mjs`.
- Quick thinking runner: adapter tests with the protocol fixture, covering reuse, a model switch, priority and the idle close. Prior art: `test/providers/provider.test.mjs` and `test/http/quick-calls.test.mjs`. Start-up timing and session resume against the real Claude CLI go in a `.slow.mjs` file.
- Brief explanations: `test/http/briefs.test.mjs` for the prompt, and `test/chat/brief-popup.test.mjs` for markdown rendering.
- Formula selection: unit tests on the offset mapping, and component tests in `test/chat/passage-selection.test.mjs` and `test/chat/display-math.test.mjs`.
- Visual parts:
  - Unit tests on the sandbox's part-tree reading and hit-testing. `test/media/visual-parts.test.mjs` currently asserts that tags stay inert, so update it.
  - Host validation in the same file.
  - Component tests for the ask box trail, keyboard picking, the highlight and the step return, in `test/media/visual-ask.test.mjs` and `test/media/visual-branch.test.mjs`.

## Out of Scope

- Picking objects inside videos or their cuts.
- Part picking for plain canvas visuals and Mermaid diagrams.
- Regenerating old visuals or old brief explanations.
- Any provider-specific note format or prompt.
- A brief explanation on hover over a visual part.
- Changes to `make_video` and `start_discussion`.

## Further Notes

- Evidence from the owner's data on 2026-11-20:
  - The nuclear reply drew the same visual twice at 1530 and 1540 of 1543 characters, before `b723f35`.
  - Claude Sonnet visuals land at 95 to 100 percent of the reply, while Codex and custom endpoints land at 6 to 55 percent.
  - The seven saved brief explanations average 556 characters, and the old suggestion call averaged 546 output tokens.
- To check when implementing:
  - Whether Claude Code can clear context and switch models inside a running process.
  - The memory a headless Claude runner uses.
  - That sessions resume after the server stops a run.
  - That per-message usage matches the final summary it replaces.
- Visual part picking is new UI: it needs a mockup at `docs/mockups/<issue-id>.html` before its ticket is published.
