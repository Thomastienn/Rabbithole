# Board pages and check-ins

Decided with the project owner on 2026-11-27 (grilling session). Terms follow `GLOSSARY.md`: learner, tutor, conversation, learning tree, board, board page, board item, check-in, learner-led, tutor-guided, familiarity, quick thinking model. Decisions: ADR 0029 (a board is a pool of pages), within ADR 0028 (board items placed by coordinates), which now applies to each page.

This changes parts of `docs/board-spec.md`: its stories 9, 19, 42, 56, 57 and 60, the `clear` op, "when to start fresh space", the tutor-guided wait, and the out-of-scope line on side boards. Everything else in that spec stands.

No prototype was run: the owner chose to build directly. No ticket under this spec calls a real model (`docs/agents/testing.md`, Real models).

## Problem Statement

On a board, the tutor puts everything on one page: the main idea, every side question the learner asks and every repeat. The board soon holds so much that it is hard to see what is going on. When the learner asks about one piece of the explanation, the answer is drawn in among the rest. Once the tutor moves to fresh space it can never go back. When the learner later asks something similar, the tutor draws it all again. The tutor also goes on for a long time without checking whether the learner is following. In learner-led mode it never asks at all, so a learner who got lost early stays lost.

## Solution

A board holds a **pool of board pages**. The tutor explains an idea on a page. When the learner asks a side question about part of it, the tutor can open a side page, explain there and come back once it is clear. When the learner later asks the same thing or something close, the tutor can open the page it already made instead of drawing it again. The tutor decides all of this itself: it is encouraged, never forced, and nothing counts items or limits a page. The learner sees every page in a strip on the board and can open any of them, and when they ask from a page the tutor answers there.

Now and then the tutor **checks in**: after a big idea, or before going back from a side page, it asks in its own words whether the learner is following, and waits for the learner, however long they take. Check-ins are the default in every mode and never quizzes. The learner sets how often they happen.

## User Stories

### Board pages

1. As a learner, I want the tutor to explain a side question on a page of its own, so that the main explanation stays readable.
2. As a learner, I want each page titled with the idea it explains, so that I can tell pages apart at a glance.
3. As a learner, I want the tutor to go back to the page it came from once the side question is clear, so that I pick up the main idea where we left it.
4. As a learner, I want the tutor to say when it goes back ("back to the forces"), so that the switch never surprises me.
5. As a learner, I want the tutor to decide when it is done with a side question, so that I don't have to say "got it" before it moves on.
6. As a learner, I want a side page to open its own side page when I ask about something on it, so that I can go as deep as I need.
7. As a learner, I want going back from a nested side page to return to the page it came from, so that I unwind one step at a time.
8. As a learner, I want the tutor to open a page it already made when I ask the same or a similar question later, so that it doesn't draw the same thing twice.
9. As a learner, I want the tutor to point at the part of a reused page that answers me, so that I know where to look.
10. As a learner, I want the tutor to add to a reused page when my new question goes further, so that the page grows with my understanding.
11. As a learner, I want the tutor to judge when a page is getting cramped, rather than follow a fixed limit, so that pages split where the ideas split.
12. As a learner, I want the tutor to keep a small side question on the page I'm on, so that a one-sentence answer doesn't cost a page switch.
13. As a learner, I want the tutor to remember what is on every page even after the app restarts, so that reuse works on a board I reopen days later.

### Moving between pages

14. As a learner, I want a strip of page titles along the top of the board, so that I see every page this conversation has.
15. As a learner, I want the page I'm on marked in the strip, so that I know where I am.
16. As a learner, I want side pages to sit after the page they came from in the strip, with a small mark, so that I see how pages relate.
17. As a learner, I want to open any page by clicking its title, so that I can look again at anything explained earlier.
18. As a learner, I want a "back to" chip on a side page that names the page it came from, so that I can go back myself in one click.
19. As a learner, I want the tutor to answer on the page I'm looking at when I ask from it, so that my question is answered about what I see.
20. As a learner, I want the view to slide between pages, so that I see that the tutor moved rather than the board jumping.
21. As a learner with reduced motion turned on, I want page switches to cross-fade, so that switching is comfortable.
22. As a learner, I want the view to return to the tutor's page when it draws while I'm looking elsewhere, so that I never miss what it is drawing.
23. As a learner, I want to reopen a board on the page the latest reply ended on, so that I carry on where I stopped.
24. As a learner, I want a board reply in the normal chat view to show a snapshot of the page that reply ended on, so that the snapshot matches what was last said.
25. As a learner, I want boards I made before pages existed to open with each of their old fresh spaces as an untitled page, so that nothing I saved is lost.
26. As a learner, I want items I circle with the pen to be from the page I'm on, so that "what's this?" is about what I see.

### Check-ins

27. As a learner, I want the tutor to check now and then that I'm following, so that it doesn't go on for long after I've lost the thread.
28. As a learner, I want check-ins after a big idea or before the tutor goes back from a side page, so that they come at natural pauses.
29. As a learner, I want check-ins not after every small step, so that they don't get annoying.
30. As a learner, I want the tutor to word each check-in its own way, so that it never sounds like the same "do you understand?" on repeat.
31. As a learner, I want check-ins in every mode by default, so that learner-led still makes sure I'm following.
32. As a learner, I want a check-in never to quiz me, so that it feels like a friend checking, not a test.
33. As a learner, I want the tutor to wait for my answer after a check-in for as long as I take, so that it never carries on before I've said I understand.
34. As a learner, I want the check-in still on screen and a "your turn" cue while the tutor waits, so that I know it is waiting for me.
35. As a learner, I want to answer a check-in by voice or by typing, so that I answer however I like.
36. As a learner, I want "not really" to get that part explained again another way, so that a check-in actually helps when I'm lost.
37. As a learner, I want "yes" to have the tutor carry on, so that I move on once I'm ready.
38. As a learner, I want my answer to a check-in to count for familiarity like any message, so that the tutor learns what I know, without ever grading me.
39. As a learner, I want a Check-ins choice in Board settings, with Off, Now and then (the default) and Often, so that I set how often the tutor checks in.
40. As a learner, I want to say "check on me more" or "stop checking in" on any board, so that I can change it for this board without opening settings.

### Tutor-guided

41. As a learner in tutor-guided, I want the tutor's short questions after each part to stay as they are, with a hint when I don't answer and the explanation carrying on if I still don't, so that silence on a quiz question is never treated as failure.
42. As a learner in tutor-guided, I want fewer check-ins, since its questions already show whether I'm following, so that I'm not asked twice.

## Implementation Decisions

### Op language

- **`page`:** `<id> page "title" [from=<item id>]` opens a new board page and makes it the open page.
  - Its parent is the page open when it was made. `from=` names the item on that page it explains, and may be left out.
  - A page with no title shows as "Page N".
  - Page ids share the item id space, and are never reused.
- **`open`:** `<id> open <page id>` makes an existing page the open page. "Back" is `open` of the parent; there is no separate back op. Like `highlight` and `clear`, an `open` op's own id names nothing.
- **The first page:** a board starts with no page. The first op that draws on an empty board, with no `page` op before it, starts an untitled page.
- **`clear`** stays readable: it opens a new untitled page whose parent is the page open at the time. The prompt stops teaching it, so old saved boards replay unchanged.
- **Placement:** each page is its own 1600×900 space with ADR 0028's coordinates. New items land on the open page.
- **What an op can reach:**
  - `highlight`, `pointer`, connectors, `on`/`in` parents and `from=` reach items on the open page only.
  - `erase` reaches any page, as it reaches back into earlier areas today.
- **The guard** checks a new item only against the items on its own page.

### Board state and replay

- **Pages are op lines.** Saving needs no new columns: a reply's op lines already hold its `page` and `open` ops, and replaying every op line in order rebuilds each page and which page is open at every reply.
- **The learner's page:** when the learner opens a page and then asks, and that page isn't the tutor's open page, the session saves an `open` op among that learner message's op lines, as it saves pen strokes today. The tutor's ops then land on the learner's page, and replay matches what the learner saw.
- **Reopening** a board shows the page open at the end of the latest reply. The `board` message sent on open carries each reply's items with the page they are on, and the open page per reply.

### Board session (server)

- **New message up:** `{ type: 'view', page }` when the learner opens a page from the strip or the back chip. The session remembers it for the learner's next message, and sends nothing to the model on its own.
- **The page index:** every turn sent to the model, including no-answer turns, starts with a short block listing every page in this conversation.
  - Each line has the page's id, title, parent and `from` item, then the page's items: the id and text of each item that has text (labels, text, math source, step and node labels), and the id alone for an item with none.
  - Item kinds and coordinates are left out to keep the block short.
  - It marks the open page.
  - The block is built from the session's own replay, so it holds after a process restart, when the model has only the spoken captions.
- **The `page:` line:** a learner message asked from a page other than the tutor's open page ends with `page: <id>`, after any `pen:` line.
- **Check-in lines:** a line starting `~> ` is a spoken check-in. It is voiced and captioned like a `> ` line and ends the reply.
  - After a check-in the session starts no timer and sends no no-answer turns. The next turn is the learner's own message, however long they take.
  - The board's waiting cue stays on until the learner speaks, types or sends.
- **Quiz questions (`?> `)** keep today's wait: about 4 s after the learner goes idle (no typing, speech or pen), then a hint, then 4 s more, then the tutor carries on. Typing, speaking or drawing still holds the wait open.
- **The check-ins level** reaches the session the way the learner-led or tutor-guided mode does today: off, sometimes or often.

### Board prompt

- **Board pages, worded to encourage, never to require:**
  - The tutor has a pool of pages.
  - When a side question would crowd or derail the page it is on, it can explain on a new page made from the item asked about, then say it is going back and `open` the page it came from once the side question is clear.
  - A quick answer stays on the page it is on.
  - When the page index shows a page that already explains what is asked, it can `open` that page and point at the part that answers, adding to it if the question goes further.
  - It judges for itself when a page feels cramped.
  - It titles each page with the idea it explains, in a few words.
- **These replace** "answer it on the same board" and "when the board is getting full, start fresh space with clear".
- **Check-ins:**
  - The tutor can check in after a big idea and before going back from a side page, never after small steps, never twice in a row, and always in fresh words of its own.
  - "Not really" means explaining that part again another way. "Yes" means carrying on.
  - The level sets how strongly this is encouraged. Off leaves the block out, unless the learner asks with "check on me more" for this board. Often encourages it after each idea.
  - "Stop checking in" and "check on me more" switch it for this board, handled by the model, like "quiz me as we go".
  - In tutor-guided mode its after-each-part questions already check understanding, so check-ins are rarer there.
- **Learner-led** drops "don't ask the learner questions" for "don't quiz the learner", and keeps its check-ins.
- **The example** grows to show a side page made from an item, a check-in, and `open` back to the first page.
- **The speak-first block** from `docs/board-spec.md` stays required and unchanged.

### Board player and view (client)

- **`page` and `open`** each get a share of their sentence's time, as `clear` does today, and the view slides to that page in it, or cross-fades with reduced motion. The pointer starts at the centre of a page it lands on.
- **The view** follows the tutor's open page while it draws. A learner who opened another page is brought back when the tutor draws its next item, as a learner who scrolled away is today. When the tutor is idle or waiting, the learner's chosen page stays.
- **The board shows one page at a time.** Scrolling through stacked areas goes, and the page strip replaces it.
- **The pen** hit-tests only items on the page on screen.
- **The chat snapshot** renders the page open at the end of its reply.

### UI

- **The page strip:**
  - a thin strip along the top of the board, holding page titles in creation order, with each side page placed after its parent and a small "from" mark
  - the page on screen marked
  - clicking a title opens that page and sends `view`
- **The back chip:** a side page shows a "back to <parent title>" chip, which opens the parent page.
- **The check-in wait:** the check-in's caption stays and the "your turn" cue keeps pulsing, with no timer and no reminder. It reuses the look of a `?> ` question waiting for its answer, so it needs no mockup.
- **Settings:** the Board section gains **Check-ins**, with Off, Now and then (the default) and Often, remembered in the browser like the other Board choices. This adds to the existing section in its current look, so it needs no mockup.
- **Mockup:** the page strip and the back chip are new UI parts. They need a mockup at `docs/mockups/<issue-id>.html` before their ticket is published (label `new-ui`), using the mockup acceptance criterion in `docs/agents/mockups.md`.

### Familiarity

- **No change:** a learner's answer to a check-in or a quiz question is an ordinary learner message, and so familiarity evidence. No-answer turns still aren't. The tutor never grades aloud.

## Testing Decisions

Good tests check what the learner gets: what is said, drawn, saved, sent to the model and shown. They don't check how the session, op reader or player is built. As in `docs/board-spec.md`, they use fake providers, fake speech and a fake clock, and never call a real model.

- **Main seam: the board session, through `createApp` in-process** (`test/support/board-kit.mjs`, the same seam as `docs/board-spec.md`). It covers:
  - `page` and `open` ops sent down, saved, and replayed on reopen, which shows the page the latest reply ended on
  - the page index at the start of each turn sent to the fake provider, with titles, parents, `from` items and item texts, rebuilt from the store after a restart
  - a learner message asked from another page: the `page:` line, the saved `open` op, and the tutor's next items landing on that page
  - an old saved board with `clear` replaying as untitled pages
  - a `~> ` check-in ending the reply and getting no no-answer turn however far the fake clock moves, then the learner's answer carrying on
  - `?> ` keeping its wait, hint and carry-on, held open by typing
  - the check-ins level reaching the board prompt
  - Prior art: `test/http/board.test.mjs` and `test/http/board-guided.test.mjs`.
- **Op reader unit tests**, behind the main seam, like the existing op tests in `test/board/ops.test.mjs`:
  - `page` with and without a title or `from=`
  - `open` of an unknown or non-page id, which is skipped
  - the first page made implicitly
  - highlight, pointer and connectors limited to the open page, and erase reaching any page
  - the guard working within each page only
  - page ids never reused
- **Board player unit tests:** `page` and `open` taking their share of the sentence time, and the reduced-motion cross-fade. Prior art: `test/board/player.test.mjs` and `test/board/camera.test.mjs`.
- **Component tests** (`test/board/mountBoard.mjs`, `test/support/render.mjs`):
  - the page strip, opening a page, the back chip and the `view` message
  - the view returning to the tutor's page when it draws
  - the check-in wait cue
  - the chat snapshot showing the reply's page
  - the Check-ins setting
  - Prior art: `test/board/board.test.mjs`.
- **Not tested automatically:** whether the tutor uses pages, goes back, reuses and checks in well under the soft prompt. This is checked in manual runs on a real model after it is built, as the board's model quality was.

## Out of Scope

- Pages from other conversations in the same learning tree. The index lists only this conversation's pages.
- The learner making, renaming, reordering or deleting pages. Only the tutor makes pages, and none are deleted.
- Any limit enforced by the app: an item budget per page, forced page switches, or a maximum number of pages.
- Thumbnails or a minimap of pages. The strip shows titles only.
- Check-ins in chat, outside the board.
- Grading check-in or quiz answers aloud.

## Further Notes

- **The main risk is the model.** With a soft prompt, the tutor may rarely open side pages, or check in too much or too little. Manual runs after the build settle this; any tuning is prompt wording, not app rules.
- **Untested:** how large the page index grows on a long board, and what it does to the first-sentence latency budget in `docs/board-spec.md`. If it grows too large, list only page titles plus the open page's items.
- **Default chosen here, open to the owner:** when the learner opens another page while the tutor is drawing, the view goes back to the tutor's page on its next item (story 22). The alternative is to stay on the learner's page and show a "tutor is on <page>" chip.
- **Check-in line syntax:** `~> ` was chosen so that it can't be mistaken for `> ` or `?> `. Both the session and the model's format rules depend on it.
