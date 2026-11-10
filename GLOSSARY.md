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

**Suggestion**:
A passage in a tutor reply that the suggestion model marked as worth breaking down into a branch. It carries no proposed question.
_Avoid_: Candidate, Explore further item

**Suggestion model**:
The learner-chosen model, usually cheaper than the tutor's, that picks suggestions in each saved reply.
_Avoid_: Helper model, cheap model

**Knowledge graph**:
The single record, across all learning trees, of concepts the learner has met and how they relate.
_Avoid_: Learner profile, skill map

**Concept**:
One thing the learner can know, such as "Peterson's algorithm"; a node of the knowledge graph.
_Avoid_: Term, skill, node

**Topic**:
A named group of related concepts, such as "Concurrency". A concept can belong to several topics.
_Avoid_: Section, category, area

**Familiarity**:
The app's estimate of how well the learner knows a concept, derived from evidence such as meeting it, asking about it and using it. An estimate, never a measured mastery.
_Avoid_: Mastery, score, level

**Inherited context**:
The fixed snapshot of relevant ancestor discussion, the passage and the learner's question that a child conversation receives at branch creation.
_Avoid_: Summary, compacted context
