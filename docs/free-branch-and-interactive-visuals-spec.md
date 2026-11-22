# Free branches and interactive visuals

## Problem Statement

A learner reading a conversation sometimes has a thought of their own that no passage in the reply covers: a side question, a "wait, what about…", sometimes something unrelated. Today every branch starts from a passage, a groundwork concept or a visual part, so the learner has two poor choices. They can ask in the conversation itself, which clutters it and pulls the tutor off its line. Or they can start a new learning tree, which loses the context they built and leaves them switching between trees.

Visuals already lean towards interaction, but the tutor's guidance treats interaction as a per-visual choice. A visual whose result depends on values, such as a formula, a hash or a simulation, can still arrive as a fixed picture. Seeing the output follow an input the learner changes, or types themselves, is part of how they learn the idea.

## Solution

**Free branch.** The learner can start a branch with their own question, without selecting anything. Like any branch, it creates a child conversation that inherits the parent conversation up to that moment, so the side question stays out of the parent but keeps its context. The question may be unrelated to the parent. A learning tree still has one root; there is no forest of roots. A thought the learner wants kept apart from this tree still starts a new learning tree.

There are two entry points:

- **Ask on the side** sits beside Send in the focused chat's question box. It sends what the learner typed as a free branch and opens the child, like any other branch. It is always visible while they type, so they find it without being told.
- A subtle **+** appears on a conversation node on the learning tree map. It opens the branch question box beside that node, with no passage. Sending creates the free branch and opens the child.

A free branch hangs off the parent's latest completed tutor reply at the moment it is created. In the parent's focused chat, its address chip, in its family's ink, and its title sit at the bottom of that reply. Several free branches from the same reply share one row in address order, and the row wraps. On the map, the branch line attaches at that reply, like other branch lines.

**Interactive visuals.** The visual guidance changes from a rule-like preference to a general principle. A visual is something the learner plays with. When what it shows depends on values the learner could vary, the visual:

- starts from a sensible example;
- lets the learner change those values, typing their own where that makes sense;
- shows the result follow their changes;
- makes plain what they can change.

It stays static when nothing meaningful varies.

## User Stories

1. As a learner, I want to ask my own question as a branch without selecting a passage, so that a side thought does not clutter the conversation I am in.
2. As a learner, I want a free branch to inherit the parent conversation, so that the tutor answers my side question with the context I have built.
3. As a learner, I want to ask an unrelated question as a free branch, so that I can follow a passing thought without leaving this learning tree.
4. As a learner, I want "Ask on the side" right beside Send, so that I discover free branches while typing and do not start a new learning tree instead.
5. As a learner, I want "Ask on the side" to open the new child at once, so that I read the answer straight away, as with any branch.
6. As a learner, I want to return from a free branch to its parent in one click, as from any branch, so that I can resume the main line.
7. As a learner, I want "Ask on the side" to be unavailable until the conversation has a completed tutor reply, so that I ask my first question in the conversation itself.
8. As a learner, I want "Ask on the side" to be unavailable while the conversation is responding, as Send is, so that the branch inherits a finished reply.
9. As a learner, I want a free branch's address chip and title at the bottom of the reply I branched after, so that I can see where in the conversation the side question came from.
10. As a learner, I want several free branches from the same reply shown together in one row, in address order, so that I can find each one.
11. As a learner, I want that row to wrap when it is full, so that many free branches stay readable on a narrow screen.
12. As a learner, I want free branches made after different replies to sit under their own replies, so that the chips follow the order of my thinking.
13. As a learner, I want a free branch's chip in its family's ink, so that it matches its line and node on the map.
14. As a learner, I want choosing a free-branch chip to open that child, so that I can revisit a side question later.
15. As a learner, I want free branches to take addresses and family inks like any branch, so that the map stays consistent.
16. As a learner, I want the map's line to a free branch to attach at the reply it hangs off, so that the map shows where the side question came from.
17. As a learner, I want a subtle "+" on a conversation node on the map, so that I can free-branch from the map without opening the focused chat first.
18. As a learner, I want the map's "+" only on conversation nodes with a completed tutor reply, so that it never offers a branch with nothing to inherit.
19. As a learner, I want the map's "+" to open the same branch question box I already know, with no passage, so that free-branching feels like branching.
20. As a learner, I want sending from the map's "+" to open the new child, so that I read the answer at once.
21. As a learner using a keyboard, I want "Ask on the side" and the map's "+" to be reachable and labelled, so that I can free-branch without a pointer.
22. As a learner, I want the map's "+" to appear when a node has keyboard focus as well as on hover, so that keyboard users can find it.
23. As a learner, I want deleting a free branch to behave like deleting any branch, so that addresses renumber as they already do.
24. As a learner, I want a free branch to survive reloading the app, so that side questions are kept like other branches.
25. As a learner, I want the tutor in a free branch to treat the inherited context as background, not as a limit, so that an unrelated question still gets a straight answer.
26. As a learner, I want a visual whose result depends on values to start from a sensible example, so that it shows something meaningful before I touch it.
27. As a learner, I want to change a visual's values and see the result follow, so that I learn how the idea responds.
28. As a learner, I want to type my own value into a visual where that makes sense, such as my own text to hash, so that I can test the idea on my own case.
29. As a learner, I want it to be obvious which parts of a visual I can change, so that I do not miss the interaction.
30. As a learner, I want a visual that has nothing meaningful to vary to stay static, so that I am not given pointless controls.
31. As a learner, I want typing in or dragging a visual's controls never to open the Ask popup, so that playing with a visual and asking about its parts do not get in each other's way.
32. As a learner, I want my playing with a visual not to change my familiarity, so that the estimate comes only from what I say.

## Implementation Decisions

- **Free branch anchor.** The branch anchor resolver gains a free-branch form: a question and no passage, groundwork or visual part. The server chooses the parent's latest completed tutor reply as the branch's message. If the parent has no completed tutor reply, it rejects the request with 400 and a clear error. A request that mixes free-branch fields with passage offsets, a groundwork concept or a visual part is rejected, as mixed groundwork requests already are.
- **Storage.** No schema change. The branches row stores the latest completed reply as its message, no offsets, no visual and an empty passage text. An empty passage marks a free branch; groundwork branches keep their concept name as passage text.
- **Inherited context.** The compaction prompt for a free branch has no passage. It compacts the parent's inherited context and conversation up to creation, as for any child. The child's tutor context omits the selected passage. Nothing tells the tutor that the question relates to the parent.
- **Create route.** The existing create-branch route takes the free-branch form and keeps its rules: a non-empty question, the parent's model and effort checks, the quick thinking model's compaction, and 409 while the parent is responding. The form-open compaction preparation is not used for free branches; the compaction starts at creation, as it does for groundwork.
- **Naming and explored concept.** These are unchanged. A free branch is named by the existing branch-title rule from its question. Its explored concept is the concept named for it together with its title.
- **Focused chat.** The question box gains an "Ask on the side" action beside Send:
  - It is enabled only when the conversation has a completed tutor reply, is not responding, and the question box has text.
  - It is unavailable while the question has attachments, since a branch question carries none.
  - Using it creates the free branch and opens the child's focused chat, as passage branches do.
- **Free-branch chips.** The parent's focused chat shows a row at the bottom of each reply that free branches hang off. Each entry is the branch's address chip in family ink followed by its title. Entries are in address order and the row wraps. A long title truncates; the chip never does, and the full title stays in the entry's label. Choosing a chip opens that child. They reuse the existing address chip look, as explored groundwork chips do. Where the reply is the latest one, the row sits between the reply and its next questions. The mockup confirms the exact placement.
- **Map.** Branch lines already attach by message, so a free branch's line attaches at its reply without new layout work. A conversation node shows a subtle "+" on hover and on keyboard focus, and only when that conversation has a completed tutor reply. The "+" opens the existing branch question box beside the node, with no passage. Sending creates the free branch and opens the child.
- **Visual guidance.** In the visual prompt, the sentences that make interaction the default when an idea has a meaningful variable are replaced with this principle: "Treat a visual as something the learner plays with, not a picture to look at. When what it shows depends on values the learner could vary, start from a sensible example, let them change those values, typing their own where that makes sense, and show the result follow. Make plain what they can change. Leave it static when nothing meaningful varies." The surrounding input-validation and control rules stay.
- **No host change for visuals.** Visual controls are already never visual parts, and a click that ends a drag never picks a part. Typing in or dragging a visual's controls therefore cannot open the Ask popup.
- **Familiarity.** This is unchanged. Only the learner's own messages count as evidence; changing a visual's inputs does not.

## Testing Decisions

- A good test checks behaviour the learner or a caller can observe: the route's response, the saved child as read back, what the tutor and the compaction receive, and what a rendered component shows and does. It does not check internal helpers.
- **HTTP integration (main seam).** Post a free branch to the create-branch route on an in-process app with fake providers. Check that the child:
  - is created with no passage;
  - hangs off the parent's latest completed tutor reply;
  - gets a compaction prompt with no passage, and a tutor context with no selected passage;
  - survives reopening the store.

  Also check that the route returns 400 before the parent's first completed reply and for mixed anchor fields. Prior art: the discussion-branch HTTP tests.
- **Component tests in jsdom:**
  - "Ask on the side": enabled and disabled states, and that it creates a free branch and opens the child.
  - The free-branch chip row: several chips in address order under their own replies, with family ink, and choosing one opens the child.
  - The map's "+": shown on hover and focus, hidden before the first completed reply, and opening the branch question box with no passage.

  Prior art: the branch form and branch component tests, and the groundwork chips.
- **No test for the visual prompt wording.** Prompt quality is judged in planning sessions, not by ticket tests.

## Out of Scope

- A forest: several roots in one learning tree.
- The tutor noticing an off-topic question and offering to move it to a free branch.
- Free-branching from a particular earlier reply rather than the latest completed one.
- Attachments on a free branch's question.
- Staying in the parent while the free branch's answer streams in the background.
- A keyboard shortcut for "Ask on the side".
- Asking the tutor to make an existing static visual interactive; a plain message already covers it.
- Counting interaction with a visual as familiarity evidence.

## Further Notes

- The glossary now defines **Free branch** and widens **Branch** and **Inherited context** to cover it.
- "Ask on the side", the free-branch chip row and the map's "+" are new UI. Their tickets need a mockup at `docs/mockups/<issue-id>.html` or `.png`, the `new-ui` label and a `Mockup:` line.
- No ADR: a free branch extends the existing branch and is easy to reverse.
