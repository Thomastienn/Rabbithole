# Titles and origin

Decided with the project owner on 2026-11-14 (grilling session). Spec B of four; see [setup and tutor style](setup-and-tutor-style-spec.md). Terms follow `GLOSSARY.md`. Everything not named here keeps its current behavior.

## Problem Statement

A conversation's title is its first question, cut at 200 characters. A child conversation created by asking "explain" on a passage is titled "explain", which says nothing on the map, in the library or in search.

Inside a child conversation, the learner cannot see what they branched from or what they asked. They must go back to the parent or open the inherited context. When they revisit a learning tree days later, they have forgotten why each child exists.

## Solution

- **Model-written titles.** When the learner sends a conversation's first question, the quick thinking model writes a short title. For a root, it reads the question. For a child, it reads the inherited context and the question, so "explain" on "mutex" becomes something like "How a mutex blocks threads". The question text shows as the title at once and is replaced when the title arrives. A title is written once; a learner's rename always wins.
- **Origin strip.** The top of every child conversation shows where it came from: the parent's address chip, the source it was asked about (the passage, the suggested term or the visual's title) and the learner's question. The chip jumps to that source in the parent.

## User Stories

### Titles

1. As a learner, I want each conversation titled by what it is about, so that the map, library and search make sense.
2. As a learner who asks "explain" on a passage, I want the child's title to name the passage's idea, so that I recognise it later.
3. As a learner, I want my question shown as the title the moment I send it, so that nothing waits on the title.
4. As a learner, I want the model's title to replace it shortly after, so that I get the better title without doing anything.
5. As a learner, I want titles written once, so that a conversation keeps a stable name I can recognise.
6. As a learner, I want a title I renamed never overwritten, so that my choice wins.
7. As a learner, I want renaming to stay where it is today, so that the rare manual change is still easy.
8. As a learner with no quick thinking model chosen, I want my question kept as the title, so that titling never blocks or errors.
9. As a learner, I want a failed title call to keep my question as the title without an error, so that a background job never interrupts me.
10. As a learner who sends only an attachment as the first question, I want the title written from the attachment's text, or the file name when there is no text or no quick thinking model, so that the conversation still gets a meaningful name.
11. As a learner, I want the title call's usage counted in usage history like other quick thinking work, so that I see what titles cost.
12. As a learner, I want titles short enough for a conversation node and the library list, so that they are not cut mid-word.
13. As a learner, I want the title in the language of my question, so that it reads naturally.

### Origin strip

14. As a learner in a child conversation, I want to see the passage I branched from at the top, so that I remember what I asked about.
15. As a learner, I want to see my question under it, so that I remember what I wanted to know.
16. As a learner, I want the parent's address chip in its branch family ink, so that the strip matches the map and the passage underline.
17. As a learner, I want the chip to open the parent with the source passage in view, so that I can reread its context.
18. As a learner who branched from a suggestion, I want the suggested term shown as the source, so that the strip works the same.
19. As a learner who asked about a visual, I want the visual's title shown as the source, so that I know which visual it was.
20. As a learner, I want a long source cut to two lines with "Show all", so that the strip does not push the conversation down.
21. As a learner, I want my question always shown in full, so that I never lose what I asked.
22. As a learner, I want the strip to stay at the top of the conversation, not floating over the reading, so that it does not cover replies.
23. As a learner whose source passage is unavailable, I want the strip to say so and still show my question, so that I keep what remains.
24. As a screen reader user, I want the strip announced as the conversation's origin with its source and question, so that I get the same reminder.

## Implementation Decisions

- **Title job.** A new quick thinking job, `title`, runs when a conversation's first learner message is saved and the title has not been renamed. Input: the question (and the inherited context for a child; attachment text or file name when the question is only an attachment). Output: a plain title of at most about 60 characters, no quotes or trailing punctuation, in the question's language. It is metered as a quick thinking task in usage history.
- **Placeholder rule.** The existing first-message rule (question text, cut at 200 characters) applies to roots and children as the immediate title. The title job replaces it only if the title is still unrenamed when the job finishes. A rename during the job wins.
- **Delivery.** The new title reaches the client through the existing tree state refresh; no new streaming channel.
- **Failures.** An unset quick thinking model skips the job. A failed or empty result keeps the placeholder and logs a warning; no error reaches the learner.
- **Origin data.** Branches already store the passage text, label (suggestion or visual part) and artifact id. The origin strip reads the branch row and the child's first learner message. A visual-sourced branch shows the artifact's title. The kind of source is not labelled.
- **Origin strip component.** A new focused chat component above the thread, using the existing address chip and branch family ink. Clicking the chip opens the parent focused chat scrolled to the passage (or visual) through the existing passage jump.
- **Long sources.** Two-line clamp with a "Show all" toggle; the question is never clamped.

## Testing Decisions

- Tests assert the title the learner sees and the strip's text and actions, not the job's internals.
- **Seams.** (1) `createApp` with a fake quick thinking provider: first message saves the placeholder, the title job replaces it, a rename during the job wins, an unset model or a failure keeps the placeholder (`test/chat/first-question.test.mjs`, `test/store/branch-first.test.mjs` and the suggestion job tests are prior art). (2) The title prompt builder as a unit: root vs child inputs, attachment-only fallback. (3) A component test for the origin strip: passage, suggestion and visual sources, clamp and Show all, unavailable passage, chip action (`test/chat/passage.test.mjs`, `test/chat/navigation.test.mjs`).
- No browser scripts.

## Out of Scope

- Retitling after the conversation drifts, automatic or on demand.
- Titles written from the reply.
- Showing the inherited context paragraph in the strip.
- Changing how renaming works.

## Further Notes

- The placeholder rule is today's first-message title, so titles still appear when no quick thinking model is chosen (see the empty first run in spec A).
