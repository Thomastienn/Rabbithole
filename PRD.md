# TreeTutor — Product Requirements

Status: Map-first requirements agreed on 2026-11-08. This revision authorizes requirements and backlog updates; app implementation requires a separate explicit request. Existing implementation and verification are recorded in Beads and docs/verification; this document defines the target behavior, not current completion.

## Relationship to the original idea

IDEA.md remains the original vision: connected subproblem conversations that branch recursively, with Codex and Claude, optional automatic branch suggestions, Mermaid diagrams, Remotion videos, and potentially a custom OpenAI-compatible endpoint. This PRD makes the initial release Codex-only and text-first with manual passage selection. Claude, cross-provider switching, suggestions, media, and custom endpoints remain deferred. Parent and child conversations can both continue chatting and branching; conversations are not limited to leaf nodes.

## Audience

Anyone learning with LLMs, including students and independent learners exploring unfamiliar topics.

## Delivery

TreeTutor is a local web app only. Hosted deployment and an installed desktop app are outside the product scope. The local app server binds to loopback by default.

## Providers

The current release supports Codex through the learner's existing ChatGPT subscription. Claude implementation, Claude authentication/testing, cross-provider switching, API-key access, and custom OpenAI-compatible endpoints are deferred and must not block this release. Do not show a Claude setup requirement or a nonfunctional provider picker in the Codex-only interface.

Child conversations default to their parent's Codex model. Learners can change Codex model within an existing conversation while preserving visible messages and inherited context.

Later, adding Claude and provider switching must preserve visible messages and the conversation's existing context, including inherited branch context. The new provider must be able to continue the discussion using that history. This future continuity requirement and the previously selected native Claude Code route remain recorded; they do not require Claude work now.

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
- The map is the primary workspace: opening a tree shows the map filling the available workspace with the tree sidebar collapsed by default and a compact toolbar visible. Tree selection, tree creation, and connection settings are available on demand rather than permanently occupying the main view.
- Default conversation boxes show their title, a small activity indicator, and a compact preview of the latest question and answer. Derive previews from existing messages rather than persisting duplicate text. Source passage text and extra actions are revealed on demand; branch connections remain visible.
- Cap the preview at two lines for the question and two lines for the answer, ending truncated text with an ellipsis (…). Opening the conversation shows the full messages.
- Learners can collapse or expand a node's descendants while keeping that node visible, with a small indicator when descendants are hidden. Provide expand-all and collapse-all actions without permanently expanding the compact toolbar.
- A small chevron beside the node title folds or unfolds descendants; clicking the rest of the node opens its conversation. Keep the chevron action distinct from opening or dragging the node, and show a tiny activity dot beside the title.
- Provide a keep-current-branch action: preserve the path from the root to the current conversation and its descendants, while collapsing side branches along that path.
- Selecting a conversation opens its chat in a side panel alongside the map. Learners can expand the chat to fill the workspace or collapse it to the side to give the map more room.
- Use one chat side panel: selecting another node switches that panel to the selected conversation. The panel takes space beside the map rather than covering it; the map remains available for panning, zooming, and selecting nodes. Smoothly bring the selected node into view when needed so it remains visible beside the panel.
- When the window cannot comfortably fit both map and chat, chat fills the workspace; a back/collapse control returns to the map.
- A brand-new tree starts with an empty map and a Start conversation action. That action opens the chat side panel; sending the first question creates the root conversation node. Before that first question, show no empty conversation box. Creating a child makes it visible and opens it immediately in the chat side panel.
- Returning from expanded chat restores the map's previous position and zoom.
- Animate transitions smoothly between the map, side-panel chat, and expanded chat so navigation feels continuous rather than abrupt.
- Keep chat controls compact: a model icon opens a small model-selection menu rather than a full-width selector. Show passage-branching actions only when text is selected, while retaining keyboard access to text selection and branching.
- Conversations remain available to revisit and continue later.
- Any child conversation can create further child branches, with no product-imposed nesting depth limit. Every depth uses the same chat controls and compact inherited-context rule.
- Place new child boxes automatically to the right of their parent, near the highlighted passage's position. Offset placement when necessary to keep boxes readable and unobscured.
- Learners can reposition boxes manually. Branch connections retain their association with the source passage after movement.
- Different conversation boxes can generate responses concurrently. A response in progress must not prevent navigating to or chatting in another branch.

## Keyboard access

Every action must be available through keyboard bindings, including canvas navigation, conversation selection, zooming, branching, and chatting. Specific bindings remain to be decided.

Use standard keyboard interactions initially. Add Vim-style navigation later.

## Child conversation context

- Generate compact context on demand when the learner creates a child branch.
- Include relevant parent history and ancestor context in the summary, alongside the exact selected passage and the learner's question.
- Fix inherited context at branch creation; later parent messages do not automatically change it.
- Preserve original conversation messages so summarization does not replace the source history.
- Child discussions remain side context. Do not inject their messages or summaries into the parent conversation; returning to the parent leaves its model context unchanged.

## Future direction

Automatic suggestions for concepts or passages worth branching into are an explicit long-term product goal. The initial version uses manual text selection. The selected later design is recorded in [branch-suggestions-proposal.md](docs/branch-suggestions-proposal.md); its implementation remains separate from the initial text release.

## Content rollout

- Start with text conversations and build incrementally.
- Add Mermaid diagrams later, rendered inside the chat. The model may choose to generate a diagram as part of its explanation without a separate user request.
- Add Remotion video generation after that, available when the learner requests a video in the conversation. The selected later generation/playback design is recorded in [video-flow-proposal.md](docs/video-flow-proposal.md); implementation remains separate.

### Isolated media generation

- Spawn a subagent to create each Mermaid diagram or Remotion video, rather than perform generation work inside the tutor conversation.
- Keep the subagent's working messages, generation code, tool output, and revision history out of the tutor's context.
- Display the finished artifact inside the originating chat. Context isolation concerns generation work; the tutor can still refer to the resulting diagram or video.
- The exact task context passed to the subagent and the result representation returned to the tutor remain implementation choices. Preserve the context-isolation requirement when deciding them.

## Core learning journey

1. Create a learning tree, see its empty map, and use Start conversation to open the chat side panel. Ask about a topic, such as tournament trees, to create the root node.
2. Read the answer and highlight an unfamiliar concept, such as Peterson.
3. Ask a question about the selection to create a connected child conversation.
4. Generate compact inherited context on demand, make the child visible on the map, and immediately open it in the chat side panel (or full workspace on a narrow window).
5. Continue chatting or branch recursively from another selected passage.
6. Return to the overview or an earlier conversation without injecting child discussions into its context.
7. Close and reopen the app, select the saved learning tree, and resume.

## Initial text release

The initial release targets the complete text learning journey: multiple saved trees, a movable branching canvas, focused chat, keyboard access, lazy context compaction, concurrent conversations, and subscription-backed Codex with Codex model switching. Verify Codex authentication, context continuity and independent sessions; Claude integration and cross-provider checks are outside this release. Do not silently substitute API-key access.

Build incrementally within this scope; Beads records implementation order and dependencies. Mermaid, Remotion, automatic branch suggestions, and Vim bindings are later increments rather than requirements for the first text release.

## Acceptance criteria

These are future implementation checks, not claims that the app has been built or tested.

1. **Branching:** Highlight a passage and ask a question. A connected child appears to the right, near the source passage where space permits, and immediately receives focus. Repeat within the child to demonstrate recursive branching.
2. **Context:** Verify the child receives a compact snapshot of relevant ancestor/parent context, the exact selected passage, and the question. Creating later parent messages does not change that snapshot. Child discussion does not enter parent context.
3. **Navigation:** Drag empty map space to pan, use the wheel to zoom around the cursor, drag nodes without opening them, and click nodes to open or switch the single chat side panel. Verify the map remains interactive beside chat; expanded chat returns to the previous map position/zoom; narrow windows support returning from full-workspace chat. Transitions are smooth, and connections still identify their source passages.
4. **Keyboard:** Complete tree creation, text selection, branching, box movement, navigation, zooming, folding, all bulk branch actions, chat panel collapse/expand/return, chatting, and Codex model menu selection using only the keyboard.
5. **Persistence:** Create multiple trees, add messages and nested branches, reposition boxes and change fold/panel state, allow the layout save interval to pass, then reopen the app. Verify trees, messages, connections, context snapshots, positions, viewport, selected conversation, and panel/fold state remain available. Changed layout is saved at most once per minute; idle layouts produce no writes. Layout persistence stores a current compact state rather than message copies or interaction history; message persistence remains unchanged.
6. **Concurrency:** Generate responses in two separate conversations at the same time. Navigation and interaction with other conversations remain available; responses reach their respective boxes.
7. **Codex continuity:** Change Codex model within a conversation and verify visible history remains intact and continuation uses prior discussion and inherited context. Repeat after saving and reopening and within a nested child. Verify independent Codex conversations do not share or reroute session state. No Claude login, inference or cross-provider check is required.
8. **Local delivery:** Run through localhost and verify the app server listens only on loopback. Saved learning trees remain on the local machine; selected model providers still receive inference requests.
9. **Compact map:** Verify collapsed-by-default tree navigation and compact minus/percentage/plus/fit controls with remaining actions in a menu. Nodes show a title, tiny activity dot, fold chevron, and latest question/answer preview capped at two lines each with ellipses for truncation. Fold/unfold one subtree, expand all, collapse all, and keep the current branch; the latter preserves root-to-current path and current descendants while folding side branches along the path. Folding changes visibility without deleting conversations or interrupting replies.
10. **Compact chat and empty start:** A new tree shows an empty map and Start conversation; its first sent question creates the root node. Model selection uses a small icon-triggered menu; passage actions appear only with selected text and remain keyboard-accessible. A new child is made visible and opens in chat even when its parent branch was folded.

For the later media increments, verify that both Mermaid and Remotion generation use subagents, their working context stays separate, and the finished artifacts appear in the originating chat without injecting generation transcripts into the tutor conversation.

## Technical verification and open choices

The provider research below began on 2026-11-07. Current decisions and task-specific verification are recorded in the linked local documents and Beads; the original research snapshot is not a current runtime status report.

- **Codex:** The selected route uses Codex app-server with ChatGPT-managed authentication. See the [architecture decision](docs/architecture-proposal.md) and current provider/verification tasks for implementation and runtime evidence. Codex model continuity and session isolation remain release checks.
- **Claude (deferred):** The previously selected route invokes the official, user-installed Claude Code CLI with native user authentication. See the [subscription integration decision](docs/research/claude-subscription-integration.md). Claude implementation, authentication, session isolation, history transfer and eligibility follow-up are postponed; no Claude prerequisite gates the current release. Preserve the route decision for later without substituting API-key access.
- **History transfer (later):** When provider switching is resumed, verify preservation of prior discussion and inherited context. Continuity does not require identical answers from different models.
- **Compaction:** Verify summary quality and branch startup latency with a real learning conversation. A summary must not replace the saved source history.
- **Implementation choices:** React/TypeScript/Vite, React Flow, a loopback Node server, SQLite, and the initial keyboard contract were selected in the [architecture decision](docs/architecture-proposal.md). This PRD's revised compact controls, selection-only branch actions, chat side panel and layout-saving cadence supersede conflicting older interaction details there. Exact dimensions, breakpoints and animation timing remain implementation details; clarify changes that materially affect the agreed experience.
- **Later increments:** Suggestion and video designs are selected in the linked documents above. Their implementation and validation remain later work; optional Vim bindings still require agreement.

## Change boundary

Continue requirements work only until the user explicitly requests implementation. Ask about material ambiguities; do not silently expand scope or convert an unresolved proposal into a confirmed requirement.
