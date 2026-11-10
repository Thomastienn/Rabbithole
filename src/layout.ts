export const layoutCss = `
html, body, #root { height: 100%; }
html { view-transition-name: none; }
.workspace { position: relative; }
.trees { display: none; flex: 0 0 18rem; min-width: 0; min-height: 0; border-right: thin solid var(--color-border); background: var(--color-background-body); }
.trees[data-open=true] { display: flex; }
.tree-navigation-content { flex: 1; height: 100%; min-height: 0; min-width: 0; }
.tree-navigation-content h2 { font-size: var(--font-size-lg); }
.tree-list { flex: 1; min-height: 0; overflow: auto; }
.tree-date-heading { font-size: var(--font-size-sm); color: var(--color-text-secondary); }
.saved-tree-row { border-radius: var(--radius-element); }
.saved-tree-row[data-current=true] { background: var(--color-neutral); }
.tree-row-actions { flex-shrink: 0; opacity: 0; pointer-events: none; }
.saved-tree-row:hover .tree-row-actions, .saved-tree-row:focus-within .tree-row-actions { opacity: 1; pointer-events: auto; }
@media (hover: none) { .tree-row-actions { opacity: 1; pointer-events: auto; } }
.tree-navigation-footer { border-top: thin solid var(--color-border); }
.tree-navigation-footer > button:first-child { justify-content: flex-start; }
.tree-drawer { height: 100%; background: var(--color-background-body); }
.sidebar-expand { position: absolute; z-index: 6; top: var(--spacing-3); left: var(--spacing-3); background: var(--color-background-surface); border: thin solid var(--color-border); }
.workspace[data-sidebar-open=false] .map-toolbar { left: calc(var(--spacing-3) + var(--spacing-10) + var(--spacing-2)); }
.workspace[data-sidebar-open=false] .tree-workspace[data-expanded=true] .chat-header, .workspace[data-sidebar-open=false] .knowledge-header { padding-inline-start: calc(var(--spacing-3) + var(--spacing-10) + var(--spacing-2)); }
.conversation { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.conversation[hidden], .knowledge-panel[hidden] { display: none; }
.knowledge-panel { flex: 1; min-height: 0; overflow: auto; }
.knowledge-content { max-width: 70rem; margin-inline: auto; overflow-wrap: anywhere; }
.knowledge-content .astryx-list-item { min-width: 0; }
.knowledge-content :focus-visible { outline: medium solid var(--color-text-primary); outline-offset: var(--spacing-1); }
.tree-workspace { position: relative; display: flex; flex: 1; min-height: 0; min-width: 0; flex-direction: row; }
.focused-chat, .overview { display: flex; flex: 1; min-width: 0; min-height: 0; flex-direction: column; }
.overview { position: relative; background: var(--color-background-body); }
.map-toolbar { position: absolute; z-index: 5; top: var(--spacing-3); left: var(--spacing-3); border: thin solid var(--color-border); border-radius: var(--radius-element); background: var(--color-background-surface); box-shadow: var(--shadow-low); }
.empty-map { flex: 1; text-align: center; max-width: 28rem; margin-inline: auto; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.focus-reveal:not(:focus-visible) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.chat-header { border-bottom: thin solid var(--color-border); }
.bubble-tint-swatch { width: var(--spacing-5); aspect-ratio: 1; border: thin solid var(--color-border-emphasized); border-radius: var(--radius-element); }
.question-bubble { background: var(--question-bubble-tint); color: var(--color-text-primary); border-radius: var(--radius-element); padding: var(--spacing-3); overflow-wrap: anywhere; }
.chat-title { flex: 1; min-width: 0; }
.chat-title .rename-title { width: 100%; min-width: 0; justify-content: flex-start; padding-inline: 0; }
.saved-chat-title { flex: 1; min-width: 0; }
.saved-chat-title > * { min-width: 0; }
.chat-title h2 { font-size: var(--font-size-lg); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.passage { position: relative; align-self: stretch; }
.reply-md { display: block; min-width: 0; overflow-wrap: anywhere; }
.reply-md > * + * { margin-block-start: var(--spacing-3); }
.reply-md p, .reply-md figure { margin-inline: 0; }
.reply-md :is(h3, h4, h5, h6) { margin-block-start: var(--spacing-5); margin-block-end: var(--spacing-2); }
.reply-md > :first-child { margin-block-start: 0; }
.reply-md :is(ul, ol) { padding-inline-start: var(--spacing-5); list-style-position: outside; }
.reply-md ul { list-style-type: disc; }
.reply-md ol { list-style-type: decimal; }
.reply-md li + li { margin-block-start: var(--spacing-1); }
.reply-md blockquote { margin-inline: 0; padding-inline-start: var(--spacing-3); border-inline-start: thin solid var(--color-border-emphasized); color: var(--color-text-secondary); }
.reply-md pre { margin-inline: 0; padding: var(--spacing-3); background: var(--color-background-body); border-radius: var(--radius-element); white-space: pre-wrap; overflow-wrap: anywhere; }
.reply-md pre > code { display: block; padding: 0; background: transparent; white-space: inherit; font-size: var(--font-size-sm); }
.reply-md code .astryx-text { font-family: inherit; white-space: inherit; }
.reply-md a { color: var(--color-text-primary); text-decoration: underline; text-underline-offset: var(--spacing-1); }
.reply-md .md-table { max-width: 100%; overflow-x: auto; }
.reply-md table { width: 100%; border-collapse: collapse; }
.reply-md :is(th, td) { padding: var(--spacing-2); border: thin solid var(--color-border); text-align: start; }
.reply-md th { background: var(--color-background-body); font-weight: 600; }
.reply-md math[display=block] { padding-block: var(--spacing-2); max-width: 100%; overflow-x: auto; }
.reply-md [data-reveal] { background: var(--color-background-blue); color: var(--color-text-primary); }
.reply-md u.suggestion { text-decoration: underline dotted var(--color-text-secondary); text-decoration-thickness: from-font; text-underline-offset: var(--spacing-1); }
.reply-md u.suggestion { cursor: pointer; }
.reply-md u.suggestion.explored { text-decoration-style: solid; }
.reply-md u.suggestion:focus-visible { outline: thin solid var(--color-text-primary); outline-offset: var(--spacing-1); border-radius: var(--radius-element); }
.reply-md .md-source-syntax { white-space: pre-wrap; font-family: monospace; }
.diagram-card { align-self: stretch; min-width: 0; max-width: 100%; border: thin solid var(--color-border-emphasized); border-radius: var(--radius-element); background: var(--color-background-surface); color: var(--color-text-primary); overflow-wrap: anywhere; }
.diagram-card h3 { font-size: var(--font-size-base); }
.diagram-viewport { max-width: 100%; max-height: 24rem; overflow: auto; overscroll-behavior: contain; }
.diagram-viewport img { display: block; max-width: none; }
.video-frame { display: block; width: 100%; aspect-ratio: 16 / 9; border-radius: var(--radius-element); background: var(--color-background-body); }
.video-frame:focus-visible { outline: medium solid var(--color-text-primary); outline-offset: var(--spacing-1); }
.diagram-source { max-height: 12rem; overflow: auto; margin: 0; padding: var(--spacing-2); background: var(--color-background-body); color: var(--color-text-primary); font-size: var(--font-size-sm); }
.diagram-card:focus-visible, .diagram-viewport:focus-visible, .diagram-source:focus-visible { outline: medium solid var(--color-text-primary); outline-offset: calc(-1 * var(--spacing-1)); }
.selection-action { position: absolute; z-index: 3; margin-top: var(--spacing-1); transform: translateX(-50%); animation: rise 140ms cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes rise { from { opacity: 0; transform: translate(-50%, var(--spacing-1)); } }
.passage-box { position: absolute; z-index: 3; width: min(100%, 28rem); transform: translateY(-100%); margin-top: calc(-1 * var(--spacing-1)); box-shadow: var(--shadow-low); }
.branch-form { margin-top: var(--spacing-2); border: thin solid var(--color-border-emphasized); border-radius: var(--radius-element); background: var(--color-background-surface); }
.focused-chat { flex: 0 1 32rem; min-width: 0; border-left: thin solid var(--color-border); }
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
@media (prefers-reduced-motion: reduce) { .activity-dot, .selection-action { animation: none; } .conversation-box, .node-extra, .diagram-card .astryx-icon { transition: none; } }
.react-flow__node:focus-visible { outline: none; }
.react-flow__node:focus-visible .conversation-box { outline: medium solid var(--color-text-primary); outline-offset: var(--spacing-1); }
.react-flow__edge:focus-visible { outline: none; }
.react-flow__edge:focus-visible .react-flow__edge-path { stroke: var(--color-text-primary); stroke-width: var(--spacing-1); }
.conversation-box button { height: auto; white-space: normal; }
.node-message[data-role=user] { padding-inline-start: var(--spacing-2); border-inline-start: medium solid var(--color-border-emphasized); }
.node-message[data-role=assistant] { padding-inline-start: var(--spacing-2); }
.node-message { position: relative; }
.node-message .react-flow__handle { right: calc(-1 * var(--spacing-3)); }
.react-flow__node.selected .conversation-box { border-color: var(--color-text-primary); box-shadow: var(--shadow-med); }
mark { background: var(--color-background-blue); color: var(--color-text-primary); }
.react-flow__edge-path { stroke: var(--color-text-secondary); }
.react-flow__handle { background: var(--color-text-secondary); border-color: var(--color-background-surface); }
.tree-list .saved-chat-title { height: auto; min-height: var(--spacing-8); padding-block: var(--spacing-2); white-space: normal; overflow-wrap: anywhere; text-align: start; justify-content: flex-start; }
section[role=alert] { background: var(--color-background-body); }
/* One frame height for every settings tab, so switching tabs never resizes the window. */
.settings-shell { height: min(50rem, calc(100dvh - 2rem)); min-height: 0; }
.settings-shell .astryx-side-nav { flex-shrink: 0; }
::selection { background: var(--color-background-blue); color: var(--color-text-primary); }
* { scrollbar-color: var(--color-border) var(--color-background-surface); }
@media (max-width: 48rem) {
 .workspace { flex-direction: column; overflow: hidden; }
 .conversation { min-height: 0; flex: 1; }
 .map-toolbar { left: calc(var(--spacing-3) + var(--spacing-10) + var(--spacing-2)); }
 .chat-header { padding-inline-start: calc(var(--spacing-3) + var(--spacing-10) + var(--spacing-2)); }
 .overview[data-chat-open=true] { display: none; }
 .focused-chat { flex: 1; border-left: 0; }
 .expand-chat { display: none; }
 .settings-shell { height: 100dvh; }
 .settings-shell .astryx-side-nav { width: 100%; }
}
`;
