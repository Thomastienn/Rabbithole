---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["src/shell/main.tsx","src/shell/ChatPage.tsx","src/shell/ShellBand.tsx","src/chat/Contents.tsx","src/chat/FocusedChat.tsx","src/map/TreeOverview.tsx","src/astryx-themes.ts"]
---

# Rabbithole workspace (shipped app)

Mode: Operate. Build path: code-led. The owner chose Line Diagram on 2026-11-19 and the app ships it (epic Rabbithole-ldr). DESIGN.md was rewritten from the build on 2026-11-20 after the finish review (Rabbithole-ldr.12); this contract and the mockups in `docs/mockups/line-diagram/` stay the design authority for later changes.

## Direction contract

Chosen by the owner on 2026-11-19 at the Impeccable decision page. World: **Line Diagram** (midnight transit diagram). Picked sketch: `.impeccable/mocks/decision/line-diagram.html`. Mockups: `docs/mockups/line-diagram/`.

THESIS: A learning tree is a line diagram. Each first-level branch family is a line with one colour, each conversation is a station, and each branch point is an interchange at the passage the learner selected. It refuses the category default of a grey chat column beside a list of chat titles with one accent.

OWN-WORLD: Dark default: midnight enamel ground (#0b1230), deeper sidebar and map field (#070d24), raised enamel (#141d42), ink (#e9ecf7), muted (#97a1c4). Porcelain white is the trunk line, the station ring, the focus ring and the primary action (white fill, midnight text). Four lines at equal weight, repeating: cobalt, amber, green, magenta. Scarlet is failure only. Light: porcelain ground, midnight ink and action, the same lines darkened to AA. Barlow for the interface, Barlow Semi Condensed for titles, caps labels and the wordmark, Atkinson Hyperlegible Next for replies at 17px/1.68. 8px corners on controls and containers, 4px on chips. Lines are thick and round-capped (5px in the sidebar, 7px on the map) and turn only at 45 or 90 degrees; stations are white-ringed circles. Flat: no shadow, gradient or blur. No coloured bar sits beside text anywhere (owner rule, 2026-11-19).

STORY: The learner opens a learning tree, reads the reply at a 640px measure, sees where they are on the route strip in the sidebar, selects a passage, and watches a new line leave that interchange on the map.

FIRST VIEWPORT: Desktop 1440x900 with no top bar (docs/sidebar-spec.md stands). Sidebar, 272px on the deep field: wordmark, New chat in white with search beside it, the six views, the tree title, Contents drawn as a vertical route strip (5px lines, ringed stations, addresses), Figures, Resources, the context meter, then Downloads and Settings pinned at the foot. Reading column: the chat header row, a 38px Semi Condensed title led by its address chip, the origin line, the question bubble, the reply, and the composer pinned at the foot with the white Send. Docked map, 440px on the deep field: conversation cards joined by 7px family lines that leave an interchange ring beside their source message; controls bottom left, line key top left (the controls bar takes the bottom edge at 440px). Below 1024px the docked map is hidden and Map stays one click away in the sidebar. Signature move: one colour per family, from passage underline, interchange ring and address chip to the route strip and the map line. Signature interaction: creating a branch draws the new line out of its interchange ring along the 45 degree path in 350ms, then the station ring lands; reduced motion shows it at once. Motion grammar: lines draw along their path with an exponential ease-out; everything else changes state without travel.

FORM: Line Diagram, a challenger the owner picked over the rolled form (Slip Box, position 3 of seven grounded candidates). seed:d269121b131cc617. Code-led; the picked sketch is the critique reference. Raises kept from the round: panels persist; one thing owns the reading column; fixed columns, state restyles the row only.

FINISH: unreviewed and undocumented is unfinished; this mockup build ends with the finish review and its verdict (done: disposition fix, fixes applied). DESIGN.md is rewritten when the new world ships in app code, not before

### Departures from the picked sketch

1. No top bar. The sketch drew one; the shipped shell is the sidebar from docs/sidebar-spec.md, and the world never changes the navigation model. Views, search, New chat and Settings sit in the sidebar.
2. No coloured bar beside the title (owner feedback). The family shows as the filled address chip that leads the title.
3. No small caps label above the title. The origin line under the title carries "from which passage".
4. The map keeps conversation cards with turn previews, edges anchored beside the source message, and learner-placed node positions. The lines between cards carry the diagram. Routing rule: a line leaves its ring horizontally, turns 45 degrees, runs vertically through the centre of the gutter (at least 40px clear of any card edge) when the rise exceeds the run, turns 45 degrees again and enters the target ring horizontally; rings at the same height join with one straight horizontal. A child placed left of or above its parent is an open question, not drawn.

### Per-screen rules

1. **Read.** Sidebar left, reading column centre, map docked right behind a resizable seam; Expand chat hides the map. Replies in Atkinson Hyperlegible Next at most 640px, no bubble; questions are right-aligned bubbles in the theme's neutral tint. A branched passage wears a 3px underline in its family colour, a white interchange ring and an aria-hidden address chip. Suggestions are dotted underlines. Inherited context is a collapsible tonal section. Inline visuals, diagrams and videos keep their stored position.
2. **Map.** Full workspace with the sidebar still present. Cards carry a header with address chip and Semi Condensed title; the current card wears a white ring; the trunk chip is white. Folded stubs read "address · N folded". Failures show scarlet "Reply failed" with Retry reply. Ghost trees are dashed and muted. Viewport, fit and reveal rules are unchanged product behaviour.
3. **Library.** Learning trees as line cards on a Shelf (default) or List: title, date, and a strip of short line ticks, one per conversation in family colour. Title search, date groups, Rename and Delete in a quiet menu.
4. **Knowledge, Videos, Pieces.** Page head on one 70rem column with Return to learning tree above it. Concepts are stations on the deep field grouped by topic, familiarity shown by ring fill; relations are thin neutral lines, never family colours.
5. **Settings and Usage.** A page with section navigation (Interface, Models, Connections, Usage). Usage series: input cobalt, output green, cache read amber.
6. **States and overlays.** Menus, the passage box, dialogs and enlarged media sit on raised enamel with a 1.5px porcelain seam; scarlet only for failures; sized skeletons while loading.
7. **Narrow (≤48rem).** A small header with menu, wordmark, search and New chat; the drawer holds the sidebar's contents. One pane at a time; no screen scrolls sideways.

### Kept behaviour notes

- Downloads sits at the sidebar foot beside Settings only while the download list is non-empty (src/shell/Downloads.tsx); an empty list renders nothing.
- No idle "Saved" label: layout writes batch once a minute, so only the failure state shows.
- Explicit video requests reserve their place in the reply; pending shows a slim status line with phase and percentage plus Cancel; failure shows a safe reason and Retry.
- Copy buttons on replies and code blocks, and title search across learning trees, remain.
- Usage page behaviour is unchanged from its earlier contract (TreeTutor-2li.11): one range drives summary, chart and breakdown; missing counts show a dash, never an estimate.

### Unresolved

- Decided by the owner: the six existing themes (Paperback, Forest, Harbor, Dusk, Ember, Graphite) are removed. Six Line Diagram themes replace them, each a light and dark palette for the same look: Main Line (default), Enamel, Tunnel, Timetable, Ferry, Terminus. Values live in docs/mockups/line-diagram/ld.css; docs/mockups/line-diagram/themes.html shows them side by side.
- Whether the Contents route strip and the line swatches in keys and legends pass the owner's rule against a coloured line beside text.
- How a line routes when a child card sits left of or above its parent.
- Whether a zoomed-out map may collapse cards into bare stations, as the sketch drew. Not in the mockups; it would be a new behaviour.
