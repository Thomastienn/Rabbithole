export const layoutCss = `
html, body, #root { height: 100%; }
.mobile-nav { display: none; }
header { border-bottom: 1px solid var(--color-border); }
.trees { flex: 0 0 18rem; min-width: 0; overflow: auto; border-right: 1px solid var(--color-border); background: var(--color-background-body); }
.conversation { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.conversation > .astryx-chat-layout { flex: 1; min-height: 0; overflow: auto; }
.trees button { white-space: normal; overflow-wrap: anywhere; text-align: start; }
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
