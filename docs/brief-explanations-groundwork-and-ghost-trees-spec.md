# Brief explanations, groundwork and ghost trees

Decided with the project owner on 2026-11-17 (grilling session). Terms follow `GLOSSARY.md`; this spec introduces brief explanation, groundwork, explored concept and ghost tree. Build order: brief explanations, then groundwork, then ghost trees. Everything not named here keeps its current behavior. The DeepTutor research from the same session is in `docs/research/deeptutor.md`; nothing from it is built here.

## Problem Statement

A learner reading a tutor reply often meets a term they only half know. Today the only way to learn what it means is to branch: a new conversation, a full reply, and a node on the map, when a sentence or two would have been enough. The learner either branches more than they want or reads on without understanding.

A reply also relies on ideas it never names. A learner missing that background cannot underline it, because it is not in the text, and may not know what to ask for.

Learning trees are islands. A learner who explored eigenvectors in one learning tree and meets them again in another has no way to see, from the map, that they have been there before, or to move between the two. Related study across trees is invisible unless the tutor happens to recall it.

## Solution

- **Brief explanation.** Opening an unexplored suggestion shows, above the branch question box, one short paragraph explaining the term in the context of the reply, written by the quick thinking model. For a passage the learner selected themselves, an "Explain briefly" button asks for one. The explanation is kept: pointing at that suggestion later shows it again in a small popup, even after the suggestion has been branched. A branched suggestion without one shows the start of its child's first reply instead. The tutor never sees brief explanations. Getting one counts as weak evidence that the learner has seen the concept.
- **Groundwork.** Above a tutor reply, up to three chips name concepts the reply relies on without naming, which this learner may need first; often there are none. The tutor chooses them from what it knows of the learner's familiarity. Choosing one creates a child conversation at once that asks what the concept is.
- **Ghost trees.** Every conversation may have one explored concept: the concept of the suggestion or groundwork it came from, or otherwise one named together with its title. When another learning tree explored the same concept, the map shows that tree as a ghost tree: a faded miniature of its shape, joined by dashed lines to the matching conversation nodes. Choosing it opens the other tree's map with the matching conversations marked, and a ghost tree there leads back. The learner can hide ghost trees.

## User Stories

### Brief explanations

1. As a learner, I want a short explanation of an underlined term without creating a branch, so that I can keep reading when a sentence is enough.
2. As a learner, I want the brief explanation to appear on its own when I open an unexplored suggestion, so that I do not have to press anything extra.
3. As a learner, I want the brief explanation shown above the branch question box, so that I can still decide to branch after reading it.
4. As a learner, I want a loading state while the explanation is written, so that I know something is coming.
5. As a learner, I want the explanation to fit the reply I am reading, so that it explains the term as this reply uses it.
6. As a learner, I want the explanation to say whatever the term needs, such as what it is or why it holds, so that it answers my real gap rather than a fixed question.
7. As a learner, I want the explanation in the language of the reply, so that I can read it as easily as the reply.
8. As a learner, I want the explanation kept, so that reopening the same term shows it at once without waiting.
9. As a learner, I want pointing at a suggestion I already opened to show its saved explanation in a small popup, so that I can refresh my memory like a wiki preview.
10. As a keyboard learner, I want focusing a suggestion to show the same popup, so that I am not left out by not using a mouse.
11. As a learner, I want the popup to keep working after the suggestion has been branched, so that the quick reminder stays available.
12. As a learner, I want a branched suggestion with no saved explanation to show the start of its child's first reply, cut off with an ellipsis, so that I still get a reminder of what it is.
13. As a learner, I want pointing at a suggestion I never opened to show nothing, so that skimming a reply never triggers model calls.
14. As a learner, I want an "Explain briefly" button when I select my own passage, so that I can get a short explanation of anything, not just underlined terms.
15. As a learner, I want selecting text not to start a model call by itself, so that ordinary branching does not cost anything extra.
16. As a learner, I want to branch from a term after reading its brief explanation, so that a brief explanation never stops me going deeper.
17. As a learner, I want a failed explanation to say so and offer a retry, so that I am not left with a spinner.
18. As a learner, I want the tutor not to see my brief explanations, so that my conversation stays what I actually asked.
19. As a learner, I want brief explanations to count quietly toward my familiarity, so that the tutor knows I have at least seen the concept.
20. As a learner who already knows a concept well, I want needing a brief explanation of it to lower my familiarity a little, so that the tutor notices I may be forgetting it.
21. As a learner, I want a brief explanation on a later day to count as a fresh encounter, so that the concept fades more slowly afterwards.
22. As a learner, I want reopening a saved explanation not to count again, so that hovering never inflates my familiarity.
23. As a learner, I want brief explanation calls recorded in usage history, so that I can see what they cost.

### Groundwork

24. As a learner, I want the tutor to point out background ideas a reply relies on without naming, so that I can fill a gap I could not have underlined.
25. As a learner, I want groundwork shown as chips above the reply, so that I see it before I start reading.
26. As a learner, I want at most three groundwork chips, and often none, so that they stay a hint, not a reading list.
27. As a learner who already knows the background, I want the tutor to skip groundwork I know well, so that chips stay relevant to me.
28. As a learner, I want choosing a groundwork chip to create a child conversation at once that asks what it is, so that learning the background takes one click.
29. As a learner, I want the groundwork child to sit in the same learning tree as an ordinary child, so that the map stays one tree.
30. As a learner, I want the groundwork child's branch drawn from the top of its parent's reply, so that I can tell it came from the reply as a whole.
31. As a learner, I want the groundwork child's origin to show the groundwork concept, so that I remember why it exists.
32. As a learner, I want a groundwork chip I already chose to open its child, so that I never create duplicates.
33. As a learner, I want to ignore groundwork freely, so that it never blocks me from reading on.
34. As a learner, I want groundwork even when the tutor's notes went missing, so that the quick thinking model's stand-in covers it as it covers suggestions.
35. As a learner, I want the tutor never to mention groundwork in the reply text, so that the reply reads naturally.

### Explored concepts

36. As a learner, I want a conversation branched from a suggestion to be about that suggestion's concept, so that related trees can find it.
37. As a learner, I want a conversation from a groundwork chip to be about that concept, so that it joins the same cross-tree links.
38. As a learner, I want a root question or a conversation from my own passage to get its concept when its title is written, so that every kind of conversation can link across trees.
39. As a learner, I want different wordings of the same idea to land on one concept, so that "eigenvector" and "eigenvectors of a matrix" link.
40. As a learner, I want a conversation that fits no concept to have none, so that the app never invents links.
41. As a learner, I want renaming a conversation not to change its concept, so that my titles stay mine and links stay stable.

### Ghost trees

42. As a learner, I want to see on the map when another learning tree explored the same concept, so that I know I have studied it before.
43. As a learner, I want a ghost tree to look like a faded miniature of the other tree's shape, so that I recognise it at a glance.
44. As a learner, I want a ghost tree to show the other tree's title, so that I know which tree it is.
45. As a learner, I want dashed lines from the matching conversation nodes to the ghost tree, so that I see which conversations it relates to.
46. As a learner, I want each other tree to appear at most once on a map, so that several matches do not clutter it.
47. As a learner, I want each conversation node joined to at most one ghost tree, the one where I explored that concept most, so that the map stays readable.
48. As a learner, I want at most five ghost trees on a map, the ones with the most matching conversations, so that a well-connected tree is not buried.
49. As a learner, I want choosing a ghost tree to open that tree's map with the matching conversations marked, so that I land where the concept was explored.
50. As a learner, I want the other tree to show a ghost tree leading back, so that I can return the way I came.
51. As a learner, I want a switch in the map toolbar to hide ghost trees, so that I can see a tree on its own.
52. As a learner, I want that switch remembered, so that I do not have to turn ghost trees off every time.
53. As a learner, I want to move a ghost tree on the map like a conversation node, and have it stay where I put it, so that I can arrange my map.
54. As a learner, I want ghost trees to disappear when the other tree or its matching conversation is deleted, so that they never point nowhere.
55. As a learner, I want two conversations in the same tree about the same concept never to produce a ghost tree, so that ghost trees only link different trees.
56. As a learner, I want a ghost tree of a tree I never arranged to still show its shape, so that a tree I never opened as a map is not blank.
57. As a keyboard or screen reader learner, I want a ghost tree to be a labelled control naming the other tree and the concept, so that I can use it without seeing it.
58. As a learner with existing learning trees, I want conversations already branched from suggestions to take part in ghost trees, so that my earlier study links without new model calls.

## Implementation Decisions

### Brief explanations

- A new quick thinking job writes a brief explanation, following the detached title and verdict job pattern. It uses the quick thinking model and its effort. Its prompt gives the full plain text of the tutor reply and the exact term or passage, and asks for one short paragraph that explains whatever the term needs in that context, in the reply's language, without hardcoding "what is it". The reply and term are passed as data, not instructions, like the other quick prompts.
- A new additive table stores brief explanations, keyed by the reply message and the passage's start and end, with the passage text, the suggestion's concept when there is one, the explanation and its time. The tutor's messages and the conversation are never changed.
- A new route returns a saved brief explanation or writes one. Two requests for the same passage while one is being written share that one call. A failed call stores nothing, records no evidence and returns an error that the textbox shows with a retry.
- The explanation is returned whole, not streamed; the quick thinking model is fast enough, and the textbox shows a loading state meanwhile.
- Brief explanations are recorded in usage history under a new task, which needs the usage events task constraint widened by a migration.
- Opening an unexplored suggestion requests the brief explanation automatically. A passage the learner selected shows an "Explain briefly" button instead; saved explanations for selected passages show again only while the textbox for that same passage is open, since a selection leaves no underline to point at.
- Pointing at or focusing a suggestion underline shows its saved brief explanation in a small popup. A branched suggestion without one shows the first part of its child's first tutor reply as plain text, cut at a word boundary with an ellipsis. An unexplored suggestion without one shows nothing. Clicking still behaves as today: unexplored opens the textbox, explored opens its child.
- Brief explanations exist only for tutor replies, not for discussion lines or visuals.
- When a brief explanation for a suggestion is saved, the app records one observation for its concept at level 2 (partial) with low confidence, keyed by that brief explanation so it is recorded once. Level 2 is the lowest level that lifts an unknown concept (0.30 to 0.35 with the current prior) while dipping a well-known one (about 0.90 to 0.83), and, when at least a day after the concept's previous observation, it counts as spaced evidence, so it also slows fading. Selected passages carry no concept and record nothing. Showing a saved explanation again records nothing.

### Groundwork

- The notes block rule gains a line kind: `{"groundwork": name}` for a concept the reply relies on but does not name and that the learner probably needs first, judged from the concept neighbourhood; at most three; none is normal; never a concept already named in the reply or already well known to the learner.
- The notes reader keeps at most the first three groundwork names, drops empty ones and drops any that duplicate a suggestion's concept in the same reply. Groundwork is saved with that reply's suggestions, in the same once-per-reply record, and the quick thinking stand-in that writes suggestions for a reply without notes writes groundwork too.
- Groundwork names use the concept neighbourhood's exact names when they match, like suggestion concepts, and are recorded in the knowledge graph as concepts the reply relied on.
- Choosing a groundwork chip creates a branch from that reply with no start or end, the groundwork concept's name as its passage, and the question "What is <concept>?". Inherited context, title and model inheritance work as for any branch. Its explored concept is the groundwork concept.
- A chosen chip shows as explored and opens its child. On the map, a groundwork branch's line starts at the top of its parent conversation node's reply. The child's origin strip shows the groundwork concept as its source.

### Explored concepts

- Each conversation gains an optional explored concept, referencing a concept in the knowledge graph.
- A branch from a suggestion takes that suggestion's concept at creation; a branch from groundwork takes the groundwork concept.
- Every other conversation gets its explored concept from the title job. The title prompt gains the nearest existing concept names, found with the same embedding lookup the concept neighbourhood uses, and the job returns both the title and one concept name, which may be one of those, a new one, or none. The title keeps its current cleaning and limits. A name matching an existing concept or alias uses that concept; otherwise a new concept is created the way the knowledge graph creates concepts, without topics until the tutor's notes add them. An unreadable concept keeps the title and leaves the concept empty.
- The explored concept is set once. Renaming a conversation never changes it, and the learner cannot edit it.
- A one-off migration sets the explored concept of existing conversations branched from a saved suggestion, from that suggestion's concept. Other existing conversations stay without one; no model backfill runs.

### Ghost trees

- The learning tree list the client already loads gains, for each conversation, its explored concept and the number of learner messages it holds. No new route is needed; the list already carries every conversation and its saved position across all trees.
- A new pure function chooses the ghost trees for a map from that list and the current tree:
  - For each conversation in the current tree with an explored concept, the candidates are the other learning trees with a conversation of the same concept.
  - Its best match is the candidate whose matching conversations hold the most learner messages; ties go to the most recently created tree.
  - Conversations whose best match is the same tree share one ghost tree, with one dashed line each.
  - The ghost tree's matching conversations are every conversation in the other tree with any of those concepts.
  - Ghost trees are ranked by their number of dashed lines and only the first five are kept.
- A ghost tree is one map node drawing a faded miniature of the other tree: a dot per conversation at its saved position and branch lines in their branch family inks, scaled to fit about 160 pixels, with the tree's title beneath. A tree without saved positions uses the map's default placement. Nothing else is drawn inside it.
- A ghost tree is placed with the map's existing free-space placement near its first linked conversation node, can be dragged, and its position is saved with this map's layout.
- Choosing a ghost tree opens the other tree's map and marks its matching conversation nodes until the learner opens a conversation or leaves the map.
- A "Ghost trees" switch in the map toolbar shows or hides them, on by default and remembered like the app's other view choices.
- A ghost tree is a button labelled with the other tree's title and the shared concepts.

## Testing Decisions

- Tests check behavior the learner or a caller can observe: what the notes reader returns, what familiarity a set of observations gives, what the job stores and returns, what a component shows and does. They never assert on internal structure.
- **Notes reader**, unit tests: groundwork lines are read, capped at three, empty names and duplicates of the same reply's suggestion concepts are dropped, and an empty block gives no groundwork. Prior art: the existing notes reader tests in the chat test folder.
- **Familiarity**, unit tests: one brief explanation observation lifts an unknown concept from 0.30 to 0.35, dips a well-known concept to about 0.83, and slows later fading when it comes at least a day after the previous observation. Prior art: the existing familiarity tests.
- **Title job**, tests with the fake provider: the prompt carries the nearest concepts, the job stores the title and the explored concept, a known alias resolves to its concept, an unreadable concept keeps the title, and a renamed conversation keeps its concept. Prior art: the existing title job tests.
- **Brief explanation job and route**, one in-process integration test with a fake provider: the first request writes and saves the explanation and records usage and one observation; a second request returns it without a model call; a failed call stores nothing and records nothing.
- **Explored concept migration**, a store test: a conversation branched from a saved suggestion gets its concept; others stay empty.
- **Ghost tree choice**, unit tests of the new pure function: one ghost tree per other tree, best match by learner messages with the tie rule, the cap of five ranked by lines, no ghost tree within the same tree, nothing for conversations without an explored concept, and matching conversations listed for marking.
- **Components**, jsdom tests: the branch textbox shows the automatic brief explanation and its loading and error states for an unexplored suggestion, the button for a selected passage, the hover and focus popup with the saved explanation and the child-reply fallback, and nothing for an unexplored suggestion without one; groundwork chips create a child and open it once chosen; the ghost tree node draws one dot per conversation, carries its label and opens the other tree. Prior art: the branch form, passage and map parts tests.
- No browser scripts.

## Out of Scope

- Exporting, importing or sharing learning trees.
- A forest view of all learning trees.
- Offering an earlier conversation when the learner branches on a concept explored elsewhere.
- Anything from the DeepTutor research: struggle kinds, teaching observations, sourced memory note entries, learner claims of familiarity.
- A model backfill of explored concepts for existing conversations not branched from a suggestion.
- Brief explanations in discussions or visuals, and hover popups on touch screens.
- Editing a conversation's explored concept, or giving a conversation more than one.
- Ghost trees inside one learning tree, or more than one ghost tree per conversation node.

## Further Notes

- The groundwork question "What is <concept>?" is fixed English. A learner studying in another language gets the concept name as the tutor wrote it inside that English question; revisit if that reads badly in practice.
- Ghost trees appear only as conversations gain explored concepts, so older learning trees will show few until the learner keeps studying.
- The level 2 choice for brief explanation evidence depends on the current familiarity prior and weights; a change to those should recheck the lift-and-dip effect.
