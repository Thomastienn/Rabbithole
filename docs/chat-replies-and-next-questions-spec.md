# Chat replies: effort control, readable replies, next questions

Decision record: ADR 0008.

## Problem Statement

The learner cannot find where to change effort in a focused chat. The control exists, but it sits at the bottom of the model menu, below every provider's model list, so it reads as missing.

Tutor replies sometimes say the same thing twice. In a conversation about the Artemis mission, the tutor asked for a roadmap visual and then wrote the same five missions again as a timeline in prose, repeating even the visual's footnote. The tutor only writes a short request for a visual and never sees what was drawn, so it does not know what the visual already shows. The fixed rules also push it towards a timeline for any dated entries. The same rules still say visuals go to a "smart-model worker", although the chat model draws them (ADR 0004).

Replies are better than before but still read as dense. The overall length is fine; the trouble is long sentences and paragraphs packed with several ideas, so a reply is hard to take in from top to bottom.

Deleting a learning tree from the library sometimes drops the learner into an unrelated tree. When the deleted tree was the one last open, the app opens its neighbour in the list, which feels random. The learner was in the library to pick, and wants to stay there.

After a reply, the learner has to think of the next question alone. Suggestions mark terms to branch on, but nothing proposes a question to ask next. Suggestions also come from a separate quick thinking model call that rereads the whole reply after it finishes, which costs a request, arrives late and comes from a weaker model.

## Solution

The focused chat gets its own effort dropdown beside the model button, showing the conversation's current effort and changing it in one click. The model menu then lists only models.

A visual request states exactly what the visual shows, and the tutor prompt describes a visual as a section of the reply that the learner reads in place. Knowing what is already on screen, the tutor writes what the visual cannot carry instead of repeating it. The outdated wording about a smart-model worker is corrected.

The default tutor style gains a short paragraph of loose guidance on writing for reading top to bottom, in small pieces that each carry one idea, with some structure when a reply has several parts. It is added to the existing style; nothing there is replaced or shortened. Side sections stay.

Deleting a learning tree from the library keeps the learner in the library. The list refreshes and the tree is gone; nothing else changes. If the deleted tree was the one last open, leaving the library lands on the new-chat screen.

The tutor ends each reply with one hidden block holding its next questions, its suggestions and the concepts, topics and links the reply touched. The server strips the block from the reply. Next questions appear one at a time under the latest reply as they arrive: one to three deep, curious questions per teaching reply, none after a casual turn. Choosing one asks it at once in the same conversation. The separate quick thinking suggestion call is removed; the quick thinking model stands in only when a reply arrives without a readable block.

## User Stories

1. As a learner, I want an effort dropdown beside the model button in a focused chat, so that I can see and change the conversation's effort without opening the model menu.
2. As a learner, I want the effort dropdown to show the conversation's current effort, so that I know what the next reply will use.
3. As a learner, I want the effort dropdown to offer only the efforts the current model supports, plus Provider default, so that I cannot pick one that will fail.
4. As a learner using a custom endpoint, I want the effort dropdown to keep its Custom… option, so that I can still type an effort the endpoint accepts.
5. As a learner, I want the effort dropdown disabled while a reply streams, like the model button, so that a change never lands mid-reply.
6. As a learner, I want the model menu to list only models, so that it is shorter and easier to scan.
7. As a learner, I want to be told when switching models resets my effort, as today, so that a silent change does not surprise me.
8. As a learner, I want the effort I choose before my first question to be used for the new learning tree, so that the dropdown works on the empty chat too.
9. As a learner, I want a reply's prose not to repeat what its visual already shows, so that I do not read the same content twice.
10. As a learner, I want the prose beside a visual to add what the visual cannot show, such as why it matters and caveats, so that the two complement each other.
11. As a learner, I want a visual to show what the tutor said it would show, so that the prose around it stays true.
12. As a learner, I want reply text broken into small pieces that each carry one idea, so that I can take a reply in from top to bottom.
13. As a learner, I want replies with several parts to have some structure, such as headings, a list or step cards, so that I always know where I am.
14. As a learner, I want the tutor to keep the occasional side section, so that replies keep their character.
15. As a learner who has edited my tutor style, I want my own style left as I wrote it, so that a default change never overwrites my words.
16. As a learner, I want to stay in the library after deleting a learning tree there, so that I can carry on choosing.
17. As a learner, I want the library list to refresh after a delete, so that the deleted tree disappears straight away.
18. As a learner, I want deleting a tree I did not have open to change nothing else, so that my place is kept.
19. As a learner, I want to land on the new-chat screen when I leave the library after deleting the tree I last had open, so that I never land in an unrelated tree.
20. As a learner, I want one to three next questions under each teaching reply, so that I always have a thought-provoking way forward.
21. As a learner, I want next questions to be the how, why or what-if a curious person would ask, so that they deepen my understanding instead of restating the reply.
22. As a learner, I want next questions to ask what the reply raised but did not answer, so that they are never answered already.
23. As a learner, I want no next questions after a casual turn such as "thanks", so that they never feel forced.
24. As a learner, I want next questions to appear one by one while they arrive, so that I am not left waiting for all of them.
25. As a learner, I want next questions only under the latest reply, so that older replies stay clean.
26. As a learner, I want next questions disabled while a reply streams, so that I cannot send two questions at once.
27. As a learner, I want choosing a next question to ask it at once in the same conversation, so that one click moves me on.
28. As a learner, I want choosing a next question never to create a branch, so that it behaves like a question I typed.
29. As a learner, I want suggestions underlined as before, so that I can still branch on unfamiliar terms.
30. As a learner, I want suggestions to come from the model that wrote the reply, so that they reflect the whole conversation.
31. As a learner, I want my knowledge graph to keep learning from each reply, so that familiarity and concept links stay current.
32. As a learner, I want suggestions and the knowledge graph still filled in when a reply arrives without its hidden block, so that a model slip loses nothing.
33. As a learner, I want never to see the hidden block, so that the reply reads cleanly.
34. As a learner, I want a reply stopped early to keep whatever next questions and suggestions already arrived, so that stopping does not throw them away.
35. As a learner, I want a retried reply to replace the old reply's next questions and suggestions, so that they match the reply I see.
36. As a learner, I want reply usage to stop showing a separate suggestions call when none was made, so that the usage line stays honest.
37. As the owner, I want one request fewer per reply, so that conversations cost less and feel faster.

## Implementation Decisions

### Effort dropdown

- The focused chat header gains an effort dropdown beside the model button. It reuses the existing effort options, the custom-effort entry and the existing model-change call that already accepts an effort; the server side needs no change.
- The "Effort for next reply" group moves out of the model menu into the new dropdown. The model button keeps showing the model; whether it still shows the effort beside it is left to the implementer, as long as the dropdown shows it.
- The reset notice when a model switch drops the effort stays as it is.

### Visual requests

- The visual request block gains a required field stating exactly what the visual shows, such as "Artemis I to IV with year and status, then longer-term goals". The tutor writes it before the prose that follows, so it knows what is on screen.
- The tutor rules describe a visual as a section of the reply that the learner reads in place, so the surrounding prose carries what the visual cannot. No rule names the repetition problem directly.
- The rule sentence that says the server delegates visuals to a smart-model worker is corrected to say the chat model draws them in a separate call.
- The new field is passed to the visual writer as part of its request, so the drawn visual matches it.
- Older stored requests without the field still parse.

### Readability

- The default tutor style gains one paragraph of loose guidance: write for reading top to bottom, break explanations into small pieces that each carry one idea in plain sentences, and give replies with several parts some shape such as headings, lists or step cards. No numbers or fixed formats.
- It is appended to the existing default; no current sentence is changed or removed. A saved learner style is untouched.

### Library delete

- Deleting a learning tree from the library keeps the library open and refreshes its list.
- If the deleted tree was the one last open, the app clears its open tree instead of opening a neighbour; leaving the library then shows the new-chat screen.
- Deleting from anywhere else, and deleting a branch inside the open tree, behave as today.

### Next questions and suggestions in the reply (ADR 0008)

- The tutor rules gain a rule for one hidden block at the end of each reply. It holds next questions (one per line, so each can be shown as soon as it arrives), suggestions (terms or short phrases as written in the reply, each with its concept), and the concepts, topics and links the reply touched, in the shape the knowledge graph already takes.
- The rule's guidance for suggestions carries over the existing suggestion prompt's meaning: terms used but not explained, likely unfamiliar to this learner. Its guidance for next questions is loose: one to three deep, curious questions the reply raises but does not answer; none after a casual turn.
- The block works like the verdict block: the server strips it from the stored and streamed reply and parses it tolerantly. Each next question streams to the client as its line completes.
- Parsed suggestions and graph data go to the same store calls the quick thinking suggestion job used, so underlines and the knowledge graph behave as before.
- Next questions are stored with their reply so they survive reload, and are replaced when the reply is retried. Only the latest reply in a conversation shows them.
- A stopped reply keeps whatever part of the block had arrived.
- The separate quick thinking suggestion call after each reply is removed. When a completed reply has no readable block, the quick thinking model runs once as a fallback for suggestions and the knowledge graph, as it does for verdicts. The fallback writes no next questions.
- Usage for the removed call stops appearing; a fallback call is recorded under the existing suggestions task.
- Choosing a next question sends it as an ordinary learner message in the same conversation, through the same path as a typed question. It is disabled while a reply streams.
- The suggestion settings stay, as the quick thinking model's settings.

### Glossary

- New: Next question. Updated: Suggestion (marked by the tutor), Quick thinking model (compaction, titles and fallback).

## Testing Decisions

- A good test checks what the learner or a caller sees: what the dropdown offers and sends, what the reply shows, what the store holds. It never asserts prompt wording or fixed labels (ADR 0007).
- Effort dropdown: extend the model menu component test to choose an effort from the new dropdown and assert the model-change call carries it, and that a streaming reply disables it.
- Visual request field: extend the diagram parser unit test so a request with the new field passes it through and an older request without it still parses.
- Library delete: extend the chat hooks delete-flow test so deleting the last-open tree from the library keeps the library, opens no other tree, and later shows the new-chat screen.
- Hidden block: one integration seam at the send route with a fake provider, following the verdict integration test. A reply carrying the block stores suggestions, graph data and next questions, and the learner never receives the block. A reply without it triggers exactly one fallback call. A stopped reply keeps what arrived.
- Block parser: a unit test, following the verdict parser test, that a partial block yields each completed next question line and ignores a torn line.
- Next questions in the thread: a component test that only the latest reply shows them, that they are disabled while streaming, and that choosing one sends it in the same conversation.
- The existing quick thinking suggestion tests are rewritten around the new seam or deleted where the call no longer exists.
- Readability guidance: no test.

## Out of Scope

- Changing what the quick thinking model does for compaction, titles or the verdict fallback.
- A setting to turn next questions off or change how many appear.
- Streaming suggestion underlines into the reply before the block arrives.
- Sending the drawn visual back to the tutor.
- Rewriting the existing tutor style or fixed rules beyond the additions above.

## Further Notes

- The duplicate roadmap was traced in the Artemis conversation: the tutor asked for a roadmap visual and then wrote a timeline of the same missions, with no tool call between them.
- The learner has no saved tutor style, so the readability paragraph reaches them through the default.
- The block adds a few hundred chat-model output tokens per reply. Watch whether reply quality or verbosity changes once the tutor carries this extra work.
