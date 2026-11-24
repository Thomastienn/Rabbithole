# More suggestions, briefed selections, branch previews, quiet usage and typing while the tutor answers

Decided with the project owner on 2026-11-24 (grilling session). Terms follow `GLOSSARY.md` (learner, tutor, reply, suggestion, brief explanation, brief batch, passage, branch, conversation, focused chat, quick thinking model, visual). Respects ADR 0008 and ADR 0016 (the tutor marks its notes inline) and ADR 0021 (the brief batch streams marker text).

The prompt wording below is a proposal, not benchmarked. No ticket under this spec calls a real model (`docs/agents/testing.md`, Real models).

## Problem Statement

Long teaching replies arrive with few or no suggestions. In "Explaining concepts before solving problems", a 5,128-character Claude Sonnet reply, the tutor bolded its key terms but marked none, and since it closed with `[[end]]` its marks counted as final, so the reply had no suggestions and no brief explanations. The last 25 Sonnet replies have 0 to 3 suggestions each, mostly 0. Streaming itself works: marked terms underline as they arrive, and underlines appear only at the end when the tutor never closes its notes.

A passage the learner selected and asked to explain briefly keeps its brief explanation, but nothing in the reply shows it. To see the brief again the learner has to select exactly the same words.

Pointing at a branched passage shows little. A branched suggestion shows its brief, or the start of its child's first reply; a branch from the learner's own selection shows nothing at all. Neither shows the question the learner asked.

Every finished reply shows a line of token counts, such as "Chat: 618 input · 499 output · 14,596 cache-read tokens · Suggestions: 4,195 input…", that almost nobody wants to read.

While the tutor answers, the message box is disabled, so the learner cannot even type their next question.

## Solution

The tutor's suggestion notes gain one loose sentence: a term it would bold because it matters is usually one the learner may not fully understand, so it should mark it as a suggestion rather than only bold it.

Asking for a brief explanation of a selected passage turns that passage into a suggestion of the reply: underlined like any suggestion, with the brief showing on hover and the branch box opening on click.

Pointing at any branched passage shows the question the learner asked and the start of the child's first reply, cut to about 280 characters with "…".

Token counts move behind a closed "Usage" control in each reply's footer.

The message box stays editable while the tutor answers; only sending waits.

## User Stories

1. As a learner, I want the terms the tutor treats as important to be suggestions, so that I can open the ones I don't understand.
2. As a learner, I want long technical replies to carry suggestions, so that I always have doors to go deeper.
3. As a learner, I want the tutor to judge which terms to mark, not follow a quota, so that suggestions stay meaningful.
4. As a learner, I want suggestions to keep underlining as the terms arrive, so that I can branch while reading.
5. As a learner, I want a passage I asked to explain briefly to stay marked, so that I never have to select it again.
6. As a learner, I want that passage's brief to show when I point at it, so that I can reread it at a glance.
7. As a learner, I want clicking that passage to open the branch box with its brief, so that I can branch from it like any suggestion.
8. As a learner, I want it underlined the same way as the tutor's suggestions, so that there is one kind of mark to learn.
9. As a learner, I want overlapping marks to keep working, so that a briefed passage inside a longer suggestion is still reachable.
10. As a learner, I want pointing at a branched passage to show the question I asked, so that I remember why I branched.
11. As a learner, I want it to show the start of the child's first reply, so that I can recall the answer without opening it.
12. As a learner, I want a long first paragraph cut short with "…", so that the preview stays small.
13. As a learner, I want the brief to show instead while the child has no reply yet, so that the preview is never empty.
14. As a learner, I want the same preview for branches from my own selections and from suggestions, so that every branched passage behaves alike.
15. As a learner, I want clicking a branched passage to keep opening its conversation, so that navigation stays the same.
16. As a learner, I want token counts hidden by default, so that replies read cleanly.
17. As a learner, I want one small "Usage" control to show them when I want, so that the numbers are still there.
18. As a learner, I want that control closed again on every visit, so that nothing stays expanded.
19. As a learner, I want visual progress shown only while a visual is drawing or has failed, so that no lasting status text clutters the reply.
20. As a learner, I want token stats in the conversation details to stay as they are, so that I can still compare costs.
21. As a learner, I want to type my next message while the tutor answers, so that I don't lose my thought.
22. As a learner, I want Send disabled until the reply ends, so that I don't interrupt it by accident.
23. As a learner, I want Enter to do nothing while the tutor answers, so that I don't think my message was sent.
24. As a learner, I want my draft kept when the reply ends, so that I can send it when I'm ready.
25. As a learner, I want my draft never sent automatically, so that I stay in control.
26. As a learner, I want Stop to stay available while I type, so that I can still end a long reply.
27. As a learner, I want the first-question screen to keep its typing open while the first reply starts, so that the same rule holds everywhere.
28. As a learner using a screen reader, I want the box announced as editable with Send unavailable, so that I know I can keep typing.

## Implementation Decisions

### Suggestion marking

- One sentence is added to the suggestion paragraph of `NOTES_RULE`. Proposed wording: "When you would bold a term because it matters, the learner may not fully understand it yet, so mark it as a suggestion instead of only bolding it."
- Nothing else in the notes rule changes. The quick thinking model still adds no suggestions to a reply whose notes ended.

### Briefed selections become suggestions

- When a brief explanation is saved for a learner-selected passage, the passage is added to that reply's suggestions, ready, with the brief attached. Its concept is left empty, so opening it later records no familiarity evidence.
- If the passage already matches a suggestion, nothing is added; that suggestion's brief is kept, as today.
- From then on it is a suggestion in every way: the same underline, the same hover, and a click opens the branch box with the brief.

### Branch preview

- The client receives, for each branch, its question as well as the start of the child's first reply.
- Pointing at any branched passage shows a card with the question (one line, truncated) and then the first paragraph of the child's first reply, cut at about 280 characters at a word boundary with "…". While the child has no reply, the card shows the passage's brief if one exists, otherwise only the question.
- The card replaces the current branched-suggestion card. Overlapping branches keep their picker.

### Usage disclosure

- The reply's token line is replaced by a muted "Usage" button in the reply footer that expands the same line. It is closed by default and its state is not kept.
- The visuals progress text stays only while a visual is pending or has failed, as now, in both the focused chat and the map's conversation nodes. No lasting success text remains anywhere.

### Typing while the tutor answers

- The composer's text box is no longer disabled while a reply is in flight. Send is disabled and Enter does nothing until the reply ends. The draft stays unchanged when the reply ends and is never sent automatically. Attach stays disabled during a reply. Stop is unchanged.
- The first-question screen follows the same rule.

## Testing Decisions

- Good tests check what the learner sees and can do, not component internals.
- **Seam 1: the focused chat thread as a component.** Render a reply with tutor suggestions, a briefed selection and branched passages. Assert the underlines, the hover card's question and excerpt (cut with "…"), the brief while the child has no reply, the closed Usage button that expands, and an editable composer with Send disabled while a reply streams. Prior art: `test/chat/passage.test.mjs`, `test/chat/brief-popup.test.mjs`, `test/chat/navigation.test.mjs`.
- **Seam 2: the brief route in process.** Saving a brief for a selected passage adds a ready suggestion with no concept, and a passage matching an existing suggestion adds nothing. Prior art: `test/http/briefs.test.mjs`.
- **Unit:** the excerpt cutter (word boundary, "…", short paragraphs untouched), and the notes rule containing the new sentence. Prior art: `test/chat/suggestions-notes.test.mjs`.

## Out of Scope

- A quick thinking model top-up of suggestions (considered and rejected by the owner in favour of the loose prompt sentence).
- A separate mark style for briefed selections.
- Queuing a message to send when the reply ends.
- Changing the token stats panel in conversation details.

## Further Notes

- Evidence from 2026-11-24: in the raw Claude session for "Explaining concepts before solving problems" the reply held only a visual marker, three next questions and `[[end]]`, with bold terms and no `[[term]]` marks.
