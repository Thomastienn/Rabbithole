# Accessibility and visual polish audit

Verified under **TreeTutor-sh8.7**, 2026-11-10. Covers the map, nodes, chat
panel (beside, expanded, narrow), sidebar with settings and custom endpoint,
map and model menus, branch form, passage selection, diagram and video cards,
and empty, loading, error and signed-out states.

## Evidence and what kind it is

All browser evidence below is **fixture** evidence: synthetic providers, a
seeded SQLite tree, the production build and agent-browser Chromium. No live
provider was called for this task.

- `scripts/verify-polish.mjs <label>` seeds a markdown reply with table, code
  and math, a ready Mermaid diagram, a failed video, a branch, a second chat, a
  signed-in fixture Claude and a signed-out Codex. It records contrast in light
  and dark (map, chat, model menu, sidebar), visible motion under
  reduced motion, composer position after chat opens, unnamed controls, visible
  focus over 75 Tab stops, and page overflow plus composer reachability at
  390×844, 768×900, 2560×1080 and 720×450. 720×450 stands in for 1440×900 at
  200% zoom: same CSS viewport, so the same media queries apply.
- Before: [polish-before.json](polish-before.json); after:
  [polish-after.json](polish-after.json). Screenshots:
  `.impeccable/review/polish-{before,after}-*.png`.
- The before run's focus probe only checked the focused element. The after
  probe also checks the ring on a map box's inner box, a focused edge's
  thicker path and the composer's wrapper. The baseline CSS had no focus style
  on boxes or edges, so the baseline fails both probes.
- `impeccable detect src` reported no findings before or after.

| Check | Before | After |
| --- | --- | --- |
| Text contrast, light and dark (map, chat, model menu, sidebar) | 0 failures | 0 failures |
| Visible focus over 75 Tab stops | 13 stops without a ring (map boxes, edges) | 0 |
| Controls without an accessible name | 0 | 0 |
| Transitions still running under reduced motion | box border/shadow, source link fade, Mermaid source chevron, composer | composer border colour only (Astryx, no movement) |
| Composer moves after chat opens | no | no |
| Page overflow and composer reachable at narrow, breakpoint, wide, 200% | pass | pass |
| Tutor reply with a table or list | wrapped at about 250px in a 480px panel | uses the bubble's full width |

## Findings fixed

| Sev | Finding | Fix |
| --- | --- | --- |
| P1 | Map boxes and edges had no visible keyboard focus (WCAG 2.4.7) | Focused box gets a primary-text outline; focused edge path thickens and darkens (`src/layout.ts`) |
| P1 | Rich tutor replies (tables, lists) collapsed to shrink-to-fit width, so prose wrapped at half the panel | `.passage` stretches across the message column |
| P2 | Diagram cards filled the column but video cards shrank to fit their content | Cards stretch the same way |
| P2 | **Mermaid source** trigger was larger than the card's title | Trigger uses body text at medium weight |
| P2 | Box hover, source-link fade and the disclosure chevron still moved under reduced motion | Added to the reduced-motion block |
| P2 | React Flow chrome (attribution) stayed light in the dark scheme | `colorMode="system"` |
| P2 | No level-1 heading; toolbar `aria-label` on a generic element; zoom value named via `aria-label` on a span | Visually hidden **TreeTutor** h1; toolbars are `role="group"`; zoom has a visually hidden "Current zoom" label |
| P1 | Vim canvas bindings did nothing: the delete-confirmation AlertDialog stays mounted with `aria-modal`, so the "dialog open" guard was always true (regression from rename/delete) | Guard counts only visible menus and dialogs (`src/TreeOverview.tsx`); `verify-vim-bindings` passes again |
| P3 | Three `1px` borders in the stylesheet | `thin` like the other borders |

## Fixture drift repaired

The changes above did not cause these. Before any edit, three fixtures already
failed on a clean checkout because later features changed the DOM:

- `verify-compact-controls`: menus now stay mounted, so `querySelector('[role=menu]')`
  found the sidebar's chat-actions menu. It now uses the visible menu. The zoom
  selector is now `[data-zoom]`, and so is `verify-large-map`'s.
- `verify-keyboard-journey`: the model menu opens on the signed-out Claude group,
  so the first focused item is a `menuitem`. The script waits for focus inside
  the menu and arrows down to **Keyboard B**. The closed-menu check now looks at
  every menu.
- `verify-diagram-rendering`: replies render as markdown, so the drag now finds
  the first text node with a TreeWalker. It re-measures and retries if diagrams
  re-scroll the log. Because of the diagram-recovery work, a diagram left
  pending at server start becomes interrupted, so the fixture now expects 7
  failed and 0 pending.

- `verify-canvas-positions`: the highlighted passage no longer includes the
  paragraph's trailing space after markdown rendering. The fixture now compares
  against the trimmed text.

## Full fixture run (final build)

`npm test`: 127/127. Astryx `doctor --built dist`: 20 pass, 2 warn, 0 fail.
All 24 non-live `scripts/verify-*.mjs` fixtures pass, plus `verify-polish`.
`verify-branch-compaction` and `verify-codex-history` are explicit live Codex
evaluations. They were started during the sweep and failed at the Codex turn
(no live reply). They are not fixture evidence and were not rerun.

## Known issues left open

- **Bundle size.** The main chunk is 1.46 MB (454 KB gzip). Astryx core is about
  2.3 MB of source in it and is already imported per component. KaTeX (about
  78 KB gzip) loads eagerly because markdown renders synchronously with raw
  offsets for passage selection. Mermaid (162 KB gzip) and the diagram families
  were already lazy and stay out of the map view. The app is served from
  loopback, so this costs disk reads, not network time. Lazy KaTeX would need
  an async render path, which is a feature-sized change.
- **Composer transition.** Astryx's own border and shadow colour transition
  still runs under reduced motion. It changes colour, not position.
- **Two "Responding" status regions** while a reply runs with the chat open: the
  map box dot and the chat status line. They sit in different regions, and the
  map one is the only signal while the chat is collapsed.
- **Very wide windows.** The chat panel stays at 32rem beside a wide map. Expand
  chat gives the full width. Changing this would redesign the agreed
  map-first layout.
- **Wide Mermaid drawings** scroll inside their focusable viewport at panel
  width. This is intended.
- **Astryx doctor warnings** (no failures): it cannot prove the Figtree font
  because Vite aliases the theme font to the self-hosted `@fontsource` copy, and
  a source scan (not `--built dist`) flags existing `className`, inline style
  and Heroicons uses.
- **Not exercised:** touch drag on the map, a real browser zoom keystroke (the
  test uses the equivalent viewport), and screen-reader speech output. Live
  regions were checked in the markup, not by listening.
