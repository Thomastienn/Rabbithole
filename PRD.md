# Rabbithole — Product Requirements

Status: Map-first requirements agreed on 2026-11-08; Claude made the default provider alongside Codex on 2026-11-09. The owner clarified on 2026-11-09 that New chat opens a map with one visible root conversation, map nodes show the whole conversation, and branch lines attach beside their source message. On the same day the owner accepted three additions for after the text release (rich reply rendering, rename and delete, and a custom OpenAI-compatible endpoint) and the optional Vim canvas mapping in docs/vim-bindings-proposal.md. Later on 2026-11-09 the owner replaced the branch-suggestion design with Break down, token stats and a knowledge graph, specified in docs/break-down-spec.md for a new epic after Product 1.0. The user subsequently authorized autonomous backlog implementation; see AGENTS.md for standing authorization. Existing implementation and verification are recorded in Beads and docs/verification; this document defines the target behavior, not current completion. On 2026-11-15 the owner renamed the product Rabbithole and refocused it on curious self-learners (see PRODUCT.md); the code, package, data directory, `TREETUTOR_*` variables and Beads IDs still use TreeTutor until a separate rename.

Design authority: the [visual identity spec](docs/visual-identity-spec.md) owns the general visual direction. The owner's 2026-11-11 [workspace and media refinement spec](docs/workspace-media-refinement-spec.md) supersedes its conflicting focused-chat, passage-popup, rail/search, usage and media rules within that scope. Behavior and acceptance criteria in this PRD stay binding.

## Relationship to the original idea

IDEA.md remains the original vision: connected subproblem conversations that branch recursively, with Codex and Claude, optional automatic branch suggestions, Mermaid diagrams, Remotion videos, and potentially a custom OpenAI-compatible endpoint. This PRD makes the initial release text-first with manual passage selection, supporting Claude (default) and Codex through the learner's existing subscriptions, including cross-provider switching. Suggestions, media, rich reply rendering, rename and delete, Vim bindings, and the custom endpoint are later increments. Parent and child conversations can both continue chatting and branching; conversations are not limited to leaf nodes.

## Audience

Curious self-learners exploring ideas for their own sake, with no technical background assumed. The owner set this on 2026-11-15, replacing the earlier student framing: no exam, syllabus or deadline pressure; understanding checks happen only when the learner asks. See PRODUCT.md.

## Delivery

Rabbithole is a local web app only. Hosted deployment and an installed desktop app are outside the product scope. The local app server binds to loopback by default.

## Providers

The current release supports Claude through the learner's existing Claude subscription, using the official user-installed Claude Code CLI with its native sign-in, and Codex through the learner's existing ChatGPT subscription. Claude is the initial default provider; Codex remains available. The agreed workspace refinement adds a chat provider/model default in Settings for new learning trees; changing it leaves existing conversations unchanged. Do not silently substitute API-key access for either subscription provider.

As a later increment, the learner can add one custom OpenAI-compatible endpoint by entering its base URL and API key in settings. It is an explicit choice that appears as a third provider in the model menu, never a fallback for Claude or Codex. The key stays in a local owner-only file; it is never returned to the browser, logged, or stored with learning trees. Conversations can switch between the custom endpoint, Claude and Codex with the same continuity rule.

Provider and model selection share the compact model menu. A signed-out provider shows an actionable sign-in message rather than a nonfunctional choice.

The agreed workspace refinement exposes quick thinking, chat default and smart model roles in Settings, each with independently configurable model and supported effort choices from any connected provider, including the custom endpoint. Quick thinking handles suggestions and branch compaction, preserving the existing suggestion choice and inexpensive provider defaults. Smart handles inline visuals and private video scripts, scenes and animation code. Its model and effort initially follow the corresponding Settings chat defaults through "Same as chat default" choices; each can be overridden independently. Conversation overrides do not change global defaults. Merely configuring a role starts no calls.

Child conversations inherit their parent's current provider, model and effort. Learners can change model, provider and supported effort within an existing conversation while preserving visible messages and the conversation's existing context, including inherited branch context. New learning trees resolve the Settings chat defaults; later changes to those defaults do not alter existing conversations. The new provider must be able to continue the discussion using that history.

## Local persistence and learning trees

- Support multiple separate learning trees, similar to multiple conversations in a chat app.
- Automatically save learning trees locally, including conversation messages, branch relationships, inherited context snapshots, and canvas box positions.
- Restore saved trees when the app is reopened so learners can resume their work.
- Restore each tree's collapsed branches, map position/zoom, selected conversation, and chat panel mode (collapsed, beside the map, or expanded). Store only the current compact layout state per tree, using conversation IDs and fold overrides rather than copied messages or a history of interactions. Reuse the existing saved viewport and box positions rather than duplicating them.
- Apply layout changes immediately in the UI, but coalesce layout persistence into at most one write per minute when changed. This cadence applies to layout only; message persistence remains unchanged. An unexpected close can lose the most recent unsaved layout changes.
- Local storage does not imply offline inference: model requests use the selected provider.

## Problem

An LLM explanation often introduces concepts the learner does not understand. Asking about them in the same conversation interrupts the original thread. Opening a separate chat takes time and loses the connection between the original explanation and the follow-up.

Example: A learner asks about tournament trees, encounters Peterson in the explanation, and needs to explore that concept before continuing.

## Desired experience

Let learners ask connected side questions inside a conversation, similar to a `/btw` interaction. Preserve the relationship between the original topic and the side discussion.

## Canvas and conversations

- Initially, learners highlight any text in a response and ask about it to create a child conversation. This flow must also work through the keyboard.
- Immediately focus the new child conversation when it is created.
- Parent and child conversations remain on the same canvas, with visible branch connections.
- Each conversation appears as a small box that the learner can move around the canvas.
- Learners can navigate the canvas to explore different branches.
- Mouse navigation: drag empty canvas space to pan, use the mouse wheel to zoom around the cursor, drag a conversation box to reposition it, and click a conversation box to open its focused chat. A drag must not also open the conversation.
- Keep a compact map control strip: minus, current zoom percentage, plus, a small fit icon, and a menu for tree selection/creation, expand-all, collapse-all, keep-current-branch, settings, and help. Retain full keyboard access. Remove the large persistent brand/tagline header and always-visible navigation instructions to give space back to the map.
- The map is the primary workspace: opening a tree shows the map filling the available workspace with a compact toolbar and a collapsible learning tree rail. The rail honors the browser's open/closed preference and starts open in a fresh desktop browser, as defined by the visual identity spec; narrow windows use a closed drawer. The sidebar lists saved chats under a single New chat action; creating a tree asks for no name. Connection settings open on demand.
- Conversation boxes show their title, a small activity indicator, and the whole conversation: every question and answer, in order, as compact previews. Derive previews from existing messages rather than persisting duplicate text. Source passage text and extra actions are revealed on demand; branch connections remain visible.
- Truncate a long message in its preview, ending the truncated text with an ellipsis (…), but never omit a message: every message of the conversation stays visible in its box. Opening the conversation shows the full messages.
- Each branch connection leaves its parent box beside the message the branch was created from, and stays beside that message as the box grows, folds or moves.
- Learners can collapse or expand a node's descendants while keeping that node visible, with a small indicator when descendants are hidden. Provide expand-all and collapse-all actions without permanently expanding the compact toolbar.
- A small chevron beside the node title folds or unfolds descendants; clicking the rest of the node opens its conversation. Keep the chevron action distinct from opening or dragging the node, and show a tiny activity dot beside the title.
- Provide a keep-current-branch action: preserve the path from the root to the current conversation and its descendants, while collapsing side branches along that path.
- Selecting a conversation opens its chat in a side panel alongside the map. Learners can expand the chat to fill the workspace or collapse it to the side to give the map more room.
- Use one chat side panel: selecting another node switches that panel to the selected conversation. The panel takes space beside the map rather than covering it; the map remains available for panning, zooming, and selecting nodes. Smoothly bring the selected node into view when needed so it remains visible beside the panel.
- When the window cannot comfortably fit both map and chat, chat fills the workspace; a back/collapse control returns to the map.
- New chat creates a learning tree immediately and opens its map showing a single root conversation box, with that conversation open in the chat side panel. The root shows a placeholder title until the first question is sent, then takes its title from that question. Creating a child makes it visible and opens it immediately in the chat side panel.
- Returning from expanded chat restores the map's previous position and zoom.
- Animate transitions smoothly between the map, side-panel chat, and expanded chat so navigation feels continuous rather than abrupt.
- Keep chat controls compact: a model icon opens a small model-selection menu rather than a full-width selector. Show passage-branching actions only when text is selected, while retaining keyboard access to text selection and branching.
- Conversations remain available to revisit and continue later.
- As a later increment, learners can rename any conversation, delete a whole chat, and delete a branch together with its descendants. Each delete asks for confirmation, names what will be removed and states that it cannot be undone. Deleting a branch leaves its parent conversation unchanged.
- Any child conversation can create further child branches, with no product-imposed nesting depth limit. Every depth uses the same chat controls and compact inherited-context rule.
- Place new child boxes automatically to the right of their parent, level with the message the branch was created from. Offset placement when necessary to keep boxes readable and unobscured, including when a box grows as its conversation continues.
- Learners can reposition boxes manually. Branch connections retain their association with the source passage after movement.
- Different conversation boxes can generate responses concurrently. A response in progress must not prevent navigating to or chatting in another branch.

## Keyboard access

Every action must be available through keyboard bindings, including canvas navigation, conversation selection, zooming, branching, and chatting. Specific bindings remain to be decided.

Use standard keyboard interactions initially. As a later increment, add the opt-in Vim canvas aliases agreed in [vim-bindings-proposal.md](docs/vim-bindings-proposal.md): default off, active only while the map or a conversation box itself has focus, and never intercepting text entry, selection, menus, dialogs or media controls.

## Child conversation context

- Generate compact context on demand when the learner creates a child branch.
- Use the quick thinking model to combine the parent's fixed inherited context with the parent conversation into a compact paragraph for the new child. Preserve important ideas rather than forcing a tiny word budget; the owner rejected the proposed 80–150-word target. Ancestor discussion arrives through the parent's existing summary, recursively at every depth.
- Preserve the exact selected passage separately. Context preparation summarizes existing discussion without answering the new question or introducing a new explanation; the child's first learner message carries that question separately.
- Fix inherited context at branch creation; later parent messages do not automatically change it.
- Preserve original conversation messages so summarization does not replace the source history.
- Child discussions remain side context. Do not inject their messages or summaries into the parent conversation; returning to the parent leaves its model context unchanged.

## Future direction

The agreed workspace refinement adds historical usage graphs covering multiple
years and all time. Retain usage counts, dates, provider/model and task type
independently of learning-tree, conversation and video deletion, without keeping
deleted text or video content. Content deletion must not reduce historical usage
totals. Missing provider measurements remain unavailable rather than invented.

Automatic suggestions for concepts or passages worth branching into are an explicit long-term product goal. The initial version uses manual text selection. The selected later design is recorded in [break-down-spec.md](docs/break-down-spec.md), which supersedes the earlier suggestions proposal: a suggestion model underlines likely-confusing terms and sections, both underlines and highlighted text open a small prompt box that branches, a knowledge graph across learning trees informs the underlines, and every final response shows its token usage. It ships in a new epic after Product 1.0 (TreeTutor-sh8).

## Content rollout

- Start with text conversations and build incrementally.
- After the text release, render tutor replies as formatted text: Markdown structure, code blocks and math. The saved raw message text stays the canonical source, so passage selection, branch anchors and source reveal remain exact. Raw HTML in replies is not rendered.
- Add Mermaid diagrams later, rendered inside the chat. The model may choose to generate a diagram as part of its explanation without a separate user request.
- Add on-demand narrated Remotion videos with optional Three.js scenes after diagrams. The final [workspace and media refinement spec](docs/workspace-media-refinement-spec.md) supersedes conflicting portions of the earlier [video proposal](docs/video-flow-proposal.md): smart generates freely creative 2D/3D scenes and a private script, Edge TTS supplies online narration/subtitles, and videos aim for 1–2 minutes or longer when needed. Show a video-sized loading rectangle with Cancel, then the finished player. No automatic repair/retry. Retain videos in a global local library with playback, Show in folder and trash actions, independently of conversation/tree deletion.

The agreed [inline visuals spec](docs/inline-visuals-spec.md) replaces new tutor diagrams with sandboxed HTML/SVG/JS visuals generated on the smart model during reply streaming. Existing Mermaid diagrams stay unchanged.

### Isolated media generation

- Spawn a subagent to create each Mermaid diagram or Remotion video, rather than perform generation work inside the tutor conversation.
- Keep the subagent's working messages, generation code, tool output, and revision history out of the tutor's context.
- Display the finished artifact inside the originating chat. Context isolation concerns generation work; the tutor can still refer to the resulting diagram or video.
- The exact task context passed to the subagent and the result representation returned to the tutor remain implementation choices. Preserve the context-isolation requirement when deciding them.

## Core learning journey

1. Choose New chat and see its map with a single root conversation open in the chat side panel. Ask about a topic, such as tournament trees; the root takes its title from that first question.
2. Read the answer and highlight an unfamiliar concept, such as Peterson.
3. Ask a question about the selection to create a connected child conversation.
4. Generate compact inherited context on demand, make the child visible on the map, and immediately open it in the chat side panel (or full workspace on a narrow window).
5. Continue chatting or branch recursively from another selected passage.
6. Return to the overview or an earlier conversation without injecting child discussions into its context.
7. Close and reopen the app, select the saved learning tree, and resume.

## Initial text release

The initial release targets the complete text learning journey: multiple saved trees, a movable branching canvas, focused chat, keyboard access, lazy context compaction, concurrent conversations, and subscription-backed Claude (default) and Codex with model and provider switching. Verify Claude and Codex authentication, context continuity, cross-provider switching and independent sessions. Do not silently substitute API-key access.

Build incrementally within this scope; Beads records implementation order and dependencies. Mermaid, Remotion, automatic branch suggestions (Break down), token stats, the knowledge graph, and Vim bindings are later increments rather than requirements for the first text release.

## Acceptance criteria

These are future implementation checks, not claims that the app has been built or tested.

1. **Branching:** Highlight a passage and ask a question. A connected child appears to the right, level with the source message where space permits, its connection leaves the parent beside that message, and it immediately receives focus. Repeat within the child to demonstrate recursive branching.
2. **Context:** Verify the child receives a compact snapshot of relevant ancestor/parent context, the exact selected passage, and the question. Creating later parent messages does not change that snapshot. Child discussion does not enter parent context.
3. **Navigation:** Drag empty map space to pan, use the wheel to zoom around the cursor, drag nodes without opening them, and click nodes to open or switch the single chat side panel. Verify the map remains interactive beside chat; expanded chat returns to the previous map position/zoom; narrow windows support returning from full-workspace chat. Transitions are smooth, and connections still identify their source passages.
4. **Keyboard:** Complete tree creation, text selection, branching, box movement, navigation, zooming, folding, all bulk branch actions, chat panel collapse/expand/return, chatting, and provider/model menu selection using only the keyboard.
5. **Persistence:** Create multiple trees, add messages and nested branches, reposition boxes and change fold/panel state, allow the layout save interval to pass, then reopen the app. Verify trees, messages, connections, context snapshots, positions, viewport, selected conversation, and panel/fold state remain available. Changed layout is saved at most once per minute; idle layouts produce no writes. Layout persistence stores a current compact state rather than message copies or interaction history; message persistence remains unchanged.
6. **Concurrency:** Generate responses in two separate conversations at the same time. Navigation and interaction with other conversations remain available; responses reach their respective boxes.
7. **Provider continuity:** New trees default to Claude. Change model within a conversation, and switch a conversation between Claude and Codex in both directions; verify visible history remains intact and continuation uses prior discussion and inherited context. Repeat after saving and reopening and within a nested child. Verify independent conversations, on either provider, do not share or reroute session state.
8. **Local delivery:** Run through localhost and verify the app server listens only on loopback. Saved learning trees remain on the local machine; selected model providers still receive inference requests.
9. **Compact map:** Verify collapsed-by-default tree navigation and compact minus/percentage/plus/fit controls with remaining actions in a menu. Nodes show a title, tiny activity dot, fold chevron, and every message of the conversation as a compact preview; long messages are truncated with ellipses and no message is omitted. Branch lines leave the parent beside their source message. Fold/unfold one subtree, expand all, collapse all, and keep the current branch; the latter preserves root-to-current path and current descendants while folding side branches along the path. Folding changes visibility without deleting conversations or interrupting replies.
10. **Compact chat and new chat:** New chat asks for no name and opens a map with one root conversation box and its chat panel; the first sent question gives the root its title. Provider/model selection uses a small icon-triggered menu; passage actions appear only with selected text and remain keyboard-accessible. A new child is made visible and opens in chat even when its parent branch was folded.

For the later media increments, verify that both Mermaid and Remotion generation use subagents, their working context stays separate, and the finished artifacts appear in the originating chat without injecting generation transcripts into the tutor conversation.

## Technical verification and open choices

The provider research below began on 2026-11-07. Current decisions and task-specific verification are recorded in the linked local documents and Beads; the original research snapshot is not a current runtime status report.

- **Codex:** The selected route uses Codex app-server with ChatGPT-managed authentication. See the [architecture decision](docs/architecture-proposal.md) and current provider/verification tasks for implementation and runtime evidence. Codex model continuity, cross-provider switching and session isolation are release checks.
- **Claude:** The selected route invokes the official, user-installed Claude Code CLI with native user authentication. See the [subscription integration decision](docs/research/claude-subscription-integration.md). Claude authentication, history transfer, session isolation and switching are release checks; the eligibility clarification follow-up remains optional and non-blocking. Do not substitute API-key access.
- **History transfer:** For provider switching, verify preservation of prior discussion and inherited context. Continuity does not require identical answers from different models.
- **Compaction:** Verify summary quality and branch startup latency with a real learning conversation. A summary must not replace the saved source history.
- **Implementation choices:** React/TypeScript/Vite, React Flow, a loopback Node server, SQLite, and the initial keyboard contract were selected in the [architecture decision](docs/architecture-proposal.md). This PRD's revised compact controls, selection-only branch actions, chat side panel and layout-saving cadence supersede conflicting older interaction details there. Exact dimensions, breakpoints and animation timing remain implementation details; clarify changes that materially affect the agreed experience.
- **Later increments:** Suggestion (Break down) and video designs are selected in the linked documents above; Break down, token stats and the knowledge graph form a new epic after TreeTutor-sh8. Their implementation and validation remain later work; the optional Vim mapping was agreed on 2026-11-09. Rich reply rendering, rename and delete, and the custom OpenAI-compatible endpoint were accepted on 2026-11-09 and are tracked in Beads epic TreeTutor-sh8.

## Change boundary

Implement the existing backlog under the standing authorization in AGENTS.md. Preserve the agreed release order and scope; clarify material product changes while continuing independent ready work.

The owner's 2026-11-11 interview is synthesized in the final
[workspace and media refinement spec](docs/workspace-media-refinement-spec.md).
It defines compact focused-chat and passage controls, a floating composer,
title-only floating search and a quiet restyled scrollbar, historical usage
visualizations and simplified colorful diagrams, alongside the model and video
rules above. The owner authorized specification writing and tracker publication;
that documentation task does not itself execute the new implementation backlog.
