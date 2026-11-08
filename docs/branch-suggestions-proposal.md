# Automatic branch suggestions

Decision: `TreeTutor-vm4.4`. Status: draft for agreement.

The user agreed to draft up to three optional passage suggestions after a completed tutor reply, opening an editable question before branch submission and retaining manual selection. The details below remain proposed. This is a later increment; PRD.md remains the product authority and app implementation is not authorized. This document defines behavior, not visual styling or a component system.

## Learner flow and trigger

The learner reads a tutor response and can explore an unfamiliar concept without composing a side question from scratch. After a text reply completes successfully and is saved, evaluate that reply once for zero to three useful branch suggestions. Do not evaluate partial, failed, canceled or interrupted replies. An answer may warrant no suggestions.

Suggestion work belongs to the originating conversation and response. It must not block chatting, navigation or concurrent replies elsewhere. Completion never moves keyboard focus, scrolls the chat or opens a child. Do not rerun automatically when focusing a conversation, reopening a tree or switching provider/model. A later reply has its own suggestions; it does not rewrite earlier suggestions.

Use the conversation's selected approved provider/model captured at reply completion. Only the completed answer, its preceding learner question and relevant existing fixed inherited context are needed. Exclude unrelated branches. Suggestion generation may make an additional inference request; local storage does not imply offline inference. Exact request integration and latency remain implementation checks, and unresolved subscription routes must not be replaced by API keys.

## Presentation, dismissal and acceptance

Show a compact labeled group, “Explore further,” after its source response. Each suggestion contains a short exact source passage and an editable proposed question. Suggestions are optional reading aids; their presence does not mean the learner has misunderstood something. Do not insert popups, auto-open panels or highlight passages across the whole answer.

| Action or state | Proposed behavior |
| --- | --- |
| Suggestions pending | Keep the answer and manual branching usable. Reserve no blocking dialog and announce no repeated progress updates. |
| Suggestions ready | Show up to three distinct candidates associated with this message. Announce availability once, politely, without reading every question aloud. |
| Choose a suggestion | Open the existing branch-question form with the exact passage and editable question. Focus the question field. No child or compacted snapshot exists yet. |
| Edit and submit | Use the normal manual-branch flow: compact relevant context on demand, save the child and fixed inherited snapshot, then immediately focus the child. Preserve the source passage even when the question changes. |
| Cancel the form | Return focus to the suggestion control; create no child and retain suggestions. |
| Dismiss one suggestion | Hide it for this saved response. Move focus to the next suggestion, previous suggestion or group control, in that order. |
| Dismiss all | Hide this response's suggestion group and return focus to its message control. Do not change other responses or disable manual selection. |
| Suggestion accepted | Mark its control “Open branch” linked to the created child, avoiding duplicate children from repeat activation. Deliberate manual branching from that passage remains available. |
| No useful suggestions | Show no group. An empty result is valid. |
| Generation fails or response is invalid | Keep manual branching usable; show a brief nonblocking “Suggestions unavailable” status. Do not automatically retry or publish invalid candidates. |
| App stops during generation | Do not restart inference automatically on reopening. Retain completed saved suggestions; unfinished work stays unavailable. |

Suggestion controls use normal Tab navigation and Enter/Space activation, visible focus and descriptive accessible names. Escape closes the question form before any return-to-overview action. Canvas handlers must not intercept question editing. Exact shortcut choices follow the architecture decision if agreed; no extra global shortcut is introduced here.

Persist completed candidates, dismissals and accepted child references with their source message. A failed save must not report acceptance or dismissal as saved. Reopening restores those states without new inference. On branch-creation failure, preserve the edited question for retry and avoid marking the candidate accepted until the child is saved. Late events cannot attach results to another message or revive dismissed candidates.

## Candidate and context rules

Each candidate identifies one contiguous passage in the immutable source answer, with message ID, exact text and start/end offsets. Follow the architecture proposal's canonical-text indexing if agreed. Validate that the offsets match the exact passage; repeated words must resolve to one occurrence, and rendered Markdown must map to the same canonical source used by manual selection. Discard mismatches rather than guess an anchor.

Prefer a concept needed to understand this particular explanation, with a short question that makes sense alongside the passage. Do not claim to know the learner's ability. Skip duplicate or overlapping candidates, tangential topics and questions already answered adequately in the current reply. Return fewer than three when appropriate; filling a quota is not a quality goal.

Store candidate metadata separately from tutor messages. Suggestion generation instructions, candidate lists and diagnostics do not become parent history or inherited branch context. On submission, the chosen passage and edited question enter the ordinary branch-creation flow. The child's compact context includes relevant parent/ancestor history as required by the PRD. Later parent replies leave that inherited snapshot fixed, and child discussions do not enter parent context.

No branch, summary request, canvas box or edge is created merely because a suggestion appears. This is the same explicit submission boundary used by manual branching at every nesting depth.

## Examples

- **Useful candidate:** An answer introduces “Peterson's algorithm” as a tournament-tree building block but does not explain its two-participant protocol. Offer “How does Peterson's algorithm let two participants share a lock?” Selecting it opens the question form; the learner may change it to “Why is Peterson needed at each node?” before submitting.
- **Repeated passage:** An answer mentions “Peterson's algorithm” twice. The candidate records the occurrence in the building-block explanation; the eventual edge reveals that occurrence after moving boxes or reopening the tree.
- **No useful candidate:** A short answer already explains each introduced term. Offer nothing rather than a generic “Tell me more” question.
- **Dismissal:** The learner dismisses a familiar term. It remains dismissed after reopening; new replies can still offer their own relevant passages.
- **Nested use:** A child answer introduces “busy waiting.” Submitting its suggestion creates a grandchild using the same fixed-context and focus rules. The original root conversation receives no new context.

## Alternatives and tradeoffs

| Option | Tradeoff |
| --- | --- |
| After completed replies, recommended draft | Makes useful entry points discoverable without interrupting reading; adds inference work and needs strict quality filtering. |
| Only on explicit request | Avoids automatic inference cost and visual noise; learners must discover and request suggestions. |
| Candidates bundled into the tutor's answer-generation request | May avoid a separate round trip, but couples optional suggestions to the main answer format and completion. Evaluate only if it preserves ordinary text and history isolation. |
| Automatically create branches | Creates unwanted context, boxes and inference work. Excluded: the learner must submit a question. |

Start with the existing branch form and normal passage anchors. No learner profile, prerequisite graph, ranking service, cross-tree analysis or suggestion preferences screen is proposed. Exact generation protocol and visual composition remain future implementation decisions.

## Implementation acceptance checks

These are planned checks; no app, inference or accessibility tests have run.

1. Complete replies in two conversations concurrently. Each receives zero to three candidates only after its own saved completion; typing, navigation and focus remain uninterrupted. Failed, partial and canceled replies do not trigger evaluation.
2. Choose, edit, cancel and submit using only the keyboard. Cancellation creates nothing; successful submission creates exactly one focused child using normal compaction. Re-activating the accepted suggestion opens that child. Manual selection still works before, during and after suggestion work.
3. Validate repeated text, emoji, Markdown, invalid offsets, duplicate candidates and overlapping passages. Accepted candidates must resolve to the exact original passage after movement and restart. Invalid candidates must not appear.
4. Dismiss one and all candidates, then reopen the tree and switch providers. Saved dismissals persist; no suggestion inference restarts. Interrupt generation and fail saves separately; show no false saved state and permit continued manual branching.
5. Inspect model requests and persisted histories. Only the stated input reaches suggestion generation; candidates and diagnostics remain outside tutor history. The submitted question receives the ordinary fixed branch snapshot. Test in a nested child and verify parent isolation.
6. Review a small fixed set of learning answers: the tournament-tree example, a self-contained short answer, repeated terminology, unrelated technical vocabulary and an answer in a nested branch. For every displayed candidate, verify exact grounding, relevance, a useful question, no duplication and no adequate existing answer. Omit candidates that fail; record results before enabling automatic suggestions.
7. Verify descriptive controls, focus recovery after dismiss/cancel, a single polite availability announcement and no focus/scroll changes when results arrive. Simulate failed generation and late events while another conversation remains usable.

Agreement needed before closing: automatic evaluation and its additional inference cost, dismissal persistence, accepted-suggestion reuse and failure/restart behavior. Implementation remains `TreeTutor-vm4.5`, dependent on this decision and the manual branching flow.
