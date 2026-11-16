# Code colours, everyday analogies, paced discussions, cut patches and set piece parts

Vocabulary follows `GLOSSARY.md` (tutor, learner, classmate, discussion, everyday analogy, skill, tutor style, visual, video, cut, cut audit, set piece, part, piece library, smart model, chat model, familiarity). Set piece parts are recorded in ADR 0006, building on ADR 0002 (audited cuts and shared set pieces), ADR 0004 (the chat model writes media, the smart model reviews) and ADR 0005 (house style and the piece library).

## Problem Statement

Code in tutor replies shows as plain text in some languages: a Java example about semaphores came back with no colours at all, while Python was coloured. Code the learner pastes into their own message shows raw, fence markers and all.

Explanations of abstract ideas start abstract. When the learner asked whether a semaphore was "like traffic police letting a few cars through", everything after it, including the video, became much easier to follow; the tutor, visuals and videos rarely start from an everyday situation on their own.

Discussions do not feel like a group chat. The opening lines all land at once, like a wall of text, and later lines spill out token by token, so nobody seems to be taking turns. Every classmate also sounds the same: polished, eager and full of buzzwords, like an actor reading a script rather than people chatting online.

Fixing a cut is wasteful. When a cut audit flags two crowded labels, the chat model writes the whole cut again to move them, paying for thousands of output tokens to change a few lines; repairs of broken cuts and improvements of poor library pieces do the same.

Every set piece is drawn whole. A city draws each person, car and house itself, a stadium draws its people again, and a person improved in one piece stays poor everywhere else. Crowds of hundreds of 3D objects are impractical, and the piece library saves only the 2D form of each piece although 3D cuts draw a 3D form too.

## Solution

Code in tutor replies and in the learner's own messages is coloured in every common language, using the app theme's syntax colours. Learner messages render as markdown, like replies. Code with no language label stays plain.

Replies, visuals and videos open with an everyday analogy when a concept is new or abstract to the learner, map the formal idea onto it, and say plainly where the analogy breaks down. They skip it for quick factual answers and when it would not help. A video's planner decides how its analogy shapes the video and carries one analogy through its cuts. Nothing forces classmates or the learner to think in analogies.

Discussion lines arrive one at a time. A "Maya is typing…" indicator shows who speaks next, then the whole line appears, at the pace of someone typing it. The learner can type while lines arrive and sends once every written line has appeared. Leaving and coming back resumes the pace; closing the discussion by asking in the conversation shows whatever is left at once; reopening shows seen lines at once.

Each classmate talks and thinks in their own way, fitting their level: casual, everyday words and slang, the odd swear word or typo, short lines, rarely an emoji, never buzzwords. Voices differ within a discussion and follow the learner's language. The tutor stays plain and clear.

Fixing, repairing and improving return a patch of only what changes. If a patch does not apply, the app asks for the whole source as it does today. The cut audit itself is unchanged.

A set piece may be built from parts. The piece writer chooses parts while drawing, reusing library pieces where they fit and drawing anything else itself. Parts are saved as library pieces of their own, both forms are saved together, and improving a part improves every piece that uses it in future videos. Many copies of a part are placed with one helper, varied through their props, and drawn with instancing in 3D so crowds play smoothly.

## User Stories

1. As a learner, I want Java code in a tutor reply coloured, so that I can read its structure at a glance.
2. As a learner, I want code in every common language coloured, so that colouring does not depend on which language the tutor picked.
3. As a learner, I want code colours to follow the current theme in light and dark appearance, so that code fits the rest of the page.
4. As a learner, I want keywords, strings, comments, numbers, function names, types and other parts of code coloured by the theme's syntax colours, so that each language looks consistent with the others.
5. As a learner, I want code with no language label shown plain, so that the app never guesses a wrong language and colours it misleadingly.
6. As a learner, I want code the tutor marks as plain text shown plain, so that output and logs are not coloured as code.
7. As a learner, I want long code blocks to colour without slowing the reply, so that reading stays smooth while a reply streams.
8. As a learner, I want the copy button on a code block to keep copying the exact code, so that colouring never changes what I paste.
9. As a learner, I want to branch from a passage inside coloured code as I could before, so that colouring does not break branches.
10. As a learner, I want my own messages rendered as markdown, so that code, lists and emphasis I type look as I meant them.
11. As a learner, I want code I paste into my message coloured like the tutor's, so that I can check what I sent.
12. As a learner, I want my message's raw text kept as I typed it, so that copying or editing it gives back exactly what I wrote.
13. As a learner, I want a reply about a new, abstract concept to open with an everyday situation I already know, so that I have something concrete to hang the idea on.
14. As a learner, I want the formal idea mapped onto the analogy step by step, so that I see which part of the analogy stands for which part of the concept.
15. As a learner, I want the tutor to say where the analogy breaks down, so that I do not carry a wrong picture forward.
16. As a learner, I want no analogy forced onto a quick factual answer, so that simple answers stay short.
17. As a learner, I want no analogy when I already know a concept well, so that the tutor does not talk down to me.
18. As a learner, I want the tutor to judge whether a concept is new to me from my familiarity where the app already knows it, so that analogies show up when they help me.
19. As a learner, I want an analogy I suggest myself taken seriously, refined or corrected where it is off, so that my own thinking is respected.
20. As a learner, I want a visual to show the analogy when it helps, so that I can see the everyday situation next to the concept.
21. As a learner, I want a video to use an everyday analogy when the concept is new, so that the video starts from something I recognise.
22. As a learner, I want a video's planner to decide how the analogy shapes the video, so that each video uses the analogy where it teaches best.
23. As a learner, I want a video to keep one analogy across its cuts, so that I do not have to juggle several pictures at once.
24. As a learner, I want my edited tutor style to still apply on top of the analogy guidance, so that I stay in control of how the tutor explains.
25. As a learner, I want discussion lines to appear one at a time, so that the discussion feels like people taking turns.
26. As a learner, I want a typing indicator naming who speaks next, so that I know someone is about to talk.
27. As a learner, I want each line to appear whole after its typing pause, so that it reads like a chat message, not a stream of tokens.
28. As a learner, I want short lines to come quickly and long lines to take longer, so that the pace feels natural.
29. As a learner, I want a little variation in the pauses, so that the pace does not feel mechanical.
30. As a learner, I want the tutor's lines in a discussion paced like the classmates', so that the whole chat keeps one rhythm.
31. As a learner, I want the opening lines of a new discussion paced, so that it does not start as a wall of text.
32. As a learner, I want the lines that answer my reply paced too, so that the rhythm holds through the whole discussion.
33. As a learner, I want to type my reply while lines are still arriving, so that I can write my thought down as it comes.
34. As a learner, I want sending to wait until every written line has appeared, so that my reply follows the lines I have seen.
35. As a learner, I want a clear sign that sending will be possible once the lines finish, so that I am not confused by a send that does nothing.
36. As a learner, I want the pace to resume where it was when I come back to a discussion I left mid-way, so that I do not miss lines.
37. As a learner, I want lines I have already seen shown at once when I reopen a discussion, so that rereading is instant.
38. As a learner, I want any lines still waiting shown at once when the discussion closes, so that the closed discussion stays complete and readable.
39. As a learner, I want the tutor's reply to end with the discussion, so that text after it never gives away where the discussion goes before its lines appear.
40. As a learner, I want each classmate to sound like a different person, so that I can tell them apart without reading their names.
41. As a learner, I want classmates to talk in everyday words and slang, like people in a casual online chat, so that the discussion feels real.
42. As a learner, I want classmates to avoid buzzwords and performed eagerness, so that they never sound like an actor or an advert.
43. As a learner, I want classmates to keep lines short, so that the discussion moves like a chat.
44. As a learner, I want the odd swear word or typo allowed, so that classmates sound like real people.
45. As a learner, I want emoji kept rare, so that classmates do not look cringe.
46. As a learner, I want each classmate to think in their own way, fitting their level, so that the discussion shows different routes to the idea.
47. As a learner, I want each classmate's voice to stay the same for the whole discussion, so that they stay recognisable when I reply.
48. As a learner, I want classmates to talk in my language, including its casual speech, so that a discussion in my language feels as natural as one in English.
49. As a learner, I want the tutor in a discussion to stay plain and clear, so that someone reliable untangles the idea.
50. As a learner, I want classmates' voices and levels kept hidden, so that I see people, not labels.
51. As a learner, I want classmates' honest misunderstandings kept, so that the casual voice does not replace the teaching.
52. As a learner, I want a flagged cut fixed by changing only what the audit flagged, so that the rest of the cut stays as it was.
53. As a learner, I want cut fixes to cost fewer tokens, so that making videos stays affordable.
54. As a learner, I want a broken cut repaired by patching it, so that repairs are faster and cheaper.
55. As a learner, I want a poor library piece improved by patching it, so that improvements cost less.
56. As a learner, I want a fix whose patch does not apply to fall back to rewriting the whole cut, so that a bad patch never leaves a cut broken.
57. As a learner, I want a patched cut checked and rendered like any fixed cut, so that a patch that breaks a cut is discarded as today.
58. As a learner, I want the cut audit to stay as it is, so that review quality and the smart model's cost do not change.
59. As a learner, I want a city in a video built from people, cars and houses drawn once, so that the video costs fewer tokens.
60. As a learner, I want a crowd of hundreds of people to play smoothly in a 3D cut, so that large scenes do not stutter.
61. As a learner, I want copies of a part to vary in position, size, colour and state, so that a crowd does not look like one figure stamped out.
62. As a learner, I want a new video to reuse a saved part, such as a person from an earlier video, so that common objects look the same across my videos.
63. As a learner, I want a piece with no fitting part to draw everything itself, so that parts are never forced where none fits.
64. As a learner, I want pieces to prefer a flat build, using a part only when it is reused or already saved, so that pieces stay simple.
65. As a learner, I want parts saved in the piece library as pieces of their own, so that they can be reused and browsed.
66. As a learner, I want every saved piece to keep both its 2D and 3D forms, so that 2D and 3D videos reuse pieces in the same way.
67. As a learner, I want one reuse choice to cover a piece's 2D and 3D forms together, so that the two forms never drift apart.
68. As a learner, I want a part improved by a cut audit to improve every piece that uses it in future videos, so that one fix spreads.
69. As a learner, I want saved videos to keep how they looked when a part is later improved, so that my library videos never change under me.
70. As a learner, I want a video's own set piece to win over a library part with the same name, so that every person in one video looks alike.
71. As a learner, I want a piece built from parts to keep the video's palette roles, so that its parts match the rest of the video.
72. As a learner, I want visuals in replies to stay as they are, so that this change touches only videos.

## Implementation Decisions

### Code colours

- The markdown renderer swaps Astryx's tokenizer, which knows about twenty languages and returns nothing for Java, C#, Ruby, Scala and Dart, for Prism (`prismjs`, already present in the dependency tree through Remotion Studio), added as a direct dependency.
- Prism tokens map onto the theme's existing syntax colour roles (keyword, string, comment, number, function, type, constant, variable, property, attribute, tag, operator, punctuation and the others the themes define). A token with no matching role stays plain. No theme gains new colours, and token styling keeps the existing token classes so every theme works unchanged.
- Prism is used only for tokenizing; the renderer keeps building React elements, so no model-written code reaches the page as HTML, and Prism's in-page autoloader is never used.
- Grammars load only for languages that replies and messages use. Unlabelled fences and the `text` and `plaintext` labels stay plain; there is no language guessing.
- Learner messages render through the same markdown renderer as tutor replies, including maths and code colours, but without reply-only features such as suggestions, inline media and passage branching. The stored message text is unchanged.

### Everyday analogy

- The guidance is a skill: fixed, hidden and shared by every learner, added to the teaching skill that tutor replies, visuals and video narration already receive. The learner's tutor style still applies on top of it.
- It covers: open with a familiar real-life situation when a concept is new or abstract to the learner; map the formal idea onto it; say where it breaks down; skip it for quick factual answers, casual turns and concepts the learner already knows.
- "New to the learner" is judged from familiarity where a prompt already receives it, and from the conversation otherwise. No new familiarity plumbing is added for this.
- The video planner decides how an analogy shapes a video (for example, opening on it or returning to it) and keeps one analogy across a video's cuts.
- The guidance asks the tutor to take a learner's own analogy seriously, refining or correcting it, but nothing requires later replies or videos to reuse it, and discussion prompts do not push classmates toward analogies.

### Paced discussions

- Generation is unchanged: the opening lines still come in the tutor's reply block, and reply turns still come from one model call per turn. Pacing is purely a presentation of lines that already exist.
- The discussion card holds unseen lines in a queue and reveals them one at a time. Before each line it shows "<speaker> is typing…" for a pause that grows with the line's length, roughly one to four seconds, with a small random jitter. Classmates and the tutor share one speed. A line appears whole, never token by token. A line still being written waits in the indicator until it is complete.
- There is no skip control. The reply box stays usable while lines arrive; sending is disabled until every written line has appeared, with a short hint saying so.
- Which lines the learner has seen is remembered per discussion, so reopening shows seen lines at once and leaving mid-way resumes the pace on return. When the discussion closes because the learner asked in the conversation, every remaining line appears at once.
- The discussion rule asks the tutor to place the discussion last in its reply, so no reply text follows it while lines are still arriving.

### Classmate voices

- Each classmate in the discussion block gains a private voice alongside their hidden level: a short description of how they talk and how they think. The server stores it with the level, never sends either to the browser, and passes both to every reply turn so the voice stays the same for the whole discussion.
- Validation requires a voice for every classmate and distinct voices within a discussion; older discussions without voices keep working.
- The discussion rule and the reply-turn rule describe the voice range: casual online chat, everyday words and slang, contractions, the odd swear word or typo, short lines, rarely an emoji, no buzzwords or performed eagerness, distinct from each other and fitting each classmate's level. Classmates use the learner's language. The tutor's lines stay plain and clear, and honest misunderstandings stay.
- The natural-writing skill applies to classmate lines, but it must not flatten the casual voices into the tutor's register.

### Cut patches

- The cut audit and its output are unchanged.
- The fix after an audit, the repair of a cut that failed to validate or render, and the smart model's improvement of a poor library piece return a unified diff against the source they were given, instead of the whole source. First-time writing of cuts and set pieces stays a full write.
- The app applies the diff with the `diff` package (jsdiff), added as a direct dependency. If the diff does not parse or does not apply, the app makes one follow-up call asking for the whole source, exactly as today; there is no patch retry.
- A patched cut goes through the same validation and rendering as any fixed cut, and a patch that breaks a cut is discarded as today. The existing attempt limits still apply, with the whole-source fallback counted within them.
- The source given to the fixer carries line structure the model can diff against; implementers choose the exact presentation.

### Set piece parts

- The piece writer prompt tells the chat model that a set piece may be built from parts: other set pieces in the same module or saved library pieces. It prefers a flat build and uses a part only when the part is reused at least twice or already exists in the library; anything with no fitting part is drawn by the piece itself. There is no fixed nesting limit.
- The planner is unchanged: it names the video's set pieces, and the piece writer decides their parts. The library lookup that today runs for each named set piece also runs for candidate parts, with the same reuse, variant or new choice.
- The video kit gains one helper that places many copies of a part. Copies vary only through the part's props (position, scale, palette role and state), seeded so frames stay stable. In 3D it draws copies with three.js instancing per mesh of the part, using the installed three.js only.
- The piece library saves parts as library pieces of their own. A piece that uses parts records which library pieces it uses instead of copying them, and assembling a reused piece brings its parts along, scoped and with roles remapped as reused pieces are today.
- One reuse choice covers a piece's 2D and 3D forms together, and the library saves both forms. This fixes today's behaviour of saving only 2D forms and always redrawing 3D forms.
- When a cut audit flags a poor part, the existing piece improvement improves the part's library entry; every piece that uses it picks up the improvement in future videos. The current video keeps its pieces, and saved videos keep how they looked.
- Within one video, the video's own set piece wins over a library part of the same name, so a reused library city uses the video's own person.
- The piece library view is unchanged; a piece's code already shows which parts it uses.

## Testing Decisions

- Tests check external behaviour: what the learner sees rendered, what a prompt tells the model, what the pipeline does with a model's answer and what the store returns. They never assert on internal helpers or exact prompt wording beyond the rule a ticket introduces. Model calls are faked; no test calls a real provider.
- **Markdown rendering** is tested through the markdown renderer, as the existing markdown tests do: a Java, C# and Python fence produce coloured tokens with theme token classes; an unlabelled or `text` fence stays plain; copy text and passage offsets are unchanged; learner messages render markdown without reply-only features.
- **Skills and prompts** are tested at prompt assembly, as the existing skill-source, tutor-style and visual-prompt tests do: tutor replies, visuals and video narration receive the analogy guidance, the learner's tutor style still follows it, and the discussion rule asks for voices and for the discussion to come last.
- **Discussion pacing** is tested in the discussion card component with fake timers, as the existing discussion card tests do: lines reveal one at a time with a typing indicator, pauses grow with length, send waits for every line, seen lines show at once on reopen, and a closed discussion shows every line.
- **Classmate voices** are tested through discussion block validation and the discussion HTTP routes, as the existing discussion and discussion-reply tests do: voices are required and distinct, never reach the browser, older discussions still load, and reply turns receive each classmate's voice and level.
- **Cut patches** are tested through the cut pipeline with a fake chat model, as the existing video audit, repair and piece-improvement tests do: a valid diff patches the cut, an unparseable or non-applying diff falls back to one whole-source call, a patch that breaks a cut is discarded, and attempt limits hold.
- **Set piece parts** are tested through the piece pipeline and the piece store, as the existing video-pieces, piece-library and video-piece-library tests do: parts are saved as their own entries with both forms, a reused piece brings its parts, an improved part reaches later assemblies but not saved videos, a video's own piece wins a name clash, and the copy helper renders the requested number of varied copies in 2D and 3D in the video kit test support.

## Out of Scope

- Any change to the cut audit's input, output or model.
- Provider-native edit tools (Claude Code's `Edit`, Codex's `apply_patch`) and app-supplied edit tools for the fixer.
- Language guessing for unlabelled code fences, and code colouring inside discussion lines, visuals and cuts.
- A skip or speed control for discussion pacing, and per-classmate typing speeds.
- Saved or recurring classmate personas across discussions.
- Forcing analogies onto classmates or reusing the learner's own analogy in later replies and videos.
- Set piece parts in visuals, and planner-chosen parts.
- "Made from" or "used in" listings in the piece library view.
- New theme colours for syntax roles.

## Further Notes

- The 2D-only saving of library pieces contradicts ADR 0005 and the glossary; fixing it here brings the code back in line with both.
- Release order follows the existing roadmap: Claude by default plus Codex. Custom endpoints get the same behaviour, since nothing here depends on a provider's own tools.
- The everyday-analogy guidance changes every learner's replies; its wording should be checked against a few real conversations, such as the semaphore one, before closing.
