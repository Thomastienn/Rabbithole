# Memory note writing, concept lookup, fast recall and a clearer knowledge graph

Decided with the project owner on 2026-11-24 (grilling session). Terms follow `GLOSSARY.md` (learner, tutor, memory note, knowledge graph, concept, topic, concept link, familiarity, quick thinking model, tutor tool, attachment, conversation). Decision: ADR 0022 (concepts merge automatically). Respects ADR 0003 (tutor tools provider first), ADR 0013 (structured output through tool calls) and ADR 0016 (tutor marks its notes inline).

The prompt wordings below are proposals, not benchmarked. No ticket under this spec calls a real model (`docs/agents/testing.md`, Real models).

## Problem Statement

The memory note has never been written. Across 234 tutor replies the tutor never called `update_memory_note`, so the note is empty and every conversation starts as if the tutor had never met the learner. Writing it is left entirely to the tutor's choice, under a rule that says "only when you learn something lasting", and the tutor calls any tool in about one reply in eight.

The knowledge graph reaches the tutor only through concept names in the learner's typed message. When the learner attaches a problem sheet and writes "explain the concepts in this", nothing matches, so the tutor learns nothing about what the learner knows. The tutor already has `look_up_concept`, but it was called once ever, and it takes one concept at a time.

Searching earlier conversations can take about 30 seconds. Each `search_conversations` call first embeds every message not yet embedded, up to 256 messages of up to 2,000 characters each, inside the tool call. 206 of 462 messages are still unembedded, so the next call pays again.

The knowledge graph fills with duplicates: Threads and thread, promise and Promises, Perseverance and Perseverance rover, and topics such as Networking and Computer networking. 655 concepts and 74 topics exist and no merge was ever made. The manual "Merge concepts" dialog asks the learner to search hundreds of concepts by hand.

The learner cannot see the groups in the graph. Topics are plain circles of the same colour, pinned evenly around a circle regardless of how related they are. Nothing under the graph tells the learner how their knowledge is growing.

## Solution

The quick thinking model, in the call it already makes after each reply, may also edit the memory note when the exchange showed something lasting about the learner. It uses the same edits as the tutor's tool: add, rewrite or remove an entry, preferring rewrite and remove so the note stays short, under the existing size limit. The tutor keeps its tool. A reply that changed the note shows a quiet "Memory updated" mark.

The tutor is told, loosely, to look up concepts the concept neighbourhood does not cover before explaining them, for example the concepts of an attached problem, and `look_up_concept` accepts several concepts in one call.

Messages are embedded in the background as soon as they complete, and older ones once in the background, so searching earlier conversations embeds only the query.

Duplicate concepts and topics merge automatically when recorded, confirmed by the quick thinking model; a one-time cleanup merges the existing ones, and the manual merge dialog goes away.

Each concept wears its main topic's colour, each topic gets a soft hull around its concepts, and related topics sit near each other. Below the graph, a stats panel shows how the learner's knowledge is growing.

## User Stories

1. As a learner, I want the tutor to remember lasting things about me, such as my background and goals, so that I don't repeat myself in every learning tree.
2. As a learner, I want the memory note written even when the tutor forgets to, so that it actually fills up.
3. As a learner, I want the note to stay short, with old entries rewritten rather than piled up, so that it stays accurate.
4. As a learner, I want a quiet "Memory updated" mark on the reply that changed my note, so that I know when it changed.
5. As a learner, I want the mark to open my memory note, so that I can check or correct it.
6. As a learner, I want my own edits to the note to stay, so that the models never undo what I wrote unless something new contradicts it.
7. As a learner, I want secrets and sensitive personal details kept out of the note, as today, so that my privacy is safe.
8. As a learner, I want instructions found in replies, pages or tool output never to change my note, so that nothing can hijack it.
9. As a learner, I want the tutor to check what I know about the concepts in my attachment before explaining, so that it pitches the explanation at my level.
10. As a learner, I want concepts the graph has never seen treated as new to me, so that the tutor starts from the basics.
11. As a learner, I want one lookup to cover several concepts, so that checking my level adds only a few seconds.
12. As a learner, I want the automatic concept neighbourhood to keep working from my typed message, so that nothing is lost when the tutor skips a lookup.
13. As a learner, I want searching earlier conversations to answer in about a second, so that a reply that recalls my past study doesn't stall.
14. As a learner, I want new messages searchable soon after they complete, so that recall finds what I just asked.
15. As a learner, I want embedding to run in the background without slowing replies, so that the app stays responsive.
16. As a learner, I want "thread" and "Threads" to be one concept, so that my familiarity isn't split.
17. As a learner, I want overlapping topics such as Networking and Computer networking merged, so that the graph has fewer, clearer groups.
18. As a learner, I want merges to happen without my doing anything, so that I never search the graph for duplicates.
19. As a learner, I want concepts that are only similar, such as Lock and Locking, kept apart unless they really are the same, so that merges don't blur distinct ideas.
20. As a learner, I want a merged concept to keep its other names as aliases, so that the tutor still recognises them.
21. As a learner, I want my existing duplicates merged once, so that the graph is clean today.
22. As a learner, I want my data backed up before the one-time cleanup, so that a bad merge can be recovered.
23. As a learner, I want each concept coloured by its main topic, so that I can tell which group it belongs to.
24. As a learner, I want a soft outline around each topic's concepts, so that groups read at a glance.
25. As a learner, I want related topics placed near each other, so that the map's layout means something.
26. As a learner, I want the graph laid out the same way each time, so that I can find things where I left them.
27. As a learner, I want to see concepts met and concepts known over time, so that I can see my progress.
28. As a learner, I want topics ranked by my familiarity, so that I see my strong and weak areas.
29. As a learner, I want a list of concepts fading from memory, so that I know what to revisit.
30. As a learner, I want the misconceptions I've had listed, so that I can check I've fixed them.
31. As a learner, I want an activity heatmap by day, so that I see how regularly I study.
32. As a learner, I want choosing a concept in the stats to open its detail in the graph, so that the stats lead somewhere.
33. As the owner, I want memory edits, lookups and merges logged, so that I can tell whether they run.
34. As the owner, I want every quick thinking call metered as today, so that usage stays complete.

## Implementation Decisions

### Memory note writing

- The post-reply quick thinking call (the one that names suggestions, or marks them when a reply never ended) gains an optional `memory` field in its tool output: a list of edits in the same shape `update_memory_note` takes (add, rewrite, delete). An empty or missing list changes nothing.
- The call's input gains the current memory note and the memory rule's limits on what may be stored. The proposed instruction: "If this exchange showed something lasting about the learner that would help teach them anywhere, such as background, goals, level or preferences, edit the memory note; prefer rewriting or removing entries to adding. Usually there is nothing to change."
- Edits go through the same editor as the tool, so the same size limit applies (`MEMORY_NOTE_LIMIT`, 8,000 characters: an edit that grows the note past it is refused). No new cap.
- When suggestions are turned off this call does not run, and only the tutor's tool writes the note.
- Each write records the message that caused it. A message with a recorded write shows a muted "Memory updated" mark in its reply footer. Choosing the mark opens the memory note in Settings. The mark shows no note text.
- The tutor's `update_memory_note` tool and its rule stay.

### Concept lookup

- `look_up_concept` takes `concepts`, a list of 1 to 10 concept names or short descriptions, instead of one `description`. It returns, per requested item, the nearest concepts with familiarity (or a guess, or unknown), topics and links, as now. An item with no match returns unknown.
- The tutor rule gains one loose sentence where the tools are described. Proposed wording: "When the learner asks about concepts the concept neighbourhood does not cover, such as those in an attachment or a request like 'explain the concepts in this', look them up together with look_up_concept before you explain."
- Unknown familiarity keeps its current meaning, "heard of once but cannot explain", which the owner confirmed means beginner.
- Offered only where the tool is offered today: Claude, Codex and tool-capable custom endpoints.

### Background message embedding

- When a message completes, a background job embeds it, chunked as the recall search embeds today. A failure leaves it unembedded and logs a warning.
- On startup, a background job embeds older unembedded messages in small batches, yielding between batches, until none remain.
- `search_conversations` embeds only the query. Messages still unembedded are found by keyword only, as when the embedder is unavailable today.

### Automatic merge (ADR 0022)

- When the post-reply call records new concepts or topics, each new name is compared by embedding with existing ones. Pairs above a high similarity threshold become candidates. The default threshold is 0.85; the ticket may tune it against the owner's known duplicates listed below.
- Candidates for one reply are confirmed in one quick thinking tool call that answers, per pair, whether the two name the same concept (or topic). Confirmed pairs merge at once through the existing merge, keeping the name with more evidence (or the older one on a tie) and storing the other as an alias.
- Topics merge the same way, moving their concepts to the kept topic.
- A one-time cleanup runs in the background after startup. It backs up the database file first, then checks every existing concept and topic the same way, in batches, and records that it ran so it never runs again.
- The "Merge concepts" button, its dialog and the merge route the dialog used are removed. The store's merge stays, used by the automatic path.
- Each merge is logged with both names and the kept one.

### Graph colour, hulls and placement

- The server sends, with the graph, a 2D anchor for each topic: a PCA of the topic centroids (the mean of their concepts' embeddings), scaled to the map. A topic whose concepts have no embeddings falls back to the current even circle. The result is deterministic.
- The force layout keeps its current forces, using these anchors instead of evenly spaced ones.
- Each concept takes its first topic as its main topic. Topic hues are spread around the colour wheel in anchor-angle order, so neighbouring topics get neighbouring hues, and they are mixed toward the theme's ink so they read on both light and dark variants. Concepts without a topic stay neutral.
- Each topic draws a soft, low-opacity hull around its concepts, behind them, with its label. Familiarity keeps its current ring fill.

### Stats panel

- A new panel under the knowledge graph shows five sections:
  - (a) concepts met and concepts known over time, where known means familiarity at or above the level the graph already draws as full;
  - (b) topics ranked by mean familiarity;
  - (c) fading concepts, meaning concepts once known whose current familiarity has faded below known;
  - (d) misconceptions recorded, newest first, with whether a later observation cleared each one;
  - (e) an activity heatmap of learner messages per day.
- One new read-only route returns these figures from existing tables. No new stored data.
- Choosing a concept anywhere in the panel selects it in the graph and opens its detail.
- This is new UI: its ticket carries the `new-ui` label and a `Mockup:` line pointing at `docs/mockups/<issue-id>.html`, which the owner makes before it publishes.

## Testing Decisions

- Good tests check what the learner, the store or the next model call ends up with, never how it got there.
- **Seam 1: the post-reply quick thinking job**, with the fake provider. Assert that a returned `memory` edit changes the note and records its message, that an edit past the limit is refused, that candidate pairs reach the confirmation call and confirmed pairs are merged with an alias. Prior art: `test/chat/suggestions-calls.test.mjs`, `test/chat/suggestions-knowledge.test.mjs`.
- **Seam 2: the recall tools**, run directly with a store and a fake embedder. Assert that a list lookup returns one entry per item, unknown included, and that `search_conversations` embeds only the query. Prior art: `test/http/recall-tools.test.mjs`.
- **Store tests** for the background embedding queue, the one-time cleanup running once, the kept-name rule and topic merging. Prior art: `test/map/knowledge-merge.test.mjs`.
- **Unit tests** for the topic anchors (deterministic, fallback without embeddings), hue order, and the stats figures from a small fixture. Prior art: `test/map/knowledge-layout.test.mjs`.
- **Component tests** for the "Memory updated" mark, the removal of the merge dialog and the stats panel's sections and concept selection. Prior art: `test/shell/memory-note-settings.test.mjs`, `test/map/knowledge-page.test.mjs`.

## Out of Scope

- Full t-SNE, UMAP or K-means grouping: topics stay the groups.
- Undoing a merge, or splitting a concept.
- Showing memory note text in the reply's mark.
- Text-tool custom endpoints, which do not get `look_up_concept`.
- Matching attachment text in the automatic concept neighbourhood (considered and rejected in favour of the tutor's lookup).
- Streaks, goals or notifications.

## Further Notes

- The owner's duplicates for checking the threshold: complex number/complex numbers, Condition variables/condition variable, Prime attribute/prime attributes, promise/Promises, Semaphore permit/Semaphore permits, Threads/thread, Lossless join/lossless join decomposition, Artemis/Artemis program, Perseverance/Perseverance rover. Pairs to keep apart unless confirmed: Lock/Locking, Dispatch/Dispatcher. Topics: Networking/Computer networking, Orbital mechanics/Astrodynamics, Spaceflight/Space exploration, Neural networks/Deep learning.
- Measured on 2026-11-24: 0 memory note rows, 27 tool calls over 234 replies, 1 `look_up_concept` call, 206 of 462 messages unembedded.
