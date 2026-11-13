export const layoutCss = `
html, body, #root { height: 100%; }
body { background: var(--color-background-body); color: var(--color-text-primary); }
.react-flow { --xy-background-color: var(--color-background-body); }
html { view-transition-name: none; }
::selection { background: var(--treetutor-selection); color: var(--color-text-primary); }
.workspace { position: relative; }
/* Moss shell band (mockup Read): paper-toned text, focus ring and current tab on moss in both appearances. */
/* Overrides sit on the controls, not the header: tooltips and the palette render inside the band and keep popover colours. */
.shell-band :is(button, .band-mark) { --color-text-primary: var(--treetutor-band-ink); --color-text-secondary: var(--treetutor-band-muted); --color-icon-primary: var(--treetutor-band-ink); --color-icon-secondary: var(--treetutor-band-muted); --color-text-disabled: var(--treetutor-band-muted); --color-icon-disabled: var(--treetutor-band-muted); --color-overlay-hover: color-mix(in srgb, var(--treetutor-band-ink) 12%, transparent); --color-overlay-pressed: color-mix(in srgb, var(--treetutor-band-ink) 16%, transparent); --focus-outline-color: var(--treetutor-band-ink); }
.shell-band {
 display: flex; flex: none; align-items: center; gap: var(--treetutor-module); height: calc(7 * var(--treetutor-module)); padding-inline: calc(2 * var(--treetutor-module)); overflow-x: auto; scrollbar-width: none; background: var(--treetutor-band); color: var(--treetutor-band-ink); }
.shell-band button { color: var(--treetutor-band-ink); }
.shell-band :focus-visible { outline: var(--focus-outline-width) solid var(--treetutor-band-ink); outline-offset: var(--focus-outline-offset); }
.band-mark { flex: none; margin-inline-end: var(--treetutor-module); font-size: 20px; letter-spacing: -.01em; color: var(--treetutor-band-ink); }
.tree-switcher { flex: 0 1 auto; max-width: 280px; min-width: 0; height: 32px; border: 1px solid color-mix(in srgb, var(--treetutor-band-ink) 22%, transparent); font-weight: 600; }
.tree-switcher[aria-current=page] { background: color-mix(in srgb, var(--treetutor-band-ink) 16%, transparent); }
.tree-switcher-content { display: flex; align-items: center; min-width: 0; }
.tree-switcher-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tree-switcher-icon { flex: none; width: 16px; height: 16px; margin-inline-start: var(--treetutor-module); }
.view-tabs { display: flex; flex: none; gap: 2px; margin-inline-start: calc(2 * var(--treetutor-module)); }
.shell-band .view-tab { height: 32px; padding-inline: 12px; font-weight: 600; color: var(--treetutor-band-muted); }
.shell-band .view-tab:hover { color: var(--treetutor-band-ink); }
.shell-band .view-tab[aria-current=page] { background: var(--treetutor-band-ink); color: var(--treetutor-band); }
.band-tools { flex: none; margin-inline-start: auto; }
.shell-band .new-chat { height: 32px; border: 1px solid color-mix(in srgb, var(--treetutor-band-ink) 35%, transparent); font-weight: 600; }
.band-save { height: 24px; padding-inline: var(--treetutor-module); border-radius: var(--radius-element); background: var(--color-error); color: var(--color-on-error); --color-text-primary: var(--color-on-error); --color-text-secondary: var(--color-on-error); }
.shell-band .band-save button { height: 20px; color: var(--color-on-error); text-decoration: underline; }
/* Library (mockup Library): every learning tree is a volume on a shelf, or a row in the list; paper focus ring. */
.library-content { max-width: 70rem; margin-inline: auto; padding: calc(5 * var(--treetutor-module)) calc(4 * var(--treetutor-module)) calc(8 * var(--treetutor-module)); }
.library-content :focus-visible, .volume:has(.saved-chat-title:focus-visible) { outline: var(--focus-outline-width) solid var(--treetutor-paper); outline-offset: var(--focus-outline-offset); }
.library-panel { scrollbar-width: thin; scrollbar-color: transparent transparent; }
/* Quiet page scrollbar: thin rounded thumb, no track; shown on hover, scroll or keyboard focus, never needed to scroll. */
.library-panel:is(:hover, :focus-within, [data-scrolling]) { scrollbar-color: var(--color-border-emphasized) transparent; }
@supports selector(::-webkit-scrollbar) {
 .library-panel, .library-panel:is(:hover, :focus-within, [data-scrolling]) { scrollbar-width: auto; scrollbar-color: auto; }
 .library-panel::-webkit-scrollbar { width: 10px; background: transparent; }
 .library-panel::-webkit-scrollbar-thumb { border: 3px solid transparent; border-radius: var(--radius-full); background: transparent padding-box; }
 .library-panel:is(:hover, :focus-within, [data-scrolling])::-webkit-scrollbar-thumb { background-color: var(--color-border-emphasized); }
}
.library-head { margin-bottom: calc(4 * var(--treetutor-module)); }
.library-head > :first-child { flex: 1 1 24rem; }
.library-head h1 { font-size: 34px; line-height: 1.12; font-weight: 700; letter-spacing: -.015em; }
.library-intro { max-width: 62ch; }
.library-tools { justify-content: space-between; margin-bottom: var(--treetutor-module); }
.tree-date-heading { margin: calc(4 * var(--treetutor-module)) 0 12px; font-size: 13px; font-weight: 600; color: var(--color-text-secondary); }
.shelf, .library-list { list-style: none; margin: 0; padding: 0; }
.shelf { display: grid; grid-template-columns: repeat(auto-fill, 176px); gap: calc(4 * var(--treetutor-module)) calc(3 * var(--treetutor-module)); }
.shelf .volume { position: relative; display: grid; grid-template-rows: 144px auto; border: 1px solid var(--color-border); border-radius: var(--radius-element); background: var(--color-background-surface); }
.shelf .volume:hover { border-color: var(--color-border-emphasized); }
.shelf .volume[data-current=true] { box-shadow: 0 0 0 3px var(--color-background-body), 0 0 0 5px var(--treetutor-paper); }
.shelf .volume[data-renaming=true] { grid-column: span 2; grid-template-rows: auto; padding: 12px; }
.shelf .volume-band { display: flex; flex-direction: column; min-height: 0; padding: 12px; border-radius: calc(var(--radius-element) - 1px) calc(var(--radius-element) - 1px) 0 0; background: var(--treetutor-paper); --color-text-primary: var(--treetutor-paper-ink); --color-text-secondary: var(--treetutor-paper-ink); --color-overlay-hover: transparent; --color-overlay-pressed: transparent; color: var(--treetutor-paper-ink); }
/* The title button covers the whole volume, so the spine and date open it too; the menu sits above it. */
.shelf .saved-chat-title { position: static; transform: none; height: auto; padding: 0 20px 0 0; font-size: 17px; line-height: 1.15; font-weight: 700; letter-spacing: -.01em; text-wrap: balance; white-space: normal; overflow-wrap: anywhere; text-align: start; justify-content: flex-start; align-items: flex-start; color: var(--treetutor-paper-ink); }
.shelf .saved-chat-title::after { content: ''; position: absolute; inset: 0; border-radius: inherit; }
.shelf .saved-chat-title:focus-visible { outline: none; }
.shelf .volume-date { margin-top: auto; font-weight: 600; color: var(--treetutor-paper-ink); }
.volume-meta { display: grid; gap: var(--treetutor-module); padding: 10px 12px 12px; }
.volume-spine { display: flex; flex-wrap: wrap; gap: 2px; }
.volume-spine i { flex: 0 0 4px; height: 6px; border-radius: var(--radius-full); background: var(--ink); }
.shelf .tree-row-actions { position: absolute; top: 4px; right: 4px; z-index: 1; color: var(--treetutor-paper-ink); }
.library-list { border-top: 1px solid var(--color-border); }
.library-list .volume { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; align-items: center; gap: calc(2 * var(--treetutor-module)); min-height: 48px; border-bottom: 1px solid var(--color-border); }
.library-list .volume[data-current=true] { background: var(--color-neutral); }
.library-list .volume[data-renaming=true] { display: block; padding-block: var(--treetutor-module); }
.library-list .volume-band, .library-list .volume-meta { display: contents; }
.library-list .volume-spine { display: none; }
.library-list .saved-chat-title { justify-content: flex-start; height: auto; min-height: 40px; white-space: normal; overflow-wrap: anywhere; text-align: start; font-weight: 600; }
.library-list .volume-date { order: 1; min-width: 7rem; color: var(--color-text-secondary); }
.library-list .tree-row-actions { order: 2; }
@media (max-width: 48rem) { .library-list .volume { grid-template-columns: minmax(0, 1fr) auto auto; } .library-list .volume-date { display: none; } }
.conversation { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.conversation[hidden], .knowledge-panel[hidden], .library-panel[hidden] { display: none; }
.knowledge-panel, .library-panel { flex: 1; min-height: 0; overflow: auto; }
.knowledge-content { max-width: 70rem; margin-inline: auto; padding: calc(5 * var(--treetutor-module)) calc(4 * var(--treetutor-module)) calc(8 * var(--treetutor-module)); overflow-wrap: anywhere; }
/* Knowledge and Videos (mockup Knowledge, Videos): concepts on the deep field, familiarity by ring form, paper focus and selection. */
.knowledge-panel > .knowledge-header { width: 100%; max-width: 70rem; margin-inline: auto; padding-inline: calc(4 * var(--treetutor-module)); padding-block-end: 0; }
.knowledge-panel > .knowledge-header + .knowledge-content { padding-block-start: calc(3 * var(--treetutor-module)); }
.knowledge-content :focus-visible { outline: var(--focus-outline-width) solid var(--treetutor-paper); outline-offset: var(--focus-outline-offset); }
.knowledge-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(16rem, 360px); gap: calc(4 * var(--treetutor-module)); align-items: start; }
.knowledge-field { position: relative; height: 32rem; min-width: 0; overflow: hidden; border-radius: var(--radius-container); background: var(--color-background-muted); cursor: grab; touch-action: none; }
.knowledge-field:active { cursor: grabbing; }
.knowledge-map { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
.knowledge-links, .knowledge-regions { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; pointer-events: none; }
.knowledge-regions circle { fill: currentColor; fill-opacity: 0.1; stroke: currentColor; stroke-opacity: 0.4; stroke-width: 1px; vector-effect: non-scaling-stroke; }
.topic-label { position: absolute; width: min-content; color: var(--color-text-primary); font-size: 14px; line-height: 1.3; font-weight: var(--font-weight-semibold); text-align: center; overflow-wrap: break-word; }
.knowledge-links line { stroke: var(--color-border-emphasized); stroke-width: 1.5px; stroke-linecap: round; }
.knowledge-links line[data-kind="builds on"] { stroke: var(--color-text-secondary); }
.knowledge-links line[data-selected=true] { stroke: var(--treetutor-paper); stroke-width: 2px; }
.knowledge-links marker path { fill: var(--color-text-secondary); }
/* Concept points: the ring sits on the layout position; the label hangs below it. */
.concept-point { position: absolute; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 0; border: 0; border-radius: var(--radius-inner); background: none; color: var(--color-text-primary); font: inherit; cursor: pointer; transform: translate(-50%, -7px); }
.concept-point .fam { width: 14px; height: 14px; }
.concept-point .fam[data-fill=none] { background: var(--color-background-muted); }
.concept-point:hover .fam { box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-text-primary) 15%, transparent); }
.concept-point[aria-pressed=true] .fam { outline: 2px solid var(--treetutor-paper); outline-offset: 3px; }
.concept-name { max-width: 11rem; overflow: hidden; padding: 0 4px; border-radius: var(--radius-inner); background: color-mix(in oklab, var(--color-background-muted) 88%, transparent); font-size: 12px; font-weight: var(--font-weight-semibold); white-space: nowrap; text-overflow: ellipsis; }
.fam { display: inline-block; flex: none; width: 10px; height: 10px; border: 1.5px solid var(--color-text-primary); border-radius: 50%; }
.fam[data-fill=some] { background: linear-gradient(90deg, var(--color-text-primary) 50%, transparent 50%); }
.fam[data-fill=full] { background: var(--color-text-primary); }
.knowledge-key { display: flex; flex-wrap: wrap; gap: 8px 16px; margin-top: 12px; font-size: 12px; color: var(--color-text-secondary); }
.knowledge-key span { display: inline-flex; align-items: center; gap: 6px; }
.knowledge-key-links { margin-inline-start: auto; }
.knowledge-detail { position: sticky; top: 0; padding: 4px 0 0; }
.knowledge-detail h2 { font-size: 20px; font-weight: 700; }
.knowledge-reading, .knowledge-reading.astryx-text { font-family: var(--treetutor-font-reading); font-size: 15px; line-height: 1.6; color: var(--color-text-secondary); }
.knowledge-reading strong { color: var(--color-text-primary); font-weight: 600; }
.knowledge-evidence { display: grid; grid-template-columns: 1fr auto; gap: 6px 16px; margin: 0; font-size: 13px; color: var(--color-text-secondary); }
.knowledge-evidence dd { margin: 0; color: var(--color-text-primary); font-variant-numeric: tabular-nums; text-align: right; }
.knowledge-content .astryx-button[data-variant=secondary] { background: transparent; box-shadow: inset 0 0 0 1px var(--color-border-emphasized); }
.knowledge-content .astryx-button[data-variant=secondary]:hover { background: color-mix(in oklab, var(--color-text-primary) 8%, transparent); }
.knowledge-actions button[aria-pressed=true] { border-color: var(--color-accent); box-shadow: inset 0 0 0 1px var(--color-accent); background: var(--color-accent-muted); }
@media (max-width: 48rem) { .knowledge-panel > .knowledge-header { padding-inline: calc(2 * var(--treetutor-module)); } .knowledge-content { padding: calc(3 * var(--treetutor-module)) calc(2 * var(--treetutor-module)) calc(6 * var(--treetutor-module)); } .knowledge-body { grid-template-columns: minmax(0, 1fr); } .knowledge-detail { position: static; } .knowledge-field { height: 22rem; } .knowledge-key-links { margin-inline-start: 0; } }
.tree-workspace { position: relative; display: flex; flex: 1; min-height: 0; min-width: 0; flex-direction: row; }
.reading-workspace { display: flex; flex: 1; min-width: 0; min-height: 0; }
.contents { display: flex; flex-direction: column; flex: 0 0 calc(33 * var(--treetutor-module)); width: calc(33 * var(--treetutor-module)); min-height: 0; border-inline-end: thin solid var(--color-border); background: var(--color-background-muted); }
.contents-panel { flex: 1; min-height: 0; }
.contents-collapse { align-self: flex-start; margin: calc(-2 * var(--treetutor-module)) 0 0 calc(-1 * var(--treetutor-module)); }
.contents-rail { flex: none; display: flex; flex-direction: column; align-items: center; padding-block: var(--treetutor-module); border-inline-end: thin solid var(--color-border); background: var(--color-background-muted); }
.contents-head { flex: none; padding: calc(3 * var(--treetutor-module)) calc(2 * var(--treetutor-module)) calc(2 * var(--treetutor-module)); }
.contents-head h2 { font-size: 20px; line-height: 1.2; font-weight: 700; letter-spacing: -0.01em; overflow-wrap: anywhere; }
.contents-scroll { flex: 1; min-height: 0; overflow: auto; padding: 0 var(--treetutor-module) calc(2 * var(--treetutor-module)); }
.contents-label { padding: calc(2 * var(--treetutor-module)) var(--treetutor-module) 6px; font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.contents-list { list-style: none; margin: 0; padding: 0; }
.contents .contents-row { display: flex; width: 100%; height: auto; min-height: calc(4 * var(--treetutor-module)); justify-content: flex-start; gap: var(--treetutor-module); padding: 6px var(--treetutor-module) 6px calc(var(--treetutor-module) + var(--depth, 0) * 2 * var(--treetutor-module)); text-align: start; font-weight: 400; }
.contents-row[aria-current] { background: var(--color-background-surface); font-weight: 600; }
.contents-row > span:first-child > span { flex: 1; min-width: 0; }
.contents-row-body { display: flex; width: 100%; align-items: center; gap: var(--treetutor-module); }
.contents-address { flex: none; min-width: 34px; font-variant-numeric: tabular-nums; color: var(--color-text-secondary); }
.contents-dot { flex: none; width: var(--spacing-2); height: var(--spacing-2); border-radius: 50%; background: var(--ink); }
.contents-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.contents-row .contents-busy { flex: none; color: var(--color-text-secondary); }
.contents-empty { display: block; padding-inline: var(--treetutor-module); }
.contents-context { flex: none; padding: 12px calc(2 * var(--treetutor-module)) calc(2 * var(--treetutor-module)); border-block-start: thin solid var(--color-border); font-variant-numeric: tabular-nums; }
.contents-context meter { display: block; width: 100%; height: 4px; appearance: none; border: none; border-radius: var(--radius-inner); background: var(--color-border); }
.contents-context meter::-webkit-meter-bar { height: 4px; border: none; border-radius: var(--radius-inner); background: var(--color-border); }
.contents-context meter::-webkit-meter-optimum-value { background: var(--color-text-secondary); border-radius: var(--radius-inner); }
.contents-context meter::-moz-meter-bar { background: var(--color-text-secondary); border-radius: var(--radius-inner); }
/* Narrow contents drawer (mockup Narrow): view links, the outline, then Settings. */
.drawer-head { padding: var(--treetutor-module) var(--treetutor-module) var(--treetutor-module) calc(2 * var(--treetutor-module)); }
.band-drawer { min-height: 100%; background: var(--color-background-muted); }
.drawer-views { display: flex; flex-direction: column; padding: var(--treetutor-module); border-block-end: thin solid var(--color-border); }
.band-drawer .view-tab { width: 100%; justify-content: flex-start; font-weight: 400; }
.band-drawer .view-tab[aria-current=page] { background: var(--color-background-surface); font-weight: 600; }
.band-drawer .contents { flex: 1; width: 100%; border: 0; background: none; }
.band-drawer .drawer-settings { margin: var(--treetutor-module); width: auto; }
.band-drawer :focus-visible, .contents :focus-visible, .focused-chat [data-artifact]:focus-visible { outline: var(--focus-outline-width) solid var(--treetutor-paper); outline-offset: calc(-1 * var(--spacing-1)); }
.focused-chat, .overview { display: flex; flex: 1; min-width: 0; min-height: 0; flex-direction: column; }
.overview { position: relative; background: var(--color-background-body); }
.map-toolbar { position: absolute; z-index: 5; bottom: var(--spacing-3); left: var(--spacing-3); border: thin solid var(--color-border); border-radius: var(--radius-element); background: var(--color-background-surface); }
.ink-legend { position: absolute; z-index: 4; right: var(--spacing-4); bottom: var(--spacing-4); max-width: calc(100% - 16rem); max-height: 25%; overflow: auto; padding: var(--spacing-1) var(--spacing-2); background: var(--color-background-body); color: var(--color-text-secondary); font-size: var(--font-size-sm); }
.ink-legend ul { display: flex; flex-wrap: wrap; gap: var(--spacing-2) var(--spacing-4); margin: 0; padding: 0; list-style: none; }
.ink-legend li { display: flex; align-items: baseline; gap: var(--spacing-2); overflow-wrap: anywhere; }
.ink-legend .contents-dot { align-self: center; }
.overview[data-chat-open=true] .ink-legend { display: none; }
.overview :focus-visible { outline: var(--focus-outline-width) solid var(--treetutor-paper); outline-offset: var(--focus-outline-offset); }
.empty-map { flex: 1; text-align: center; width: 100%; max-width: none; margin-inline: auto; }
.empty-map > button { color: var(--color-text-accent); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.focus-reveal:not(:focus-visible) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.chat-header { padding: calc(var(--treetutor-module) / 2) calc(2 * var(--treetutor-module)); flex: none; max-height: 40dvh; overflow: auto; border-bottom: thin solid var(--color-border); }
.chat-heading-row > button:not(.model-picker) { flex-shrink: 0; }
.chat-stats-body { font-variant-numeric: tabular-nums; max-height: 20dvh; overflow: auto; padding-block: var(--spacing-1) var(--spacing-2); padding-inline: var(--spacing-2); overflow-wrap: anywhere; }
/* Theme tiles (mockup Settings): each wears its own theme; the checked one gets a paper ring and a check. */
.theme-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: var(--spacing-4); margin: 0; padding: 0; border: 0; min-width: 0; }
.theme-choice { position: relative; display: grid; gap: var(--spacing-2); cursor: pointer; }
.theme-tile { display: grid; gap: var(--spacing-2); height: 5.5rem; padding: var(--spacing-3); border-radius: var(--radius-element); background: var(--color-background-body); box-shadow: inset 0 0 0 1px var(--color-border); }
.theme-tile > i { display: block; border-radius: var(--radius-chat); }
.theme-tile-bubble { justify-self: end; width: 64%; height: 1.125rem; background: var(--color-neutral); }
.theme-tile-line { width: 80%; height: 0.375rem; background: var(--color-text-primary); opacity: .55; }
.theme-tile-inks { display: flex; gap: 0.375rem; align-self: end; }
.theme-tile-inks > i { width: 0.625rem; height: 0.625rem; border-radius: var(--radius-full); }
.theme-tile-inks > i:first-child { width: 1.375rem; border-radius: var(--radius-inner); }
.theme-choice-name svg { color: var(--color-text-accent); }
.theme-choice input:checked ~ * .theme-tile, .theme-choice input:focus-visible ~ * .theme-tile { outline: 2px solid var(--treetutor-paper); outline-offset: 3px; }
.question-bubble { background: var(--color-neutral); color: var(--color-text-primary); border-radius: var(--radius-chat); padding: var(--spacing-2) var(--spacing-3); overflow-wrap: anywhere; }
/* Read (mockup): the focused chat owns the centre at a 640px book measure; header, list and composer share it. */
.chat-reply, .chat-reply > * { max-width: 100%; }
.focused-chat .astryx-chat-message-list { width: 100%; max-width: calc(640px + 6 * var(--treetutor-module)); margin-inline: auto; padding: calc(4 * var(--treetutor-module)) calc(3 * var(--treetutor-module)) calc(5 * var(--treetutor-module)); box-sizing: border-box; }
.focused-chat .astryx-chat-message-list > :first-child { padding: 0; }
.conv-title .rename-title { height: auto; white-space: normal; text-align: start; }
.conv-title h2 { font-size: 34px; line-height: 1.12; font-weight: 700; letter-spacing: -0.015em; text-wrap: balance; }
.chat-header .chat-heading-row { min-height: calc(5 * var(--treetutor-module)); }
.crumbs { display: flex; flex: 1; align-items: center; gap: 6px; min-width: 0; color: var(--color-text-secondary); }
.crumbs .crumb { flex: 0 1 auto; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; padding-inline: 4px; font-weight: 400; color: var(--color-text-secondary); }
.crumbs .crumb:hover { color: var(--color-text-primary); }
.crumbs strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; color: var(--color-text-primary); }
.crumbs .addr { font-variant-numeric: tabular-nums; color: var(--color-text-secondary); }
.crumb-sep { flex: none; width: 16px; height: 16px; }
.stats-toggle[aria-pressed=true] { background: var(--color-overlay-pressed); }
/* Replies: Literata 17px/1.7, no bubble (mockup Read). Code keeps the theme's code face. */
.reply-md, .reply-md .astryx-text { font-family: var(--treetutor-font-reading); font-size: 17px; line-height: 1.7; }
.reply-md pre .astryx-text, .reply-md code .astryx-text { font-size: 13px; line-height: 1.6; }
.reply-md :not(pre) > code { padding: 1px 4px; border-radius: var(--radius-inner); background: var(--color-overlay-hover); font-size: 0.82em; }
.reply-md :is(h3, h4, h5, h6), .reply-md :is(h3, h4, h5, h6) .astryx-text { font-family: var(--treetutor-font-reading); font-weight: 600; }
.reply-md h3, .reply-md h3 .astryx-text { font-size: 20px; line-height: 1.3; }
.reply-md table, .reply-md table .astryx-text { font-family: var(--font-family-body); font-size: 14px; line-height: 1.45; }
.reply-status { display: inline-flex; align-items: center; gap: var(--spacing-2); font-size: 12px; color: var(--color-text-secondary); }
.reply-status[data-status=streaming]::before { content: ''; flex: none; width: var(--spacing-2); height: var(--spacing-2); border-radius: 50%; background: var(--color-accent); animation: pulse 1.2s ease-in-out infinite; }
.reply-status[data-status=failed] { color: var(--color-text-error); border-inline-start-color: var(--color-border-error); }
.chat-question:not(:first-child) { margin-block-start: calc(3 * var(--treetutor-module)); }
/* Streaming: a leaf caret after the last written block (mockup Read). */
.chat-reply:has(.reply-status[data-status=streaming]) .reply-md > :last-child:is(p, ul, ol, blockquote)::after { content: ''; display: inline-block; width: 8px; height: 1.1em; margin-inline-start: 2px; background: var(--color-accent); vertical-align: -0.2em; }
.usage-chart { position: relative; display: grid; gap: var(--spacing-1); }
.usage-chart svg { width: 100%; height: 12rem; display: block; overflow: visible; border-block-end: 1px solid var(--color-border); }
.usage-max { position: absolute; inset-block-start: 0; inset-inline-end: 0; transform: translateY(-100%); font-variant-numeric: tabular-nums; }
.usage-bar { outline: none; cursor: default; }
.usage-hit { fill: transparent; }
.usage-bar[data-active=true] .usage-hit { fill: var(--color-background-muted); }
.usage-bar:focus-visible .usage-hit { stroke: var(--focus-outline-color); stroke-width: var(--focus-outline-width); vector-effect: non-scaling-stroke; }
[data-series=input] { fill: var(--color-icon-blue); background: var(--color-icon-blue); }
[data-series=output] { fill: var(--color-icon-green); background: var(--color-icon-green); }
[data-series=cacheRead] { fill: var(--color-icon-yellow); background: var(--color-icon-yellow); }
.usage-swatch { inline-size: 0.75rem; block-size: 0.75rem; border-radius: var(--radius-inner); display: inline-block; }
.usage-total, .usage-readout, .usage-chart td { font-variant-numeric: tabular-nums; }
.usage-readout { min-block-size: 1.5em; }
.code-copy { position: absolute; inset-block-start: var(--spacing-1); inset-inline-end: var(--spacing-1); opacity: 0; transition: opacity 120ms ease; }
.reply-md pre:is(:hover, :focus-within) .code-copy { opacity: 1; }
@media (hover: none) { .code-copy { opacity: 1; } }
.chat-title .rename-title { width: 100%; min-width: 0; justify-content: flex-start; padding-inline: 0; }
.focused-chat .model-picker { flex-shrink: 1; min-width: 0; max-width: 100%; height: 24px; background: var(--color-overlay-hover); font-size: 12px; font-weight: 600; color: var(--color-text-primary); }
.focused-chat .model-picker .chat-model { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.passage { position: relative; align-self: stretch; }
.reply-md { display: block; min-width: 0; overflow-wrap: anywhere; }
.reply-md > * + * { margin-block-start: calc(2 * var(--treetutor-module)); }
.reply-md p, .reply-md figure { margin-inline: 0; }
.reply-md :is(h3, h4, h5, h6) { margin-block-start: var(--spacing-5); margin-block-end: var(--spacing-2); }
.reply-md > :first-child { margin-block-start: 0; }
.reply-md :is(ul, ol) { padding-inline-start: var(--spacing-5); list-style-position: outside; }
.reply-md ul { list-style-type: disc; }
.reply-md ol { list-style-type: decimal; }
.reply-md li + li { margin-block-start: var(--spacing-1); }
.reply-md blockquote { margin-inline: 0; padding-inline-start: var(--spacing-3); border-inline-start: thin solid var(--color-border-emphasized); color: var(--color-text-secondary); }
.reply-md pre { position: relative; margin-inline: 0; padding: 12px 48px 12px 16px; background: var(--color-background-muted); border-radius: var(--radius-container); white-space: pre-wrap; overflow-wrap: anywhere; }
.reply-md pre > code { display: block; padding: 0; background: transparent; white-space: inherit; font-size: var(--font-size-sm); }
.reply-md code .astryx-text { font-family: inherit; white-space: inherit; }
.reply-md a { color: var(--color-text-primary); text-decoration: underline; text-underline-offset: var(--spacing-1); }
.reply-md .md-table { max-width: 100%; overflow-x: auto; }
.reply-md table { width: 100%; border-collapse: collapse; }
.reply-md :is(th, td) { padding: 8px 12px; border-bottom: thin solid var(--color-border); text-align: start; }
.reply-md th { border-bottom-color: var(--color-border-emphasized); color: var(--color-text-secondary); }
.reply-md th { background: var(--color-overlay-hover); font-weight: 600; }
.reply-md math[display=block] { padding-block: var(--spacing-2); max-width: 100%; overflow-x: auto; }
.reply-md [data-reveal], mark { background: var(--treetutor-selection); color: var(--color-text-primary); border-radius: var(--radius-inner); }
::highlight(passage) { background-color: var(--treetutor-selection); color: var(--color-text-primary); }
/* Suggestions hint in muted dotted chalk; a branched (explored) passage wears its branch family's ink (--ink, set inline) and address chip, shared with its map line and node band. */
.reply-md u.suggestion { text-decoration: underline dotted var(--color-text-secondary); text-decoration-thickness: 2px; text-underline-offset: 4px; }
.reply-md u.suggestion { cursor: pointer; }
.reply-md u.suggestion.explored { text-decoration-style: solid; text-decoration-color: var(--ink, var(--color-accent)); text-decoration-thickness: 2px; }
.reply-md .passage-address { display: inline-block; margin-inline-start: 2px; padding: 0 4px; border-radius: var(--radius-inner); background: var(--ink); color: var(--ink-on); font: var(--font-weight-bold) var(--font-size-xs)/1.45 var(--font-family-body); font-variant-numeric: tabular-nums; vertical-align: 5px; text-decoration: none; user-select: none; }
.reply-md u.suggestion:hover { text-decoration-color: var(--color-text-primary); }
.reply-md u.suggestion.explored:hover { text-decoration-color: var(--ink, var(--color-accent)); }
.reply-md u.suggestion:focus-visible { outline: medium solid var(--focus-outline-color); outline-offset: var(--spacing-1); border-radius: var(--radius-element); }
.reply-md .md-source-syntax { white-space: pre-wrap; font-family: monospace; }
/* Visuals blend into the reply: no card chrome, full column width, height from the frame's reported content. */
.visual { position: relative; margin: 20px 0; min-width: 0; }
.visual-shimmer { display: block; width: 100%; height: 180px; }
.visual-frame { display: block; width: 100%; height: 0; border: 0; background: transparent; }
/* Chrome skips rendering hidden cross-origin frames, so a loading frame sits transparent over the shimmer instead. */
.visual-frame:not([data-ready]) { position: absolute; inset: 0; height: 100%; opacity: 0; }
.visual-actions { position: absolute; inset: 0 0 auto auto; gap: 2px; padding: 2px; border: thin solid var(--color-border); background: var(--color-background-popover); border-radius: var(--radius-container); opacity: 0; }
.visual:is(:hover, :focus-within) .visual-actions { opacity: 1; }
.diagram-card { align-self: stretch; min-width: 0; max-width: 100%; border-radius: var(--radius-container); background: var(--color-background-surface); color: var(--color-text-primary); overflow-wrap: anywhere; }
.diagram-card h3 { font-size: 14px; font-weight: 600; }
.diagram-open { display: block; max-width: 100%; padding: 0; border: 0; background: none; cursor: zoom-in; }
.diagram-open img { display: block; max-width: 100%; height: auto; }
.video-library { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 18rem), 1fr)); gap: 32px 24px; align-items: start; }
.video-volume { min-width: 0; overflow-wrap: anywhere; }
.video-volume h3 { margin-top: 4px; font-size: 15px; font-weight: 600; }
.video-volume-actions { margin-inline-start: -8px; }
.video-frame { display: block; width: 100%; aspect-ratio: 16 / 9; border-radius: var(--radius-container); background: var(--color-background-body); }
.video-stage { position: relative; }
.video-stage > .astryx-skeleton, .video-controls { position: absolute; inset: 0; }
.video-card[data-state=ready] .video-controls { inset: var(--spacing-2) var(--spacing-2) auto auto; padding: 0; background: var(--color-background-surface); border-radius: var(--radius-element); }
.video-inline { min-width: 0; width: 100%; overflow-wrap: anywhere; }
.video-inline .astryx-text { font-family: var(--font-family-body); font-size: var(--text-supporting-size); line-height: var(--text-supporting-leading); }
.video-inline .astryx-button, .video-inline .astryx-button .astryx-text { font-family: var(--font-family-body); font-size: var(--text-label-size); line-height: var(--text-label-leading); }
.video-inline:not([data-state=ready]) .video-controls { position: static; flex-direction: row; justify-content: flex-start; gap: 12px; padding: 4px 0; }
.video-status-icon { flex: none; width: 16px; height: 16px; color: var(--color-text-secondary); }
.video-inline .video-controls > [role=status] { min-width: 0; }
.video-inline .video-controls > button { flex: none; }
.video-inline[data-state=ready] .video-controls { flex-direction: row; opacity: 0; }
.video-inline[data-state=ready]:is(:hover, :focus-within) .video-controls { opacity: 1; }
@media (hover: none) { .visual-actions, .video-inline[data-state=ready] .video-controls { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .video-stage .astryx-skeleton, .video-stage .astryx-skeleton::after { animation: none; } }
/* Inline videos sit on the video's own dark paper in both appearances (docs/video-quality-spec.md); color-scheme: dark resolves the theme's dark values. */
.video-inline video.video-frame { color-scheme: dark; background: var(--color-background-body); }
/* Pending draft frame: storyboard ink drawing and erasing behind the real steps, elapsed time, estimated bar and Cancel. */
.video-inline[data-state=pending] .video-stage { color-scheme: dark; background: var(--color-background-body); color: var(--treetutor-paper); box-shadow: inset 0 0 0 1px var(--color-border); border-radius: var(--radius-container); overflow: hidden; container-type: inline-size; }
.video-draft { position: absolute; inset: 0; }
.video-sketch { position: absolute; inset: 0; width: 100%; height: 100%; fill: none; stroke: var(--treetutor-paper); stroke-opacity: 0.2; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.video-sketch path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: video-sketch 7.2s cubic-bezier(0.22, 1, 0.36, 1) infinite both; }
.video-sketch .video-sketch-mark { stroke: var(--treetutor-ink-1); stroke-opacity: 0.55; }
@keyframes video-sketch { 0% { stroke-dashoffset: 1; } 45%, 72% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -1; } }
.video-steps { position: absolute; left: 24px; bottom: 26px; margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; font: 500 13px/1.35 var(--font-family-body); }
.video-steps li { display: flex; align-items: center; gap: 8px; color: var(--color-text-secondary); }
.video-steps li > i { flex: none; width: 7px; height: 7px; margin-inline: 2.5px; border-radius: 50%; border: 1.5px solid currentColor; }
.video-steps li > svg { flex: none; width: 12px; height: 12px; stroke-width: 2.5; color: var(--treetutor-ink-2); }
.video-steps li[data-step=active] { color: var(--treetutor-paper); font-weight: 600; }
.video-steps li[data-step=active] > i { background: var(--treetutor-ink-1); border-color: var(--treetutor-ink-1); animation: video-pulse 1.6s ease-in-out infinite; }
.video-steps small { font-weight: 400; font-size: 12px; color: var(--color-text-secondary); font-variant-numeric: tabular-nums; }
@keyframes video-pulse { 50% { opacity: 0.35; } }
.video-inline[data-state=pending] .video-controls { position: absolute; inset: auto 16px 18px auto; flex-direction: row; align-items: center; gap: 12px; padding: 0; }
.video-elapsed { font: 500 13px/1 var(--font-family-body); font-variant-numeric: tabular-nums; color: var(--color-text-secondary); }
.video-draft-bar { position: absolute; inset: auto 0 0 0; height: 3px; background: var(--color-border); }
.video-draft-bar > i { display: block; height: 100%; background: var(--treetutor-ink-1); transform-origin: left; transition: transform 1.2s linear; }
@container (width < 440px) { .video-steps li:not([data-step=active]) { display: none; } .video-sketch { opacity: 0.6; } .video-inline[data-state=pending] .video-controls { inset: 8px 8px auto auto; } }
@media (prefers-reduced-motion: reduce) { .video-sketch path { animation: none; stroke-dashoffset: 0; } .video-steps li[data-step=active] > i { animation: none; } .video-draft-bar > i { transition: none; } }
/* Figure caption under the player: title in Archivo, description in the reading face. */
.video-caption { padding-inline: 2px; }
.video-inline .video-caption :is(h3, h3 *) { margin: 0; font: 600 var(--text-label-size)/var(--text-label-leading) var(--font-family-heading); color: var(--color-text-primary); }
.video-inline .video-caption .astryx-text:not(h3, h3 *) { max-width: 65ch; font-family: var(--treetutor-font-reading); font-size: 15px; line-height: 1.55; color: var(--color-text-secondary); }
/* Lightbox caps media at natural size; generated videos are small, so fill the viewer (contain keeps 16:9). */
.astryx-lightbox video { width: 92vw; height: calc(100dvh - 8rem); }
/* Media viewers share the raised sheet and dimmed paper backdrop; no blur. */
.astryx-lightbox::backdrop { backdrop-filter: none !important; background: var(--color-overlay); }
.astryx-lightbox :is(img, video), .visual-viewer { background: var(--color-background-popover); outline: thin solid var(--color-border-emphasized); border-radius: var(--radius-container); }
.visual-viewer h2 { margin: 0 32px 8px 0; font-size: 16px; font-weight: 700; }
.visual-viewer p { margin-block-end: 16px; color: var(--color-text-secondary); }
.viewer-close { position: absolute; inset: 8px 8px auto auto; }
.video-frame:focus-visible { outline: medium solid var(--color-text-primary); outline-offset: var(--spacing-1); }
.inherited-context { border-radius: var(--radius-container); background: var(--color-background-surface); padding-inline: 12px; color: var(--color-text-primary); }
.inherited-context .astryx-collapsible-trigger { padding: 10px 0; color: inherit; font-weight: 600; }
.inherited-body { margin: 0; padding: 0 var(--treetutor-module) calc(2 * var(--treetutor-module)); display: grid; gap: var(--spacing-1); font-size: var(--font-size-sm); }
.inherited-body dt { color: var(--color-text-secondary); font-weight: 500; margin-block-start: var(--spacing-2); }
.inherited-body dd:first-of-type { border-inline-start: 2px solid var(--ink, var(--color-accent)); padding-inline-start: 12px; color: var(--color-text-primary); }
.inherited-body dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; color: var(--color-text-secondary); font-family: var(--treetutor-font-reading); font-size: var(--font-size-base); line-height: 1.7; }
.diagram-source { max-height: 12rem; overflow: auto; margin: 0; padding: var(--spacing-2); background: var(--color-background-body); color: var(--color-text-primary); font-size: var(--font-size-sm); }
.diagram-card:focus-visible, .diagram-open:focus-visible, .diagram-source:focus-visible { outline: medium solid var(--color-text-primary); outline-offset: calc(-1 * var(--spacing-1)); }
.selection-action { position: absolute; z-index: 3; margin-top: var(--spacing-1); transform: translateX(-50%); animation: rise 140ms cubic-bezier(0.16, 1, 0.3, 1); }
@keyframes rise { from { opacity: 0; transform: translate(-50%, var(--spacing-1)); } }
.passage-box { position: absolute; z-index: 3; width: min(100%, 320px); transform: translateY(-100%); margin-top: calc(-1 * var(--spacing-1)); }
/* Raised paper surfaces and a paper passage border (mockup States). */
.branch-form { margin-top: var(--spacing-2); border: thin solid var(--treetutor-paper); border-radius: var(--radius-container); background: var(--color-background-popover); }
.branch-passage { flex: 1; min-width: 0; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; overflow-wrap: anywhere; font-family: var(--treetutor-font-reading); }
.branch-question { flex: 1; min-width: 0; }
/* One frame: the paper sheet is the edge; its field keeps only its focus ring. */
.branch-form .astryx-text-input:not(:focus-within) { border-color: transparent; box-shadow: none; }
.branch-send { flex: none; }
.astryx-alert-dialog h2 { margin-block-end: var(--spacing-2); }
.astryx-alert-dialog, .merge-dialog { background: var(--color-background-popover); }
/* Rose is failure-only; deletion is separated, outlined paper, filled on keyboard focus. */
.astryx-alert-dialog .astryx-button[data-variant=destructive] { background: transparent; color: var(--color-text-primary); box-shadow: inset 0 0 0 1px var(--color-border-emphasized); }
.astryx-alert-dialog .astryx-button[data-variant=destructive]:not(:first-child) { margin-inline-start: 32px; }
.astryx-alert-dialog .astryx-button[data-variant=destructive]:focus-visible { background: var(--treetutor-paper); color: var(--treetutor-paper-ink); outline-color: var(--treetutor-paper); }
.delete-dialog[data-failed=true] [id$=description] { color: var(--color-text-error); }
.delete-menu-item { border-block-start: thin solid var(--color-border); margin-block-start: 4px; }
.astryx-dropdown-menu { background: var(--color-background-popover); }
/* Model menu: the current model wears the leaf check. */
.astryx-dropdown-menu .astryx-dropdown-menu-radio { background: none; border-color: transparent; }
.astryx-dropdown-menu .astryx-dropdown-menu-radio .astryx-radio-indicator-dot { display: none; }
.astryx-dropdown-menu .astryx-dropdown-menu-radio[data-checked=checked]::after { content: ''; width: 0.3rem; height: 0.6rem; border: solid var(--color-text-accent); border-width: 0 2px 2px 0; transform: translateY(-15%) rotate(45deg); }
.failure-banner, .visual[data-state=failed], .video-card:is([data-state=failed], [data-state=unavailable]) .video-controls, .diagram-card[data-state=failed] { border: thin solid var(--color-border-error); border-radius: var(--radius-element); background: var(--color-error-muted); padding: 8px 12px; color: var(--color-text-primary); overflow-wrap: anywhere; }
.failure-banner { flex-wrap: wrap; }
.failure-banner button { margin-inline-start: auto; flex: none; }
.workspace-failure { margin: 8px 16px; }
.visual[data-state=failed] { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
.visual[data-state=failed] > button { margin-inline-start: auto; }
.failure-icon { flex: none; width: 16px; height: 16px; color: var(--color-text-error); }
.title-editor { display: grid; grid-template-columns: minmax(0, 1fr) auto; width: 100%; align-items: end; }
.title-editor > [role=alert] { grid-column: 1 / -1; }
.title-editor > :last-child { justify-content: flex-end; }
.first-question { width: min(100%, 560px); margin: 48px auto; }
.first-question > .astryx-chat-composer { width: 100%; text-align: left; }
.first-question h2 { font-size: 20px; font-weight: 700; text-align: center; }
.tree-loading { width: min(100%, 640px); }
@media (prefers-reduced-motion: reduce) { .tree-loading .astryx-skeleton, .tree-loading .astryx-skeleton::after { animation: none; } }
.focused-chat { flex: 1; min-width: 0; background: var(--color-background-body); position: relative; }
/* Turn rail: one tick per learner question on the chat's right edge; the current one is long and inked. */
.turn-rail { position: absolute; z-index: 3; right: var(--spacing-2); top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: flex-end; max-height: 60%; overflow-y: auto; scrollbar-width: none; }
.turn-rail .turn-tick { min-width: 0; min-height: 0; width: var(--spacing-6); height: var(--spacing-3); padding: 0; justify-content: flex-end; border-radius: var(--radius-inner); }
.turn-rail .turn-tick span[aria-hidden] { display: block; width: 10px; height: 2px; background: var(--color-border); transition: width 120ms ease-out, background-color 120ms ease-out; }
.turn-rail .turn-tick:hover span[aria-hidden] { background: var(--color-text-secondary); }
.turn-rail .turn-tick[aria-current=true] span[aria-hidden] { width: 18px; background: var(--color-text-primary); }
@media (prefers-reduced-motion: reduce) { .turn-rail .turn-tick span[aria-hidden] { transition: none; } }
/* The map docks right of the reading column on the deep panel (mockup Read: 440px default, seam on its left edge). */
.overview[data-chat-open=true] { flex: 0 0 var(--map-width); border-left: thin solid var(--color-border); }
.overview[data-chat-open=true] .tree-canvas, .overview[data-chat-open=true] .react-flow { --xy-background-color: var(--color-background-muted); background: var(--color-background-muted); }
.chat-divider { flex: none; position: relative; z-index: 5; width: var(--spacing-2); margin-inline: calc(-1 * var(--spacing-1)); cursor: col-resize; touch-action: none; }
.chat-divider::after { content: ''; position: absolute; inset-block: 0; left: 50%; width: 2px; transform: translateX(-50%); background: transparent; transition: background-color 120ms ease-out; }
.chat-divider:hover::after, .chat-divider:active::after, .chat-divider:focus-visible::after { background: var(--treetutor-paper); }
.chat-divider:focus-visible { outline: medium solid var(--focus-outline-color); outline-offset: 0; }
.focused-chat > .astryx-chat-layout { flex: 1; min-height: 0; overflow: auto; }
/* Floating composer: the dock fades in rather than drawing a band; it ignores pointers so passages above stay selectable. */
.focused-chat .astryx-chat-layout > :last-child { background: linear-gradient(to bottom, transparent, var(--color-background-body) var(--spacing-8)); pointer-events: none; }
.focused-chat .astryx-chat-layout > :last-child > * { pointer-events: auto; }
.focused-chat .astryx-chat-layout > :last-child > :first-child { pointer-events: none; }
.focused-chat .astryx-chat-layout > :last-child > :first-child button { pointer-events: auto; }
.focused-chat .astryx-chat-layout > :last-child > :nth-child(2) { display: none; }
.focused-chat .astryx-chat-composer { width: 100%; max-width: calc(640px + 6 * var(--treetutor-module)); margin-inline: auto; padding-inline: calc(3 * var(--treetutor-module)); box-sizing: border-box; }
.focused-chat .astryx-chat-composer > :first-child { flex-direction: column; align-items: stretch; gap: var(--spacing-2); border: thin solid var(--color-border-emphasized); border-radius: var(--radius-container); background: var(--color-background-surface); padding-block: var(--spacing-2); }
.focused-chat .astryx-chat-composer > :first-child:focus-within { border-color: var(--treetutor-paper); box-shadow: 0 0 0 1px var(--treetutor-paper); }
.focused-chat .astryx-chat-composer > :first-child > :first-child { min-width: 0; }
.focused-chat .astryx-chat-composer > :first-child > :last-child { min-width: 0; }
.focused-chat .astryx-chat-composer > :first-child > :last-child > :first-child { flex: 1; min-width: 0; }
/* Let a wrapped empty placeholder size the editor instead of overlapping the footer. */
.focused-chat .astryx-chat-composer-input { display: grid; }
.focused-chat .astryx-chat-composer-input > [aria-hidden=true] { position: static; grid-area: 1 / 1; }
.focused-chat .astryx-chat-composer-input > [contenteditable] { grid-area: 1 / 1; }
.focused-chat .astryx-chat-send-button { border-radius: var(--radius-element); }
.tree-canvas { flex: 1; min-height: 0; background: var(--color-background-body); }
.tree-canvas:focus-visible { outline: var(--focus-outline-width) solid var(--focus-outline-color); outline-offset: calc(-1 * var(--spacing-1)); }
.tree-workspace[data-expanded=true] .overview { display: none; }
.tree-workspace[data-expanded=true] .focused-chat { flex: 1; border-left: 0; }
::view-transition { pointer-events: none; }
::view-transition-group(chat-panel) { animation-duration: 220ms; animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
::view-transition-group(conversation) { animation-duration: 220ms; animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
@media (prefers-reduced-motion: reduce) {
 ::view-transition-group(*), ::view-transition-old(*), ::view-transition-new(*) { animation: none; }
}
.conversation-box { width: var(--treetutor-map-node-width); border: thin solid var(--color-border); border-radius: var(--radius-element); background: var(--color-background-surface); overflow-wrap: anywhere; transition: border-color var(--duration-fast) ease-out; }
.react-flow__node:hover .conversation-box { border-color: var(--color-text-secondary); }
.conversation-box[data-focused=true] { outline: var(--focus-outline-width) solid var(--treetutor-paper); outline-offset: var(--focus-outline-offset); }
.conversation-box .node-band { margin: calc(-1 * var(--spacing-3)) calc(-1 * var(--spacing-3)) 0; padding: var(--spacing-1) var(--spacing-2); border-radius: calc(var(--radius-element) - 1px) calc(var(--radius-element) - 1px) 0 0; background: var(--ink); color: var(--ink-on); }
.conversation-box .node-band :is(h2, button, .astryx-icon) { color: var(--ink-on); }
.conversation-box .node-band :focus-visible { outline-color: var(--treetutor-paper); outline-offset: var(--spacing-2); }
.conversation-box .node-band .activity-dot, .conversation-box[data-active=true] .node-band .activity-dot { background: var(--ink-on); }
.node-address { flex: none; color: inherit; font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold); }
.conversation-box .node-title { flex: 0 1 auto; min-width: 0; justify-content: flex-start; padding-inline: var(--spacing-1); text-align: start; }
.conversation-box .node-title h2 { font-size: var(--font-size-base); font-weight: var(--font-weight-semibold); line-height: 1.3; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.node-extra { margin-inline-start: auto; opacity: 0; transition: opacity 120ms ease-out; }
.react-flow__node:hover .node-extra, .react-flow__node:focus-within .node-extra, .node-extra:focus-visible { opacity: 1; }
@media (hover: none) { .node-extra { opacity: 1; } }
.activity-dot { display: inline-block; flex: none; width: var(--spacing-2); height: var(--spacing-2); border-radius: 50%; background: var(--color-text-secondary); }
.conversation-box[data-active=true] .activity-dot { background: var(--color-accent); animation: pulse var(--duration-slow-max) ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.3; } }
@media (prefers-reduced-motion: reduce) { .conversation-box[data-active=true] .activity-dot, .react-flow__edge .react-flow__edge-path.branch-new, .selection-action, .reply-status::before, .visual-shimmer, .visual-shimmer::after { animation: none; } .chat-divider::after, .conversation-box, .node-extra, .diagram-card .astryx-icon, .reply-usage, .reply-copy, .code-copy { transition: none; } }
.react-flow__node:focus-visible { outline: none; }
.react-flow__node:focus-visible .conversation-box { outline: var(--focus-outline-width) solid var(--focus-outline-color); outline-offset: var(--focus-outline-offset); }
.react-flow__edge:focus-visible { outline: none; }
.react-flow__edge:focus-visible .react-flow__edge-path { stroke: var(--focus-outline-color); stroke-width: var(--treetutor-branch-focus-width); }
.conversation-box button { height: auto; white-space: normal; }
.node-message[data-role=user] { align-items: flex-end; }
.node-message[data-role=user] .question-bubble { max-width: 85%; padding: var(--spacing-1) var(--spacing-2); }
.node-message { position: relative; }
.node-message .node-bubble { height: auto; max-width: 100%; padding: 0; white-space: normal; text-align: start; justify-content: flex-start; }
.node-message[data-role=user] .node-bubble { max-width: 85%; }
.node-message[data-role=user] .node-bubble .question-bubble { max-width: 100%; }
.node-status { display: flex; align-items: center; gap: var(--spacing-1); color: var(--color-text-secondary); }
.node-status[data-status=failed] { color: var(--color-error); }
.node-status svg { flex: none; width: var(--spacing-4); height: var(--spacing-4); }
.node-retry { align-self: flex-start; }
.node-message .react-flow__handle { right: calc(-1 * var(--spacing-3)); }
.fold-stub { position: absolute; left: 100%; top: 50%; transform: translateY(-50%); display: flex; align-items: center; pointer-events: auto; }
.fold-stub::before { content: ''; width: var(--spacing-5); border-top: var(--treetutor-branch-width) dashed var(--ink); }
.fold-stub button { background: var(--color-background-body); border: thin dashed var(--color-border-emphasized); padding: var(--spacing-1) var(--spacing-2); white-space: nowrap; color: var(--color-text-secondary); }
.react-flow__edge-path { stroke: var(--ink, var(--treetutor-branch-color)); stroke-width: var(--treetutor-branch-width); stroke-linecap: round; }
.react-flow__edge.branch-focused .react-flow__edge-path { stroke: var(--ink, var(--color-accent)); stroke-width: var(--treetutor-branch-focus-width); }
.react-flow__edge-path.branch-new { animation: branch-draw var(--treetutor-branch-draw-duration) ease-out; }
@keyframes branch-draw { from { stroke-dasharray: 1; stroke-dashoffset: 1; } to { stroke-dasharray: 1; stroke-dashoffset: 0; } }
.react-flow__handle { background: var(--color-text-secondary); border-color: var(--color-background-surface); }
section[role=alert] { background: var(--color-background-body); }
/* Settings page (mockup Settings, Usage): page head, sticky section nav, one page at a time. */
.settings-content { --color-border-emphasized: var(--color-text-secondary); max-width: 1120px; margin-inline: auto; padding: calc(5 * var(--treetutor-module)) calc(4 * var(--treetutor-module)) calc(8 * var(--treetutor-module)); }
.settings-content :focus-visible { outline: var(--focus-outline-width) solid var(--treetutor-paper); outline-offset: var(--focus-outline-offset); }
.settings-head h1 { font-size: 34px; line-height: 1.12; font-weight: 700; letter-spacing: -.015em; }
.settings-layout { display: grid; grid-template-columns: 216px minmax(0, 640px); gap: 48px; align-items: start; }
.settings-nav { position: sticky; top: 0; width: auto; height: auto; background: transparent; border: 0; }
.settings-content :is(h1, h2) { scroll-margin-top: calc(5 * var(--treetutor-module)); }
.settings-group > :first-child h2 { font-size: 20px; line-height: 1.2; font-weight: 700; letter-spacing: -.01em; }
.settings-keys { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--spacing-2) var(--spacing-6); margin: 0; font-size: 13px; color: var(--color-text-secondary); }
.settings-keys > div { display: contents; }
.settings-keys dd { margin: 0; display: flex; gap: var(--spacing-1); justify-content: end; }
.settings-keys kbd { min-width: 20px; padding: 1px 5px; border: thin solid var(--color-border-emphasized); border-radius: var(--radius-element); font: 12px/1.4 monospace; text-align: center; }
/* Models page (mockup Models): profile bar, then one compact row per role; display: contents keeps ARIA rows inside the grid. */
.settings-profile { padding: var(--spacing-3) var(--spacing-3) var(--spacing-3) var(--spacing-4); border-radius: var(--radius-container); background: var(--color-background-surface); }
.settings-profile .astryx-selector, .settings-profile > :first-child { min-width: 180px; }
.settings-roles { display: grid; grid-template-columns: minmax(0, 1fr) 248px 152px; column-gap: var(--spacing-3); }
.settings-roles [role=cell]:not(.settings-roles__note) { display: flex; align-items: center; }
.settings-roles__row { display: contents; }
.settings-roles [role=columnheader] { padding-bottom: 6px; font-size: 12px; font-weight: 600; color: var(--color-text-secondary); }
.settings-roles [role=rowheader], .settings-roles [role=rowheader] ~ [role=cell] { padding: 10px 0; border-top: thin solid var(--color-border); }
.settings-roles__role b { display: block; font-weight: 600; }
.settings-roles__role small { display: block; font-size: 12px; color: var(--color-text-secondary); }
.settings-roles__note { grid-column: 1 / -1; }
.settings-roles__note:not(:has(:not(:empty))) { display: none; }
@media (max-width: 48rem) { .settings-roles { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } .settings-roles [role=rowheader] { grid-column: 1 / -1; } .settings-roles [role=rowheader] ~ [role=cell] { border-top: 0; padding-top: 0; } .settings-roles [role=columnheader] { display: none; } }
/* Settings sections: seams and small-caps labels, not cards (spec, Settings window). */
.settings-panel h3 { font-size: var(--font-size-base); font-weight: 600; font-variant-caps: all-small-caps; letter-spacing: 0.06em; color: var(--color-text-secondary); }
* { scrollbar-color: var(--color-border) var(--color-background-surface); }
@media (max-width: 48rem) {
 .ink-legend { bottom: calc(2 * var(--spacing-3) + var(--spacing-10)); max-width: calc(100% - 2 * var(--spacing-4)); }
 .shell-band { flex-wrap: wrap; height: auto; min-height: calc(7 * var(--treetutor-module)); padding-inline: var(--treetutor-module); overflow-x: visible; }
 .shell-band .band-mark { margin-inline-start: var(--treetutor-module); font-size: 17px; }
 .shell-band .band-save { flex-basis: 100%; flex-wrap: wrap; height: auto; margin-block-end: var(--treetutor-module); }
 .workspace { flex-direction: column; overflow: hidden; }
 .conversation { min-height: 0; flex: 1; }
 .overview[data-chat-open=true] { display: none; }
 .focused-chat { flex: 1; border-left: 0; }
 .expand-chat { display: none; }
 .settings-content { padding: calc(3 * var(--treetutor-module)) calc(2 * var(--treetutor-module)) calc(6 * var(--treetutor-module)); }
 .settings-layout { grid-template-columns: minmax(0, 1fr); gap: var(--spacing-6); }
 .settings-nav { position: static; }
}
`;
