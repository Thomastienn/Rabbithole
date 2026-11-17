---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["src/main.tsx","src/ChatPage.tsx","src/Contents.tsx","src/TreeOverview.tsx","src/KnowledgePage.tsx","src/VideoLibrary.tsx","src/SettingsWindow.tsx","src/layout.ts","src/themes/paperback/paperbackTheme.ts"]
---

# Rabbithole workspace (shipped app)

Mode: Operate. Build path: code-led. Design authority: DESIGN.md (written from the shipped build on 2026-11-13) and the static mockup in docs/mockups/ with its brief `.impeccable/surfaces/docs-mockups-index-html.md`. Lecture-hall Slate (2026-11-10) is superseded and kept only in Git history.

## Direction contract

Chosen by the owner on 2026-11-12 at the Impeccable decision page. World: **Paperback Series, Seasonal Inks**. Picked sketch: `.impeccable/mocks/decision/paperback-seasonal.html`. Shipped through TreeTutor-y36 (y36.1 to y36.11), finish-reviewed in TreeTutor-y36.12.

THESIS: A learning tree is a volume in a paperback series. The trunk is paper and each first-level branch family takes one muted leaf ink, worn by its passage underline, address chip, branch line, contents dot, library spine tick and conversation node band. It refuses the category default of a grey chat column beside a sidebar list with one blue accent.

OWN-WORLD: Dark default: bark-black ground (#1a1613), raised bark (#241f1a), deeper panels (#14110e), paper text (#efe6d6), moss shell band (#33432a). Series inks at equal weight: amber, leaf, rust, lichen, repeating (they fill the Astryx hue slots yellow, green, pink, blue so Mermaid and bubble tints follow). Leaf green is the one action colour; paper is the focus ring; rose red is failure only (deletion is outlined neutral, filled paper on focus). Light: paper ground with the same inks darkened to AA. Archivo for interface and titles, Literata for replies. 3px element and 4px container corners, hairline seams, an 8px module, flat ink bands, no texture.

STORY: The learner opens a volume from the Library, reads the reply at a book measure in the centre, sees where they are in the numbered contents on the left, and watches a branch they create appear on the docked map in its family's ink.

FIRST VIEWPORT: Desktop 1440x900. Moss band: Rabbithole wordmark, learning-tree switcher (opens the Library), view tabs Read, Map, Knowledge, Videos, then search, New chat, Settings; a map-layout save failure joins the band with Retry. Below, Read is three columns: Contents (264px: tree title and counts, numbered addresses with ink dots, Figures, context meter), the reading column (640px Literata measure, breadcrumbs, 34px title, composer at the foot with the model menu and the leaf-green Send), and the docked learning tree map (440px default, draggable seam, nodes with ink bands). Signature move: one ink per branch family from passage underline and address chip to branch line and node band; a new branch draws on in 350ms and shows at once under reduced motion.

FORM: Paperback Series, position 7 of seven grounded candidates. seed:ed446011afd27ce7. Raises kept: one module for every alignment; the reply owns the centre; figures numbered and listed in the contents; spine ticks per conversation; context budget as a running length.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance. Discharged 2026-11-13: finish review verdict ship (TreeTutor-y36.12), DESIGN.md written from the build, no shipping rasters (embed-prompt scan: 0).

### Per-screen rules

1. **Read.** Contents left, reading column centre, map docked right behind a seam that is pointer and keyboard resizable and persisted; Expand chat hides the map. Replies in Literata 17px/1.7 at most 640px, no bubble; questions are Archivo bubbles right aligned with the chosen tint. Branched passages underline in their family ink with an aria-hidden address chip. Inherited context is a collapsible ink-ruled section. Inline visuals and videos stay borderless at their stored position (docs/inline-visuals-spec.md).
2. **Map.** The Map tab gives the map the full workspace with an ink legend per first-level family. Left-to-right placement, edges anchored beside their source message and persisted node positions are product behaviour and stay. Nodes carry a full-width ink band with address and title; the trunk band is paper; focus and current node wear a paper ring. Folded stubs read "address · N folded". Failures show rose "Reply failed" with Retry reply. When the Map/Read switch resizes an untouched map it refits the whole tree with a 75% zoom floor and then reveals the selected node; a navigated map keeps its exact viewport; saved viewports restore on reload.
3. **Library.** Learning trees as volumes on a Shelf (default) or List, title search, date groups, a spine tick per conversation in family ink, Rename and Delete in a quiet menu, New chat in leaf green.
4. **Knowledge and Videos.** Page head like the Library on one 70rem column; the Return to learning tree row sits on the same column. Concepts on the deep field grouped by topic with a familiarity ring; paper selection; secondary actions are outlined hairline buttons; corrections pressed in leaf.
5. **Settings.** A page, not a dialog, with section navigation (Interface, Models, Connections, Usage). House Astryx radios and small-caps section labels are kept as functional headings.
6. **States and overlays.** Menus with leaf checks and a separated delete item; a paper-bordered passage prompt anchored to the selection; enlarged media on a raised overlay; sized skeletons while loading; rose only for failures; first run asks the first question through the composer.
7. **Narrow (≤48rem).** Band condenses to Contents (opens a drawer holding views, the outline and Settings), wordmark, search and New chat. One pane at a time; no screen scrolls sideways.

### Kept behaviour notes

- No idle "Saved" label: layout writes batch once a minute, so only the failure state shows (TreeTutor-y36.3).
- Explicit video requests reserve their place in the reply; pending shows a slim status line with phase and percentage plus Cancel; failure shows a safe reason and Retry; title and description stay accessible (TreeTutor-133.1, TreeTutor-zhf.6).
- Copy buttons on replies and code blocks, and title search across learning trees, remain adopted features.

### Usage page (TreeTutor-2li.11)

THESIS: Operate mode; read saved provider-reported usage in the existing Settings page. One selected range drives the summary, chart and breakdown. Calls include all attempts; missing-only token counts show a dash, never an estimate.

OWN-WORLD: Extend Paperback Series without changing its tokens. Archivo and tabular figures, seam-separated sections, house Astryx controls and tables; input is lichen, output leaf and cache read amber in both appearances. Server-supplied labels name providers.

STORY: Choose Today, Week, Month, a selected Year or All time; read the exact total and measured input/output/cache-read split, then inspect a period or switch the single breakdown between model and task. The split doubles as the chart legend. Viewing history never calls a provider.

FIRST VIEWPORT: Keep the Settings heading and section nav. A 34px exact total carries a 20px range qualifier above the split and call count. The chart's per-period/cumulative switch sits beside its small-caps heading; hover and keyboard focus expose exact values, with an expandable text table. The breakdown uses one table with 3px bars showing shares of reported tokens only. Narrow layouts wrap controls and keep table scrolling within the page.

FORM: Code-led ordinary extension, composition pinned by `docs/mockups/usage.html`; no new world, seed or tournament. Compare `src/UsageDashboard.tsx`, its Settings caller and `src/layout.ts` with PRODUCT.md, DESIGN.md and this surface contract. Preserve the parent direction and system files.

FINISH: Independent finish review verdict **ship** (2026-11-13): all ten Usage captures, the approved mockup, source and verification report inspected; no material findings. Recorded verification: build and `npm test` pass; 17 browser steps covered across dark/light at 1400×900 and 390×844, both chart and grouping modes, every range, a previous year, delayed-response selection changes, missing-only and empty states, and no provider calls. Settings regression checks pass (12 steps). Pre-existing drift: DESIGN.md is newer than `.impeccable/design.json`; reported without repair.
