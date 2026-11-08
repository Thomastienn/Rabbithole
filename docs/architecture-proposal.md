# Local app architecture and keyboard decision

Decision: `TreeTutor-7t3.3`. Status: accepted through delegated choice.

The user instructed: “Do the next Beads task. Do what you recommends.” This delegates the pending architecture and interaction choices. Adopt the recommendations below, including the keyboard contract and recorded tradeoffs. This completes the decision task; implementation remains separate work under the PRD's authorization boundary.

This covers the existing PRD's text release. It does not authorize app implementation or resolve provider eligibility. There is no app code yet. Assumption: a single local user runs the server and opens it in a desktop browser; mobile behavior and visual styling are not decided here.

## Selected architecture

- **UI:** React + TypeScript, built with Vite. Use React Flow for movable conversation boxes, viewport transforms and branch connections. Keep chat controls in HTML rather than painting text into a bitmap canvas. One shared chat component serves root and child conversations at every depth.
- **Server:** one Node process bound to `127.0.0.1`, serving the built UI, local HTTP operations and streamed response events. Keep provider processes and credentials on the server. Browser requests use the same origin; validate Host/Origin and state-changing requests so other websites cannot drive the local provider session.
- **Storage:** one SQLite database in the user's local app-data directory, outside the repo. Use the installed runtime's supported `node:sqlite` interface after checking its exact API. No ORM. The app database owns trees, conversation IDs, ordered original messages, fixed inherited snapshots, passage anchors, box positions and saved overview viewport. Provider thread IDs are references, not the canonical conversation history.
- **Providers:** isolate Codex protocol handling from chat and storage. Preserve the prior research's SIWC candidate and unresolved eligibility/history-transfer checks. Do not start authentication or choose credential handling through this decision. Add Claude handling only when its route is resolved; do not substitute API keys.
- **Generation:** track active work by conversation and turn ID, independently of focus. Stream events to their owning conversation. Save user input before requesting inference, checkpoint partial replies and persist terminal status; interrupted work after restart remains visibly incomplete. Commit child conversation, source anchor and inherited snapshot together before its first tutor turn. A failed compaction leaves the parent and source history intact and allows retry.

These are selected components, not a claim that they have been integrated. [Vite guide](https://vite.dev/guide/), [React Flow accessibility](https://reactflow.dev/learn/advanced-use/accessibility), [Node SQLite API](https://nodejs.org/api/sqlite.html).

## Passage anchors, recursive trees and focus

Store each connection's parent conversation ID, source message ID, selected text and start/end offsets into the immutable message's canonical text. Use the same UTF-16 indexing convention as browser text controls. Offsets distinguish repeated identical passages; never infer identity from screen coordinates or selected words alone. Keep the original message and inherited context snapshot after compaction.

Map rendered text selection to those offsets; derive a DOM Range from the saved anchor when the message is visible. Its rectangles locate the source connection handle. Recalculate handle geometry after wrapping, scrolling, movement or resize. If the passage is outside the box's visible area, keep a labeled edge marker identifying its source message and provide a keyboard-accessible action to reveal the passage. Do not silently attach it to another passage. [Selection API](https://developer.mozilla.org/en-US/docs/Web/API/Selection_API), [Range geometry](https://developer.mozilla.org/en-US/docs/Web/API/Range/getClientRects), [React Flow handles](https://reactflow.dev/learn/customization/handles).

Use a flat collection of conversations with parent references, not one nested UI component per tree level. No artificial depth limit. Place a new child to the right near the source passage's canvas position, shifting downward past overlapping boxes without rearranging existing boxes.

Save overview position and zoom before focusing a conversation. Show the shared chat view across the canvas area; keep the overview's state and other generations alive. On return, restore the viewport and focus the originating conversation box. Animate the selected box into/out of the focused view; immediately focus the new child's question composer. Skip movement animations when `prefers-reduced-motion: reduce` is set. Exact animation timing is deferred to UI implementation. [Reduced-motion preference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/prefers-reduced-motion).

## Selected keyboard contract

Every operation has a visible labeled control; shortcuts are scoped to the relevant control, never global overrides of browser shortcuts. Focus indicators remain visible. Canvas key handlers do not capture typing or text-selection keys inside chats.

| Context | Keys / control | Behavior |
| --- | --- | --- |
| All controls | Tab / Shift+Tab; Enter / Space | Native focus traversal and button activation; tree creation, tree selection, provider/model selection and branch submission use normal form controls. |
| Conversation box | Tab; Enter on its Open control | Reach the box, then focus its chat. Keep React Flow's documented selection behavior; do not override Enter on the node wrapper. |
| Selected box | Arrow keys; Shift+Arrow | Move box; Shift uses a larger step. Persist position and announce movement. |
| Canvas navigation controls | Focus Pan control, then Arrow keys | Pan viewport without moving a selected box. Also provide labeled directional buttons. |
| Canvas zoom controls | Enter / Space on Zoom in, Zoom out, Fit tree | Change canvas zoom without hijacking browser zoom. |
| Focused chat | Return to tree button; Escape outside a dialog | Restore saved overview viewport and originating box focus. Escape closes a dialog first. |
| Assistant message | Select passage button | Enter a labeled read-only text area containing the exact message text. Native arrows, Shift+Arrow, Ctrl+Shift+Arrow and Home/End allow precise keyboard selection. |
| Passage selection | Tab to Ask about selection, then Enter | Capture selection offsets before focus leaves the text control, show the exact selected passage and question field, then create/focus child on submission. Mouse selection reaches the same flow. |
| Message composer | Enter; Shift+Enter | Send; insert newline. Respect IME composition. A visible Send button offers the same operation. |
| Active response | Tab to Stop, then Enter / Space | Interrupt only that conversation's active turn. |

The read-only selection mode avoids depending on browser-specific caret browsing. It is an extra interaction, while preserving native selection behavior and the same stored passage anchors. Its implementation must preserve selection when controls receive focus. [Read-only text areas](https://developer.mozilla.org/en-US/docs/Web/API/HTMLTextAreaElement/readOnly).

## Alternatives and tradeoffs

| Choice | Why recommend it | Alternative and cost |
| --- | --- | --- |
| React Flow | Reuses viewport, node movement and accessibility behavior; custom passage handles are still required. | Custom DOM/SVG canvas removes a dependency but requires implementing and testing those interactions. |
| React + Vite and one Node server | Shares TypeScript with provider protocol code; local app does not need server rendering. | A full-stack rendering framework adds lifecycle/routing machinery without a current requirement. |
| SQLite on server | Transactions keep branch records consistent; history survives browser storage clearing. | IndexedDB is simpler for browser-only apps, but this app already needs a provider server and browser-origin storage can be cleared. JSON snapshots require custom atomic writes and serialize unrelated updates. |
| Separate focused chat view | Fits ordinary reading/typing while overview stays intact. | Physically zooming a full message thread to viewport size complicates scroll, layout and text selection. Animation must still make the transition continuous. |
| Read-only selection mode | Uses native keyboard text selection and exact offsets without a rich-text editor. | Browser caret browsing depends on browser/user configuration; a custom selection editor adds implementation and accessibility work. |

No layout engine, global state library, ORM, rich-text editor or media-generation infrastructure is proposed for the first slice. This decision does not select a visual theme or component system.

## Verification required during implementation

These are planned checks, not passing results:

1. Complete the PRD keyboard journey without a pointer, including selecting repeated text, nested branching, box movement, panning, zoom and provider/model controls. Confirm typing, selection and IME input do not move the canvas.
2. Move, resize and scroll parent boxes; connections still reveal the original passage. Repeat with wrapped text, emoji and repeated phrases, then reopen the tree.
3. Create a chain of child conversations with the same controls at every depth; verify fixed context snapshots and parent/child isolation. Placement must avoid existing boxes.
4. Focus and return while two conversations stream; preserve viewport, focus, message routing and partial status. Check both normal and reduced motion.
5. Reopen multiple trees after restart; verify messages, anchors, context and positions. Simulate failed saves/provider requests and interrupted generation without reporting unsaved data as saved.
6. Verify only loopback listening, same-origin request enforcement and no provider credentials in browser responses. Run the separate provider feasibility checks before claiming subscription support.

The stack and interaction contract are selected under the user's delegated choice. Runtime provider feasibility remains separate work; the implementation checks above have not run.
