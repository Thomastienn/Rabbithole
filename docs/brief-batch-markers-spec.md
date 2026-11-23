# Brief batch markers and a structured notes rule

Decided with the project owner on 2026-11-23 (grilling session). Terms follow `GLOSSARY.md` (learner, tutor, reply, suggestion, brief explanation, brief batch, groundwork, next question, quick thinking model, concept neighbourhood). Decision: ADR 0021 (the brief batch streams marker text instead of a tool call). Refines "Ready brief explanations" in the [media markers, ready brief explanations, visual part grouping and a still page spec](media-markers-briefs-and-part-grouping-spec.md) where they conflict.

Model quality was settled by manual benchmarks in the grilling session, approved by the owner: the brief format on Codex Luna (`gpt-6-luna`, effort medium) and the notes rule on Codex Terra (`gpt-6.1-terra`, effort medium). No ticket under this spec calls a real model (`docs/agents/testing.md`, Real models).

## Problem Statement

A brief batch can save nothing. On 2026-11-23 the brief batch for a reply explaining Prolog, six suggestions, ended with Luna writing "I can't write the requested brief because the available instructions don't provide a `write_briefs` tool." Codex hides MCP tools inside its JavaScript `exec` tool under the name `tools.mcp__rabbithole__write_briefs`, while the prompt named `write_briefs` and said not to execute code. Each suggestion the learner opened then waited for its own on-demand brief. It was 1 of 18 Luna batches.

Even when it works, the brief batch saves nothing until the whole call ends, 7 to 15 seconds on Luna, because a tool call reaches the server only when its arguments are complete. A suggestion opened in that window pays for a separate call.

The same Prolog reply showed the learner "A Prolog facts|fact states a relationship". The tutor wrote wiki-style marks such as `[[Prolog facts|fact]]`, joining the concept neighbourhood's name to the reply's word. The notes rule is one long paragraph that ends with the groundwork rule "use its name exactly", where it reads as a rule for every mark. It happened in 1 of 78 Terra replies. Replays showed that splitting the rule into paragraphs alone raises the rate to 3 in 8, and that one sentence limiting a mark to the reply's own words brings it to 0 in 24.

## Solution

The brief batch writes plain text instead of calling a tool: for each term, in the order given, a line `[[brief: term]]` with the term exactly as given, then its paragraph. The server saves each brief explanation as soon as the next marker, or the end of a completed call, closes it, so the first briefs are ready within seconds and no tool needs to be found. A batch that is cut off or skips terms retries once for the missing terms only; whatever is still missing is written on demand when opened, as today.

The tutor's notes rule becomes three labelled paragraphs, one per kind of note. The groundwork naming rule moves into the groundwork paragraph, and the suggestion paragraph says to write only words of the reply inside the brackets. Pipes are not parsed: `[[x|y]]` is not an intended format.

## User Stories

1. As a learner, I want a suggestion's brief explanation ready when I open it, so that I understand the term without waiting.
2. As a learner, I want the first suggestions of a reply to have their briefs within a few seconds of the reply ending, so that I can open them while I keep reading.
3. As a learner, I want briefs ready on Codex models as reliably as on Claude, so that my model choice does not decide whether briefs wait.
4. As a learner, I want a suggestion I open before its brief arrives to get its brief on demand, as today, so that I never see an empty card.
5. As a learner, I want a brief saved by the batch to never replace one I already saw, so that a suggestion keeps the brief it first showed.
6. As a learner, I want a batch that stops part-way to keep every brief it finished, so that finished work is not thrown away.
7. As a learner, I want the briefs a batch missed to be retried once, so that most suggestions still open without a wait.
8. As a learner, I want a suggestion whose brief failed twice to still get one when I open it, so that failures never leave a suggestion without a brief.
9. As a learner, I want brief explanations to stay about two or three short sentences, so that I can read one at a glance.
10. As a learner, I want brief explanations to keep their bold, italics, inline code and inline math, so that key words and formulas read as before.
11. As a learner, I want a reply's text to read naturally, with no "|" fragments such as "Prolog facts|fact", so that marked terms read as ordinary words.
12. As a learner, I want suggestions to underline the words the reply actually uses, so that what I see underlined is what I read.
13. As a learner, I want just as many suggestions in a technical reply as before, so that the restructured rule loses no doors to explore.
14. As a learner, I want groundwork to keep using the names of concepts I have already met, so that groundwork links to what I know.
15. As a learner, I want every reply to keep its end section, next questions and `[[end]]`, so that next questions still appear.
16. As the owner, I want brief batch failures logged with their cause, so that I can see when a model breaks the format.
17. As the owner, I want a retry metered as brief usage like the first call, so that the usage meter stays complete.
18. As the owner, I want the brief batch to record no familiarity, as today, so that only opening a brief counts as evidence.
19. As the owner, I want every other quick thinking job to stay a tool call, so that this change touches only the job that failed.
20. As the owner, I want the tutor prompt for every provider to carry the same structured notes rule, so that every tutor follows one rule.

## Implementation Decisions

- **Brief batch request.** The batch prompt keeps its style and data sentences and its term list, and asks for marker text instead of a tool call. The benchmarked instruction, used word for word: `For each term, in the order given, write one line [[brief: term]] with the term exactly as given, then its paragraph on the following lines. Write nothing else.` The batch is a plain text quick thinking call: no tool spec, so Codex models need no tool discovery. The `write_briefs` quick tool is removed.
- **Reading the stream.** A marker is a whole line `[[brief: term]]`. A brief's paragraph runs from its marker line to the next marker line, trimmed. A brief is saved when the next marker arrives, and the last one only when the call completes. A term that does not match a requested term exactly is ignored. Text before the first marker is ignored. An empty paragraph saves nothing.
- **Saving.** Each brief is saved under every suggestion of the reply whose term matches, as now, and never replaces a saved brief or one being written on demand.
- **Retry.** After the call ends, whether it completed, failed or was cut off, any requested term without a saved brief is asked for once more in a new batch call holding only those terms, read and saved the same way. No second retry. A term still missing is written on demand when opened.
- **Usage and logs.** Each batch call, the retry included, is metered as brief usage. A batch that leaves terms unsaved after its retry is logged with the cause, as "saved nothing ahead" is now.
- **Opening during a batch.** Unchanged: a suggestion with no saved brief starts its on-demand call, sharing a call already running for that passage.
- **Notes rule.** `NOTES_RULE` becomes the benchmarked text below, word for word, keeping its leading blank line in the tutor instructions. Benchmark (the Prolog turn replayed on Terra): current rule 0 of 9 replies with pipe marks, labelled paragraphs alone 3 of 8, labelled paragraphs with the "words only" sentence 0 of 24 at 5.9 marks per reply against 5.4 before; tagged variants scored 1 of 24 and were not chosen.

  ```
  Notes: mark your notes in the reply text with double brackets. The app hides every marker from the learner, so never mention them. There are three kinds of note, each with its own rules below.

  Groundwork notes: when this reply relies without naming on concepts this learner probably needs first, judged from the concept neighbourhood, begin the reply with one line [[groundwork: name; name]] before any other text, with at most three names; usually there are none, so leave the line out. Never name one the reply names or the learner already knows well. When a groundwork concept is the same as one in the concept neighbourhood, even under another wording, use its name exactly.

  Suggestion notes: mark generously. Each mark is a door the learner can open to go deeper, so choose freely and lean toward more. Wrap in double brackets, where you write it, every term or short phrase of one to six words this learner might not understand or might want to explore further: technical or academic terms, jargon, names of methods, algorithms, theorems or results, and uncommon words that are not everyday public knowledge, as in "this is called [[sift down]]". Inside the brackets write only words of the reply, nothing else. Mark a term even when you explain it, including the name of the very method or idea that answers the question. Treat a concept missing from the concept neighbourhood, or of unknown familiarity, as one this learner has heard of once but cannot explain, and explain it at that level. Skip only everyday words, the exact words the learner asked about, section headings, whole sentences and concepts the learner already knows well. Mark each term once and never inside code or math; when a term appears only in math, name it in the prose beside it and mark it there, as in "the [[logarithmic integral]] $\operatorname{Li}(x)$"; a technical reply usually has many, and a casual turn has none.

  End section: end every reply with up to three lines [[next: question]], each a deep, curious how, why or what-if question this reply raises but does not answer, in the learner's voice, then a last line [[end]]. After a casual turn write [[end]] alone. Rarely, as a last resort when the learner hinted at a video or still does not follow, one next question may be [[video offer: question]], worded as the learner asking for a video of the idea, such as "Can you make a video of how the heap reorders itself?"; never in a reply holding a visual, discussion or video.
  ```

- **No pipe parsing.** The marker stripper stays as it is; `[[x|y]]` keeps its words as written.

## Testing Decisions

- Tests check behaviour the learner or the store can see: which briefs are saved, when, and what opening a suggestion returns. They do not check prompt wording or internal call order.
- **Brief batch: one seam, the existing integration test of briefs** (`createApp` with a temp store and a fake quick thinking provider). The fake streams `[[brief: term]]` text. Cases:
  - the first brief is saved while the fake's stream is still open;
  - a stream that fails part-way keeps the closed briefs, then a retry asks for only the missing terms and saves them;
  - a completed stream that skips a term triggers the same retry;
  - a term still missing after the retry is written on demand when its suggestion is opened, and the batch never replaces a brief saved on demand;
  - every batch call, the retry included, is metered as brief usage.
  No separate unit test for the stream reader: this seam covers it.
- **Notes rule: no new seam.** The existing tutor style test that loads `NOTES_RULE` keeps passing. Its wording was settled by the benchmark, not by a test.
- Prior art: the batch tests already in the brief integration test ("every suggestion gets its brief ahead of time; an early open is written on demand and kept").

## Out of Scope

- The other quick thinking tool jobs (marking suggestions, recording verdicts, naming conversations) stay tool calls and get no Codex naming or retry change: Luna found their tools in 67 of 67 calls.
- Parsing or cleaning `[[x|y]]` marks, and repairing the one stored reply that shows them.
- Backfilling briefs for old replies.
- On-demand briefs, briefs for selected passages and visual parts.
- Switching off Codex's tool deferral through Codex feature flags.

## Further Notes

- Benchmarks ran through `codex exec` without the app's MCP server, using the 18 real brief batch prompts from Luna's Codex logs (37 runs, all valid, 19 to 43 words per brief) and the real Prolog turn's tutor instructions on Terra. Time to the first brief was not measured, because `codex exec` reports no text deltas.
- Claude and other tutor models were not replayed against the new notes rule.
