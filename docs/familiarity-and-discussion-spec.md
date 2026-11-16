# Familiarity, recall and discussions

From the 2026-11-15 grilling session. Terms follow `GLOSSARY.md`.

## Problem Statement

The tutor often explains at the wrong depth. It re-explains things the learner already knows from another learning tree, and it skims past things the learner has only half understood. The app's estimate of familiarity is weak. It counts name matches in the learner's question, so a reworded concept is missed. It cannot tell a correct use from a wrong one, because it never sees whether the tutor agreed. Evidence only ever adds up, so a fresh misconception cannot pull a well-known concept down, and nothing fades with time. The chat model only sees concepts from the current learning tree. It cannot recall an earlier conversation when the learner says "like we did before".

The learner does not want to manage any of this. They just ask questions. Rating concepts by hand in the knowledge map is work they will not do.

Learning alone also has a gap. The learner only meets the questions they think to ask. They never hear the unexpected question, or the honest confusion another learner would voice, that would show them what they have missed.

Node previews on the learning tree map name a reply's visuals and videos as plain text. The learner cannot jump to them from the map.

## Solution

The tutor silently judges, in every reply, what the learner's own message showed about each concept it touched. It reports this as a hidden verdict on a fixed six-level scale with a confidence. The app turns these verdicts into a familiarity estimate. The estimate moves toward each new observation, and it fades with time the way memory does: fast after first learning, and ever more slowly each time the learner shows the concept again. The learner never sees or corrects it. The knowledge map becomes a read-only page.

Before each reply, the chat model receives the familiarity of the concepts around the learner's message, drawn from the whole knowledge graph across learning trees and bounded in size. When it needs more, it can look up any concept. It can also search and read the learner's earlier conversations in any learning tree, so "like we did in the earlier conversation" just works.

The learner can ask for a discussion. A small group chat appears inside the tutor's reply, where three or four classmates and the tutor talk the idea through. Classmates sit at different levels around the learner's estimated familiarity. They ask each other and the learner questions, and they make honest mistakes. The tutor steps in to untangle or confirm. The learner replies inside the card. When the learner next asks in the conversation itself, the discussion closes for good and its gist carries forward as context.

Node previews show each visual, diagram, video and discussion as a chip. Clicking one opens the focused chat at that item.

## User Stories

### Familiarity from the learner's own messages

1. As a learner, I want the app to judge my understanding from what I write, so that the tutor fits its explanations to me without my doing anything.
2. As a learner, I want a correct statement of mine that the tutor confirms to count as understanding, so that "so a mutex is just a lock, right?" followed by "yes" raises my familiarity.
3. As a learner, I want a wrong statement of mine to count as a misconception, so that the tutor knows to correct it rather than build on it.
4. As a learner, I want merely asking about a concept to show that I'm unsure, not that I know it, so that asking never inflates my estimate.
5. As a learner, I want applying a concept to a new case to count for more than restating it, so that the estimate reflects depth.
6. As a learner, I want correcting a classmate or spotting an edge case to count as the strongest evidence, so that teaching shows mastery.
7. As a learner, I want a passing mention to move my estimate less than a worked explanation, so that one stray sentence does not swing it.
8. As a learner, I want concepts I only read about in replies not to change my estimate, so that skimmed replies do not make the tutor think I know things.
9. As a learner, I want suggestions I did not branch on not to change my estimate, so that ignoring an underline is not read as knowing it.
10. As a learner, I want a concept I mention before any reply has taught it to be recorded, so that my own words are never thrown away.
11. As a learner, I want a recent misconception to pull a well-known concept down, so that the tutor notices when I have mixed something up.
12. As a learner, I want concepts I have not used for a long time to fade, so that the tutor briefly re-checks something I learned last year.
13. As a learner, I want something I have shown again on separate days to fade much more slowly, so that the tutor trusts my long-term knowledge.
14. As a learner, I want a faded concept to fall back toward "heard of it", not to zero, so that the tutor reintroduces it briefly instead of from scratch.
15. As a learner, I want the tutor's verdict to stay hidden from me, so that replies read naturally and I never feel graded.
16. As a learner, I want the reply to stream as fast as before, so that judging my understanding never slows down answers.
17. As a learner, I want my familiarity still recorded when the tutor forgets its verdict, so that the estimate does not depend on one model being perfect.
18. As a learner, I want branching on a passage to tell the tutor about the passage's concept through the child's first reply, so that branching still counts as evidence.
19. As a learner, I want my messages inside a discussion to count as evidence like any other message of mine, so that answering a classmate shows what I know.
20. As a learner, I want classmates' and the tutor's lines never to count as my evidence, so that simulated voices cannot change my estimate.

### What the tutor knows when it answers

21. As a learner, I want the tutor to know how familiar I am with the concepts in my question, from every learning tree, so that knowledge I gained elsewhere is not re-explained.
22. As a learner, I want the tutor to know my familiarity with the prerequisites of what I asked about, so that it explains exactly the missing foundations.
23. As a learner, I want the tutor to go a step further out in the graph when too little is nearby, so that a sparse area still gives it something to go on.
24. As a learner, I want the amount of familiarity given to the tutor to stay bounded however big my graph grows, so that replies don't get slow or unfocused.
25. As a learner, I want a concept I have never shown anything about to be estimated from linked concepts I do know, so that the tutor makes a sensible guess.
26. As a learner, I want a concept with nothing known nearby to be explained normally, so that the tutor neither assumes nor over-explains.
27. As a learner, I want the tutor to be able to look up my familiarity with any concept it is about to rely on, so that it is not limited to what was retrieved up front.
28. As a learner, I want a reworded concept name to match the concept I already know, so that "the lock thing" finds "mutex".
29. As a learner, I want the tutor to find an earlier conversation when I refer to it vaguely, so that "the mutex thing from yesterday" works.
30. As a learner, I want the tutor to read that earlier conversation, so that it can continue from what we said there.
31. As a learner, I want a long earlier conversation to arrive as a compact account, so that recall does not flood the tutor's context.
32. As a learner, I want the tutor to decide for itself when to recall, so that it never misfires on the word "earlier".
33. As a learner, I want recall to add context only, with no link or citation in the reply, so that replies stay uncluttered.
34. As a learner, I want recall and concept lookup to work even when the local embedding model is unavailable, so that the tutor still finds exact names.
35. As a learner, I want to switch recall and concept lookup off in Settings like other tutor tools, so that I keep control over what the tutor does.

### The knowledge map

36. As a learner, I want the knowledge map to remain viewable, so that I can see what I have learned when I am curious.
37. As a learner, I want the knowledge map to ask nothing of me, so that it never feels like homework.
38. As a learner, I want the map to show the new familiarity estimate, so that what I see matches what the tutor uses.

### Discussions

39. As a learner, I want to ask the tutor for a discussion about an idea, so that I can hear it talked through by others.
40. As a learner, I want the discussion to appear inside the tutor's reply where it belongs, so that it sits with the explanation it extends.
41. As a learner, I want three or four classmates at different levels, so that the discussion still fits me if the app's estimate of my level is wrong.
42. As a learner, I want classmates' levels set around my familiarity with the topic, so that their questions are ones I might have.
43. As a learner, I want only the classmates relevant to the moment to speak, so that the discussion stays short and readable.
44. As a learner, I want classmates' mistakes to be honest misunderstandings, so that their confusion feels like my own and is worth hearing.
45. As a learner, I want classmates to ask each other questions, so that it feels like a real discussion and not a Q&A.
46. As a learner, I want classmates to ask me questions directly, so that I am drawn into explaining.
47. As a learner, I want the tutor to act as the knowledgeable one who steps in to untangle or confirm, not answer everything, so that it feels like learning beside a smart person.
48. As a learner, I want the opening discussion to be brief and end with a question for me, so that I join it rather than watch it.
49. As a learner, I want to reply inside the discussion card, so that the discussion continues where it started.
50. As a learner, I want to address a classmate by name and have them answer in character, so that I can correct or help them.
51. As a learner, I want classmates to show only a name, with no level badge, so that a mistake reads as a person's confusion, not "the beginner being wrong".
52. As a learner, I want each discussion to have its own classmates, so that their levels fit this topic.
53. As a learner, I want the discussion to close when I next ask in the conversation itself, so that I never need an "end discussion" button.
54. As a learner, I want a closed discussion to stay readable, so that I can look back at it.
55. As a learner, I want a closed discussion to stay closed, so that it is compacted once and replies stay fast.
56. As a learner, I want the tutor's later replies in the conversation to know what happened in the discussion, so that it does not repeat what a classmate already untangled.
57. As a learner, I want to branch from any line of a discussion, including a classmate's, so that a classmate's confusion can become my next rabbit hole.
58. As a learner, I want the tutor never to start a discussion unless I ask, so that discussions don't become noise I skim.
59. As a learner, I want a failed discussion to say so in place, so that I can ask again.

### Node previews

60. As a learner, I want each visual, diagram, video and discussion to show as a chip in its conversation node's preview, so that I can see media at a glance on the map.
61. As a learner, I want a discussion to show as one collapsed chip, so that it does not fill the conversation node.
62. As a learner, I want clicking a chip to open the focused chat scrolled to that item, so that I can jump straight to it.
63. As a learner, I want chips to keep their status (creating, ready, unavailable), so that I know whether the item is worth opening.
64. As a learner using a keyboard or screen reader, I want each chip to be a labelled button, so that I can reach and identify it.

## Implementation Decisions

### Verdict tag

- The chat model's fixed instructions ask it to write one hidden verdict block early in each reply, after its first few sentences. The block covers every concept the learner's latest message (including a branch question and its passage) showed something about. It is a fenced block, handled by the same reply parser that already hides media request blocks mid-stream, before any text is saved or streamed. A reply whose message shows nothing has no block.
- Each verdict entry carries a concept name, a level and a confidence (`low` or `high`). The six levels, with the values the app maps them to:

  | Level | Meaning | Value |
  |-------|---------|-------|
  | 0 | misconception: states it wrongly | 0.0 |
  | 1 | heard of it: names it, no grasp | 0.2 |
  | 2 | partial: right idea, gaps or fuzzy | 0.4 |
  | 3 | explains it correctly in own words | 0.6 |
  | 4 | applies it to a new case | 0.8 |
  | 5 | teaches it: corrects a classmate, spots edge cases | 1.0 |

- Verdict names resolve to concepts the same way reply concepts do: case-insensitively, through concept aliases and the embedding match. A name with no match creates a new concept, with no topic until a reply's graph assigns one.
- Fallback: when a completed reply to a learner message has no readable verdict block, the quick thinking model is given the learner's message and the reply and returns verdicts in the same shape. It runs as a background job after the reply, like suggestions.
- Each verdict entry is stored as an observation: concept, value, confidence, source message and time. One observation per concept per learner message. A retried reply replaces that message's observations.

### Familiarity model

- Familiarity is derived from observations, never stored. A pure function takes a concept's observations and the current time and returns the estimate. The store calls this function.
- **Running average.** Each concept starts at a prior of 0.3 with a small weight. Each observation moves the estimate toward its value by a step that grows with confidence (`high` moves it further than `low`) and shrinks as the concept gathers evidence.
- **Fading.** Each concept has a stability, measured in time. Between observations the estimate drifts toward 0.2 at a rate set by the stability. An observation at level 2 or above that comes after a meaningful gap since the previous one (on the order of a day) multiplies the stability. Observations close together barely change it. A misconception (level 0) resets the stability to its short starting value.
- The exact prior weight, step sizes, starting stability, growth factor and gap threshold are routine defaults for the implementing run. Each is a named constant whose meaning is explained in a comment.
- Removed signals: "met" (a concept appeared in a tutor reply) and "ignored" (a suggestion not branched on) no longer affect familiarity. "Met" is still recorded, since suggestion picking and the knowledge map use it to know which concepts the learner has seen. Branch creation no longer records "asked" evidence, because the child's first reply's verdict covers the passage's concept.
- No familiarity estimate exists for a concept with no observations. Retrieval and lookup instead report a guess from linked concepts: the mean familiarity of its directly linked concepts that have observations, marked as a guess. If none have observations, they report "unknown".
- Schema: a new observations table replaces the familiarity role of the evidence table. Existing `asked`, `used`, `ignored`, `known` and `unknown` evidence rows are test data and are deleted by the schema upgrade, along with the corrections they hold. `met` rows are kept. There is no migration of old evidence into observations.

### Neighbourhood retrieval

- Before each chat reply, the app finds the concepts in the learner's message by embedding match against concept names, plus whole-name matches. It then adds concepts linked to those by one hop. When the set has fewer than about 15 concepts, it adds a second hop. The set is cut to the budget, nearest first.
- The chat model receives each concept with its familiarity (or guess, or "unknown"), and its "builds on" links within the set. This replaces the current tree-only list of strong concepts and its instructions. The new instructions say:
  - lean on concepts with high familiarity without re-explaining them;
  - take care with low-familiarity ones and misconceptions;
  - correct a recent misconception;
  - explain unknown concepts normally.
- Retrieval runs from the whole knowledge graph, across all learning trees.

### Embeddings

- The app reuses its existing local embedder, the one the piece library uses. Concept names and saved conversation messages get embeddings, stored with their rows.
- Items saved while no embedder is usable are embedded later, when one becomes usable, following the piece library's pattern. Until then, matching falls back to whole-name and keyword matches only.

### Tutor tools

Three new tutor tools are added to the tutor tool runner. Each has its own Settings switch, on by default.
- **look_up_concept**: takes a concept description. It returns the nearest concepts, each with familiarity (or guess, or unknown), topics and linked concepts.
- **search_conversations**: takes a description of an earlier conversation. It mixes embedding and keyword matches over message text, conversation titles and inherited context, across all learning trees. It returns about five candidates, each with conversation id, learning tree title, address, conversation title and one line of matching text.
- **read_conversation**: takes a conversation id. It returns that conversation's inherited context and messages when they fit a fixed budget. Otherwise it returns one compact paragraph made by the existing compaction job, which is cached per conversation until the conversation changes.

Recall results are context only. Replies do not cite or link them, so they are not added as resources. The tutor decides when to call any of these tools. No phrase detection exists in the app.

### Discussion

- A discussion is a new kind of artifact attached to a tutor reply, placed in the reply where the tutor put its request block, like a visual. The chat model writes it, so no smart model is needed. The tutor requests one only when the learner asks for a discussion. Its fixed instructions say so.
- At creation the chat model chooses three or four classmates. Each has a name and a level relative to the learner's familiarity with the discussion's concepts: at least one below and one above the estimate. Levels are stored with the discussion. They are given to the model on every turn and never shown to the learner.
- A discussion is a list of lines. Each line has a speaker (a classmate's name, the tutor, or the learner) and text. The opening has about four to eight lines and ends with a question to the learner.
- The learner replies inside the card. Each reply is saved as a learner line and starts a chat model call. That call gets the conversation's history, the discussion's lines, its classmates and levels, and the neighbourhood familiarity. It appends the next lines: only the relevant classmates speak, and the tutor steps in only to untangle or confirm. These replies stream into the card and produce a verdict block like any reply. Classmates keep their levels and do not learn during the discussion.
- **Closing.** When the learner sends a message in the conversation's own thread, every open discussion in that conversation closes. The compaction job compacts each one into a paragraph. Later turns in that conversation see the paragraph in place of the discussion. A closed discussion is read-only and can't be reopened, and the card shows it as closed.
- **Branching.** The learner can branch from any contiguous text of any discussion line. The passage records which discussion and line it came from. The child's inherited context includes the passage and the discussion's compacted paragraph (or its lines, if it is still open).
- A failed discussion turn shows its error in the card and keeps the lines already written.

### Correction removal

- The correction route and its store method are removed, along with the correction controls and correction display in the knowledge map. The map shows familiarity from the new model, and its evidence breakdown lists observation counts by level.

### Node preview

- Each artifact line in a conversation node's preview becomes a chip button: visual, diagram, video and discussion. A discussion chip reads "Discussion · N classmates" and its status.
- Clicking a chip opens the focused chat at the artifact, extending the existing "jump to message" action with an artifact target. Today's status text stays.

## Testing Decisions

Good tests here check what the learner or the chat model would observe: the streamed and saved reply text, what reaches the provider's prompt and tool results, the familiarity values the knowledge graph reports, and what a component renders and does on click. They do not check how a value is stored or which helper computes it.

- **The app in-process with a fake provider and a fake embedder** (the highest seam, covering most behaviour). It starts the app in-process with a temp database, the existing fake OpenAI-compatible provider, and a deterministic fake embedder. The checks:
  - The verdict block never appears in streamed or saved text, even when split across stream chunks. Its observations are recorded against the learner message. A retried reply replaces them.
  - A reply without a verdict block starts the quick thinking model fallback.
  - A verdict naming an unknown concept creates it.
  - The prompt the provider receives holds the neighbourhood with familiarity, guesses and "unknown". The hop-two expansion and the budget both apply.
  - `look_up_concept`, `search_conversations` and `read_conversation` return the specified shapes. A reworded query finds a concept and an earlier conversation. Keyword matching works with the embedder unavailable. A long conversation returns its compact paragraph.
  - The Settings switches for the three tools take them out of the tool list.
  - Discussion: the opening is saved as an artifact. A learner reply in the card appends lines. Learner lines produce observations, and classmate and tutor lines don't. A main-thread message closes the discussion and compacts it, and later prompts carry the paragraph. Replying to a closed discussion is refused. Branching from a classmate's line creates a child with the right passage.
  - The correction route no longer exists. The schema upgrade deletes old non-met evidence.

  Prior art: `test/http/tag-requests.test.mjs`, `test/http/tool-calls.test.mjs`, `test/http/branch-compaction.test.mjs` and `test/chat/suggestions-knowledge.test.mjs`.
- **The familiarity function as a unit**, with exact numbers. The checks:
  - the prior with no observations;
  - a high-confidence observation moving further than a low-confidence one;
  - a misconception pulling a well-known concept down;
  - fading toward 0.2, and never below it from fading alone;
  - stability growing only across gaps, so fading slows;
  - a misconception resetting stability;
  - "met" having no effect;
  - the linked-concept guess.

  Prior art: the existing familiarity store test, which this replaces.
- **Components in jsdom.** The checks:
  - The discussion card shows names only and no level, and has a reply box while open.
  - The card is read-only once closed, its failed state keeps earlier lines, and selecting a line offers branching.
  - Node-preview chips are labelled buttons that open the focused chat at their artifact.
  - The knowledge map has no correction controls.

  Prior art: `test/chat/navigation.test.mjs` and `test/map/knowledge-page.test.mjs`.
- Browser scripts are not needed unless a ticket's acceptance names one. Shared adapter behaviour is tested on one provider, following the testing guide.

## Out of Scope

- Answering a message with several questions as a general answer that fans out into branches. It was discussed and dropped.
- Real multiple users: teacher and student accounts, shared learning trees, or any network sync.
- Classmates who carry over between discussions or learn during one.
- Discussions the tutor starts without being asked, and classmates posting while the learner is idle.
- Reopening a closed discussion.
- Any learner-facing control to rate, correct or reset familiarity.
- Citing or linking recalled conversations in replies.
- Migrating existing test evidence into observations.
- A new embedding model or a remote embedding service.

## Further Notes

- The familiarity decisions are candidates for an ADR: the tutor's hidden verdict rather than a separate model read, anchored levels with a running average rather than additive weights, stability-based fading, and no learner corrections. The owner deferred it.
- Verdicts come from the chat model, so their quality depends on the learner's chosen model. The quick thinking model fallback covers only missing or malformed blocks, not poor judgement.
- The discussion's compacted paragraph and the read_conversation paragraph both reuse the existing compaction job. Closing once and never reopening keeps one compaction per discussion and keeps the conversation's history stable for input caching.
