# Tool calls and a lean tutor prompt

Terms: GLOSSARY.md (tutor, chat model, smart model, quick thinking model, visual, step, video, cut, cut audit, discussion, suggestion, next question, groundwork, familiarity, custom endpoint, skill, reply layout). Decision: ADR 0013 (structured output only through tool calls), which supersedes the delivery part of ADR 0008. ADR 0003 (provider-first tutor tools) and ADR 0004 (chat model writes media, smart model plans and reviews) still hold.

## Problem Statement

Only frontier models make media in Rabbithole. Every reply asks the chat model to handle about six output formats at once: prose with LaTeX, eight `:::` reply layouts, fenced JSON blocks for visuals, videos and discussions, a hidden verdict block near the start and a hidden notes block at the end, all under a tutor prompt of about 5K tokens. Other models mangle a block, mix the layout and block syntaxes (raw `:::rabbithole-visual {…}` text has reached learners), or fail one field of the smart model's large video plan JSON. No custom-endpoint model has ever got a video past its plan; Codex has made every one. When a job fails, the learner sees "Video provider failed to generate a composition." while the real cause, such as a model missing from the endpoint's catalog, is thrown away.

Visuals also read like slides: too much text and too little to play with. A figure beside a long block of text comes out lopsided. Picking a model on an endpoint that lists thousands is slow: the Settings search is an exact substring match that redraws every row on each keystroke, and the chat model menu has no search at all.

## Solution

Every model, Claude and Codex included, gets one shared tutor prompt about half today's size. The tutor writes prose, and anything structured goes through ordinary tool calls, the format models are trained on. The tutor calls a visual tool at the point in the reply where the visual belongs; the visual starts drawing at once and the reply carries on. Videos, discussions, and the hidden verdict and notes go through tool calls too. The smart model builds a video plan through small calls, one per colour, recurring object and cut, so one bad field is fixed on its own instead of failing the video. Models without native tool calling write the same calls as `<tool_call>` text.

The visual writer loads the skills its work needs, such as three.js for 3D and GSAP for animation, and visuals keep text to a few short lines and favour something to play with. Layouts stay as they are, but a lopsided figure stacks, and broken media blocks still become media. Failed media shows the provider's real error. Model pickers get a fast fuzzy search.

## User Stories

1. As a learner using a small custom-endpoint model, I want visuals to appear when the tutor offers them, so that I can learn visually without a frontier subscription.
2. As a learner using a small custom-endpoint model, I want to make a video, so that videos are not limited to Claude and Codex.
3. As a learner, I want a visual to start drawing as soon as the tutor decides on it, so that it is ready while I am still reading.
4. As a learner, I want each visual to sit at the point in the reply where it was offered, so that it lines up with the text around it.
5. As a learner, I want never to see raw JSON or `:::` markup in a reply, so that replies always read cleanly.
6. As a learner, I want a broken media block from a weaker model to still become its visual or video, so that I do not lose media to a formatting slip.
7. As a learner, I want a figure whose text runs much longer than its image to stack text and image, so that the reply is not lopsided.
8. As a learner, I want smart models to keep using layouts such as steps, timelines and comparisons, so that replies keep their shape where the model handles it well.
9. As a learner, I want visuals with only a few short lines of text, so that they hold my attention like a video instead of a slide.
10. As a learner, I want visuals I can play with, such as sliders, dragging or clicking, when changing something teaches the idea, so that exploring is more fun than looking at a picture.
11. As a learner, I want a static visual when interaction would add nothing, so that I am not given pointless controls.
12. As a learner, I want 3D visuals to work reliably, so that spatial ideas are shown properly.
13. As a learner, I want animated visuals to move with sensible pacing and easing, so that motion helps rather than distracts.
14. As a learner, I want next questions to appear as soon as a reply finishes, so that I can carry on at once.
15. As a learner, I want suggestions underlined and groundwork offered just as today, so that the switch to tool calls changes nothing I rely on.
16. As a learner, I want familiarity to keep learning from my messages with any model, so that the tutor fits my level.
17. As a learner, I want a check-yourself visual to keep its answer hidden until I reveal it, so that I can predict first.
18. As a learner, I want discussions to work with any model that can chat, so that classmates are not limited to frontier models.
19. As a learner, I want a video request to plan successfully even when the smart model gets one field wrong, so that a slip does not cost me the whole video.
20. As a learner, I want a video plan that cannot be completed to fail with a clear reason, so that I know whether to retry or change models.
21. As a learner, I want a failed visual or video to show the provider's real error, such as a model missing from the endpoint's catalog, so that I can fix the cause.
22. As a learner, I want provider errors shown without keys or tokens, so that nothing secret appears on screen.
23. As a learner adding a custom endpoint, I want the app to find out for itself whether a model can call tools, so that I never set it by hand.
24. As a learner, I want to retest a model's tool support in Settings, so that an endpoint upgrade is picked up.
25. As a learner whose model cannot call tools natively, I want it to request media in a text form the app understands, so that it still makes visuals.
26. As a learner, I want the Usage page to count media made through custom endpoints, so that I can see what media really costs.
27. As a learner with an endpoint listing thousands of models, I want a fuzzy search where "son46" finds claude-sonnet-4-6, so that I find a model without its exact name.
28. As a learner, I want model search to stay quick with thousands of models, so that typing never lags.
29. As a learner, I want the same search in the chat model menu, so that I can switch a conversation's model without scrolling a huge list.
30. As a learner, I want the same search wherever models are chosen, including model profiles and the smart and quick thinking model settings, so that every picker behaves alike.
31. As a learner using Claude or Codex, I want replies at least as good as today, so that the leaner prompt costs me no quality.
32. As a learner, I want media tools kept out of my tutor tool settings and tool activity, so that they stay app machinery, not choices I manage.
33. As a learner, I want my stored replies and their media to render exactly as before, so that nothing I saved breaks.
34. As the owner, I want one prompt for every model, so that there is a single path to tune and test.
35. As the owner, I want the media instructions to live in the tool descriptions, so that the tutor prompt stays short and each rule sits beside the call it governs.
36. As the owner, I want every structured model output to arrive as a tool call checked by the server, so that a bad value is fixed on its own instead of breaking a parse.
37. As the owner, I want no strict or constrained schema modes, so that the app relies only on what every endpoint supports.
38. As the owner, I want a skill loaded whenever its work applies and the writer retried with it when missed, so that a visual is never written without the guidance it needs.

## Implementation Decisions

### One lean tutor prompt

- The tutor prompt is rewritten for every model to roughly half its current size before learner data. Media rules move out of the prompt into the tool descriptions. The check-yourself paragraph shrinks to two or three lines. The teaching and humanizer skills are trimmed to their core rules. The math rule, the memory rule, the neighbourhood rule and the tutor style stay.
- The reply layout section stays as it is: smart models use layouts well, and the guards below cover weaker ones.
- Fixed text still comes first so provider prompt caching covers it.

### App media tools

- The tool runner gains four tools for the tutor: show_visual, make_video, start_discussion and record_turn. They are served the same way as the existing tutor tools: through the per-turn MCP server for Claude and Codex, and through function calling for custom endpoints. They are always present, are not learner-toggled tutor tools, and never appear in tutor tool settings or the tool activity list.
- Tool arguments are short and flat. Every rule a model needs for a call lives in that tool's description: when to use it, when not to, and the meaning of each argument.
- The server validates each call's arguments itself. A bad argument gets a plain error naming the argument and what is allowed, and the model fixes that one call. No strict or constrained schema mode is used anywhere.
- **show_visual**: `title`, `shows` (exactly what the visual shows), `alt` (its text alternative) and an optional `check_answer`. When `check_answer` is present the visual is a predict-then-reveal check, with the answer and reason in that field. The server places the visual at the reply position where the call happened. It creates the pending visual and starts the writer at once, using the reply text up to the call as context, then answers "queued" so the tutor continues. This replaces the old title, description, intent, excerpt and shows fields.
- **make_video**: `topic`. The server gives the planner the conversation context. The "only when the learner explicitly asks" rule and the "stands alone without other media" rule move into its description.
- **start_discussion**: classmates (name, level, voice) and lines (speaker, text), with today's discussion rules in its description. It is placed last, as the block was.
- **record_turn**: next questions, suggestions (text and concept), groundwork, concepts with topics, concept links, and verdicts (concept, level, confidence). It is called once at the end of each reply and replaces both the hidden verdict and notes blocks. Next questions show as soon as the call arrives. Invalid entries are skipped and named in the result, the same tolerance the blocks had; no retry is asked for. When a reply ends without the call, the quick thinking model stands in as it does today.
- **Turn ending**: for custom endpoints, a round whose only calls are record_turn or start_discussion ends the reply without another request. Claude and Codex may make one more request after it: the record_turn result asks the tutor to end its reply, and any text or app call from that request is dropped. Claude Code asks for a repeat answer when a response has no text, so that request can repeat the whole reply.
- **Mid-reply continuation**: after show_visual on a custom endpoint, the server sends a "queued" result that tells the tutor to continue where it stopped, and continues the reply in the next request. If the continuation starts by repeating text already shown, the repeated prefix is dropped.

### Text fallback and tolerant parsing

- A model whose endpoint cannot call tools gets the same tools described in the prompt and writes each call as Hermes-style text: `<tool_call>{"name": …, "arguments": {…}}</tool_call>`. The reply-stream parser recognises it, hides it from the learner as it hides blocks today, and runs it exactly like a native call. In text mode no result goes back to the model; it keeps writing.
- The same parser catches native calls that a model leaked into its reply text in that shape.
- The old fenced-block parser stays, so stored replies render and a new reply that still writes a fenced block is honoured. It also accepts the broken forms seen in practice, such as `:::rabbithole-visual {…}`, `:::rabbithole-video {…}`, and a `:::wide` or `:::figure` wrapped around bare request JSON, treating each as the request it meant.
- **Tool support probe**: the first time a custom-endpoint model is used for chat or media, the app sends one tiny tool call. It saves whether a valid call came back, sets the model's existing tool flag, and picks the native or text path from it. Settings offers Retest per model. Probing on first use, not when an endpoint lists its models, avoids testing thousands of models nobody uses.

### Layout guard

- A figure layout stacks its text and media vertically when the text is much taller than the media (about twice the height). Otherwise it keeps today's side-by-side arrangement. The same guard applies whichever model wrote the reply, including stored replies.

### Visual writer

- The visual writer's prompt gains a text budget: at most a few short sentences, and short labels. Interaction comes by default when the idea has a meaningful variable to change, such as a slider, dragging or clicking. A static visual is right when controls would add nothing, and the writer decides which.
- The writer gets one tool, load_skill(name). Its prompt lists each loadable skill with a one-line description and says it must load the matching skill whenever that work applies. The loadable skills are:
  - **threejs**: a vendored excerpt of the three.js quick start and common mistakes, from CloudAI-X/threejs-skills.
  - **gsap**: the core and timeline pattern, from greensock/gsap-skills.
  - **motion-design**: the checklist and duration and easing tables, from LottieFiles/motion-design-skill.
- All three are MIT and recorded with their sources and licences beside the existing vendored skills. House style and frontend-design stay always given. design-dna is not used.
- **Enforcement**: if the writer's output uses three.js without threejs loaded, GSAP without gsap loaded, or any animation (GSAP, d3 transitions, CSS transitions or keyframes) without motion-design loaded, the server rejects it once and retries the writer with the missing skills already in its prompt.
- The sandbox bundles GSAP core (no plugins) beside d3 and three.js, still with no network. The step helper and d3 are unchanged.

### Videos

- **Plan through tool calls**: the smart model plans with start_video (title, description), add_area (layout area name and description), add_colour (palette role and ink, or true colour name and hex), add_object (name, look, position, optional colour role, optional reference query), add_term (exact term), add_cut (purpose, narration, engine, dimension, join, end state, optional emphasis), add_exhibit (cut, kind and that kind's fields) and finish_video. Each call is checked as it arrives against the same rules the plan check uses today, and a bad call gets a plain error naming the field.
- **Defaults**: a cosmetic problem gets a default instead of an error. A bad join becomes a scene change; missing recurring objects, terms or areas are empty; a 3D Manim cut becomes 2D.
- **Repair**: finish_video reports structural problems, such as no cuts or a cut without narration, so the model can add what is missing. If the model stops without a valid finish, it gets one retry with the problem stated, and the video then fails with that problem.
- The calls are assembled into today's plan shape, so set pieces, cut writing, narration and export are unchanged. The large plan JSON prompt and parser are retired for new videos.
- **Cut audit through tool calls**: flag_problem (cut, problem), flag_poor_piece (piece, reason) and pass_cut, assembled into today's issue shape. The fix flow is unchanged.
- Remotion cut writers always get the motion-design skill. Their 3D skill still comes from the plan, which already knows which cuts are 3D. Manim keeps its own skills.

### Errors, usage and model search

- **Real provider errors**: a failed visual or video stores and shows the provider's first error line, shortened and with secrets redacted, instead of a generic line. Repair attempts that the writer recovers from stay silent.
- **Usage**: media calls through custom endpoints now record their usage. Today usage is read only when the call carries tools.
- **Model search**: one shared model search is used in every model picker: endpoint settings, the chat model menu, model profiles, and the smart and quick thinking model settings. It uses fuzzy subsequence matching, ranked so that contiguous and early matches come first, and shows the top 50 results without a debounce. No new dependency.

### Later

- The quick thinking model's JSON jobs (the suggestion and verdict fallback and titles) move to tool calls under the same rule, after the chat and video work.

## Testing Decisions

- Tests check behaviour a learner or the app's boundaries can see: what the reply shows, where media lands, what gets saved, what a failed card says and what a provider receives. They never check prompt wording or internal call order.
- **Main seam: the app with a fake provider.** This is the pattern in the existing media request tests: a scripted generate emits reply text and makes the app's tool calls the way Claude and Codex do over MCP. It covers:
  - show_visual landing at its call position and starting before the reply ends
  - the queued continuation, including dropping a repeated prefix
  - record_turn saving next questions, suggestions, groundwork, concepts and verdicts, and the quick thinking fallback when the call is missing
  - start_discussion and make_video
  - plan calls with per-call errors, defaults, the finish check and the one retry
  - audit calls
  - load_skill, and the reject-once retry
  - the real provider error on failed cards
  - the `<tool_call>` text fallback and the broken-block forms through the shared reply parser
- **Second seam: the custom-endpoint adapter against the fake OpenAI server.** This is the pattern in the existing tool-loop and stream tests. It covers only what that adapter owns: the native call loop with mid-reply continuation, ending a turn after record_turn, the tool support probe and Retest, and usage recorded for calls without tools.
- **Unit and component tests**: the reply markup parser's broken forms, and the figure stacking rule as a plain function. The fuzzy scorer as a plain function, and a component test of the chat model menu's search. GSAP's availability inside the existing sandbox visual tests.
- Stored-reply rendering keeps its existing tests passing unchanged.

## Out of Scope

- Wrapping Hermes Agent or any outside agent harness. Only its conventions are copied.
- Provider strict, JSON-schema or constrained-decoding modes.
- Changing reply layouts in the tutor prompt, or removing any layout.
- Moving the verdict and notes to the quick thinking model.
- A second tutor prompt or per-model prompt tiers.
- GSAP plugins, design-dna, and the three.js skills beyond the quick start and common mistakes.
- Changing the visual timeout.
- Changing who writes media: ADR 0004 still holds.

## Further Notes

- Today's audit, from the trees database and the proxy logs: opencode and github/auto failed plans on single fields (`cut 2 join`, `styleBrief.recurringObjects`). A sonnet model through a proxy failed on a catalog error the app hid. Two opencode visuals timed out. Five replies showed raw `:::rabbithole-*` JSON. Codex made 9 of 9 videos.
- The research behind ADR 0013 found that native tool calls parse more reliably than free-text JSON for small models, and that prose and code read better outside JSON arguments. It also found that tool support varies across proxies, with calls leaking into text on Ollama and vLLM.
- Not verified: GitHub Models' tool support, and whether Claude and Codex can end a turn right after a tool call without one more short request.
