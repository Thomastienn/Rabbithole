export const layoutCss = `
html, body, #root { height: 100%; }
html { view-transition-name: none; }
.trees { display: none; flex: 0 0 18rem; min-width: 0; overflow: auto; border-right: 1px solid var(--color-border); background: var(--color-background-body); }
.trees[data-open=true] { display: block; }
.conversation { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.tree-workspace { position: relative; display: flex; flex: 1; min-height: 0; min-width: 0; flex-direction: row; }
.focused-chat, .overview { display: flex; flex: 1; min-width: 0; min-height: 0; flex-direction: column; }
.overview { position: relative; background: var(--color-background-body); }
.map-toolbar { position: absolute; z-index: 5; top: var(--spacing-3); left: var(--spacing-3); border: thin solid var(--color-border); border-radius: var(--radius-element); background: var(--color-background-surface); box-shadow: var(--shadow-low); }
.empty-map { flex: 1; text-align: center; max-width: 28rem; margin-inline: auto; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.focus-reveal:not(:focus-visible) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.chat-header { border-bottom: thin solid var(--color-border); }
.chat-title { flex: 1; min-width: 0; }
.chat-title h2 { font-size: var(--font-size-lg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.passage { position: relative; }
.selection-action { position: absolute; z-index: 3; margin-top: var(--spacing-1); transform: translateX(-50%); animation: rise 140ms cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes rise { from { opacity: 0; transform: translate(-50%, var(--spacing-1)); } }
.branch-form { margin-top: var(--spacing-2); border: thin solid var(--color-border-emphasized); border-radius: var(--radius-element); background: var(--color-background-surface); }
.branch-quote { padding: var(--spacing-2) var(--spacing-3); border-radius: var(--radius-element); background: var(--color-background-blue); }
.focused-chat { flex: 0 1 32rem; min-width: 0; border-left: 1px solid var(--color-border); }
.focused-chat > .astryx-chat-layout { flex: 1; min-height: 0; overflow: auto; }
.tree-canvas { flex: 1; min-height: 0; background: var(--color-background-body); }
.tree-canvas:focus-visible { outline: medium solid var(--color-text-primary); outline-offset: calc(-1 * var(--spacing-1)); }
.tree-workspace[data-expanded=true] .overview { display: none; }
.tree-workspace[data-expanded=true] .focused-chat { flex: 1; border-left: 0; }
::view-transition { pointer-events: none; }
::view-transition-group(chat-panel) { animation-duration: 220ms; animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
::view-transition-group(conversation) { animation-duration: 220ms; animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
@media (prefers-reduced-motion: reduce) {
 ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none; }
}
.conversation-box { width: 16rem; border: thin solid var(--color-border-emphasized); border-radius: var(--radius-element); background: var(--color-background-surface); overflow-wrap: anywhere; transition: border-color 160ms ease-out, box-shadow 160ms ease-out; }
.react-flow__node:hover .conversation-box { border-color: var(--color-text-secondary); }
.conversation-box[data-active=true] { box-shadow: 0 0 0 thin var(--color-text-secondary); }
.conversation-box .node-title { flex: 0 1 auto; min-width: 0; justify-content: flex-start; padding-inline: var(--spacing-1); text-align: start; }
.conversation-box .node-title h3 { font-size: var(--font-size-base); line-height: 1.3; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.node-extra { margin-inline-start: auto; opacity: 0; transition: opacity 120ms ease-out; }
.react-flow__node:hover .node-extra, .react-flow__node:focus-within .node-extra, .node-extra:focus-visible { opacity: 1; }
@media (hover: none) { .node-extra { opacity: 1; } }
.activity-dot { display: inline-block; flex: none; width: var(--spacing-2); height: var(--spacing-2); border-radius: 50%; background: var(--color-text-primary); animation: pulse 1.2s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.3; } }
@media (prefers-reduced-motion: reduce) { .activity-dot, .selection-action { animation: none; } }
.conversation-box button { height: auto; white-space: normal; }
.node-message[data-role=user] { padding-inline-start: var(--spacing-2); border-inline-start: medium solid var(--color-border-emphasized); }
.node-message[data-role=assistant] { padding-inline-start: var(--spacing-2); }
.passage-anchor { position: relative; padding-block-start: var(--spacing-2); padding-inline-end: var(--spacing-2); border-top: thin solid var(--color-border); }
.passage-anchor .react-flow__handle { right: calc(-1 * var(--spacing-3)); }
.react-flow__node.selected .conversation-box { border-color: var(--color-text-primary); box-shadow: var(--shadow-med); }
mark { background: var(--color-background-blue); color: var(--color-text-primary); }
.react-flow__edge-path { stroke: var(--color-text-secondary); }
.react-flow__handle { background: var(--color-text-secondary); border-color: var(--color-background-surface); }
.trees nav button { height: auto; min-height: var(--spacing-8); padding-block: var(--spacing-2); white-space: normal; overflow-wrap: anywhere; text-align: start; justify-content: flex-start; }
section[role=alert] { background: var(--color-background-body); }
::selection { background: var(--color-background-blue); color: var(--color-text-primary); }
* { scrollbar-color: var(--color-border) var(--color-background-surface); }
@media (max-width: 48rem) {
 .workspace { flex-direction: column; overflow: hidden; }
 .trees { display: none; flex: 0 0 auto; max-height: 45dvh; border-right: none; border-bottom: 1px solid var(--color-border); }
 .trees[data-open=true] { display: block; }
 .conversation { min-height: 0; flex: 1; }
 .overview[data-chat-open=true] { display: none; }
 .focused-chat { flex: 1; border-left: 0; }
 .expand-chat { display: none; }
}
`;
