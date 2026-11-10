# TreeTutor

A local learning app where a learner explores a topic as a tree of connected conversations with an LLM tutor.

## Language

**Learning tree**:
One saved topic of study: a root conversation and every conversation branched from it. The UI may label it "chat".
_Avoid_: Tree (alone), map, chat (outside UI copy)

**Conversation**:
One question-and-answer thread with the tutor inside a learning tree. Never a whole learning tree.
_Avoid_: Node, box, chat

**Branch**:
The parent-to-child link created when the learner asks about a passage of a conversation.
_Avoid_: Edge, connection, subtree

**Passage**:
The exact contiguous text of a tutor reply that a branch was created from.
_Avoid_: Selection, highlight, anchor

**Inherited context**:
The fixed snapshot of relevant ancestor discussion, the passage and the learner's question that a child conversation receives at branch creation.
_Avoid_: Summary, compacted context
