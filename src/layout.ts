export const layoutCss = `
html, body, #root { height: 100%; }
.mobile-nav { display: none; }
header { border-bottom: 1px solid var(--color-border); }
.trees { flex: 0 0 18rem; min-width: 0; overflow: auto; border-right: 1px solid var(--color-border); background: var(--color-background-body); }
.conversation { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.tree-workspace { position: relative; display: flex; flex: 1; min-height: 0; flex-direction: column; }
.focused-chat, .overview { display: flex; flex: 1; min-height: 0; flex-direction: column; }
.focused-chat { position: absolute; inset: 0; }
.focused-chat > .astryx-chat-layout { flex: 1; min-height: 0; overflow: auto; }
.tree-canvas { flex: 1; min-height: 0; }
.conversation-box { width: 18rem; border: thin solid var(--color-border-emphasized); border-radius: var(--radius-element); background: var(--color-background-surface); overflow-wrap: anywhere; }
.conversation-box button { height: auto; white-space: normal; }
.conversation-box h3, .source-passage { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
.react-flow__edge-path { stroke: var(--color-text-secondary); }
.react-flow__handle { background: var(--color-text-secondary); border-color: var(--color-background-surface); }
.trees button { height: auto; min-height: var(--spacing-8); padding-block: var(--spacing-2); white-space: normal; overflow-wrap: anywhere; text-align: start; }
section[role=alert] { background: var(--color-background-body); }
::selection { background: var(--color-background-blue); color: var(--color-text-primary); }
* { scrollbar-color: var(--color-border) var(--color-background-surface); }
@media (max-width: 48rem) {
 .mobile-nav { display: inline-flex; }
 .workspace { flex-direction: column; overflow: hidden; }
 .trees { display: none; flex: 0 0 auto; max-height: 45dvh; border-right: none; border-bottom: 1px solid var(--color-border); }
 .trees[data-open=true] { display: block; }
 .conversation { min-height: 0; flex: 1; }
}
`;
