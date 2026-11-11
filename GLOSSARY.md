# TreeTutor

A local learning app where a learner explores a topic as a tree of connected conversations with an LLM tutor.

## Language

**Learning tree**:
One saved topic of study: a root conversation and every conversation branched from it. The UI may label it "chat".
_Avoid_: Tree (alone), map, chat (outside UI copy)

**Conversation**:
One question-and-answer thread with the tutor inside a learning tree. Never a whole learning tree.
_Avoid_: Node (alone), box, chat

**Conversation node**:
A conversation as drawn on the learning tree map: a chat-style preview of its questions and replies, linked to its parent and children by branches.
_Avoid_: Node (alone), preview node, box, card

**Focused chat**:
The full view of one conversation, where the learner reads replies, asks questions and creates branches.
_Avoid_: Chat page, conversation view

**Branch**:
The parent-to-child link created when the learner asks about a passage of a conversation.
_Avoid_: Edge, connection, subtree

**Passage**:
The exact contiguous text of a tutor reply that a branch was created from.
_Avoid_: Selection, highlight, anchor

**Suggestion**:
A term or short phrase in a tutor reply that the suggestion model marked as worth breaking down into a branch: used but not explained, and likely unfamiliar to the learner. It carries no proposed question.
_Avoid_: Candidate, Explore further item

**Quick thinking model**:
The learner-chosen model for picking suggestions and compacting prior discussion into inherited context for child conversations.
_Avoid_: Helper model, cheap model

**Suggestion model**:
The previous name for the quick thinking model, describing its suggestion-picking role. Existing specifications use this name.

**Knowledge graph**:
The single record, across all learning trees, of concepts the learner has met and how they relate.
_Avoid_: Learner profile, skill map

**Concept**:
One thing the learner can know, such as "Peterson's algorithm"; shown as a point in the knowledge graph.
_Avoid_: Term, skill, node

**Topic**:
A named group of related concepts, such as "Concurrency". A concept can belong to several topics.
_Avoid_: Section, category, area

**Concept link**:
A connection between two concepts: either "related", or "builds on" when one concept needs the other first.
_Avoid_: Edge, dependency

**Familiarity**:
The app's estimate of how well the learner knows a concept, derived from evidence such as meeting it, asking about it and using it. An estimate, never a measured mastery.
_Avoid_: Mastery, score, level

**Inherited context**:
The fixed background a child conversation receives at branch creation: the exact passage and a compact paragraph combining its parent's inherited context with the parent conversation, preserving important ideas. It supplies context without answering the child's question; that question is a separate learner message.
_Avoid_: Summary, compacted context
