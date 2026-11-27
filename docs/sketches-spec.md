# Sketches

Decided with the project owner on 2026-11-25 and 2026-11-26 (grilling session). Terms follow `GLOSSARY.md` (learner, tutor, reply, reply layout, visual, visual part, new version, visual frequency, theme, branch, passage). Decision: ADR 0027 (sketches are text the app draws).

The evidence is on the local branch `prototype/sketch`, under `prototypes/sketch/`. Its README holds every experiment, and `integrated/preview.html` shows ten real replies. The prototype renderer there is a stand-in: it settles the syntax and the kinds, not the look. Model quality was settled by manual benchmarks that the owner approved: Claude Sonnet for the prompt wording, and Sonnet plus Codex for the syntax. No ticket under this spec calls a real model (`docs/agents/testing.md`, Real models).

## Problem Statement

A visual is the tutor's only picture, and it is expensive. Each one is a separate call to another model that writes an HTML/SVG/JS fragment, which takes seconds to arrive and costs thousands of tokens. So a reply carries one, two, or at most three, and only its main ideas get one. The smaller points inside a section are left as words: the steps of a process, the layers of a stack, the numbers behind a comparison, who sends what in a protocol, or what each symbol in a formula means. A learner who thinks in pictures has to build those shapes in their head.

## Solution

The tutor draws small diagrams itself, called sketches, right in its reply. It writes a fenced block whose info string is `sketch` and a kind, then one short item per line. The app draws the block the moment it arrives, in the app's theme, without a model call. A sketch costs the tutor about 30 tokens and draws in under a millisecond, so a reply can carry one per section, or even one per paragraph.

There are 17 kinds: flow, cycle, stack, tree, timeline, bars, compare, parts, line, venn, plot, sequence, quadrant, pie, equation, grid and spectrum. A sketch demonstrates rather than repeats: its labels carry what the paragraph leaves out, such as real numbers, a worked example or where things sit on a scale.

Sketches sit alongside visuals and do not replace them. A hard idea still gets a visual, and its sub-points get sketches. The learner can point at a sketch item and ask about it. They can also expand a sketch into a full visual in its place, with the sketch one switch away.

Sketches blend into the chat and stay compact, because a reply carries many of them.

## User Stories

1. As a learner, I want the smaller points of a reply drawn as small diagrams, so that I see the shape of an idea and do not have to build it from words.
2. As a learner, I want a sketch to appear the moment its block arrives, so that reading never waits on a picture.
3. As a learner, I want a reply with several sections to carry a sketch for each section whose idea has a shape, so that pictures follow the whole explanation, not just its headline.
4. As a learner, I want a sketch to show what the paragraph leaves out, such as real numbers, a worked example, who sends what, where things sit on a scale or what each symbol means, so that it adds to the text instead of repeating it.
5. As a learner, I want sketches in many shapes (steps, cycles, layers, hierarchies, parts, comparisons, quantities, shares, ranges, dates, exchanges, formulas, grids of values, two-axis maps and graphs), so that each idea gets the picture that fits it.
6. As a learner, I want the main ideas of a reply to keep their full visuals, so that sketches add pictures instead of taking the rich ones away.
7. As a learner, I want a hard idea to always get a full visual, with sketches only for its sub-points, so that the hardest part is never left to a small diagram.
8. As a learner, I want sketches to blend into the chat and stay compact, so that a reply with many of them still reads as one calm text.
9. As a learner, I want sketches drawn in my theme, light or dark, so that they match the rest of the app.
10. As a learner, I want a sketch to redraw when I switch theme, so that it never shows the old colours.
11. As a learner, I want the word or two the tutor marks as the focus to stand out in a sketch, so that I know where to look first.
12. As a learner, I want a sketch to sit right after the text it illustrates, so that the picture and its words stay together.
13. As a learner, I want sketches inside every reply layout (figure beside text, comparison, steps, stages, key terms, callout, timeline, wide and the rest), so that a layout's section can carry its picture too.
14. As a learner, I want a sketch inside a layout to fit the layout at narrow and wide widths, so that nothing overflows or gets squeezed unreadable.
15. As a learner, I want a calm placeholder where a sketch is still streaming, so that I never see half-written sketch source.
16. As a learner, I want a sketch the app cannot draw to be left out quietly, so that I never see raw source or an error box in a reply.
17. As a learner, I want sketches to fade in briefly, one item after another, over about half a second, so that the picture builds in front of me.
18. As a learner who turned on reduced motion, I want sketches to appear at once, so that nothing moves.
19. As a learner, I want sketches to work with the reply's reveal, so that they appear in step with the text around them.
20. As a learner, I want to point at a sketch item and ask about it, as I can with a visual part, so that any small piece of a diagram can open its own explanation.
21. As a learner, I want to expand a sketch into a full visual in the same place, so that I can get the rich, interactive picture when a sketch is not enough.
22. As a learner, I want the sketch I expanded to stay one switch away from its visual, so that I can go back to the compact view.
23. As a learner, I want the expanded visual to be a normal visual, with its visual parts, new versions and everything else a visual has, so that expanding gives me nothing less than a visual the tutor drew.
24. As a learner, I want the expanded visual to stay in place when I come back to the conversation, so that I do not have to expand it again.
25. As a learner, I want the Figures list and the "Fig N" numbers to count only visuals, so that dozens of sketches do not crowd the list.
26. As a learner, I want the checks (predict, then reveal) to stay full visuals, so that a check keeps its interaction.
27. As a learner using a screen reader, I want each sketch read out from its title and items, so that I get the same content as a sighted learner.
28. As a learner, I want my Visual frequency setting to govern sketches as well as visuals, so that one setting controls how many pictures I get.
29. As a learner on Often, the default, I want many sketches plus the usual visuals, so that the default gives the most pictures.
30. As a learner on Sparing, I want sketches only where they clearly help, so that my replies stay mostly text.
31. As a learner on Only when asked, I want no sketches unless I ask for one, so that the setting means what it says.
32. As a learner, I want the tutor to remember the sketches it already drew in the conversation, so that later replies can build on them instead of repeating them.
33. As a learner, I want sketches to cost almost nothing, so that drawing many never makes the tutor slower or my usage heavier in a way I notice.
34. As a learner on Codex, I want sketches drawn as reliably as on Claude, so that my model choice does not decide whether I get them.
35. As the tutor, I want a short, fixed syntax for each kind, so that I can write a sketch inline without a tool call.
36. As the tutor, I want to choose freely among all kinds, so that I pick whichever fits each idea best.

## Implementation Decisions

### Format

- A sketch is a fenced code block whose info string is `sketch` followed by one kind, such as ```` ```sketch bars ````. The syntax benchmark compared the fence with a `[[sketch: …]]` marker. The fence failed 0 of 238 sketches on Sonnet and Codex. The marker failed 5 of 136 on Sonnet, all of them compare sketches, where its second in-field separator confused the model. The fence rule is also 70 to 95 tokens cheaper.
- A sketch's body has one item per line. An optional first line `title: …` names it. Wrapping one or two words in `*stars*` marks the focus. The tutor rule asks for labels under 40 characters and at most 8 items.
- These are the kinds and their lines. They come from the prototype's accepted rule and encode the syntax exactly:

  | Kind | Lines |
  |---|---|
  | flow | `A -> B` or `A -> B: arrow label`; steps, cause and effect; may branch and rejoin |
  | cycle | one stage per line, in order; the last leads back to the first |
  | stack | one layer per line, top first, `name: note` |
  | tree | an indented outline, two spaces per level |
  | timeline | `when: event`, in order |
  | bars | `label: number`, with an optional unit after the number |
  | compare | first line `vs: A \| B`, then `aspect: A's value \| B's value` |
  | parts | first line `whole: name`, then `part: what it does` |
  | line | first line `range: min..max`, then `value: label`; a number line |
  | venn | two lines `set name: item, item`, then `both: item, item` |
  | plot | one or two `y = …` lines in x (`+ - * / ^`, `sin cos exp log sqrt`), then `x: min..max` |
  | sequence | first line `actors: A \| B \| C`, then `A -> B: message` or `A: note`; who sends what, in order |
  | quadrant | lines `x: low .. high` and `y: low .. high`, then `item: x, y` with x and y from 0 to 10 |
  | pie | `label: number`; shares of one whole |
  | equation | first line `eq: …` with symbols separated by spaces, then `symbol: meaning` |
  | grid | rows of cells separated by spaces; `name:` above a grid captions it; a line holding only `×`, `=`, `+` or `→` joins two grids, as in image × kernel = output |
  | spectrum | first line `ends: low .. high`, then items in order along it, `item: note` |

- Mermaid was tried in the prototype and dropped. It added 158 prompt tokens but took about 30 ms to draw, drew tiny text on wide charts and could not offer click-to-ask. Older Mermaid diagrams stay diagrams, as today.

### Sketch module

- A new plain module turns a kind, a sketch's body and the theme palette into a drawing, or into an error naming what is wrong. It has no React and no model call, and it is the only place that knows the 17 kinds.
- Its colours come from the same theme tokens the visuals receive, in both light and dark. A theme switch redraws every sketch on screen.
- It returns one item per drawn element, carrying that element's label. This list is what the item asking and the screen-reader text use.
- An unknown kind, an empty body, or a body that matches no line of its kind is an error. Values outside a kind's range, such as a quadrant coordinate above 10, are errors too.
- The look is not decided by the prototype. Sketches are designed with Impeccable to blend into the chat and stay compact. The design needs a mockup at `docs/mockups/<issue-id>.html` before its ticket is published (label `new-ui`).

### Reply rendering

- Reply rendering draws a ```` ```sketch ```` block as a sketch instead of a code block. It shows no copy button and never shows the source.
- A sketch can sit anywhere a paragraph can, including inside every reply layout. A sketch never sits inside another sketch.
- A sketch whose fence is still open while the reply streams shows a placeholder the size of a small sketch. It draws once the fence closes.
- A sketch that fails to draw is hidden from the learner. The error is logged with its kind and reason. The learner never sees the raw source or an error box.
- Sketches fade in one item after another over about 0.5 s. With reduced motion they appear at once. They follow the reply's reveal the way the text around them does.
- Screen-reader text is built from the title and the items. The tutor writes no alt text for a sketch.
- Sketches are not counted in the Figures list or the "Fig N" numbering.

### Asking about a sketch item

- Every drawn item of a sketch can be pointed at and asked about, in the same way as a visual part. Asking opens a branch from that item, carrying the sketch's title and the item's label.

### Expand into visual

- Each sketch offers "Expand into visual". Expanding sends a normal visual request, built from the sketch's title and items and the text it sits beside. The new visual replaces the sketch in place.
- The sketch stays one switch away, as a replaced version does with a new version. The expanded visual is an ordinary visual artifact, tied to the sketch's place in the reply, so it comes back when the conversation reopens.

### Storage and history

- A sketch is only text in the reply. It has no artifact record and no extra storage. Only an expand creates a record, the visual's own.
- The conversation history sent to the tutor keeps each sketch's source, about 30 tokens each, not a summary of it.

### Tutor prompt

- The chat prompt gains the sketch rule. It is inserted after the visual guidance, just before the Visual frequency sentence. The app's visual rules stay word for word, including "Use one visual per idea…". There is no rule balancing sketches against visuals, no cap on any kind, and no list teaching which kind fits which idea. The owner rejected each of these: they took visuals away or read as forced.
- The rule as accepted (v10). Its kinds list is the table above, written as the prototype's `rule-templates-v6.txt` lists it:

  > Sketches: small diagrams you write yourself for the smaller points inside a section, beside the visuals that carry its main ideas; the app draws them instantly in its theme. A sketch costs about 30 tokens, so use them generously: give each section or paragraph that has a shape its own sketch (steps, a cycle, layers, a hierarchy, parts, a comparison, quantities, a range, dates). A reply with five sections usually has four or five sketches. A sketch can sit anywhere a paragraph can, inside a layout too, and a list or layout still gets its sketch beside it, showing in a shape what it says in words. Before you finish, check each section: one whose idea has a shape carries a sketch. A sketch demonstrates: its labels carry what the paragraph leaves out, such as real numbers, a worked example, who sends what, where things sit on a scale or what each symbol means. Put each right after the text it illustrates. Write a fenced block whose info string is `sketch` and a kind, one item per line, labels under 40 characters, at most 8 items. An optional first line `title: …` names it. Wrap one or two words in *stars* to mark the focus.
  >
  > (the bars example "Why ice floats": `Liquid water at 4 °C: 1.000 g/cm³` and `*Ice* at 0 °C: 0.917 g/cm³`, then "Kinds and their lines:" and the 17 kinds)
  >
  > Use the whole range of kinds, picking whichever fits each idea best.

- The media-block sentence changes to positive wording. "…; never write a fenced media block." becomes: "Draw a sketch in a ```sketch <kind> block; request a visual with a visual marker, a video with make_video and a discussion with a discussion marker."
- Visual frequency now governs sketches as well as visuals:
  - **Often** (accepted, v10). The existing sentence stays and gains: "Sketches sit alongside these visuals, so draw visuals as you normally would and add sketches wherever a section has a shape."
  - **Sparing** (default wording, not benchmarked). The sentence becomes "draw a visual or a sketch only where it clearly helps".
  - **Only when asked** (default wording, not benchmarked). The sentence becomes "draw no visual or sketch unless the learner asked for one". The sketch rule stays in the prompt, so the tutor knows the format when the learner does ask.
  - Whenever the learner asks for a sketch, the tutor draws one.
- Checks (predict, then reveal) stay visuals only.

## Testing Decisions

- A good test checks what the learner or the tutor would see: the drawn sketch, its items and their labels, the screen-reader text, the prompt text, and what is hidden or shown. It does not check SVG coordinates or internal helpers.
- **Sketch module (new seam, unit).**
  - For each of the 17 kinds, a valid body draws with the expected items and labels.
  - The title and the focus marked with stars are carried through.
  - Each malformed body gives an error: an unknown kind, an empty body, lines that match nothing, and out-of-range values.
  - The colours come from the given light and dark palettes.
  - Kinds are tested here and not only through reply rendering, because reply rendering hides a broken sketch and cannot say why it broke.
- **Reply rendering (existing seam, unit and component).** This seam is `renderMarkdown`.
  - A sketch block draws a sketch, with no code block and no copy button.
  - It draws inside each reply layout.
  - An open fence while streaming shows the placeholder.
  - A broken sketch shows nothing from its source and is logged.
  - Sketches are absent from the Figures list.
  - Prior art: `test/chat/markdown.test.mjs` and `test/chat/reply-layouts.test.mjs`.
- **Tutor prompt (existing seam, unit).** This seam is `tutorSystem(tree)`.
  - The sketch rule sits before the Visual frequency sentence.
  - Each setting carries its sketch wording.
  - The app's visual rules are unchanged.
  - The positive media-block sentence replaces the "never" sentence.
  - Prior art: `test/media/tutor-style.test.mjs`.
- **Sketch in a reply (existing component seam).**
  - Pointing at an item offers to ask about it, and asking opens a branch with the item's label.
  - "Expand into visual" sends a visual request built from the sketch and replaces the sketch in place.
  - The switch brings the sketch back, and the expanded visual is restored when the conversation reopens.
  - The screen-reader text is built from the title and the items.
  - Reduced motion shows the sketch at once.
  - Prior art: `test/chat/reply-media-layouts.test.mjs`.
- **Acceptance for layouts.** Each reply layout holds a sketch at narrow and wide widths, both with the reveal on and with reduced motion.

## Out of Scope

- New kinds beyond the 17, such as a balance scale, an icon array, a funnel or an undirected network.
- Sketches the learner edits, or a sketch drawn by any model other than the tutor.
- Sketches in brief explanations, discussions, videos or boards.
- Sketches as checks (predict, then reveal).
- Counting sketches as figures, or exporting them on their own.
- Turning older Mermaid diagrams into sketches.

## Further Notes

- **Release condition (owner, Q5).** A Codex benchmark of the accepted rule, with all 17 kinds, has zero failed sketches. This is judged in a planning session with the owner, not by a ticket. The earlier syntax benchmark had 0 failures on Codex, but it used only the first 11 kinds.
- **Accepted trade-off.** Any sketch rule takes some visuals from hard and mixed replies. The averages below are per 10 replies, over 2 runs of 10 questions each:

  | | Today's app | v10 |
  |---|---|---|
  | Visuals | 17.5 | 12.5 |
  | Easy replies with a visual | 6 of 6 | 6 of 6 |
  | Sketches | 0 | 27.5 |
  | Kinds used | – | 8 |
  | Broken sketches | – | 0 |
  | Output tokens | 15.6k | 17.2k |

  In hard and mixed replies, today's app gives 2 to 4 visuals each and v10 gives 1 to 2 plus sketches. This matches the owner's teaching model: the big idea gets a visual, and its sub-problems get sketches. The stronger the sketch wording, the more visuals it took.
- **Flow share.** Without kind hints, flow is about 40% of all sketches. The owner chose free choice with the plain "whole range" line over any steer or cap.
- **Wording for Sparing and Only when asked.** It is the default chosen for this spec. A later planning benchmark may refine it.
