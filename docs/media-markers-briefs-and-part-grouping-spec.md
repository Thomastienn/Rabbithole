# Media markers, ready brief explanations, visual part grouping and a still page

Decided with the project owner on 2026-11-20 (grilling session). Terms follow `GLOSSARY.md` (tutor, learner, reply, suggestion, brief explanation, quick thinking model, visual, visual part, step, discussion, classmate, familiarity). Decisions: ADR 0018 (markers carry visuals and discussions; videos stay tool calls). Refines the [inline notes, visual markers and visual parts spec](inline-notes-and-visual-parts-spec.md) where they conflict: a visual marker now carries the visual's fields, and no `show_visual` call exists.

Model quality was settled by manual benchmarks in the grilling session (Claude Haiku, effort medium), approved by the owner. No ticket under this spec calls a real model (`docs/agents/testing.md`, Real models).

## Problem Statement

A visual the tutor meant to show can vanish. On 2026-11-20 a Claude Sonnet reply explaining fusion wrote where its visual goes but never asked for it, so the learner saw a blank gap after "The neutron carries most of the energy." and had to ask "no visualization at all?". In a benchmark the tutor asked for 1 of 12 visuals it had placed.

A discussion can start with text trailing after it, such as "The discussion with Mara, Dev, Jonah and Priya is started…", and a discussion whose opening breaks a rule costs several retries before it starts.

A brief explanation takes more than a second to appear when the learner opens a suggestion, because it is written only then. It is also longer than a glance allows.

In a visual, the learner cannot point at one object. In the fusion visual, every proton and neutron was one part and every label another, so pointing at the deuterium nucleus or its label asked about all nucleons or all labels at once. When the nuclei merged and split, no part matched what was shown.

The whole page can scroll. After opening Settings and coming back, the app stays shifted up with an empty band at the bottom, a page scrollbar on the right and a horizontal scrollbar under the chat column.

## Solution

The tutor asks for a visual or a discussion by writing one marker line that carries everything needed, so a visual it places is always drawn and a discussion ends the reply cleanly. The server repairs small mistakes itself and drops, logs and never shows a marker it cannot use. Videos still go through a tool call.

Every suggestion in a reply gets its brief explanation written in the background once the reply ends, so opening a suggestion shows it at once. Briefs are about two or three short sentences.

The visual writer names one part per object the learner would name, keeps each label inside the part it names, and regroups parts at each step so they match what that step shows.

The page itself never scrolls: whatever moved it is fixed at its source, and each scrolling area scrolls inside itself.

## User Stories

1. As a learner, I want every visual the tutor places in its reply to appear there, so that I never meet a blank gap where an explanation should be.
2. As a learner, I want a visual to start drawing as soon as the tutor has written where it goes, so that it is ready by the time I read that far.
3. As a learner, I want a visual whose title or description ran long to still appear, so that a wordy tutor does not cost me the picture.
4. As a learner, I want a visual whose title or text alternative was left out to still appear with a sensible title and text alternative, so that small slips do not cost me the visual.
5. As a learner, I want a garbled visual request never to show up as raw text in the reply, so that I never see markup or the hidden answer of a check.
6. As a learner, I want a check's answer to stay hidden until I reveal it, even when the tutor's request was malformed, so that the check still tests me.
7. As a learner using a screen reader, I want every visual to keep its text alternative, so that I get the same explanation.
8. As a learner, I want visuals placed inside a wide or figure layout to keep landing there, so that layouts keep working as before.
9. As a learner, I want a discussion I ask for to start with three or four classmates and a short opening, so that it starts the same way it does now.
10. As a learner, I want the tutor's reply to end where the discussion starts, so that no stray sentence appears after the discussion.
11. As a learner, I want a discussion whose opening ran too long to still start, trimmed to its first eight lines, so that I am not left without the discussion I asked for.
12. As a learner, I want a discussion that cannot start to leave no raw text behind, so that the reply still reads cleanly.
13. As a learner, I want videos to keep starting only when I ask for one, so that nothing costly starts unasked.
14. As a learner on any provider, I want visuals and discussions to behave the same, so that switching models does not change what I get.
15. As a learner, I want the brief explanation to appear the moment I open a suggestion, so that I can read it at a glance without waiting.
16. As a learner, I want a brief explanation of about two or three short sentences, so that it reads in a second or two.
17. As a learner, I want a suggestion I open while the reply is still arriving to still get its brief explanation, so that early curiosity is not punished.
18. As a learner, I want the brief explanation I already read to stay the same when I open the suggestion again, so that it does not change under me.
19. As a learner, I want brief explanations I never open to leave my familiarity untouched, so that background work does not pretend I have seen a concept.
20. As a learner, I want opening a suggestion's brief explanation to count as weak familiarity evidence, as it does today, so that my map stays honest.
21. As a learner, I want briefs for passages I select myself and for visual parts to keep working on request, so that nothing I use today goes away.
22. As a learner, I want to point at a single object in a visual, such as one nucleus, and ask about it alone, so that I am not forced to ask about a whole group.
23. As a learner, I want pointing at a label in a visual to ask about the object it names, so that labels lead where I expect.
24. As a learner, I want a visual's parts to match what each step shows, such as two separate nuclei before a merge and a helium nucleus and a neutron after it, so that I can ask about what I am looking at now.
25. As a learner, I want a visual's step caption and legend to keep asking about the whole visual, so that text that names no object behaves predictably.
26. As a learner, I want the app to stay in place after visiting Settings, so that no empty band or page scrollbar appears.
27. As a learner, I want only the panel I am using to scroll, so that the app's frame never shifts.
28. As a learner, I want no horizontal scrollbar under the chat column, so that the reading area fits its space.
29. As the project owner, I want every visual or discussion marker the server drops to be logged with its reason, so that silent losses like the fusion reply show up in the log.
30. As the project owner, I want dropped-marker logging before the larger change, so that losses are visible from now on.
31. As the project owner, I want briefs for unopened suggestions to cost one quick thinking call per reply, so that the speed costs little.
32. As the project owner, I want background brief calls to show in usage like other quick thinking work, so that I see what they cost.

## Implementation Decisions

### Dropped-marker logging (first)

- The server logs a warning whenever it removes a visual marker without drawing a visual, naming the conversation, the reply and the reason (today: no matching call). The same log reports every drop the marker change below adds. This ships before the marker change.

### Visual and discussion markers (ADR 0018)

- `show_visual` and `start_discussion` are removed from the app tools; `make_video` stays a tool call with its validation and "only when asked" rule (ADR 0015). The `<tool_call>` text fallback remains only for `make_video` and quick thinking.
- A visual marker is one line: `[[visual: name | title: … | shows: … | alt: … | check: …]]`. Fields are separated by `|`, each `key: value`; `name` comes first without a key. Limits stay as today: name 40, title 120, shows 280, alt 280, check 600 characters.
- A discussion marker is one line and the last thing before the end section: `[[discussion: Name (level): voice | … | Speaker > line | …]]`, first three or four classmates (name at most 60 characters, level below, near or above, voice at most 500), then four to eight opening lines (speaker an exact classmate name or Tutor, text at most 2000), the last a question to the learner. This is the wording the benchmark used.
- The marker stripper reads both markers in its existing streaming pass; they share the marker family of ADR 0016 and 0017 and are never shown or stored as text.
- A visual starts drawing when its marker closes in the stream, with the reply so far as the writer's context, as the call did. It lands at its marker; a marker inside `:::wide` or `:::figure` keeps that layout.
- A discussion starts when its marker closes; the reply ends there, and text after the marker, except the end section, is dropped, as text after `[[end]]` is.
- Repairs instead of errors: a field over its limit is cut to the limit; a missing title falls back to the name and a missing alt to shows; discussion lines past eight are cut; a line whose speaker is not a classmate or Tutor is dropped. A last line that is not a question is accepted.
- Drops, each logged: a visual marker without shows; a discussion with fewer than three classmates or, after repairs, fewer than four lines; a visual or discussion marker that has not closed by the end of its line. An unclosed marker of these kinds is removed, not left as plain text, which is how a broken marker could otherwise reveal a check answer.
- Control characters in a field are removed rather than rejected.
- The tutor prompt describes both markers, says to keep `[`, `]`, `|` and line breaks out of fields and to write math in words inside a marker, and drops all wording about `show_visual`, `start_discussion` and the "queued" or "started" results. The visual and discussion guidance (when to visualise, one visual per idea, checks at most once per reply, discussions only when asked) carries over unchanged.
- Stored artifacts keep their shape; history shows ready visuals and discussions exactly as now.

### Ready brief explanations

- Once a reply's suggestions are final (after the end section, or after quick thinking marks them for a reply without one), one quick thinking call writes a brief explanation for every suggestion in the reply and returns them through one tool call, per ADR 0013. It runs apart from the hidden-notes call so concepts are not delayed.
- The batch saves each brief under its suggestion's passage. It never overwrites a brief already saved, such as one written on demand when the learner opened the suggestion early.
- Opening a suggestion serves its saved brief with no model call. With none saved yet, the current on-demand path writes one, sharing a call already running for that passage.
- Familiarity evidence moves from saving a brief to opening one: opening a suggestion's brief, saved or fresh, records the weak evidence once per suggestion, and the batch records none.
- The brief prompt asks for about two or three short sentences, as a target rather than a hard limit. It applies to batch and on-demand briefs alike.
- A failed batch is logged; suggestions fall back to on-demand briefs. Old replies are not backfilled.
- Batch calls are metered as brief usage, like on-demand briefs.
- Briefs for selected passages and visual parts stay on demand and unchanged.
- Later refined by the [brief batch markers spec](brief-batch-markers-spec.md) (ADR 0021): the batch streams `[[brief: term]]` text instead of one tool call, saves each brief as it closes, and retries missing terms once.

### Visual part grouping

- The visual writer prompt's parts rule gains: a part is one object the learner would name, never a collection of like things (such as all nucleons or all labels); a label sits inside the part it names; when objects merge, split or change identity between steps, the script renames and regroups the parts at each step so they match what that step shows. The fusion visual is the counter-example.
- Step captions and legends are not parts; clicking them asks about the enclosing part, usually the whole visual.
- Part finding in the frame is unchanged.

### Still page

- The page itself never scrolls; Settings, the chat and the map scroll inside their own areas.
- The ticket first reproduces the owner's repro (open Settings, come back) with `npm run serve`, finds what scrolls the document (the leading suspect is a `scrollIntoView` that scrolls every ancestor, the document included) and fixes that cause. Clipping overflow on the page is the fallback only if the cause cannot be fixed at its source.
- The horizontal scrollbar under the chat column is fixed in the same ticket if it shares the cause; otherwise it becomes its own ticket.

## Testing Decisions

- Tests check behaviour seen from outside: what a reply streams and stores, which artifacts start, what is logged, what an endpoint returns. They never call a real model; providers and quick thinking are fakes.
- Marker parsing (unit): both marker kinds and their fields; cutting to limits and the fallbacks; drops with reasons; an unclosed visual marker with a check removed with nothing of its answer in the text; text after a discussion marker dropped. Prior art: the existing reply-markers and inline-notes tests.
- Reply loop (fake provider): a visual starts when its marker closes and lands at it, also inside a layout; a discussion starts and ends the reply; a dropped marker is logged; `make_video` still runs as a tool call; no `show_visual` or `start_discussion` is offered. Prior art: the existing show-visual loop and end-section tests.
- Briefs (app with a fake quick thinking model): the batch saves every suggestion's brief after the reply; opening serves it with no model call; an early open writes on demand and the batch does not overwrite it; evidence is recorded on opening, not by the batch; a failed batch falls back to on demand. Prior art: the existing briefs HTTP tests.
- Prompt wording (unit): the tutor prompt describes both markers and no removed tool; the visual writer prompt has the part grouping rules. Prior art: the existing show-visual tool tests.
- Still page: reproduced and checked in a browser by the worker during diagnosis; a unit or component test only where the fix lands in code rather than CSS.

## Out of Scope

- Moving `make_video` to a marker.
- Briefs ahead of time for selected passages or visual parts; backfilling briefs for old replies; ranking suggestions to brief only some.
- Streaming brief explanations.
- Any change to how the frame finds or outlines visual parts.
- Re-benchmarking with other models; any test that uses real model usage.
- A mockup: no new screen or visual redesign.

## Further Notes

- Benchmarks (Claude Haiku, effort medium, one model): visuals 12 of 12 requested by marker against 1 of 12 by tool call, 55K against 86K input tokens; discussions 3 of 4 started by marker, 0 with trailing text, against 4 of 4 by tool call with 3 trailing, 115K against 257K input tokens across the video and discussion set. Videos started equally in both arms.
- Sonnet, Codex and the `<tool_call>` text fallback were not benchmarked; the owner accepted the Haiku results.
- Raw outputs are not stored, so the fusion reply's lost marker is inferred from the blank gap it left.
