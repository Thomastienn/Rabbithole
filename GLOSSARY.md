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

**Address**:
A conversation's place in its learning tree: the root conversation (trunk) is 1, its children 1.1, 1.2 and so on down (1.1.2). Siblings are numbered in the order they were created (ties by id), so adding a branch never renumbers the conversations before it. Deleting a branch renumbers its later siblings.
_Avoid_: Path, index, number

**Branch family**:
A first-level branch of the trunk and every conversation beneath it. Each family takes one series ink in address order (amber, leaf, rust, lichen, then repeating); the trunk wears paper. A passage underline, its address chip, the branch line on the map and the conversation node band share their family's ink.
_Avoid_: Subtree, colour group

**Passage**:
The exact contiguous text of a tutor reply that a branch was created from.
_Avoid_: Selection, highlight, anchor

**Suggestion**:
A term or short phrase in a tutor reply that the quick thinking model marked as worth breaking down into a branch: used but not explained, and likely unfamiliar to the learner. It carries no proposed question.
_Avoid_: Candidate, Explore further item

**Quick thinking model**:
The learner-chosen model for picking suggestions and compacting prior discussion into inherited context for child conversations, with its own configurable effort.
_Avoid_: Helper model, cheap model

**Suggestion model**:
The previous name for the quick thinking model, describing its suggestion-picking role. Existing specifications use this name.

**Chat model**:
The model that answers learner messages in a conversation. Its Settings default starts new learning trees; children inherit their parent's current model and effort.

**Smart model**:
The learner-chosen model for visuals and private video scripting, scene planning and animation code. Its model and effort initially follow the Settings chat defaults and can each be overridden independently.

**Effort**:
The supported reasoning setting chosen for a model role or conversation. It is independent of model selection; it does not promise a particular response quality or measured amount of computation.

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

**Usage history**:
The record of reported model usage across learning trees and tasks, retained independently of deleted conversations and media. It contains usage measurements and attribution, not deleted learning content.

**Video library**:
The local collection of generated videos, available independently of their originating learning trees. A saved video remains until the learner explicitly trashes it, even when its source discussion is deleted.

**Visual**:
An interactive HTML/SVG/JS fragment shown inside a tutor reply where the tutor placed it, running in an isolated sandbox with no network or access to the app. Older Mermaid diagrams stay diagrams.
_Avoid_: Widget, canvas, artifact (in UI copy)

**Theme**:
A named colour palette for the whole app, such as Paperback or Forest, covering surfaces, ink, accent and the four series inks. Each theme has a light and a dark variant; Appearance chooses between them.
_Avoid_: Skin, colour scheme, tint

**Appearance**:
The learner's choice of Dark, Light or System, deciding which variant of the current theme is shown.
_Avoid_: Theme, mode
