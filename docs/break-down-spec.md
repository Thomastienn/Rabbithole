# Break down, token stats and the knowledge graph

**Scoped refinement, 2026-11-11:** The [workspace and media refinement spec](workspace-media-refinement-spec.md) supersedes conflicting rules below: suggestion model is now the quick thinking role, with independent effort and custom endpoint support; the passage popup is compact with outside-click/Escape dismissal and familiarity controls in overflow; usage becomes durable historical charts rather than only today's totals. Unrelated suggestion and knowledge-graph behavior remains binding.

Status: agreed with the owner in a design session on 2026-11-09. Planned as a new
epic after TreeTutor-sh8 (Product 1.0); Beads issues are not created yet. This spec
supersedes [branch-suggestions-proposal.md](branch-suggestions-proposal.md).
Vocabulary follows [GLOSSARY.md](../GLOSSARY.md).

## Problem Statement

A tutor reply often contains terms or sections the learner does not understand, but
the learner has to notice each one, select it and write a full question before they
can branch. Breaking a broad answer such as "How to make a website" into its parts
("Frontend", "Backend") takes repeated manual work. The app also learns nothing
about the learner across learning trees, so it cannot point at what is likely to
confuse this particular learner. Finally, model calls spend subscription usage
invisibly: the learner cannot see what each reply or background call costs.

## Solution

After each saved tutor reply, a cheap suggestion model marks the terms and sections
the learner probably does not understand with a dotted underline. Clicking an
underline, or highlighting any text, opens a small empty textbox above it; the
learner types a short prompt such as "explain" and a child conversation branches
out with that passage as its source. An explored underline turns solid and reopens
its child.

The suggestion model also maintains one knowledge graph across all learning trees:
concepts grouped into topics, linked as "related" or "builds on", each with
evidence and an estimated familiarity that the learner can correct. The graph
informs which passages get underlined and is browsable in its own Knowledge tab.

Every final response shows a small line of token usage, and Settings shows a daily
total, so background cost is never hidden.

## User Stories

### Token stats

1. As a learner, I want a small line of token usage under each final tutor response, so that I can see what each reply cost.
2. As a learner, I want the line to show input, output and cache-read tokens separately, so that I understand where usage goes.
3. As a learner, I want the suggestion model's usage for a reply shown with that reply, so that background cost is not hidden.
4. As a learner, I want a daily usage total in Settings, so that I can judge my overall spend.
5. As a learner, I want "usage unavailable" shown when a provider does not report usage, so that I never see an invented number.
6. As a learner, I want usage saved with each message, so that it is still visible after I reopen the tree.
7. As a learner, I want a warning in Settings when a suggestion call's concept-name list grows past about 2k tokens, so that I know when matching has become expensive.

### Suggestions

8. As a learner, I want the app to underline terms in a reply that I probably do not know, so that I can explore them without spotting them myself.
9. As a learner, I want whole sections such as "1. Frontend" underlined when they are worth breaking down, so that I can split a broad answer into parts.
10. As a learner, I want as many underlines as the reply needs, with no fixed cap, so that nothing useful is dropped and nothing is padded.
11. As a learner, I want suggestions to run automatically after every saved reply, so that I do not have to ask.
12. As a learner, I want underlines to appear only after the reply is saved, so that streaming text never jumps around.
13. As a learner, I want failed, partial or canceled replies to get no suggestions, so that marks always refer to a real saved answer.
14. As a learner, I want a dotted underline style, so that suggestions are distinct from my own text selection.
15. As a learner, I want underlines to be subtle, so that the reply stays readable.
16. As a learner, I want suggestions never to move focus, scroll the chat or open anything, so that they do not interrupt my reading.
17. As a learner, I want a brief nonblocking "Suggestions unavailable" note when the suggestion call fails, so that I know why there are no underlines.
18. As a learner, I want manual highlighting to keep working while suggestions are pending or after they fail, so that I am never blocked.
19. As a learner, I want suggestions saved with the reply and restored on reopening without running the model again, so that reopening costs nothing.
20. As a learner, I want suggestions not to rerun when I switch provider or model, so that old replies keep their marks.
21. As a learner, I want replies saved before this feature to stay without underlines, so that no surprise backfill spends tokens.
22. As a learner, I want a Settings switch to turn automatic suggestions off, so that I can stop the background cost.
23. As a learner, I want suggestions in two conversations to run concurrently without blocking chat in either, so that concurrency still works.
24. As a learner, I want suggestion instructions and results kept out of the tutor's history, so that they never change the tutor's context.

### Suggestion model

25. As a learner, I want to choose the suggestion model in Settings, so that I can pick a cheap one.
26. As a learner, I want it to default to the conversation provider's cheap model (Haiku for Claude, Codex Luna for Codex), so that it works without setup and only uses a provider I am signed in to.
27. As a learner, I want the default to follow each conversation's provider, so that a signed-out provider never breaks suggestions.

### Branching from a passage

28. As a learner, I want clicking an underline to open a small empty textbox above that passage, so that I can ask about it in place.
29. As a learner, I want highlighting any text to open the same textbox, so that both paths work the same way.
30. As a learner, I want to type a short prompt like "explain", so that I do not have to restate what I am pointing at.
31. As a learner, I want the child conversation to receive the passage and inherited context, so that a short prompt is enough.
32. As a learner, I want an empty textbox to be impossible to send, so that I always state what I want.
33. As a learner, I want Enter to send and Escape to close the textbox, so that it works from the keyboard.
34. As a learner, I want the child to appear on the map and open in the chat panel like any branch, so that the flow matches manual branching.
35. As a learner, I want an explored underline drawn solid, so that I can see what I already explored.
36. As a learner, I want clicking an explored underline to open its existing child, so that I continue there instead of duplicating it.
37. As a learner, I want to still create a second branch from the same text by highlighting it myself, so that a new angle stays possible.
38. As a learner, I want my own highlight to win when it overlaps an underline, so that selection always does what I intended.
39. As a learner, I want to reach underlines with Tab and open them with Enter, so that suggestions are keyboard-accessible.
40. As a learner, I want descriptive accessible names on underlines and a single polite announcement when they appear, so that screen readers are not flooded.
41. As a learner, I want my typed prompt preserved if branch creation fails, so that I can retry.
42. As a learner, I want the same behavior at every nesting depth, so that grandchildren work like children.

### Knowledge graph

43. As a learner, I want one knowledge graph across all my learning trees, so that what I learn in one tree informs the others.
44. As a learner, I want concepts grouped into topics like "Concurrency" and "Machine learning", so that the graph is organized.
45. As a learner, I want a concept to belong to several topics, so that overlapping subjects are not split.
46. As a learner, I want concepts linked as "related" or "builds on", so that the app can find the underlying gap.
47. As a learner, I want the app to record evidence for each concept (met in a reply, asked about, used in my own question), so that its estimate rests on what I did.
48. As a learner, I want an estimated familiarity per concept, so that the suggestion model underlines what is likely to confuse me.
49. As a learner, I want "I know this" and "I don't get this" on a concept, so that I can correct a wrong estimate.
50. As a learner, I want my correction to outrank anything inferred, so that a known concept stops being underlined.
51. As a learner, I want ignoring an underline to count only as a weak hint, so that the app does not assume I know something I just skipped.
52. As a learner, I want the correction buttons on the passage textbox, so that I can correct the estimate while reading.
53. As a learner, I want the same concept reused across replies even under a different name ("Peterson lock" and "Peterson's algorithm"), so that evidence is not split.
54. As a learner, I want to merge duplicate concepts that slipped through, so that I can repair the graph.
55. As a learner, I want the graph built by the same suggestion call, so that it costs no extra model call.
56. As a learner, I want graph data stored locally with my learning trees, so that it stays on my machine.

### Knowledge tab

57. As a learner, I want the knowledge graph in its own tab, separate from the map and chat, so that the learning workspace stays uncluttered.
58. As a learner, I want the tab to list topics with their concepts, familiarity and evidence, so that I can see what the app thinks I know.
59. As a learner, I want correction and merge actions in the tab, so that I can manage the graph in one place.
60. As a learner, I want the tab fully keyboard-accessible, so that it meets the product's keyboard rule.

## Implementation Decisions

- **Build order (Ralph order):** token stats, then suggestions with underlines and the passage textbox, then knowledge graph data, then the Knowledge tab. The local embedding pre-filter is a deferred follow-up.
- **Usage capture:** each provider adapter reads the usage the provider reports for a turn (input, output, cache-read tokens) and the server saves it with the resulting message. The Claude CLI's result reports usage; Codex app-server usage reporting is unverified and must be confirmed. Missing usage is stored as unavailable, never estimated.
- **Suggestion run:** the server starts one suggestion-model call after a tutor reply is saved as completed, outside the tutor's session. Its input is the completed reply, the preceding learner question, the conversation's fixed inherited context, the learner's familiarity data for relevant concepts, and existing concept names of the reply's topics. Its output is a single structured result: suggestions, concepts in the reply, their topics and concept links.
- **Suggestion model selection:** a Settings value chooses the suggestion model; unset means the cheap model of the conversation's provider (Haiku for Claude, Codex Luna for Codex; the exact Codex model ID must be confirmed). Calls use the same subscription adapters as the tutor and never substitute API-key access.
- **Passage anchoring:** each suggestion identifies one contiguous passage of the immutable saved reply by message, exact text and offsets in the canonical raw text, the same indexing manual selection and rendered Markdown use. Mismatched or overlapping candidates are discarded. A suggestion has no proposed question.
- **Persistence:** suggestions, their state (unexplored, explored with child reference, ignored) and usage are stored with their source message, separate from tutor messages. The stashed vm4.11 work adds a per-message suggestions record with a status; reuse it where it fits.
- **Branch creation:** submitting the passage textbox uses the existing branch-creation flow with the passage and the learner's prompt; nothing is created until submission. The suggestion is marked explored only after the child is saved.
- **Knowledge graph data:** global (not per learning tree) records for concepts, topics, concept-topic membership, concept links ("related" or "builds on") and evidence events. Familiarity is derived from evidence; learner corrections are stored as evidence that outranks inference; an ignored underline is weak evidence.
- **Concept matching:** v1 sends the existing concept names of the reply's topics and instructs the model to reuse a matching name. No embedding model in v1.
- **Client rendering:** a pure function maps a reply's canonical text and its saved suggestions to underline ranges (dotted for unexplored, solid for explored), resolving overlap with the learner's own selection in favor of the selection.
- **Knowledge tab:** a separate top-level view from the map and chat layout, reading the global graph through the server API.
- **Isolation:** suggestion instructions, candidates, graph extraction output and diagnostics never enter tutor history or inherited context.

## Testing Decisions

- Good tests exercise external behavior through the highest seam: HTTP requests to the app server and what the learner can observe, not internal function calls or table layouts.
- **Main seam:** the app server created over the fake provider CLIs in the protocol fixture, which already fakes Claude stream-json and Codex app-server. Extend the fixture to report usage and to answer suggestion calls with structured results, including invalid, overlapping and duplicate candidates. Prior art: the artifact and video integration tests.
- Server tests cover: usage saved and returned per message, unavailable usage, suggestion run only after completed saved replies, no rerun on reopen or provider switch, disabled suggestions, failure status, passage validation, branch creation from a suggestion and explored state, tutor-history isolation, concurrency across two conversations, concept matching and reuse, evidence and corrections changing familiarity, and merge.
- **Second seam:** the pure client mapping from reply text and suggestions to underline ranges. Prior art: the client helper tests for artifacts and previews.
- No E2E tests unless the owner asks for them.

## Out of Scope

- Backfilling suggestions for replies saved before this feature.
- A proposed question or prefilled text in the passage textbox.
- A "New branch" option on an explored underline (manual highlighting covers it).
- A visual node-and-link rendering of the knowledge graph (the Knowledge tab is a list).
- Mastery scores or claims about the learner's ability beyond the familiarity estimate.
- A local embedding model for concept matching (deferred follow-up, see Further Notes).
- Using the suggestion model for inherited-context compaction.

## Further Notes

- **Deferred upgrade:** when the Settings warning shows a suggestion call's concept-name list over about 2k tokens, add a local embedding pre-filter that narrows candidates to the nearest 20–50 names before the model matches. The 2k threshold is a starting guess.
- **Naming in code:** the store's `trees` table holds conversations (messages and branches reference it), while the glossary reserves "learning tree" for a whole saved topic. New code should follow the glossary.
- **Stashed partial work:** Ralph's stopped vm4.11 run left server suggestion plumbing, saved as the Git stash `vm4.11-partial`; review it with `git stash show -p stash^{/vm4.11-partial}` before implementation.
- The 1.0 release (TreeTutor-sh8) ships without suggestions; manual highlighting remains the branching path there.
