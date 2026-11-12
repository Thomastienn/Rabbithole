# Inline visuals, passage selection and reliable media

Agreed in a grilling session on 2026-11-11. Implementation order and tickets
live in the Beads epic that links this file.

## Problem Statement

Reading and learning in the focused chat has four rough edges:

- **Selecting a passage destroys it.** Highlighting tutor text with the mouse
  immediately opens the passage box; focus moves into its input and the browser
  clears the selection, so the learner cannot copy what they just highlighted.
  The passage box then repeats the passage as a quote, which is redundant noise.
- **Visuals are limited and feel bolted on.** The tutor can only produce Mermaid
  diagrams: boxes and arrows. Many ideas are better shown as charts, step-through
  simulations, timelines, 3D scenes, annotated code traces or comparisons.
  Diagrams render as separate cards after the whole reply, not where the idea is
  discussed, so they read like attachments rather than part of the explanation.
  They only start after the reply finishes and then run one at a time.
- **Requests fail silently.** A learner asked for a video; the tutor replied
  "I'll put together a short video", but nothing appeared. The tutor's video
  request block was rejected by strict validation and dropped without any card,
  reason or retry.
- **Failed replies cost retyping.** When a tutor reply fails or is cut off by a
  crash, there is no Retry; the learner must type the whole question again.

## Solution

- Highlighting a passage shows only an **Ask** button and leaves the native
  selection intact, so copying works. Clicking Ask opens the passage box and the
  passage stays painted as a highlight in the reply while the learner types. The
  box no longer shows the passage text visually.
- The tutor gains **visuals**: self-contained interactive HTML/SVG/JS fragments
  written by an isolated worker on the smart model and run in a locked-down
  sandbox with no network. Visuals appear exactly where the tutor placed them in
  the reply and blend into the chat: transparent, borderless, app fonts and
  colors, light and dark, full column width, height fitting content. Each visual
  starts generating the moment its request appears in the stream, in parallel
  with the reply and with other visuals.
- Videos take the same inline, borderless placement.
- Nothing fails silently: malformed requests are tolerated where safe, and any
  request that still cannot run shows a failed visual or video with its reason
  and Retry. Failed and crash-interrupted replies get Retry too.
- Each visual or video offers **Try a different version**.
- Clicking a tagged part of a visual creates a branch about that part, like
  asking about a passage.

## User Stories

### Passage selection

1. As a learner, I want highlighting tutor text to keep my selection, so that I can copy it with my usual shortcut.
2. As a learner, I want an Ask button to appear next to my highlighted passage, so that I can choose to ask about it.
3. As a learner, I want highlighting text not to open a text box by itself, so that a highlight made only to copy or reread does not interrupt me.
4. As a learner, I want the passage to stay visibly highlighted in the reply after I click Ask, so that I can see what I am asking about while I type.
5. As a learner, I want the highlight to clear when I create the branch or cancel, so that stale highlights do not clutter the reply.
6. As a learner, I want the passage box to show only my question input, without repeating the passage, so that the box stays compact.
7. As a screen reader user, I want the question input to still describe the passage, so that I know what I am asking about without seeing the highlight.
8. As a learner, I want the concept correction controls to stay in the passage box, so that I can still mark a concept as known or unknown.
9. As a learner, I want clicking a suggestion underline to keep opening the passage box directly, so that suggestions stay one click away.
10. As a keyboard user, I want keyboard passage selection to keep working with its Ask button, so that the change does not regress keyboard access.
11. As a learner, I want Escape to dismiss the Ask button and the highlight, so that I can back out quickly.

### No silent failures

12. As a learner, I want a video request to produce a visible video, or a visible failure with its reason, so that I never wait for something that will not come.
13. As a learner, I want a failed visual or video to offer Retry, so that I can try again without retyping my request.
14. As a learner, I want small formatting slips in the tutor's request (extra fields, over-long text) to be tolerated, so that requests succeed more often.
15. As a learner, I want a visual whose generated code is broken to be retried once automatically, so that one bad attempt does not reach me as a failure.
16. As a learner, I want a reply that failed to offer Retry, so that I do not have to retype my question.
17. As a learner, I want a reply cut off by an app crash or shutdown to offer Retry, so that I can recover it after restarting.
18. As a learner, I want Retry to replace the failed reply in place, so that my question does not appear twice in the conversation.
19. As a learner, I want Retry only on the latest reply, so that retrying never rewrites history that later turns depend on.
20. As a learner, I want a reply I stopped myself to keep its partial text without Retry, so that my deliberate stop is respected.
21. As a learner, I want Retry to use the conversation's current chat model, so that it behaves like asking again now.

### Visuals

22. As a learner, I want the tutor to show ideas as charts, simulations, timelines, 3D scenes, code traces or comparisons, not only graphs, so that each idea gets the visual that fits it.
23. As a learner, I want a visual to appear exactly where the tutor discusses the idea, so that text and visual read as one explanation.
24. As a learner, I want visuals to have no card, border or visible title and to use the reply's fonts and colors, so that they blend into the chat.
25. As a learner, I want visuals to follow light and dark appearance, so that they never clash with my theme.
26. As a learner, I want a visual to fill the reading column and grow to its content's height, so that I never scroll inside it.
27. As a learner, I want a quiet shimmer holding the visual's place while it generates, so that the reply does not jump when it arrives.
28. As a learner, I want reply text to keep streaming while visuals generate, so that I can keep reading.
29. As a learner, I want several visuals in one reply to generate at the same time, so that I do not wait for them one by one.
30. As a learner, I want visuals to start generating as soon as the tutor asks for them, so that they arrive soon after the text.
31. As a learner, I want stepped visuals in one reply to look consistent with each other, so that a sequence reads as one story.
32. As a learner, I want to interact with visuals (step buttons, sliders, hover details, play and pause), so that I can explore an idea myself.
33. As a learner sensitive to motion, I want animations to start paused or play once and to honor reduced motion, so that nothing loops at me.
34. As a keyboard user, I want every interactive part of a visual to work by keyboard, so that visuals are not mouse-only.
35. As a screen reader user, I want each visual labelled with its description, so that I get the idea in words.
36. As a learner, I want the tutor to visualize when structure, process, quantity, comparison or space would land better seen than read, so that visuals appear when they help.
37. As a learner, I want short factual answers and casual turns to stay text-only, so that visuals do not become noise.
38. As a learner, I want the tutor to always draw a visual when I explicitly ask, so that my request is honored.
39. As a learner, I want controls such as enlarge to appear only on hover or focus, so that visuals stay clean while reading.
40. As a learner, I want pressing Stop to stop the reply and every visual still generating, so that nothing keeps spending after I stopped.
41. As a learner, I want my existing Mermaid diagrams to keep rendering, so that past conversations are unchanged.
42. As a learner, I want visuals to keep working after reopening a conversation, reloading or restarting, so that they are durable.
43. As a privacy-minded learner, I want visuals to have no network access and no way to read the app or my data, so that generated code cannot leak or tamper with anything.
44. As a learner, I want visuals written by my smart model, so that they get the strongest model's quality.

### Videos inline

45. As a learner, I want a video to appear where the tutor placed it in the reply, without a card border, so that it blends in like visuals.
46. As a learner, I want a slim status line with the rendering stage and progress plus Cancel while a video renders, so that I know it is working and can stop it.
47. As a learner, I want a failed video to show its reason and Retry inline, so that recovery happens where the video belongs.

### Try a different version

48. As a learner, I want Try a different version on a visual, so that I can get another take if the first one does not click.
49. As a learner, I want the new visual to replace the old one in place, so that the reply stays uncluttered.
50. As a learner, I want Try a different version on a ready video, so that I can get another take on a video too.
51. As a learner, I want a replaced video to remain in the video library, so that regenerating never destroys a video I might want.

### Branch from a visual

52. As a learner, I want clicking a labelled part of a visual to create a branch about that part, so that I can dig into one piece, like asking about a passage.
53. As a learner, I want the branch's tutor to know exactly what I clicked and what the visual showed, so that it answers about the right thing.
54. As a keyboard user, I want clickable parts of a visual to be reachable and activatable by keyboard, so that branching from visuals is not mouse-only.
55. As a privacy-minded learner, I want a visual able to request only "branch on this part" from the app, nothing else, so that generated code cannot act on my behalf.

## Implementation Decisions

### Passage selection

- A pointer highlight inside a completed reply shows the floating Ask button
  (the existing keyboard-path button) instead of opening the passage box. The
  native selection is not cleared.
- Clicking Ask opens the passage box and paints the passage as a non-selection
  highlight in the reply (the CSS Custom Highlight API fits: it highlights a
  Range without changing the DOM or the reply text). The highlight clears when
  the branch is created, the box is cancelled or Escape is pressed.
- Suggestion underlines keep opening the passage box directly, painting the
  same highlight.
- The passage quote in the passage box becomes screen-reader-only. The question
  input keeps describing it. Concept correction controls stay visible.
- Passage offsets, raw reply text and branch creation are unchanged.

### Request parsing and failure visibility

- The tutor's fenced request blocks stay the request channel. Parsing becomes
  tolerant: unknown keys are ignored and over-long string fields are trimmed to
  their limits. A request with missing or empty required fields, invalid JSON or
  an unclosed fence is still rejected.
- Every rejected request becomes a stored failed artifact with a learner-facing
  reason, for videos as well as visuals. No request is dropped silently.
- Failed visuals and videos offer Retry, an explicit learner action that reruns
  the worker from the stored request. Startup recovery still never retries or
  replays generation by itself.
- A worker output that fails validation gets exactly one automatic retry within
  the same turn before being stored as failed.

### Reply retry

- Messages record why they stopped streaming. A learner Stop is distinguishable
  from a failure and from a crash or shutdown (startup recovery's
  `streaming` to `interrupted` rule).
- The latest assistant reply in a conversation offers Retry when it failed or
  was interrupted by crash or shutdown. Retry is not offered after a learner
  Stop or on earlier replies.
- Retry resends the preceding learner message with the conversation's current
  chat model and effort, replacing the failed reply in place: the learner
  message is not duplicated, and the failed reply's artifacts are discarded.
  Video library entries are never discarded.
- A new endpoint carries this action, following the existing per-conversation
  action routes and the CSRF rule.

### Visual artifacts

- A new artifact kind for visuals sits beside `mermaid` and `video`. The
  artifact kind constraint is migrated in place, the same way the `interrupted`
  status was added. Existing Mermaid artifacts keep rendering through the
  current diagram renderer. New replies stop using the Mermaid worker.
- The tutor keeps one request block format (title, description, intent,
  excerpt) for visuals. The tutor instructions change to say: visualize
  structures, processes, quantities, comparisons and spatial ideas that land
  better seen than read; one visual per idea; none for short factual or casual
  turns; always when explicitly asked; place each request block where the visual
  belongs, as early as that is.
- Each artifact records its position in the stored reply text: the offset where
  its request block was removed. The reply text and passage offsets stay exactly
  as today. Artifacts without a position (all existing ones) render after the
  reply as now.
- History projection is unchanged in spirit. Later tutor turns see a visual
  only as artifact id, title and description, never its source.

### Visual worker

- One worker call per visual, using the smart model's selection and effort.
  It starts the moment its request block closes in the stream, while the tutor
  is still writing. At most 3 run at once per running reply. The rest queue in
  reply order.
- Each worker receives the frozen request plus the titles of earlier visual
  requests in the same reply, so stepped visuals stay consistent.
- Stop aborts the reply and every pending or running visual of that turn. Those
  artifacts become canceled, not failed, and their placeholders disappear.
- Worker permissions reuse the existing tutor and diagram restrictions: no
  tools, no files, no shell, one turn.
- The worker prompt is based on CopilotKit/OpenIntelligentUI (MIT): its main
  generative-UI prompt plus the "Interaction and quality", "Data and
  calculations" and "Controls and layout" sections of its advanced-visualization
  skill. The MIT notice is kept beside the prompt.
  - Remove: its streaming tool contract and parameter order, its sandbox
    bridge calls, CDN and dynamic imports, maps and trip-animator sections,
    `query_data`/A2UI references, gsap and chart.js.
  - Add rules written in our own words: return a fragment only (no html, head
    or body); transparent background; only the injected theme tokens and fonts;
    must work in light and dark; no fixed-height root; narrow reading column of
    about 400–700 px; no network, remote resources, links or images; preloaded
    libraries only; one visual per snippet; animation starts paused or plays
    once and honors reduced motion; everything keyboard-operable; clickable
    parts tagged with a short label and a one-line explanation.
  - That repo's SVG-diagram skill and every leaked or unlicensed prompt,
    including copies of Anthropic's claude.ai widget guidelines, are not used
    verbatim. Their design ideas may be restated originally.
- Server-side validation before storing: size limit, fragment only, no network
  APIs, remote URLs or document-level tags, references only preloaded
  libraries. The sandbox is the real security boundary. Validation exists to
  catch mistakes early and trigger the one automatic retry.

### Sandbox and rendering

- This deliberately reverses the diagram contract's "SVG data image, never
  injected HTML" rule for the new kind only. The main app CSP stays unchanged.
  It gains only permission to frame the sandbox page.
- Visuals render in an iframe with `sandbox="allow-scripts"` and never
  `allow-same-origin`, so they have an opaque origin with no access to app
  cookies, storage, DOM or API. The sandbox page has its own CSP: no
  connect/fetch, no frames, no remote resources; scripts only from the app's
  bundled libraries plus the visual's own code.
- The sandbox preloads mermaid, three.js, KaTeX and d3 (d3 is a new dependency)
  and injects the current theme tokens and fonts. It re-injects them when
  appearance or color scheme changes.
- A narrow, validated postMessage protocol between app and sandbox: the app
  sends source and theme; the sandbox reports content height and branch
  requests only. Messages are checked against the specific frame's window and
  a fixed shape. Everything else is ignored.
- Placement: rendered inside the reply at its recorded position, full column
  width, no card chrome, height following reported content height. The
  description is the frame's accessible label and is not shown visually. A
  shimmer roughly one short paragraph tall holds the position while pending.
  Hover and focus reveal enlarge and Try a different version.
- Map previews keep their compact title rows and never load the sandbox.

### Videos inline

- Videos use the same position recording and inline borderless placement.
- While pending, a slim status line shows the existing video phase and
  progress fraction, plus Cancel. Failed videos show reason plus Retry inline.
  The native player, library and recovery behavior are unchanged.

### Try a different version

- Available on ready visuals and ready videos through a hover or focus
  control. It reruns that artifact's worker from the stored request plus an
  instruction to take a different approach than the previous version.
- Visuals: the new source replaces the old in place. No version history.
- Videos: the artifact gets a new job; the previous ready video stays in the
  video library as its own entry; the chat shows only the newest.

### Branch from a visual

- Workers tag clickable parts with a short label and a one-line explanation.
  The sandbox makes tagged parts focusable and activatable by keyboard and
  pointer, and posts only "branch on this part" with that label and explanation.
- The app validates the message (known frame, ready visual, bounded strings)
  and opens the passage box with the clicked part as a visual passage.
- Branch creation stores, as the branch passage text, the visual's title,
  description, the clicked label and its explanation. Inherited context is
  compacted as today. No screenshot or image input is involved.
- A branch from a visual has no text offsets in the reply. The branch record
  marks it as coming from that visual artifact so the map, reopen and
  "explored" state work without inventing offsets.

## Testing Decisions

- Good tests drive public behavior only: HTTP requests and responses, stored
  state visible through the API, and what the built UI shows and does. No
  assertions on internal helpers or private shapes.
- **HTTP integration seam** (temporary SQLite store, `createApp`, fake
  providers; prior art: the artifact and video integration tests). It covers:
  - tolerant parsing and visible failures for visuals and videos
  - reply Retry eligibility: failed, crash-interrupted, learner-stopped,
    latest only
  - in-place replacement with no duplicate learner message
  - workers start when their block closes, before the reply ends
  - concurrency cap of 3
  - Stop cancels all visuals
  - one automatic retry on invalid worker output
  - recorded positions, with reply text and offsets unchanged
  - Try a different version for visuals and videos, with old videos kept in
    the library
  - the visual-branch passage content and validation
  - existing Mermaid artifacts still served
  - migration of an existing database
- **Focused UI check seam** (built UI, fixture provider, agent-browser, no paid
  inference; prior art: the passage popup and diagram rendering checks). It
  covers:
  - pointer highlight keeps the native selection and shows only Ask
  - highlight persists while typing and clears afterwards
  - quote hidden visually but still describing the input
  - visuals render inline at position, transparent, auto-height, in light and
    dark
  - shimmer while pending
  - hover and focus controls
  - a hostile fixture visual cannot fetch, read app storage or post anything
    except the allowed messages
  - keyboard operation of tagged parts and branch creation from a visual
  - inline video status, Cancel and Retry
- One gated live smoke check against a real provider confirms a real visual
  request renders, following the existing live verification scripts. There is
  no broad E2E suite.

## Out of Scope

- The original epic deferred "Check yourself" to TreeTutor-zjq; its later scope
  is recorded below and does not change the original epic's acceptance.
- A visuals library or version history for visuals.
- A "Visualize" action on passages; asking already covers it.
- Speculatively starting workers when the learner sends a message.
- Migrating or regenerating existing Mermaid diagrams.
- Retry on earlier replies or on learner-stopped replies.
- Screenshot or image input for branches from visuals.
- Changing how videos are generated, narrated or stored.

## Check yourself extension (TreeTutor-zjq)

Revisited after the visual worker shipped. Reuse an ordinary visual request and
the isolated smart worker; no new artifact kind, endpoint or saved quiz state.
The tutor may offer one short optional prediction when a next step or
cause-and-effect outcome helps test an idea, after enough context to reason.
Explicit check requests and quiz opt-outs take precedence. Skip short factual
answers, casual turns and requests for a direct explanation. Continuing the
conversation never depends on answering or revealing.

The request's intent identifies a predict-then-reveal check; intent/excerpt carry
the precise question, correct outcome and reason. Visible prose, title and
description do not spoil the answer. The visual shows its starting state and
question, with the answer, resulting state and explanation inside an initially
closed native details/summary labelled **Reveal answer**. Enter and Space open
and close it; hidden content stays out of the initial accessibility tree.
Reveal controls are not branch controls. This is private self-checking, with no
submitted answer, grading, familiarity update, timer or inference on reveal.
Reload resets the disclosure to closed while retaining the generated source.
Explicitly revealing a saved branch source inside an answer opens its containing
disclosure before focusing that part.

Verify HTTP request/worker/persistence/history boundaries, then focused built-UI
hidden/revealed states, keyboard controls, auto-height, no reveal calls/branches,
reload without inference and desktop/narrow in both appearances. A gated native
smoke distinguishes real tutoring and generated interaction from fixtures.

## Further Notes

- "Visual" is a new domain term for the interactive HTML/SVG/JS artifact kind.
  Add it to the glossary when implementing; avoid "widget", "canvas" and
  "artifact" in UI copy.
- The failed video request that triggered this work: the tutor promised a
  video, the stripped block left a trailing newline in the stored reply, and no
  artifact row exists. The exact rejected block was not recoverable.
- Prompt research details and license notes came from a review of
  CopilotKit/OpenIntelligentUI, LibreChat, llamacoder, anthropics/skills and
  several repos copying leaked prompts. Only MIT and Apache sources are
  reusable.
- Another session was editing the focused chat's passage code on 2026-11-11.
  The selection ticket should start from that work once it is committed.
