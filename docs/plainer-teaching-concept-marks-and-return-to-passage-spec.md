# Plainer teaching, more visuals, concept marks, honest ghost trees and back to the passage

Decided with the project owner on 2026-11-25 (grilling session). Terms follow `GLOSSARY.md` (learner, tutor, tutor style, skill, suggestion, brief explanation, brief batch, quick thinking model, concept, explored concept, ghost tree, familiarity, everyday analogy, visual, visual frequency, passage, branch, free branch, focused chat). Respects ADR 0016 (the tutor marks its notes inline) and ADR 0022 (concepts merge automatically); ADR 0023 records the concept mark.

## Problem Statement

The learner finds that Claude explains worse than Codex. Claude tends to open with the formal definition and stack notation before the idea has landed, while Codex opens with the intuition. The harness never says which comes first, so each provider follows its own habit. The owner wants the harness fixed once for every provider, not tuned per model.

Brief explanations often read like a summary of the reply rather than an explanation of the term. Their length and wording vary, they lean on other jargon, and a newcomer may need two reads.

Long replies that cover several concepts often carry no visual or only one, and the learner, who wants visuals, has no way to ask for more by default.

Some suggestions show text like `safe state|safe` in the reply. The tutor wrote a wiki-style alias to name the concept a short word stands for, and the server shows the whole inside of the mark.

Ghost trees join learning trees that have nothing in common. Two trees started from lecture PDFs, one on deadlocks and one on parsing, both got the explored concept "Lecture learning", because the title job sees only the typed question ("help me learn this lecture") and not the attached file. Another tree got a concept named "none".

Concepts never merge. Every merge confirmation is rejected by the usage table, which does not accept a merge task, so ADR 0022's automatic merges and its one-time cleanup have merged nothing.

Going back from a branch to its parent lands at the bottom of the parent conversation, not where the learner branched, so they have to scroll and find the phrase again.

## Solution

The teaching skill tells every tutor, on every provider, to pitch each explanation to how well this learner knows the idea: intuition first when the idea is new, built in a way that varies with the idea, formal terms once it has landed, and the precise version at once for a learner who already knows the ground.

Brief explanations are always two or three short sentences of plain everyday words, pitched at the learner's familiarity with the concept, with no jargon left unexplained.

A new Visual frequency setting offers Sparing, Often and Only when asked. Often is the default and encourages one visual for each distinct concept a picture helps, without forcing any.

`[[concept|shown]]` becomes an official suggestion mark. The reply shows only the shown words; the concept is stored as the suggestion's concept.

The title job reads the attached file's text when naming a root conversation's explored concept, never names an activity such as "lecture learning", and treats "none" as no concept. A one-off cleanup fixes the trees already named badly.

Merges are recorded in the usage table, so automatic merges and the one-time cleanup run.

The back button, the origin chip and the ancestor breadcrumbs scroll the parent to the passage the learner branched from and light it up.

## User Stories

1. As a learner new to an idea, I want the tutor to give me the intuition before the textbook definition, so that I understand it on the first read.
2. As a learner, I want the intuition built in different ways for different ideas, such as a tiny example, the problem the idea solves, a contrast or a quick picture, so that replies don't all sound the same.
3. As a learner, I want everyday analogies only now and then, so that they stay helpful rather than a habit.
4. As a learner, I want formal terms and symbols introduced only once the idea has landed, each in plain words the first time, so that notation never blocks me.
5. As a learner who already knows the ground, I want the precise version straight away, so that I'm not slowed down by basics.
6. As a learner, I want Claude and Codex to teach the same way, so that switching provider doesn't change the quality of explanations.
7. As a learner, I want my own tutor style to still apply on top of the teaching skill, so that my edits keep working.
8. As a learner, I want every brief explanation in plain everyday words, so that I understand a term without branching.
9. As a learner, I want every brief explanation two or three short sentences long, so that briefs are consistent and quick to read.
10. As a learner, I want a brief explanation to explain the term itself, what it is or why it holds here, not summarise the reply, so that it answers what I pointed at.
11. As a learner, I want a brief explanation pitched to how well I know the concept, so that it is neither patronising nor over my head.
12. As a learner, I want no unexplained jargon in a brief explanation, so that one brief never needs another.
13. As a learner, I want briefs opened together in a brief batch to follow the same rules, so that every brief reads alike.
14. As a learner, I want detail left to branches, so that briefs stay short.
15. As a learner, I want long replies that cover several concepts to carry more visuals by default, so that I can see each idea.
16. As a learner, I want the tutor encouraged, not forced, to draw visuals, so that short or simple replies aren't buried in pictures.
17. As a learner, I want to choose Sparing, Often or Only when asked in Settings, so that I control how many visuals I get.
18. As a learner who chose Only when asked, I want visuals only when I ask for one, so that replies stay text.
19. As a learner, I want an explicit request for a visual honoured at every level, so that the setting never blocks me.
20. As a learner, I want the setting to take effect from my next reply, so that I see the change at once.
21. As a learner, I want the setting kept across restarts, so that I choose it once.
22. As a learner, I want the setting not to change videos, so that it does only what it says.
23. As a learner, I want suggestions never to show a bar or the alias text, so that replies read cleanly.
24. As a learner, I want a short suggestion like "fact" in a Prolog reply to stand for the concept Prolog fact, so that branching from it explores the right idea.
25. As a learner, I want the right concept stored for each suggestion, so that my familiarity and ghost trees are accurate.
26. As a learner, I want suggestions inside tables to work the same, so that table cells never show stray characters.
27. As a learner, I want plain suggestions without an alias to keep working, so that nothing I already have changes.
28. As a learner who starts a tree from a lecture PDF, I want its explored concept named after the lecture's subject, so that it links only to trees on the same subject.
29. As a learner, I want no explored concept that names the activity, such as "lecture learning" or "explaining a file", so that unrelated trees never join.
30. As a learner, I want a conversation with no clear subject to have no explored concept rather than one called "none", so that it joins no ghost tree.
31. As a learner, I want my existing deadlocks and parsing trees, and the tree named "none", fixed, so that their wrong ghost trees disappear.
32. As a learner, I want trees on truly the same subject, such as two Mars trees, still to link, so that the fix doesn't break real ghost trees.
33. As a learner, I want duplicate concepts merged automatically, as ADR 0022 promised, so that my knowledge graph stays clean.
34. As a learner, I want merges shown in Usage history, so that I can see what they cost.
35. As a learner, I want the duplicates already saved merged once the merge works, so that the graph is cleaned without me.
36. As a learner in a branch, I want the back button to take me to the passage I branched from, so that I continue reading where I left off.
37. As a learner, I want the origin chip to do the same, so that every way back behaves alike.
38. As a learner, I want each ancestor breadcrumb to land on the passage that leads toward where I am, so that I can jump several levels and still see where I branched.
39. As a learner, I want the passage lit up briefly when I land, so that I spot it at once.
40. As a learner, I want the landing to hold even while the parent loads and lays out, so that the view never jumps to the bottom afterwards.
41. As a learner going back from a free branch, I want to land on the parent reply that was latest when I branched, so that I return to that point.
42. As a learner, I want Contents and the map to keep opening conversations as they do today, so that only the way back changes.
43. As a learner using a keyboard or screen reader, I want focus moved to the passage I landed on, so that I know where I am.
44. As a learner who prefers reduced motion, I want the light-up shown without animation, so that it is still visible.

## Implementation Decisions

### Teaching skill

- The teaching skill's line about what to aim for ("what the idea is and why it exists, how it works … and what it connects to") is replaced by this guidance, word for word:

  > Pitch each explanation to how well this learner knows the idea, judged from the concept neighbourhood and their own messages. When it is new to them, build intuition before the textbook version. Vary how you build it to suit the idea: a tiny example, the problem it solves, a contrast with something familiar, a quick picture, or just plain words. Don't open the same way every time, and use an everyday analogy only now and then. Bring in formal terms and symbols once the idea has landed, each in plain words the first time. When they already know the ground, go straight to the precise version.

- The skill stays a principle, not a recipe of fixed steps; the owner rejected a step-by-step order as same-y.
- It is the same for every provider: the skill is part of the fixed tutor instructions every chat model receives. No provider-specific wording anywhere.
- The default tutor style is unchanged. The tutor style still layers on top.
- No outside skill is added; i-have-adhd was considered and dropped.

### Brief explanations

- The single brief prompt and the brief batch prompt share one style rule: two or three short sentences, every time; plain everyday words a newcomer understands on one read; explain the term in this reply's context, what it is or why it holds, never a summary of the reply; no jargon the brief does not explain; detail is for branches. The current wording that calls the length "a target, not a hard limit" goes.
- The brief call is told the learner's familiarity with the suggestion's concept when one is known, and pitches the wording to it. Unknown familiarity means write for a newcomer.
- Briefs stay on the quick thinking model. The brief batch marker format and parsing are unchanged.

### Visual frequency

- A new app-wide setting with three values, stored like video mode in a single-row table: `sparing`, `often` (default) and `only-asked`. A settings route reads and writes it.
- Settings shows it as three buttons next to Video mode (see the visual controls spec for the buttons rule).
- The tutor's visual marker rule gains one sentence chosen by the setting:
  - Often: in a longer reply that covers several distinct concepts, draw a visual for each concept a picture helps; never add one where it doesn't help.
  - Sparing: today's guidance, a visual where it clearly helps.
  - Only when asked: no visual unless the learner asked for one.
- At every level an explicit learner request for a visual is honoured. Videos and the video offer are untouched.
- The tutor instructions are rebuilt with the current value, so a change applies from the next reply, the same way a tutor style edit does.

### Concept marks

- A kind-less double-bracket mark may be `[[concept|shown]]`. The parser splits on the first `|` or `\|`. The left side, trimmed, is the concept; the right side, trimmed, is the shown text that appears in the reply and gets the underline. With either side empty, the mark is a plain suggestion of the non-empty side.
- Stripping while streaming and when saving removes the concept and the bar, so offsets, passages and underlines are computed on the shown text only.
- A mark's concept is stored as that suggestion's concept. The quick thinking notes call names concepts only for marks without one; it still writes the reply's concepts, links and verdict.
- The notes rule in the tutor prompt describes the form: plain `[[words]]` normally; `[[concept|shown words]]` when the shown words stand for a longer or more specific concept. In a table, the bar may be written `\|`.
- The fallback path, where quick thinking marks a reply that ended without an end section, uses the same parser, so an alias there is handled the same way.
- Groundwork, next questions and the other kinded markers are unchanged.

### Ghost trees

- The title job receives the text of the first message's attachments, up to the first few thousand characters across them, from the text already extracted when the message was sent. Images without extracted text contribute nothing.
- The naming prompt says the explored concept is a subject of study, never the activity of studying, with "lecture learning", "homework help" and "explaining a file" as examples to avoid.
- A reply of "none", or an empty name, means the conversation has no explored concept. No concept named "none" is ever created.
- Reuse of the nearest existing concept is kept, so trees on truly the same subject still link.
- A one-off cleanup, recorded in the cleanups table like earlier one-time cleanups, re-names the explored concept of each root conversation whose explored concept is "Lecture learning" or "none", using the new naming with its first question and attachment text. The two concepts are deleted once no conversation or evidence uses them. Today that is the deadlocks and parsing lecture trees and the Prolog tree.

### Merge recording

- A schema migration rebuilds the usage table so its task check also accepts `merge`, keeping every existing row, the same way earlier migrations rebuilt that table.
- With merges recorded, ADR 0022's automatic merge runs after each reply's suggestions. Its one-time cleanup was never recorded as finished, so it runs at the next startup without further changes.
- Usage history already labels the task "Concept merges".

### Back to the passage

- The back button, the origin chip and each ancestor breadcrumb open the parent conversation with a target: the passage of the child on the path from that ancestor to the current conversation.
- The parent scrolls the passage into view and lights it up the same way a reveal does today, then moves focus to it.
- The target uses the existing hold that keeps message and figure targets in place for several frames, so the chat's scroll-to-bottom cannot win while the parent loads and lays out.
- A free branch has no passage. Its target is the parent reply that was latest when the branch was created.
- A target whose passage no longer exists, such as after the reply was replaced, falls back to the reply it belonged to, then to today's behaviour.
- Contents and the map open conversations as they do today.
- With reduced motion, the light-up shows without fading.

## Testing Decisions

- Tests check what the learner or the stored data sees, not how a prompt is phrased. Prompt wording is not tested word for word; tests check that the teaching guidance reaches the tutor instructions for each provider the same way and that the visual frequency sentence changes with the setting.
- Parser tests for concept marks, next to the existing reply marker and inline notes tests: `[[a|b]]` shows `b` with concept `a`; `[[a\|b]]` the same; `[[a]]` shows `a` with no concept; empty sides; a mark inside a table row; streamed text never shows the bar or the concept, even when a chunk ends mid-mark.
- Suggestion notes tests: a mark's concept is stored as the suggestion's concept, and the quick thinking call is asked to name only the marks without one.
- Brief tests, next to the existing brief tests: the familiarity of the concept is passed to the brief call when known.
- Visual frequency: a store test for the default and round-trip, a route test, and a settings component test that shows three buttons and saves the choice.
- Title job tests, next to the existing title tests: attachment text reaches the naming call; "none" leaves no explored concept and creates no concept.
- Cleanup test on a fixture database with a "Lecture learning" and a "none" explored concept: both are renamed, the bad concepts are gone and the cleanup runs once.
- Migration test, next to the existing upgrade tests: an old usage table keeps its rows and then accepts a merge row; the existing merge tests then pass through the metered path.
- Navigation component tests, next to the existing chat header, origin strip and navigation tests: back, origin chip and breadcrumb each target the right passage; a free branch targets its latest parent reply; a missing passage falls back to its reply.
- Prompt behaviour is not measured in these tickets. Measuring, when wanted, happens in a planning session.

## Out of Scope

- Lowering the suggestion call's token use. The large number the learner saw was most likely the input count; no change.
- A per-provider prompt, or any tuning aimed at one model.
- An evaluation script or measured comparison of the teaching change.
- Changing how Contents or the map open conversations.
- Visual frequency for videos.

## Further Notes

- The `|` measurement (131 tutor runs on Codex and Claude) is recorded in ADR 0023.
- The Step glossary entry now describes Play; Play and the visual controls are in the visual controls spec.
