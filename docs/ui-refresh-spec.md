# UI refresh and cheaper suggestions

## Problem Statement

The learner finds the current workspace confusing and more expensive than it needs to be.

- The learning tree list is hidden. The only way to reach it is a map menu item, and it shares one sidebar with settings, connections and map help, so the list reads like a long chat settings drawer instead of navigation.
- A Learning/Knowledge tab row takes a full row of the screen for a switch the learner rarely uses.
- Settings are scattered in the same sidebar as the tree list, ungrouped.
- Conversation nodes on the map show questions and replies in the same style, so it is hard to tell who said what.
- Folding a conversation node removes its branches and leaves only a small "N hidden branches" line, so the learner cannot see where hidden branches came from.
- The focused chat is not organized: question, reply, artifacts, usage and status are stacked with little hierarchy, and the panel width is fixed.
- Diagrams render at natural size inside a small scroll box, so they do not scale with the slim chat panel and cannot be enlarged.
- Child conversations do receive inherited context, but the learner cannot see what it contains.
- New conversations silently use whatever model the learner's own Claude Code configuration defaults to (for this learner, the most expensive one), and Codex likewise uses the account default.
- The suggestion model is sent every tutor reply twice (once as text, once as a word-offset table) and must return character offsets. Picks with a wrong offset are silently dropped, and the remaining picks often feel random or too long.

## Solution

- A collapsible learning tree sidebar, open by default on desktop, containing only "New chat", the tree list grouped by date, a "Knowledge" entry and a settings gear. The tab row goes away.
- Settings open in a modal floating window with grouped side tabs: Models, Connections, Interface and Usage, redesigned rather than only moved.
- Conversation nodes and the focused chat both read like a chat: the learner's questions right-aligned in a tinted bubble whose tint the learner picks in Settings, tutor replies left-aligned.
- Folded conversation nodes keep a short branch stub per hidden child, leaving from its passage and ending in an eye-slash button that expands the fold.
- The focused chat gets a clear turn structure and a draggable divider that starts slim.
- Diagrams fit the panel width and open enlarged on click; videos get an "Open large" view.
- Child conversations show their inherited context in a collapsed, read-only section.
- Claude defaults to Sonnet and Codex to GPT-6.1 Terra, always sent explicitly and saved on the conversation.
- The suggestion model receives the reply once and returns only exact terms or short phrases; the server finds them in the reply.

## User Stories

### Learning tree sidebar

1. As a learner, I want the learning tree sidebar open by default on desktop, so that I can see and switch between my learning trees without hunting for a menu item.
2. As a learner, I want a collapse button in the sidebar header, so that I can give the map and focused chat the full width.
3. As a learner, I want an expand button pinned at the top-left of the workspace when the sidebar is collapsed, so that I can bring it back in one click.
4. As a learner, I want the sidebar's open or collapsed state remembered across reloads, so that the workspace opens the way I left it.
5. As a learner on a phone, I want the sidebar to open as a drawer from the same button, so that the map keeps the small screen.
6. As a learner, I want the sidebar to hold only "New chat", my learning trees, a "Knowledge" entry and a settings gear, so that it reads as navigation, not a settings page.
7. As a learner, I want my learning trees grouped under Today, Yesterday, Previous 7 days and Older by creation time, so that a long list stays scannable.
8. As a learner, I want each learning tree row to show how many branches it has, so that I can see which topics I explored deeply.
9. As a learner, I want the rename and delete actions on a row to appear on hover and on keyboard focus, so that the list is quiet until I need them.
10. As a keyboard user, I want the row actions reachable by Tab, so that hover is never the only way in.
11. As a learner, I want the current learning tree row highlighted, so that I know which tree the map shows.

### Knowledge entry

12. As a learner, I want a "Knowledge" entry in the sidebar instead of a top tab row, so that the workspace gains that row back.
13. As a learner, I want the Knowledge entry to open the knowledge graph as a full view and return me to the learning tree I left, so that visiting it does not lose my place.

### Settings window

14. As a learner, I want the settings gear to open a modal floating window, so that settings never crowd the tree list.
15. As a learner, I want settings grouped into Models, Connections, Interface and Usage side tabs, so that I find a setting by what it is about.
16. As a learner, I want the Models tab to hold the suggestion model choice and the concept-matching cost warning, so that every model decision is in one place.
17. As a learner, I want the Connections tab to hold Claude sign-in status and check, Codex/ChatGPT connect, and the custom endpoint form, so that every provider connection is in one place.
18. As a learner, I want the Interface tab to hold the bubble tint, the Vim canvas bindings toggle and the map help text, so that every look-and-control preference is in one place.
19. As a learner, I want the Usage tab to show today's usage, so that I can watch my spend.
20. As a learner, I want the settings content redesigned with clear section headings and descriptions, so that each tab reads as a designed page and not a moved list.
21. As a learner, I want Esc, a close button and a backdrop click to close the settings window, so that leaving it is obvious.
22. As a keyboard user, I want focus trapped inside the settings window while it is open and returned to the gear when it closes, so that I never lose my place.
23. As a learner on a phone, I want the settings window full-screen, with the side tabs as a list I tap into, so that it fits the screen.
24. As a learner, I want "Help" in the map menu to open Settings on the Interface tab, so that map help is still one click away.
25. As a learner, I want links that used to jump to custom endpoint settings to open the Connections tab with the endpoint form focused, so that those shortcuts still work.

### Bubble tint

26. As a learner, I want to pick my question bubble tint from about six theme presets, so that my questions stand out in a color I like.
27. As a learner, I want the presets to stay readable in light and dark themes, so that a tint never hides my text.
28. As a learner, I want the tint remembered on this browser, so that I pick it once.
29. As a learner, I want one tint applied to both conversation nodes and the focused chat, so that my questions look the same everywhere.

### Conversation nodes on the map

30. As a learner, I want my questions right-aligned in my tinted bubble inside a conversation node, so that I can tell my questions from tutor replies at a glance.
31. As a learner, I want tutor replies left-aligned as plain text inside a conversation node, so that the node reads like a chat.
32. As a learner, I want branch lines to keep leaving from the tutor reply rows they came from, so that the map still shows which passage each branch explores.
33. As a screen reader user, I want each preview row still announced as a question or an answer, so that the new alignment is not the only cue.

### Hidden branches

34. As a learner, I want a folded conversation node to keep one short branch stub per hidden direct child, leaving from the passage that child came from, so that I can see where hidden branches start.
35. As a learner, I want each stub to end in an eye-slash icon button, so that hidden branches are obvious and not a small line of text.
36. As a learner, I want a stub's tooltip and accessible name to give the hidden child's title and how many more conversations are hidden beneath it, so that I know what expanding reveals.
37. As a learner, I want clicking any stub to expand the fold, so that I can reveal hidden branches straight from the map.
38. As a learner, I want "Collapse all", "Expand all" and "Keep current branch" to keep working with stubs, so that existing map controls behave the same.

### Focused chat layout

39. As a learner, I want my messages right-aligned in my tinted bubble with no "You" label, so that the focused chat matches the map.
40. As a learner, I want tutor replies left-aligned with no bubble, under a small "Tutor · model" header, so that I know which model answered.
41. As a learner, I want tutor reply text capped at a comfortable reading width, so that long replies stay readable when I widen the panel.
42. As a learner, I want each reply to show its text with suggestion underlines first, then its diagrams and videos, then its status line, so that every reply has the same order.
43. As a learner, I want the usage line moved into a quiet footer that shows on hover and on keyboard focus, and always on touch screens, so that metadata does not compete with the answer.
44. As a learner, I want each question and its answer grouped as one turn with a larger gap between turns, so that the conversation scans as question-answer pairs.
45. As a learner, I want streaming, failed and canceled states to stay visible on the reply they belong to, so that failures are never hidden.
46. As a learner, I want passage selection, "Ask about selection", suggestion underlines, child-branch links and passage corrections to keep working in the new layout, so that branching is not broken.

### Inherited context

47. As a learner in a child conversation, I want a collapsed "Inherited from *parent title*" section at the top of the focused chat, so that I can check what the tutor was told about the parent.
48. As a learner, I want that section to show the passage, my branching question and the condensed summary, so that I see the full inherited context.
49. As a learner, I want that section to be read-only, so that it matches the fixed snapshot the tutor actually received.
50. As a learner, I want root conversations to show no such section, so that it appears only where inherited context exists.

### Adjustable panel

51. As a learner, I want a draggable divider between the map and the focused chat, so that I can widen the chat for diagrams or videos and slim it for reading.
52. As a learner, I want the focused chat to start slim, so that the map gets most of the screen by default.
53. As a learner, I want the divider clamped between a minimum readable width and 70% of the workspace, so that neither side can disappear.
54. As a learner, I want the divider width remembered on this browser, so that my preferred split stays.
55. As a learner, I want double-clicking the divider to reset it to the default width, so that I can undo a drag quickly.
56. As a keyboard user, I want to focus the divider and move it with arrow keys, so that resizing does not need a mouse.
57. As a learner, I want the existing map-only and expanded chat modes to keep working alongside the divider, so that nothing I rely on goes away.

### Diagrams and videos

58. As a learner, I want diagrams to scale down to the chat panel width, so that a whole diagram is visible in the slim panel.
59. As a learner, I want diagrams never enlarged past their natural size inline, so that small diagrams stay crisp.
60. As a learner, I want clicking a diagram to open it near full-screen with zoom and pan, so that I can read detailed diagrams.
61. As a keyboard user, I want a diagram to be a button I can open with Enter or Space, so that enlarging does not need a mouse.
62. As a learner, I want the Mermaid source to stay collapsed under the diagram and open only when rendering fails, so that source is there when I need it.
63. As a learner, I want videos to have an "Open large" button that plays them in a near full-screen view, so that I can watch generated videos properly.

### Default models

64. As a learner, I want new Claude conversations to use Sonnet unless I pick another model, so that I never pay for the most expensive model by accident.
65. As a learner, I want TreeTutor to ignore my own Claude Code default model, so that my coding setup does not change my tutoring cost.
66. As a learner, I want new Codex conversations to use GPT-6.1 Terra when my account lists it, so that Codex starts on a sensible model.
67. As a learner whose Codex account does not list GPT-6.1 Terra, I want the account default used and a note under the model picker, so that I know why the default differs.
68. As a learner, I want the model picker to show the model a conversation will actually use from the start, so that what I see is what I am billed for.

### Suggestions

69. As a learner, I want the suggestion model sent each tutor reply only once, so that suggestions cost fewer input tokens.
70. As a learner, I want the suggestion model to return only the exact terms or short phrases it picked, so that it outputs less.
71. As a learner, I want TreeTutor to find each picked phrase in the reply itself, so that a correct pick is never lost to a miscounted offset.
72. As a learner, I want a phrase that appears several times anchored to the occurrence the model listed in reading order, so that the right mention is underlined.
73. As a learner, I want a phrase that differs from the reply only in whitespace still found, so that line breaks do not drop good picks.
74. As a learner, I want picks the reply does not contain dropped, so that underlines always match real text.
75. As a learner, I want suggestions limited to terms or short phrases of one to six words, so that underlines are never whole sentences or sections.
76. As a learner, I want suggestions to pick terms the reply uses but does not explain, that matter for my question, so that underlines point at real gaps.
77. As a learner, I want terms the reply defines in place, everyday words, the topic of my own question and concepts I already know well skipped, so that underlines are not noise.
78. As a learner, I want low-familiarity concepts preferred, so that suggestions follow what I actually do not know.
79. As a learner, I want no fixed cap on the number of suggestions, so that a dense reply can still get every useful underline.
80. As a learner, I want concept and concept-link extraction for the knowledge graph to keep working, so that familiarity keeps updating.
81. As a learner, I want evidence that the new suggestion format costs less and picks better on my own saved replies, so that the change is proven and not assumed.

## Implementation Decisions

### Delivery order

One Beads epic with eleven tasks, implemented in this order: default models; phrase-matched suggestions with the comparison run; sidebar and tree list; settings window; bubble tint; chat-style conversation nodes; hidden-branch stubs; focused chat layout; inherited context section; draggable divider; diagram and video enlarge. The two cost fixes go first. Bubble tint precedes the two chat-style tasks that use it. The rest are independent of each other.

### Default models

- The Claude provider always passes a model to the CLI. When a conversation has no stored model, it passes the provider's default (`sonnet`), so the learner's Claude Code configuration never chooses the tutoring model. The Claude model list stays Opus, Sonnet and Haiku; Fable is not added.
- The Codex provider's default is `gpt-6.1-terra` when the account's model list contains it; otherwise the account default from the model list. The models response flags the fallback so the picker can show a note.
- A new conversation stores the resolved default model at creation, so the stored model, the picker and the billed model agree. Existing conversations with a null model resolve the same default on their next reply.
- The suggestion model setting and its own cheap-model defaults are unchanged.

### Suggestions

- The suggestion request sends the reply once. The word-offset table is removed from the request.
- Output contract: `{"suggestions":[{"text":"<exact phrase>","concept":"<optional>"}],"concepts":[...],"links":[...]}`. No offsets. Suggestions are listed in reading order. Concepts and links are unchanged.
- The server computes offsets. For each phrase in order:
  1. find the first occurrence at or after the end of the previous match;
  2. otherwise the first occurrence anywhere that does not overlap an earlier match;
  3. otherwise a match that treats any run of whitespace in the phrase as any run of whitespace in the reply;
  4. otherwise drop it.
  A matched span must still pass the existing exact-slice and surrogate-boundary check before it is kept. Stored suggestions keep their exact start, end and text, so branches, underlines and corrections are unchanged.
- Prompt rules: terms or short phrases of one to six words; used but not explained in the same reply; relevant to the learner's question; skip terms defined in place, everyday words, the question's own topic and concepts at familiarity 0.8 or higher; prefer low familiarity, then centrality. No count cap. Numbered section headings and whole sentences are no longer picked.
- Unparseable output still fails the call. Individually unmatched or overlapping phrases are dropped. Usage is still recorded on success and failure.
- A one-off comparison runs the old and new prompts on about five saved tutor replies from local data and records picks, input and output tokens and dropped-pick counts as verification evidence.

### Sidebar, tree list and Knowledge

- The top Learning/Knowledge tab row is removed. Knowledge becomes a sidebar entry that opens the knowledge graph as a full view in the workspace; leaving it returns to the previous learning tree.
- The sidebar is open by default above the mobile breakpoint, collapsed by default below it, and its open state is stored in browser storage like the existing Vim preference.
- Settings, Connections and map help leave the sidebar. The map menu's "Learning trees" item becomes the sidebar toggle; "Settings" and "Help" open the settings window.
- Tree list grouping uses the stored creation time of root learning trees. Group boundaries are calendar days in the learner's local time. Branch count is the number of descendant conversations, derived from data already loaded. No schema change.
- A small pure module provides grouping and counting so it can be tested without a browser.

### Settings window

- A modal dialog component from the design system, large on desktop and full-screen on mobile, with vertical side tabs.
- Tabs and contents: Models (suggestion model settings, concept-matching cost warning); Connections (Claude sign-in status and check, Codex/ChatGPT connect, custom endpoint settings); Interface (bubble tint, Vim canvas bindings, map help); Usage (today's usage).
- Existing settings components are reused inside the tabs and restyled; their behavior and API calls do not change.
- The window can open on a given tab with a given control focused. Existing shortcuts to custom endpoint settings open Connections with the endpoint form focused.

### Bubble tint

- About six presets mapped to design-system color tokens (accent, blue, green, purple, amber, neutral). No raw colors and no free color picker.
- Stored in browser storage. Applied through one CSS custom property consumed by both conversation nodes and the focused chat.

### Conversation nodes

- Preview rows keep chronological order. Question rows align right in the tint bubble; reply rows align left. Per-message branch handles stay on the reply rows. Screen-reader "Question:"/"Answer:" prefixes stay.

### Hidden-branch stubs

- Folding stays per conversation node and still hides every descendant.
- A folded node renders, for each hidden direct child, a short edge from that child's passage handle to a small marker node holding an eye-slash icon button. The marker's accessible name gives the child title and the count of further hidden descendants. Activating any marker expands the fold.
- The text line "N hidden branches" is removed.
- Marker computation lives with the existing hierarchy logic and is testable without a browser.

### Focused chat layout

- Uses the existing chat message components. Learner messages: right-aligned tint bubble, no sender label. Tutor replies: no bubble, header "Tutor · model", capped reading width.
- Per reply order: text with suggestion underlines, artifacts, status. The usage line moves to a footer visible on hover and on focus-within, always visible on devices without hover.
- Turn grouping: a question and its reply share a tight gap; turns are separated by a larger gap.
- Selection, "Ask about selection", underlines, child links and passage corrections keep their behavior.

### Inherited context section

- Shown only in child conversations, collapsed by default, at the top of the focused chat message list. Label: "Inherited from *parent title*". Body: the passage, the learner's branching question and the condensed snapshot as plain text. Read-only.
- The conversation response already carries the branch passage, question and snapshot; no API change is expected.

### Draggable divider

- Replaces the fixed chat panel width. Default 26rem. Clamped to a 22rem minimum and 70% of the workspace maximum. Stored in browser storage. Double-click resets to the default. The divider is a focusable separator with arrow-key resizing and correct value attributes.
- Map-only and expanded chat modes remain. The divider is hidden on mobile, where the chat takes the full width as today.
- The clamp and step math is a small pure function so it can be tested without a browser.

### Diagrams and videos

- Inline diagrams fit the panel width, keep their aspect ratio and are never upscaled past their natural size. The fixed-height scroll box is removed.
- The diagram image is a button. Activating it opens a near full-screen modal with zoom and pan. The same modal pattern gives videos an "Open large" view.
- Mermaid source stays a collapsed section, open by default only on render failure. Rendering stays in the browser as a sanitized SVG image; no server-side image step.

## Testing Decisions

- Good tests exercise external behavior through the highest existing seam: HTTP requests against the app with fake provider launchers, or exported pure functions. They do not assert component internals, class names or prompt wording beyond the documented contract.
- Seam 1, the HTTP app with fake providers (prior art: suggestion, model and branch tests):
  - new Claude conversations send `sonnet` to the CLI even when the environment's Claude configuration names another model;
  - Codex uses `gpt-6.1-terra` when listed and the account default plus a fallback flag when not;
  - the stored model matches what was sent;
  - the suggestion request no longer carries a word-offset table;
  - phrase-only output is anchored correctly in order, for repeats, for whitespace differences and for overlaps, and unmatched phrases are dropped;
  - concepts, links and usage are still saved;
  - child conversation responses carry passage, question and snapshot.
- Seam 2, pure UI logic modules run under the Node test runner (prior art: canvas, layout and layout-save tests):
  - tree list date grouping across day boundaries and branch counts;
  - divider clamp, reset and arrow-key steps;
  - hidden-branch marker computation for folded nodes, including nested folds.
- Visual and interaction work (sidebar, settings window, tint, bubbles, chat layout, enlarge views) has no automated browser or end-to-end tests. Each such task is checked with the type-checked production build, the design-system doctor on the built output and one screenshot pass, recorded as verification evidence.
- The suggestion comparison run is recorded verification evidence, not an automated test.

## Out of Scope

- A cap or user setting for the number of suggestions.
- Section headings or whole sentences as suggestions.
- Adding Fable to the Claude model list.
- Editable tutor instructions, or any change to how the Claude CLI is isolated.
- An API-key path for Claude.
- Ordering or grouping learning trees by last activity, or any message timestamp schema change.
- Search in the tree list.
- A free color picker or custom tint colors.
- A non-modal or draggable settings window.
- Per-branch folding; folding stays per conversation node.
- Swapping the map and chat sides.
- Server-side diagram rendering.
- Inherited context shown on conversation nodes, or editing it.

## Further Notes

- Domain terms follow the glossary: learning tree, conversation, conversation node, focused chat, branch, passage, suggestion, suggestion model, inherited context.
- The default-model fix addresses a live cost bug: the Claude CLI was falling back to the learner's own Claude Code default model.
- The suggestion change keeps stored suggestion data and branch anchors exactly as they are; only the model contract and the server-side anchoring change.
- UI tasks use the Impeccable skill with Astryx components and tokens, following the project's no-raw-div and no-raw-color rules.
