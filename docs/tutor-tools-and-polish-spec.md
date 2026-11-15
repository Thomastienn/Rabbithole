# Tutor tools, reply layouts and polish

Spec from the 2026-11-14 grilling session. Terms follow `GLOSSARY.md`; new terms from this session are **reads images**, **tutor tool**, **resource**, **reply layout**, **memory note**, and a revised **familiarity**.

## Problem Statement

The tutor answers from memory alone. It cannot search the web, read a page, show a real image, calculate with a library, or remember anything about the learner between learning trees. When it states a fact, the learner has no way to check where it came from. Every reply is one top-to-bottom column, even when a comparison or a gallery would explain better.

Several smaller problems wear down daily use:

- A visual that is still being drawn looks the same as a finished one, so the learner cannot tell whether to wait.
- Switching the model profile leaves the open conversation on its old model, so the switch seems to do nothing.
- In focus mode, the Show top bar button covers page content.
- Hovering over a conversation node pops up a long block of reply text the learner did not ask for.
- Models often write equations as plain text instead of math, so formulas are hard to read.
- One custom endpoint, such as a router with 199 models, has one "Accepts images" flag for all of them. Models that read images still get OCR text, and models that can't read images may get pictures.
- Familiarity rises every time a concept appears in a reply, even if the learner never read it, so it overstates what the learner knows.
- The default tutor style does not reflect good teaching practice. A teaching style that asks questions before answering frustrates a learner who wants the answer.

## Solution

The chat model gets **tutor tools**. A provider's own tool is used where it has one, and the app supplies the rest:

- web search and page reading
- image finding
- offline Python for calculation
- a **memory note** it can update

Every page, image or document the tutor draws on becomes a **resource** of the learning tree. Replies cite resources with chips, and the learning tree's contents panel lists them, so the learner can go straight to the original.

The tutor can arrange a reply section in a **reply layout**: plain flow, figure beside text, image gallery, side-by-side comparison or step cards. Every passage stays branchable.

Smaller fixes:

- Visuals show a clear drawing, interactive or failed state, with a count per reply.
- Switching the model profile updates the open conversation.
- The focus mode button hides until the pointer reaches the top edge.
- Conversation nodes stop popping up hover text.
- A fixed rule makes models write math as math.
- Each custom endpoint model gets its own **reads images** and **uses tutor tools** settings, filled in from what the endpoint reports.
- Familiarity counts merely meeting a concept for little.
- The default tutor style becomes answer-first, using the teaching practice from the `/teach` skill.

## User Stories

### Tutor tools

1. As a learner, I want the tutor to search the web when it states specific facts, figures, dates or recent events, so that its answers are current and checkable.
2. As a learner, I want the tutor to explain stable concepts without searching, so that simple questions stay fast and cheap.
3. As a learner, I want the tutor to read a web page it found, so that it answers from the source rather than from a search snippet.
4. As a learner, I want the tutor to find real images of what it explains, so that I see the actual thing rather than only a synthetic drawing.
5. As a learner, I want the tutor to run Python with numpy, scipy, sympy and pandas, so that its calculations are exact instead of guessed.
6. As a learner, I want the tutor to download a data file through page reading and analyse it in Python, so that it can work with real data.
7. As a learner, I want model-written Python to have no network and no access to my home folder or app data, so that a hostile web page cannot use the tutor to reach my machine or local network.
8. As a learner, I want page reading to refuse my own machine and local network addresses, so that the tutor cannot be steered into my router, AdGuard or local model router.
9. As a learner, I want the tutor to pick a Python run's time limit for the job, so that a quick sum and a longer data analysis both finish.
10. As a learner, I want Python runs to stop after 10 minutes at most, so that a stuck run cannot hang my reply forever.
11. As a learner, I want the reply's Stop button to end any running tool, so that I stay in control of long work.
12. As a learner, I want to see a collapsed tool activity line under each reply, such as "Searched … · Read 2 pages · Ran Python", so that I know what the tutor did.
13. As a learner, I want to expand the tool activity line to see queries, pages, code and raw output, so that I can check the tutor's work.
14. As a learner, I want to see which tool is running while a reply streams, so that I know the tutor is working and not stuck.
15. As a learner, I want one on/off switch per tutor tool in Settings, so that I can turn off tools I don't want.
16. As a learner, I want to set my own SearXNG URL, so that web and image search are free and need no API key.
17. As a learner, I want a test button for the SearXNG URL that explains what is wrong, such as JSON output being disabled, so that setup does not fail silently.
18. As a learner, I want the search tools hidden for custom endpoints until SearXNG is set, so that the tutor never tries tools that cannot work.
19. As a learner using Claude, I want Claude's own web search and page fetching used, so that I get the provider's best search.
20. As a learner using Codex, I want Codex's own web search used, with the app's page reading, so that Codex has both.
21. As a learner using a custom endpoint, I want the app's search and page reading, so that every model I choose can research.
22. As a learner, I want no limit on the number of tool calls in one reply, so that hard questions get as much research as they need.
23. As a learner, I want later turns in the same conversation to see earlier tool calls and their outputs, so that the tutor does not repeat a search it already did.
24. As a learner, I want child conversations' inherited context compacted from everything, tool outputs included, so that important findings carry into branches.
25. As a learner, I want tool use to count in token stats and usage history, so that I see the real cost of a reply.
26. As a learner, I want Python to return only raw output, so that its results are transparent; charts belong in visuals.
27. As a learner, I want models that cannot call tools to answer normally without them, so that choosing such a model never breaks a reply.

### Memory note

28. As a learner, I want the tutor to keep one memory note about me across all learning trees, so that I don't repeat my background and preferences in every tree.
29. As a learner, I want the tutor to see the whole memory note in every conversation, so that it always knows what matters about me.
30. As a learner, I want the tutor to update the memory note only when it learns something lasting, so that it does not spend tokens on every turn.
31. As a learner, I want the tutor to add, rewrite or delete memory note entries, so that the note stays condensed and current.
32. As a learner, I want "Updated memory note" in the tool activity line whenever it changes, so that no update is hidden.
33. As a learner, I want to read and edit the memory note in Settings, so that I can fix anything wrong.
34. As a learner, I want to switch the memory note tool off, so that the tutor stops writing it.
35. As a learner, I want the memory note to hold only learning-relevant facts, never secrets or sensitive personal details, so that my privacy is protected.
36. As a learner, I want the memory note treated as data, not instructions, so that text injected from a web page cannot take control of the tutor.

### Resources

37. As a learner, I want every web page, image or document the tutor drew on kept as a resource of the learning tree, so that I can return to where a fact came from.
38. As a learner, I want citation chips in replies that jump to the matching resource, so that I can check one claim directly.
39. As a learner, I want a Resources list in the learning tree's contents panel, with each resource's title, site, kind and the conversations that cited it, so that I have a reliable layer under the tutor.
40. As a learner, I want clicking a resource to open the original, so that I can read it in full.
41. As a learner, I want every branch to see the learning tree's resources, so that a child conversation can build on the same sources.
42. As a learner, I want the tutor to prefer resources already in the tree, so that answers stay consistent with sources I've seen.
43. As a learner, I want the tutor to recommend one primary resource for going deeper, so that I know what to read next.

### Images in replies

44. As a learner, I want found images shown in the reply with a credit link to their resource, so that I know where each picture comes from.
45. As a learner, I want a dead image replaced by an app placeholder saying it is no longer available, so that old replies still make sense.

### Reply layouts

46. As a learner, I want the tutor to put an image or visual beside its explanation, so that I read both together.
47. As a learner, I want an image gallery when several pictures matter, so that I can compare them at a glance.
48. As a learner, I want side-by-side comparison columns, so that differences between two or three things stand out.
49. As a learner, I want step cards for procedures, so that each step is a distinct unit.
50. As a learner, I want plain flow when no layout helps, so that layouts never become decoration.
51. As a learner, I want to branch from any text inside a reply layout, so that layouts never cost me branching.
52. As a learner on a narrow window, I want layouts to fall back to plain flow, so that nothing is squeezed.
53. As a learner, I want conversation nodes to keep showing plain text, so that the map stays readable.

### Visual progress

54. As a learner, I want a visual that is still drawing to say "Drawing…" with elapsed time, so that I know to wait.
55. As a learner, I want a finished visual marked "Interactive", so that I know I can use it.
56. As a learner, I want a failed visual to say so and offer Retry, so that I can recover.
57. As a learner, I want a partly drawn visual dimmed and locked until it finishes, so that I don't interact with half a visual.
58. As a learner, I want "n of m visuals ready" in the reply footer, so that I know when the whole reply is complete.
59. As a learner, I want the conversation node to show the same visual count, so that I can see progress from the map.
60. As a screen-reader user, I want visual state changes announced, so that I get the same progress information.

### Model profiles and per-model settings

61. As a learner, I want switching the active model profile to change the open conversation's chat model and effort from its next message, so that the switch takes effect where I'm working.
62. As a learner, I want a streaming reply to finish on its old model when I switch profile, so that nothing breaks mid-reply.
63. As a learner, I want other conversations and learning trees to keep their models when I switch profile, so that past choices stay intact.
64. As a learner with a router endpoint, I want a searchable list of the endpoint's models in Settings, so that I can find one among hundreds.
65. As a learner, I want each model's **reads images** setting filled in from what the endpoint reports, so that vision models get real images without setup.
66. As a learner, I want to change **reads images** per model, so that I can correct a wrong report.
67. As a learner, I want each model's **uses tutor tools** setting filled in from what the endpoint reports, and changeable, so that tools reach only models that support them.
68. As a learner, I want an image icon in the model menu on models that read images, so that I can choose one before attaching a picture.

### Polish

69. As a learner in focus mode, I want the Show top bar button hidden until my pointer reaches the top edge, so that it never covers content.
70. As a keyboard user in focus mode, I want the button to appear when it gets focus, and Ctrl+Shift+F to keep working, so that I can always restore the top bar.
71. As a learner, I want no hover pop-up on conversation node rows, so that moving the pointer across the map stays calm.
72. As a screen-reader user, I want conversation node rows to keep their accessible names, so that removing the pop-up costs nothing.
73. As a learner, I want the tutor to write equations as math, so that formulas render properly instead of as plain text.
74. As a learner, I want math written with `\(…\)` or `\[…\]` to render too, so that every model's math style works.
75. As a learner, I want branching from a passage containing math to keep working, so that the new math forms don't break passages.

### Teaching tutor style and familiarity

76. As a learner, I want the tutor to answer my question fully first, never holding an answer behind questions, so that I learn without friction.
77. As a learner, I want at most one question per reply, at the end and only when it helps, so that replies don't become interrogations.
78. As a learner, I want one optional practice step or check-yourself visual after an answer, so that I can practise when I choose.
79. As a learner, I want quiz options of equal length with the right answer's position varied, so that quizzes test understanding and not pattern-spotting.
80. As a learner, I want the tutor to teach at my level, based on strong evidence, so that it neither over-explains nor skips steps.
81. As a learner, I want merely meeting a concept in a reply to count for little in familiarity, so that suggestion underlines don't vanish for terms I never read.
82. As a learner, I want my own corrections, my questions and my use of a concept to weigh most, so that familiarity reflects what I actually know.
83. As a learner who never edited the tutor style, I want the new default applied automatically, so that I get the better teaching without doing anything.

## Implementation Decisions

### Tutor tool runner (the one new seam)

- A new server module owns tutor tools. Its interface has two operations. The first answers which tutor tools a given chat model receives in a turn. It decides from the provider, the model's **uses tutor tools** setting, the per-tool switches and whether SearXNG is set. The second runs one tool, given a name, arguments and a turn context, and returns a result. The turn context holds the learning tree, conversation, reply message, abort signal and Python workspace.
- App tools: `web_search`, `read_page`, `find_images`, `run_python`, `update_memory_note`. Each tool's description tells the model what it returns and what it cannot do. For example, `run_python` cannot display files or figures.
- Provider split:
  - Claude: its own web search and page fetch, plus the app tools it lacks.
  - Codex: its own web search, plus the app's `read_page` and the remaining app tools.
  - Custom endpoints: every app tool, through function calling.
  - `find_images` always comes from the app.
- An ADR records the provider split, SearXNG and offline Python. It is still to be written; see Further Notes.

### Delivery to providers

- Claude and Codex reach the app tools through one MCP server that the app serves over streamable HTTP on localhost, built with the official MCP SDK. Each turn gets a fresh secret token, sent as a header, which binds calls to that turn's context and is revoked when the turn ends. Requests without a live token are refused.
- Claude adapter: when tools are on, it allows its own WebSearch and WebFetch plus the app MCP server's tools, and drops the single-turn limit, since there is no tool call cap. It keeps strict MCP config, no setting sources and no slash commands.
- Codex adapter: when tools are on, it turns its own web search to live and registers the app MCP server. Shell, patch, JS REPL, apps and skills stay off, and its sandbox stays read-only. Usage now sums every model call in the turn, not just the last one.
- Custom endpoint adapter: when the model uses tutor tools, it runs a function-calling loop. It sends the tool definitions, executes each returned tool call through the runner, appends the results and continues until the model answers. There is no call cap; the abort signal ends the loop.
- A model with **uses tutor tools** off, or with every tool switched off, gets the old tool-free behaviour.

### Tool events, storage and replay

- Adapters emit a new tool event while streaming: tool id, name, input, status (running, done, failed), output, and elapsed time while running. The send route forwards it to the reply stream.
- A new store table records each tool call per reply message, in order, with name, input, output, status and timing. Deleting a conversation deletes its tool calls.
- Later turns in the same conversation see earlier tool calls and outputs. Claude and Codex sessions keep them natively. The custom endpoint adapter replays them as assistant tool-call and tool-result messages.
- Compaction for inherited context receives the conversation's tool calls and outputs in full, alongside the replies.
- Usage history records every model call of a tool turn, so token stats and usage show the real total.

### `web_search` and `find_images` (SearXNG)

- Settings gains an optional SearXNG URL with a Test action. The test runs a JSON search and reports specific failures, including SearXNG's JSON format being disabled. The default SearXNG settings serve HTML only, so JSON must be enabled in its settings.
- `web_search` returns titles, URLs and snippets. `find_images` uses SearXNG's image category and returns image URL, thumbnail, title and source page. Without a URL, both are hidden for custom endpoints, and `find_images` is hidden for every provider.

### `read_page`

- It fetches the URL on the server and returns readable text, extracted with Mozilla Readability on the existing jsdom. Long text is returned in pages through an offset argument.
- An optional save-as filename writes the raw response into the conversation's Python workspace, up to a size limit. This is how data reaches offline Python.
- It is a trust boundary. It refuses loopback, link-local, private and other non-public addresses after DNS resolution, and re-checks every redirect. It allows only `http` and `https`.

### `run_python`

- It runs in bubblewrap, following the video sandbox's pattern: no network (network namespace unshared), a read-only system, an empty home, and app data hidden. Only the conversation's Python workspace is writable.
- A dedicated virtual environment, separate from Manim's, holds numpy, scipy, sympy and pandas. A setup step like Manim's creates it, and there is no runtime package install.
- The model passes a time limit in seconds: 60 by default, 600 at most. The process is killed at the limit or on abort. Each run is a fresh process; files in the workspace persist for the conversation. Stdout and stderr are returned raw, truncated to a fixed size with a marker.
- If bubblewrap or the venv is missing, the tool is hidden, and Settings shows how to set it up, the same way Manim does.

### Memory note

- The store keeps a single memory note as markdown text.
- Every chat model prompt carries the whole note as data, labelled as learner-editable data and not instructions.
- `update_memory_note` takes add, rewrite and delete operations. Add means new entry text, optionally under a heading. Rewrite means exact old entry text plus new text. Delete means exact old entry text. An operation that names text not in the note fails with a clear error.
- There is no size cap and no undo. The tutor's instructions ask it to keep the note condensed.
- A fixed rule says when to update (only when it learns something lasting) and what is banned: secrets such as keys or passwords, and sensitive personal details.
- Settings gets a Memory note section where the learner reads and edits the note.

### Resources

- The store gains resources per learning tree: URL, title, site, kind (page, image or file) and first-seen time, plus citations linking a resource to the reply messages that cited it. The same URL in one learning tree is one resource.
- A resource is created when a tool returns a page, an image or a saved file. Results of the provider's own search are recorded from their tool events where the provider reports URLs.
- Tool results give each resource its number within the learning tree. The tutor cites with a standard markdown link to a `resource:` URL, for example `[3](resource:3)`, which the renderer turns into a citation chip. Plain prose like `a[3]` is never misread as a citation.
- The chat model's prompt lists the learning tree's existing resources (number, title, site), so it can prefer and re-cite them.
- The contents panel gains a Resources list. Each entry shows title, site, kind and citing conversations, and opens the original. A citation chip scrolls to its entry.

### Images in replies

- The tutor places a found image with standard markdown image syntax. The renderer shows it with a credit link to its resource. On load failure, an app placeholder says the image is no longer available.
- Images are linked, not saved. The learner accepted this, since linking exposes their IP no more than normal browsing does.

### Reply layouts

- Reply layouts use container directives, parsed in the same markdown pass so passage offsets stay exact. This adds the micromark directive extension and its mdast utility, from the same family as the existing markdown dependencies.
- Five layouts: plain flow (no directive), figure beside text, gallery, comparison (two or three columns, each with a title) and steps (each step with a title).
- Every text run inside a layout stays a passage source for branches. Under a width threshold, layouts render as plain flow. Conversation node previews strip layouts to plain text.
- The fixed rules describe the layouts and say to use plain flow unless a layout clearly helps.

### Math

- A fixed app rule, alongside the media rules and outside the editable tutor style, tells the chat model to write every formula as `$…$` or `$$…$$`, never as plain text.
- The markdown parser also accepts `\(…\)` and `\[…\]` at the tokenizer level, so passages keep exact raw offsets.

### Visual progress

- A plain frontend module derives each visual's displayed state from the artifact's status, whether source has arrived, and its start time: drawing, interactive, failed or interrupted. It also derives a reply's "n of m visuals ready".
- The visual frame shows a visible badge (Drawing… with elapsed time, Interactive, Failed with Retry), dims and blocks input while drawing, and announces changes through a live status region.
- The reply footer and the conversation node show the count while any visual is unfinished. Videos are unchanged.

### Model profile switch

- Activating a model profile also sets the chat model and effort of the conversation open in focused chat, the one the model menu shows, to the profile's chat model default. This happens even if that conversation's model was chosen by hand. A streaming reply keeps its model; the change applies from the next message. Other conversations are untouched. With no conversation open, nothing else changes.

### Per-model settings

- When the app lists an endpoint's models, it keeps each model's reported `capabilities.vision` and `capabilities.tools`.
- A new store table keeps per-model overrides of **reads images** and **uses tutor tools**. Each value comes from the override if one exists, otherwise from the reported capability. If nothing is reported, **reads images** falls back to the endpoint's old "Accepts images" flag and **uses tutor tools** falls back to off.
- The adapter's image handling becomes per model. The endpoint form loses its "Accepts images" toggle; the old value survives only as that fallback.
- Settings shows, per custom endpoint, a searchable model list with both toggles. The model menu shows an image icon on models that read images, including Claude and Codex models, which always read images.

### Focus mode and conversation node

- In focus mode, the Show top bar button is visually hidden, with no layout space, until the pointer enters a thin hot zone along the top edge or the button gets keyboard focus. It stays in the tab order. Ctrl+Shift+F is unchanged.
- Conversation node row buttons drop their hover tooltip and keep the same accessible name.

### Tutor style and familiarity

- The default tutor style is rewritten to be answer-first, using the `/teach` skill's teaching practice:
  - answer fully first
  - teach at the learner's level
  - one optional practice step or check-yourself visual after the answer
  - back specific claims with resources and recommend one primary resource
  - quiz options of equal length, with the right answer's position varied
  - at most one question per reply, at the end, only when it helps
  - search only for specific facts, figures, dates, recent events, or when unsure
- Learners without a saved tutor style get the new default automatically. Saved styles are untouched, and restoring the default gives the new text.
- Familiarity weights change: meeting a concept in a reply counts for little and has a low total ceiling. Asking, using and the learner's corrections dominate, and the latest correction still outranks everything.
- The chat model's prompt gains a short, bounded list of the learning tree's concepts with strong evidence only: known (corrected known, or used) and shaky (corrected unknown, or asked). Concepts merely met are never listed.

## Testing Decisions

- Good tests check external behaviour at the highest seam: what a tool returns, what an adapter sends to its provider and emits, what the store returns, what a component shows and announces. They never check internal call order or private helpers. Use the cheapest level that proves the behaviour, following the project testing guide.
- **Tutor tool runner (new seam), unit level.** Tool lists per provider, settings and switches. `web_search` and `find_images` against a fake SearXNG HTTP server, including the JSON-disabled error. `read_page` extraction, paging, save-as-file, and refusal of loopback and private addresses, both direct and through redirects. `update_memory_note` operations and their errors. `run_python` against a fake sandbox runner for arguments, time limit, truncation and abort.
- **Provider adapters, integration level with fakes.** Claude and Codex launch arguments and config, with tools on and off, using the protocol fixture's fake CLI output. Custom endpoint function-calling loop, replay of earlier tool calls, abort mid-loop, and usage summed across calls, using the fake OpenAI server. Tool events reaching the reply stream through the app. Prior art: the Codex adapter tests, provider tests, endpoint and image tests built on the protocol fixture and the fake OpenAI server.
- **Store, unit level on a temp database.** Tool calls per message and their deletion, memory note, resources and citations with per-tree numbering, per-model overrides with capability fallback, new familiarity weights. Prior art: the knowledge and suggestion tests, and the store schema fixtures.
- **Frontend modules, unit level.** Markdown: `\(…\)` and `\[…\]` math, the five reply layouts, `resource:` citation chips, image placeholders and exact passage offsets inside layouts and math. Visual progress state and counts. Model profile switch effect on the open conversation. Prior art: the markdown tests and the chat hook tests.
- **Components, jsdom harness.** Focus mode hot zone visibility and keyboard focus. Conversation node rows without tooltips but with accessible names. Tool activity line collapsed and expanded. Visual badge and live announcements. Searchable model list toggles. Resources list. Prior art: the navigation and map part tests.
- **Fixed rules and tutor style, integration level.** The chat prompt contains the math rule, layout rule, memory note as data, resource list and strong-evidence concepts. A learner with no saved tutor style gets the new default. Prior art: the tutor style tests.
- **Real sandbox, manual and opt-in.** A new `npm run test:python`, modelled on the real OCR check, runs real bubblewrap. It proves a computation works, network access fails, the home folder and app data are invisible, and the time limit kills a stuck run. It is never part of `npm test`.
- No browser scripts unless an issue's acceptance names one.

## Out of Scope

- Tools for the smart model, the quick thinking model, visuals or videos.
- Searching past learning trees (the earlier `recall` idea). The memory note replaces it for now; an embedding or grep search may come later.
- Network access or runtime package installs for Python.
- Figure or file output from `run_python`. Charts belong in visuals.
- Saving copies of found images.
- Learner-added resources.
- Undo or a size cap for the memory note.
- Other `/teach` features: missions, glossary, HTML lessons, reference sheets, spaced review, communities and a research mode.
- Hosted search providers such as Brave or Tavily.
- Free-form layout or CSS from the tutor.
- Changes to video progress.

## Further Notes

- Planned build order, as epics: (1) chat and map polish; (2) per-model settings; (3) visual progress; (4) tutor style and familiarity; (5) tutor tools; (6) memory note; (7) resources; (8) reply layouts. Epics 6 to 8 depend on 5's tool runner and tool events. Tickets are not created yet.
- To write before tickets: ADR 0003, on tutor tools coming from the provider where it has them and from the app otherwise, with SearXNG search and offline Python.
- Verify when building:
  - Whether the installed Codex CLI supports streamable HTTP MCP servers. If it doesn't, fall back to a stdio MCP bridge process that forwards to the same runner.
  - Whether bubblewrap can unshare the network namespace on this machine.
  - What 9router reports in `capabilities.tools` for models it cannot verify.
- Replaying every tool output and compacting it in full can make long conversations expensive. The learner accepted this. Watch token stats after release.
- The memory note is part of every prompt and has no cap. If it grows large, revisit the cap decision.
