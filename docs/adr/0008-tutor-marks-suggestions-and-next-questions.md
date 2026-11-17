# The tutor marks suggestions and next questions in its own reply

After every reply, a separate quick thinking model call read the reply again to mark suggestions and extract concepts, topics and links for the knowledge graph. That call resent the whole reply and its context, could not start until the reply finished, and came from a weaker model than the one that wrote the reply. We also wanted next questions, and a quick model writing them would likely ask the obvious. We decided that the chat model writes one hidden block at the end of each reply, holding its next questions, its suggestions and the concepts, topics and links the reply touched. The server strips the block before the learner sees the reply and shows each next question as soon as its line arrives. The separate suggestion call is removed. As with the verdict block, the quick thinking model stands in only when a reply arrives without a readable block. We accepted a few hundred more chat-model output tokens per reply and a tutor prompt that asks more of every turn, in exchange for one fewer request per reply, next questions from the model that knows the conversation best, and suggestions that appear with the reply instead of after it.

## Considered Options

- Keep the quick thinking call and add next questions to it. No change to the tutor prompt, but the questions come from the weaker model, after the reply, and the extra request stays.
- The chat model writes only next questions; the quick call keeps suggestions and the knowledge graph. Smaller tutor prompt, but the extra request stays for every reply.
- Inline markers around suggested terms in the reply text. Underlines would appear while streaming, but markers can leak into copied text and the knowledge graph would still need its own block.
