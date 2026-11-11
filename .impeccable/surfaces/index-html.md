---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["src/main.tsx","src/ChatPage.tsx","src/TreeOverview.tsx"]
---

# TreeTutor workspace (all seven screens)

Mode: Operate. Build path: code-led. Design authority: docs/visual-identity-spec.md (Direction contract, per-screen rules, optional features).

## Direction contract

Chosen by the owner on 2026-11-10 at the Impeccable decision page (direction round, Operate surface, code-led build). World: **Lecture-hall Slate**. Picked sketch: `.impeccable/mocks/decision/assigned.html` (composition reference for the map and focused chat, audited at the finish review). Alternates shown: Reading Room at Night (Impeccable's pick), Star Atlas (competitive challenger), five declined challengers and the category standard.

THESIS: The learning tree is worked on a slate. A flat green-black ground, chalk-white reply text and branches ruled as chalk lines from the exact passage they came from. It refuses the category default: neutral grey AI-chat panels with one blue accent.

OWN-WORLD: Dark: slate ground (~#1c2724), raised slate surface (~#24312d), deeper rail (~#16201d), chalk-white text (~#ebe7dc), muted chalk (~#9fb0a8), hairline seams (chalk at ~12% alpha). Chalk accents do jobs: yellow (~#e8d27a) is the one accent (focus, active branch, primary action, branched passage); blue, pink, green chalk are tint and series colours only. One alert colour (a chalk red) reserved for save and generation failures, held until seen. Light: pale slate-paper ground with slate ink, the same chalk hues darkened to pass contrast. Flat colour, no grain, no chalk texture, no handwriting fonts. Type: a readable text serif (Source Serif 4) for replies and question text; a plain grotesk (Public Sans) for UI; both self-hosted. Corners small (4px element, 6px panels). Hairline seams and one elevation step, never drop shadows.

STORY: The learner opens a calm dark room for thinking, reads a long reply at a comfortable measure, sees a phrase they do not understand, branches from it, and watches a chalk line connect that passage to a new conversation on the map. They trust the tree because every line shows where a question came from.

FIRST VIEWPORT: Desktop 1440x900: learning tree rail left (~232px, deeper slate, TreeTutor wordmark with "Tutor" in chalk yellow, New chat as the yellow text action, tree list below); learning tree map centre on bare slate, conversation nodes as raised slate cards with a chalk-colour dot and title, branches as 2px rounded chalk-white lines, the active branch and focused node in chalk yellow with a yellow outline offset 3px; focused chat right (~560px, raised slate, hairline seam), header with title and quiet provider/model, inherited context as a yellow-ruled quote, replies in the serif at 16px/1.7 and at most 62ch, the branched passage underlined in chalk yellow, composer at the bottom with a yellow Send. Signature move: on branch creation the new chalk line draws from the source passage's anchor to the new node (stroke draw-on, ~350ms ease-out), and the passage underline and the line share the same yellow; reduced motion shows the line at once.

FORM: Lecture-hall Slate, position 6 of the seven grounded candidates (reading room at night, university-press paperback, transit diagram, field notebook, herbarium plate, lecture-hall slate, study-group whiteboard). seed:fd686b1db47bf6f9. Raises kept from declined challengers: hierarchy by scale contrast alone (type specimen); flat colour, one branch geometry drives line, highlight and focus (guide map); vast empty slate, the map owns its field (catalog sleeve); one alert colour held until noticed (gate board); hairline seams and isolated destructive actions (dark console).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

### Per-screen rules

1. **Learning tree map.** Bare slate field, no grid dots, no watermark, nothing printed around the tree. Conversation nodes keep the chat-style content the PRD requires (whole conversation visible), set as raised slate cards: 4px corners, hairline seam, chalk dot plus title in Public Sans 600, body in muted chalk. Branch lines 2px chalk-white at ~75% with round caps, attached beside their source message; the focused path and node in chalk yellow (line 2.5px, node outline offset 3px). Hidden-branch stubs are short dashed chalk lines with a count. Map controls are quiet ghost buttons on a raised slate strip with hairline seam, bottom left. Signature draw-on runs here.
2. **Focused chat.** Raised slate column with a hairline seam to the map; draggable divider is the seam itself, highlighted yellow on hover and drag. Header: title in Public Sans 600, provider and model as small muted text, token stats behind a quiet toggle. Replies in Source Serif 4 16px/1.7, max 62ch, no bubble; question bubbles are a 12%-chalk fill, right aligned, Public Sans. Inherited context section is a yellow left rule with muted quote text, collapsible. Branched passages underlined 2px chalk yellow. Diagram and video cards are raised slate with hairline seams, fit the column, open enlarged on a dimmed slate overlay. Composer: hairline-bordered field, yellow Send as the only filled button. Reply copy buttons (adopted) sit quiet under each reply, shown on hover and focus.
3. **Learning tree sidebar.** Deeper slate rail, wordmark top, New chat as the yellow text action, tree search field (adopted) under it, tree list with the current tree on a 12%-chalk fill; rename and delete in a quiet overflow menu; settings gear joins the rail foot with its label so the foot is not a lone icon.
4. **Settings window.** Raised slate dialog, hairline seam, 6px corners, Public Sans throughout; sections divided by seams and small-caps labels, not cards. Appearance (Dark, Light, System) is the first setting. Bubble tint presets show as chalk swatches.
5. **Knowledge page.** Same slate field and chalk-line language as the map: concept nodes as small raised cards, relations as 1.5px chalk lines, the selected concept in yellow; side detail panel uses the focused chat's serif for explanatory text.
6. **Dialogs and menus.** Delete confirmation: raised slate, the destructive button outlined in the alert colour and separated from Cancel by space, filled only on focus. Model menu: plain list on raised slate, current model marked with a yellow check, signed-out providers in muted text with their sign-in action. Passage prompt box: anchored to the selection, raised slate, yellow ring, compact.
7. **Mermaid diagram theming.** Mermaid reads the resolved appearance; nodes in raised slate with chalk-white text and hairline strokes, edges chalk-white, one series per chalk hue (yellow, blue, pink, green) in that order; light appearance uses the darkened chalk set.

### Optional features

Adopted (each its own child ticket under this epic, after the focused chat ticket and before the finish review):

- **Copy buttons** on tutor replies (and code blocks): reply text is the product, and copying it out supports "a place to think" without adding chrome while reading.
- **Search across learning trees** in the sidebar: the tree list grows over long use, and finding a tree fast keeps the room calm.

Not adopted, with reasons:

- **Map overview (minimap):** contradicts "the map owns its field"; fit-view and keyboard navigation already cover orientation.
- **Markdown export:** a behavior feature with no role in this visual world; it can return as its own PRD increment.

### Smart video loading extension (TreeTutor-133.1)

THESIS: An explicit video request reserves its playback space while private production runs. The learner sees one loading state, then a player or a simple recoverable failure.

OWN-WORLD: Preserve Lecture-hall Slate, Astryx typography, semantic surfaces and existing small corners in both appearances. Use the existing 16:9 media geometry, Astryx Skeleton, stacks and small ghost actions; reduced motion freezes the placeholder.

STORY: Request, keep reading or navigate elsewhere, then play the finished video. Cancel stops an attempt; Retry explicitly starts another. No script, code, engine stages or logs appear.

FIRST VIEWPORT: The existing title sits above a full-column rectangle. Loading text and Cancel sit inside it; paused native playback replaces it at the same size. Description stays below. The persistent action becomes Open large in the player's upper corner, preserving focus.

FORM: A narrow extension of the existing focused-chat media card, code-led; the established direction and seed above remain authoritative. No new visual system or page scaffold.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
