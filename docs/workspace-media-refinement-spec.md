# Workspace, model roles and narrated video refinement

Status: agreed design synthesized from the owner's 2026-11-11 interview.
Documentation and specification publication are authorized; this task does not
implement the features. Beads records delivery order and implementation status.

## Problem Statement

Creating a child conversation can produce an answer masquerading as inherited
context. The learner needs a faithful account of prior discussion, without losing
important ideas or pre-answering the new question. Model configuration also lacks
clear roles and effort controls.

Focused chat spends too much space on its header and composer. Passage branching
has too many visible buttons and cannot be dismissed naturally. The learning-tree
rail has an intrusive scrollbar and persistent search field. Usage is presented
as today's text totals, making long-term consumption difficult to understand.
Diagrams contain too many shapes and connections to explain their ideas clearly.

The learner also needs creative educational videos with narration and subtitles,
generated without exposing scripts or production steps. Videos need a durable
library independent of their originating learning trees.

## Solution

Use a quick thinking model to recursively compact prior discussion for each child.
Offer independent model and effort settings for quick thinking, chat and smart
roles. Let children inherit their parent's current chat choice and effort.

Give reading more space through a slim header, floating composer and compact
passage popup. Move title-only search into a floating window and restyle the
rail's scrollbar. Show usage through historical charts that survive content
deletion. Present diagrams as small, colorful explanatory steps.

On an explicit video request, a smart-model worker privately creates a script and
custom 2D/3D scenes. Edge TTS creates narration and subtitle data; Remotion and
Three.js produce the finished local video. A video-sized loading rectangle offers
Cancel, then becomes the finished player. A shared video library provides playback,
Show in folder and trash actions. Creative freedom takes priority over introducing
a reusable scene library in this version.

## User Stories

### Inherited context

1. As a learner, I want a child to receive background rather than an answer to its new question, so that its tutor can answer in the child conversation.
2. As a learner, I want the quick thinking model to compact context, so that background preparation uses the role I configured for it.
3. As a learner, I want compaction to combine the parent's inherited context and parent conversation, so that earlier ancestors remain represented without rereading every ancestor transcript.
4. As a learner, I want important ideas, constraints and conclusions preserved, so that branching does not lose the reasoning I need.
5. As a learner, I want repetition removed without adding new knowledge, so that the inherited account stays concise and faithful.
6. As a learner, I want one compact paragraph with enough length for the subject, so that an arbitrary tiny word target does not discard important ideas.
7. As a learner, I want my selected passage preserved exactly beside that paragraph, so that the child knows what I pointed at.
8. As a learner, I want my new question sent separately, so that the summarizer does not treat it as a question to answer.
9. As a learner, I want the same rule at every nesting depth, so that grandchildren work like children.
10. As a learner, I want inherited context frozen when a branch is created, so that later parent messages do not change an existing child's background.
11. As a learner, I want unrelated branches excluded and child discussion kept out of the parent, so that conversations stay independent.
12. As a learner, I want original messages preserved, so that compaction does not replace my saved source history.

### Model roles and effort

13. As a learner, I want quick thinking, chat default and smart choices in Settings, so that each role has a clear purpose.
14. As a learner, I want each role's model independently configurable, so that background work can use a different model from chat.
15. As a learner, I want each role's effort independently configurable, so that sharing a model does not force identical reasoning effort.
16. As a learner, I want every role to offer models from any connected provider, including my custom endpoint, so that configuration is consistent.
17. As a learner, I want effort choices limited to what the selected model supports, so that the setting is meaningful.
18. As a learner, I want quick thinking to handle suggestions and compaction, so that both use its configured model and effort.
19. As a learner, I want the existing suggestion-model choice retained as quick thinking, so that the role rename does not discard my preference.
20. As a learner, I want unconfigured quick thinking to retain the existing inexpensive provider default, so that it does not silently become the chat model.
21. As a learner, I want new learning trees to use the Settings chat model and effort, so that I control their starting configuration.
22. As a learner, I want children to inherit their parent's current provider, model and effort, so that branching keeps the current conversational choice.
23. As a learner, I want to change model and effort inside a conversation, so that I can adjust its next response without changing global defaults.
24. As a learner, I want configuration changes to preserve visible messages and inherited context, so that switching does not reset a discussion.
25. As a learner, I want changes to Settings defaults to leave existing conversations unchanged, so that saved conversations retain their choices.
26. As a learner, I want smart initially to follow the Settings chat model and effort, so that it works without separate setup.
27. As a learner, I want to override smart's model and effort independently, so that it can share chat's model while using a different effort.
28. As a learner, I want smart's following behavior to use global chat defaults rather than a conversation override, so that its configuration is predictable.
29. As a learner, I want smart to create video scripts, scenes and animation code, so that creative video work uses that role.
30. As a learner, I want settings saved locally and restored, so that I do not configure roles again after restarting.
31. As a learner, I want unavailable selections explained without silent provider substitution, so that work uses the provider I chose.

### Focused chat and passage popup

32. As a learner, I want one slim header row, so that controls leave more room for replies.
33. As a learner, I want a shortened title with the full title available on hover or keyboard focus, so that long titles stay readable without a tall header.
34. As a learner, I want a compact model/effort picker, expand and close controls, so that common actions remain directly reachable.
35. As a learner, I want token stats and secondary header controls under a quiet overflow menu, so that they do not occupy a permanent extra row.
36. As a learner, I want automatic saving to continue without a permanent saved-status line, so that metadata does not crowd the header.
37. As a learner, I want a floating rounded rectangular composer with a circular send button beside it, so that asking a question takes less visual space.
38. As a learner, I want the composer to leave the last reply readable and remain usable in narrow windows, so that the floating layout does not hide content.
39. As a learner, I want a passage popup containing the passage, question field and a small send control, so that branching feels lightweight.
40. As a learner, I want outside click or Escape to dismiss that popup, so that I need no Cancel branch button.
41. As a learner, I want familiarity corrections under a small overflow menu, so that I retain them without two prominent buttons.
42. As a learner, I want branching to retain passage anchoring, keyboard access and failure recovery, so that compact presentation preserves the existing learning flow.
43. As a learner, I want submission still to require my question, so that dismissing or opening a popup never creates a branch.

### Learning-tree navigation

44. As a learner, I want a search icon instead of a persistent search field, so that the rail has more room for learning trees.
45. As a learner, I want that icon to open a floating search window, so that search appears only when needed.
46. As a learner, I want search to match learning-tree titles only, so that a large collection stays simple to search.
47. As a learner, I want choosing a result to open its learning tree, so that title search takes me directly to saved work.
48. As a learner, I want keyboard navigation and an understandable empty state, so that floating search remains accessible.
49. As a learner, I want a thin rounded scrollbar thumb with subtle theme-matched color and no heavy track, so that the rail feels less crowded.
50. As a learner, I want the scrollbar to appear on hover or scroll, so that it stays quiet while remaining discoverable.
51. As a learner, I want mouse, touch and keyboard access to every saved learning tree, so that scrollbar styling never hides functionality.

### Usage history

52. As a learner, I want a usage trend chart, so that I can see how consumption changes over time.
53. As a learner, I want a cumulative view, so that I can see accumulation over months and years.
54. As a learner, I want stacked input, output and cache-read bars, so that I can understand the reported token categories.
55. As a learner, I want breakdowns by model and task, so that I can distinguish chat, suggestions, compaction and video work.
56. As a learner, I want today, week, month, selected-year and all-time filters, so that usage stays useful over years of learning.
57. As a learner, I want precise values on hover or keyboard focus and an accessible textual equivalent, so that graphs do not hide their numbers.
58. As a learner, I want usage to survive learning-tree, conversation and video deletion, so that historical totals do not shrink.
59. As a learner, I want only counts, dates, provider/model and task attribution retained for deleted content, so that historical accounting does not retain deleted text or video.
60. As a learner, I want reported background-model usage counted, so that hidden production work is not hidden consumption.
61. As a learner, I want unavailable measurements identified rather than estimated, so that charts do not invent usage.
62. As a learner, I want historical usage restored after restart without rerunning calls, so that viewing the dashboard spends no model tokens.

### Diagrams

63. As a learner, I want a complex explanation split into small visual steps, so that one crowded graph does not overwhelm me.
64. As a learner, I want few main ideas, clear labels and fewer connections per diagram, so that its point is easy to follow.
65. As a learner, I want meaningful colors and simple visual metaphors, so that diagrams are approachable even to children.
66. As a learner, I want technical detail in the accompanying explanation, so that simpler visuals preserve accuracy.
67. As a learner, I want diagrams readable in both appearances and accessible without color alone, so that colorful presentation remains usable.
68. As a learner, I want existing safe rendering, text alternatives and passage interactions preserved, so that visual improvement does not weaken existing behavior.

### Video generation

69. As a learner, I want video generation only when requested, so that ordinary explanations do not start expensive background work.
70. As a learner, I want smart to generate a script and creative scenes without showing its working steps, so that I receive an educational video rather than a production workflow.
71. As a learner, I want custom scenes without a predefined scene-component vocabulary, so that explanations have creative freedom.
72. As a learner, I want the model to choose 2D or 3D unless I specify, so that the visual form serves the subject.
73. As a learner, I want 2D for ordinary explanations and 3D where spatial relationships help, so that depth has an explanatory purpose.
74. As a learner, I want videos to aim for one or two minutes and run longer when needed, so that explanations are concise but complete.
75. As a learner, I want an explicit duration request to guide generation, so that I can ask for a shorter or longer explanation.
76. As a learner, I want Edge TTS narration from the generated script, so that videos explain ideas aloud.
77. As a learner, I want synchronized subtitles, so that I can follow the explanation with sound off or alongside narration.
78. As a learner, I want setup to install the narration client and rendering dependencies, so that video generation needs no separate manual setup.
79. As a learner, I want generated narration, subtitles and videos saved locally, so that ready videos can be reopened without regeneration.
80. As a learner, I want a video-sized rectangular loading placeholder, so that I know where the video will appear while work runs.
81. As a learner, I want Cancel on that placeholder, so that I can stop unwanted generation.
82. As a learner, I want the finished player to replace the placeholder in place, so that completion does not move focus or disrupt reading.
83. As a learner, I want to continue chatting and navigating during generation, so that production does not block the learning workspace.
84. As a learner, I want scripts, source code, engine details and production logs hidden, so that I only see the loading state and finished video or a simple failure.
85. As a learner, I want a failed generation to stay failed without automatic repair or retry, so that it does not keep spending tokens in the background.
86. As a learner, I want an explicit Retry action after failure, so that another attempt happens only when I request it.
87. As a learner, I want canceled or interrupted jobs never to publish late results or restart automatically, so that stopping work actually stops it.
88. As a learner, I want reopening a ready video to reuse its saved files, so that playback never triggers another model call.

### Video library

89. As a learner, I want one library of generated videos across learning trees, so that I can find them independently of their original conversations.
90. As a learner, I want library playback, so that I need not reopen the source conversation to watch a video.
91. As a learner, I want Show in folder, so that I can locate a video in my file explorer.
92. As a learner, I want explicit deletion through the system trash, so that removal is recoverable through the desktop's trash workflow.
93. As a learner, I want videos retained when their learning tree or conversation is deleted, so that deleting discussion does not delete my video collection.
94. As a learner, I want unavailable media represented honestly, so that a removed or missing file is never shown as playable.
95. As a learner, I want deletion to leave historical usage intact, so that removing a video does not erase the consumption that produced it.

## Implementation Decisions

- **Authority and delivery.** This is the final interview specification for the named refinements. It supersedes conflicting earlier workspace notes, visual layout rules, suggestion-model naming and video proposals only within this scope. Unrelated map behavior, appearance tokens, provider/authentication rules and release prerequisites remain binding. Implementation issues are separate from specification publication.
- **Existing seams.** Extend the existing application server, provider adapters, local store, focused-chat components, Settings window, learning-tree rail, diagram worker, video worker and local renderer. Reuse current session isolation, artifact lifecycle, authentication and request protection rather than introducing another orchestration system.
- **Role settings.** Persist provider/model selections and supported effort choices for quick thinking, chat default and smart. Offer the same connected-provider model choices across roles, including the custom endpoint. Migrate the existing suggestion selection into quick thinking. An unset quick thinking model retains the existing inexpensive provider default; the interview did not choose a new numeric or named quick thinking effort default.
- **Following versus overriding.** Smart model and effort each initially follow their corresponding Settings chat default. Each can be overridden independently; overriding effort does not pin the model, and overriding the model does not itself pin effort. Following is dynamic and uses global chat defaults, not a conversation override. Resolve compatibility against the selected provider/model's supported capabilities; do not send invented effort levels or silently substitute a provider.
- **Conversation configuration.** New roots resolve and save chat defaults. Child creation snapshots the parent's current provider, model and effort. Conversation controls can change model and effort for subsequent work without replacing history or inherited context. Settings changes do not retroactively alter saved conversations. Preserve existing provider-specific defaults for older records without effort rather than fabricating a historical value.
- **Compaction source and purpose.** Use the configured quick thinking model and effort in an isolated summarization call. Combine the parent's fixed inherited background with its completed conversation, identifying the exact passage as source context. Earlier ancestors arrive through the inherited snapshot; unrelated sibling histories and private worker transcripts do not enter the input. The new child question remains separate from the compaction task and is delivered as its own learner message.
- **Compaction result.** Request one coherent compact paragraph containing existing important ideas, constraints and conclusions, with repetition removed. Explicitly prohibit answering the new question, extending the explanation or inventing facts. Preserve the exact passage separately. Do not impose the rejected 80–150-word target, silently truncate important ideas, or treat the old 1,200-word/character limits as an agreed product requirement. Provider context/output ceilings still exist and must fail clearly rather than silently discard history. No replacement numeric product cap was selected.
- **Snapshot consistency.** Keep existing exact-passage validation and atomic branch persistence. Freeze source context at creation, leave original messages unchanged and preserve parent/child isolation. A compaction failure must not create a partly initialized branch or erase the learner's submitted question.
- **Compact surfaces.** Use one slim header row for shortened title, compact model/effort picker, expand, close and overflow. Full titles are available on hover/focus. Move token stats and secondary controls under overflow; remove permanent autosave text while keeping autosave. Keep the existing stats and inherited-context content reachable.
- **Composer.** Use the requested floating rounded rectangular input and adjacent circular send control. Preserve sending, interruption controls, typing accessibility and narrow-screen behavior. Ensure the latest reply and focused input are not obscured. No new attachment, voice-input or editing workflow is implied.
- **Passage popup.** Show the passage, question input and small send control; familiarity actions remain under overflow. Remove Cancel branch and dismiss through outside interaction or Escape with correct focus handling. Preserve existing requirements for nonempty questions, exact anchors, keyboard submission, failed-submit recovery and explored suggestions. Opening or dismissing a popup alone creates no branch.
- **Search and scrolling.** Replace the persistent field with an icon-triggered floating search window. Change the current title-and-message search behavior to title-only search, retaining case-insensitive matching and ordinary local queries without model calls. Do not scan saved conversation text to produce results. Selecting a result opens its learning tree. Retain list grouping, current-tree state and keyboard behavior. Style a thin rounded theme-aware thumb with no heavy track, visible on hover or scroll, without disabling scroll or making touch/keyboard access depend on hover.
- **Usage storage.** Extend local storage with durable usage records independent of message and artifact deletion. Records contain reported counts, occurrence time, actual provider/model and task attribution without retained deleted text, scripts, media or inference transcripts. Migrate available historical measurements once without duplicates; do not reconstruct usage that was never saved or invent missing provider/model attribution.
- **Usage collection.** Capture provider-reported model consumption for chat and background work, including suggestions, compaction, diagram and video generation. A failed/canceled call may still consume tokens; retain a measurement if actually reported and distinguish unavailable measurements. Track logical calls/attempts so repeated events, reopening and migration cannot double count. Edge TTS and local rendering do not become invented LLM-token counts.
- **Usage presentation.** Offer trend/cumulative views, stacked input/output/cache-read bars, model/task breakdowns and today/week/month/selected-year/all-time ranges. Give exact values through hover/focus and an accessible nonvisual equivalent. Respect provider counter semantics so cached tokens are not counted twice in totals. Currency pricing and estimated token counts are not part of this decision.
- **Diagram explanation.** Keep Mermaid but change the generation instructions toward several small explanatory diagrams rather than one crowded graph, with few main ideas, clear labels and purposeful connections. Pair simple visual metaphors and meaningful theme-aware colors with accurate explanatory text. Preserve safe syntax/rendering constraints; use trusted app styling instead of enabling arbitrary generated script, HTML or unsafe styling. No fixed node count or new diagram engine was selected.
- **Video ownership of work.** The chat model handles the learner conversation. An isolated smart-model worker uses smart effort for the script, visual planning and custom composition code. Resolve model/effort into the job's frozen input alongside its existing relevant conversation context. Production transcripts and source remain outside chat, suggestions and inherited context. Preserve the tutor-visible concise finished-artifact representation without exposing production details to the learner.
- **Rendering and creativity.** Extend the existing Remotion pipeline with Three.js through its supported React integration for spatial scenes. The model may freely author custom compositions; a reusable scene/component library and constrained storyboard language are explicitly deferred. Generic safety validation is still required and must not be confused with a creative template restriction. Do not migrate to HyperFrames or add a second renderer for this version.
- **Narration and subtitles.** Install the Edge TTS client as part of setup and save its returned audio/subtitle data locally. Edge TTS uses Microsoft's online service; the owner explicitly accepted that in place of offline synthesis when no paid account/API key is needed. This requires no downloadable offline voice model. Generate speech and subtitle data from the same script and align the animation with actual audio timing, avoiding a second transcription-model call merely to recreate known narration. Provide synchronized subtitles without exposing the script as a separate product surface.
- **Duration and local media.** Aim for 1–2 minutes, extending when the explanation warrants it or the learner specifies another duration. Replace the current short-video-only limits with support for this target; no unlimited resource promise or new fixed upper duration was agreed. Persist ready media and subtitle assets locally for reuse. Keep playback paused initially and retain accessible native player controls.
- **Loading, cancellation and failure.** Reserve a video-sized rectangle during preparation/rendering, with a small Cancel control. Replace it in place with the ready player. No script approval, intermediate previews, code view or technical progress stages are exposed. On failure, report a simple actionable failure. Never automatically repair, retry or regenerate. A new attempt requires explicit learner Retry; successful generation is not automatically replayed on reopen. Keep interruption/restart semantics and reject late publication from canceled or superseded attempts.
- **Network and renderer boundary.** Edge TTS is the narration network stage; chat/smart/quick thinking requests use their selected providers. Rendering remains local and isolated. Stage narration/media for the renderer instead of granting generated code unrestricted network or filesystem access. Extend the existing allowlist and rendering support for the selected 3D/audio features without weakening isolation.
- **Library persistence.** Decouple ready video ownership from originating conversations so conversation/tree deletion preserves library media. Store enough library metadata for playback, title and media location without retaining deleted conversation text or the private production transcript. Existing videos should appear without regeneration; removing a conversation must not strand its saved video behind a conversation-only media route.
- **Library operations.** Provide a global list and playback, a server-owned reveal operation for the selected video and a trash operation for the video and its owned playback assets. Resolve files through server-issued video identity, never an arbitrary client path or shell command. Remove library entries only consistently with media removal, and report missing files honestly. Usage records survive both content deletion and trash actions. Do not silently regenerate a removed video or invent a permanent-delete fallback if trash fails.
- **Visual implementation.** Reuse suitable Astryx components and theme tokens; inspect available loading/dialog/input components before inventing equivalents. Use Impeccable for frontend implementation. Preserve both appearances, keyboard access, reduced-motion behavior and the current optional Vim focus boundaries. No new visual theme or fixed pixel dimensions were agreed.

## Testing Decisions

The owner confirmed the following plan during specification writing: existing HTTP
integration tests are the main seam, with focused UI/component checks for visual
behavior and accessibility, plus real renderer/TTS smoke checks. A broad E2E suite
is not requested. Test observable behavior rather than component internals, prompt
wording alone, private functions or assertions that merely mirror implementation.

- **Prior art.** Existing branching and branch-lifecycle tests run the application server against a real temporary local database and controlled providers. Usage tests already cover provider events, restart and date boundaries. Suggestion/provider tests exercise subscription adapters and a fake custom endpoint. Video tests already inject a controlled renderer and verify artifacts, frozen input, cancellation, media serving and restart. Extend those seams rather than creating a second test harness.
- **Roles and effort.** Through Settings/conversation HTTP operations, verify independent role values, partial smart overrides, dynamic following, custom endpoint choices, supported effort validation, root defaults, parent-to-child inheritance, conversation overrides and reopening. Verify captured adapter requests receive the selected role's actual effort and settings changes do not reroute active jobs or mutate existing conversations.
- **Recursive compaction.** Create root, child and grandchild with distinct important facts. Observe the quick thinking call and saved child context: inherited snapshot plus completed parent discussion, exact passage retained, new question separate, no sibling leakage or parent mutation. Include a paragraph longer than the rejected tiny target to catch accidental truncation. Provider fixtures establish wiring and persistence; a real provider check must separately assess whether summaries preserve meaning and avoid answering. Do not claim a mocked response proves summarization quality.
- **Usage history.** Exercise reported and unavailable counts across calendar/year boundaries and chart ranges, task/provider groupings, restarts, deletion and one-time migration. Delete learning trees and videos and assert the same historical totals with no retained deleted content. Verify no double counting after repeated completion events, retries or reopening, including providers with differing cache-counter semantics. Include reported usage on failed work without inventing missing measurements.
- **Focused chat and popup.** Use focused UI/component checks for slim header, overflow access, title hover/focus, effort/model controls and floating composer fit. Verify outside-click/Escape dismissal, familiarity overflow, keyboard submission, failed-submit recovery and focus return. Check narrow/wide windows and both appearances; screenshots support layout assessment but do not prove all interactions.
- **Title search and scroll.** Integration tests must prove a message-only match no longer appears while title matches still do. UI checks cover opening/dismissing the floating window, result activation and empty states. Verify thumb appearance on hover/scroll and full mouse/touch/keyboard reachability without relying on a visible scrollbar track.
- **Diagrams.** Exercise safe server generation and actual Mermaid rendering of multiple small diagrams with theme colors, text alternatives and existing passage interactions. A real example review assesses simplicity and readability; a syntax fixture or shape count alone does not prove a child can understand the explanation.
- **Video lifecycle.** Through HTTP, use controlled smart provider, narration and render results to verify exactly one job per request, frozen model/effort/context, hidden production data, local media/subtitle delivery, no automatic repair/retry, explicit retry, cancellation and late-event rejection. Fail script generation, TTS and rendering separately and assert no automatic second attempt. Check restart marks unfinished jobs interrupted without restarting inference.
- **Library and desktop operations.** Verify existing/new videos list and play, survive source conversation/tree deletion and reopen without calls. Use injected desktop/trash boundaries in integration tests for safe path ownership, failed trash operations and missing files. A supported-desktop check must actually open the selected folder and move a disposable video to system trash; a mocked launcher does not establish desktop behavior.
- **Real media smoke boundary.** After implementation, generate representative 2D and 3D narrated videos near the target duration using the actual isolated renderer and Edge TTS, inspect frames and listen to audio, verify subtitles and synchronization, and play the saved results after restart. Confirm no hidden repair attempt and no source/transcript leakage. Record provider, hardware, rendering time and actually reported token usage; make no unmeasured quality, speed or savings claim.
- **Setup and regression.** Verify a clean project setup provisions required clients, render dependencies and 3D/audio support, and that reopening ready media works without calling a provider. Run relevant integration tests and the existing build/token checks during implementation. Use focused UI checks, not the whole historical E2E runner by default. Documentation publication itself requires link, requirements, dependency-graph and diff checks, not model generation or a runtime build.

## Out of Scope

- Implementing or running the new features as part of this documentation task.
- A reusable scene/component library, template-only creativity or a constrained storyboard renderer in this version.
- Automatic repair, automatic retries, restart-triggered generation or silent model/provider fallback.
- Offline TTS models, paid narration accounts, voice cloning, soundtrack generation, a public script editor or script approval workflow.
- Conversation-message/full-text search, embeddings or model-powered learning-tree search.
- A second rendering engine, HyperFrames migration, interactive 3D playback or a full video editor.
- A new visual theme, unrelated map/knowledge-graph changes or a general application rewrite.
- Invented token counts, billing estimates, guaranteed unlimited free Edge TTS availability or a new fixed duration/word limit.
- A new broad E2E suite, cloud-hosted media storage or remote Git publication.

## Further Notes

- This specification replaces the earlier partial [workspace notes](workspace-media-refinement.md). It refines the [visual identity](visual-identity-spec.md), [Break down](break-down-spec.md), [video proposal](video-flow-proposal.md) and [diagram artifacts](diagram-artifacts.md) only where its decisions differ; the PRD remains the product entry point.
- Source inspection found an existing compactor using the parent model with the new question in its input and a 1,200-word prompt limit; suggestion selection is separate from chat and has no effort configuration. Usage totals are currently tied to saved messages/suggestions. Search currently includes message text. Videos already use isolated local Remotion rendering, but support short 2D compositions, use the conversation model and are removed with their conversation. These are starting points, not completed refinements.
- [Remotion's 3D integration](https://www.remotion.dev/docs/three) and [caption support](https://www.remotion.dev/docs/captions/) support the selected direction. [HyperFrames](https://hyperframes.heygen.com/guides/hyperframes-vs-remotion) was considered; no demonstrated benefit justified replacing the renderer already integrated into this app.
- [Edge TTS documentation](https://pypi.org/project/edge-tts/) describes the online service and audio/subtitle output. It does not require the user's own paid account/API key in its documented workflow. Its maintainer states that the exact [service quota is unknown](https://github.com/rany2/edge-tts/issues/219). Setup installs a client, not Microsoft's speech model; narration text leaves the machine for synthesis. Ready playback uses local files.
- Freeform compositions may consume more tokens than template-driven scenes. The owner chose creative freedom first. No runtime benchmark, listening test, subtitle synchronization test or new UI verification was performed during this interview/specification task.
- Exact effort defaults for previously unconfigured quick thinking/chat roles, subtitle presentation (player tracks versus embedded captions), video dimensions, numeric resource ceilings and the library's precise navigation placement were not selected in the interview. These are implementation details to resolve against supported capabilities; they must not be presented as owner-agreed requirements. Any material change in cost, behavior or creative scope requires clarification rather than an invented decision.
