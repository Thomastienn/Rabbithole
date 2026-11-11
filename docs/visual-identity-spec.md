# Visual identity redesign

Agreed with the owner on 2026-11-10 in a grilling session. This spec owns TreeTutor's look and layout from the moment the direction contract below is recorded; PRD.md keeps authority over behavior and acceptance criteria.

Status: **Complete**, 2026-11-11 (TreeTutor-nwx; finish ticket TreeTutor-nwx.12). All seven screens and both adopted optional features are implemented. The Impeccable finish reviewer returned `ship` after reviewing 46 dark/light desktop/narrow captures; no material fix round was required. The documenter replaced DESIGN.md and its sidecar with the built Lecture-hall Slate world. [Finish evidence and validation](verification/visual-finish/README.md) records fixture coverage, the existing TreeTutor-wpc failures, and native-provider checks outside this visual redesign's scope.

## Problem Statement

The learner finds TreeTutor unattractive to spend time in. The workspace is grey on grey: no accent color and no identity, so nothing tells the eye where to look. The focused chat is a tall white column with messages pushed to the bottom and a large empty area above them. Conversation nodes are plain white boxes joined by thin grey branch lines that barely read. The learning tree sidebar is mostly empty, with a lone settings gear at its foot and a visible "React Flow" watermark on the map. Reply metadata such as provider, model and token counts is visually noisy. Dark mode is the stock neutral grey. The result reads like a generic admin panel rather than a place to think, even though the product is used for long sessions of reading and asking.

## Solution

Give TreeTutor a complete new visual world, chosen through Impeccable's direction round and applied to every screen at once, while every existing behavior keeps working.

- The learner opens TreeTutor and lands in a dark workspace that feels made for thinking: long tutor replies are comfortable to read, and the learning tree map is recognisable at a glance as TreeTutor.
- The learner can switch Appearance between Dark, Light and System in Settings; both modes are designed, not inverted.
- Layout and structure may change where the chosen direction calls for it, but every flow the learner relies on today (branching from a passage, map navigation, folding, keyboard and Vim access, model switching, saving and restoring, media, suggestions, the knowledge graph) still works the same way.
- Copy buttons, search across learning trees, a map overview (minimap) and Markdown export of a learning tree are included only when the chosen direction calls for them; the direction contract states which.

## Direction contract

Chosen by the owner on 2026-11-10 at the Impeccable decision page (direction round, Operate surface, code-led build). World: **Lecture-hall Slate**. Picked sketch: `.impeccable/mocks/decision/assigned.html` (composition reference for the map and focused chat, audited at the finish review). Alternates shown: Reading Room at Night (Impeccable's pick), Star Atlas (competitive challenger), five declined challengers and the category standard.

THESIS: The learning tree is worked on a slate. A flat green-black ground, chalk-white reply text and branches ruled as chalk lines from the exact passage they came from. It refuses the category default: neutral grey AI-chat panels with one blue accent.

OWN-WORLD: Dark: slate ground (~#1c2724), raised slate surface (~#24312d), deeper rail (~#16201d), chalk-white text (~#ebe7dc), muted chalk (~#9fb0a8), hairline seams (chalk at ~12% alpha). Chalk accents do jobs: yellow (~#e8d27a) is the one accent (focus, active branch, primary action, branched passage); blue, pink, green chalk are tint and series colours only. One alert colour (a chalk red) reserved for save and generation failures, held until seen. Light: pale slate-paper ground with slate ink, the same chalk hues darkened to pass contrast. Flat colour, no grain, no chalk texture, no handwriting fonts. Type: a readable text serif (Source Serif 4) for replies and question text; a plain grotesk (Public Sans) for UI; both self-hosted. Corners small (4px element, 6px panels). Hairline seams and one elevation step, never drop shadows.

STORY: The learner opens a calm dark room for thinking, reads a long reply at a comfortable measure, sees a phrase they do not understand, branches from it, and watches a chalk line connect that passage to a new conversation on the map. They trust the tree because every line shows where a question came from.

FIRST VIEWPORT: Desktop 1440x900: learning tree rail left (~232px, deeper slate, TreeTutor wordmark with "Tutor" in chalk yellow, New chat as the yellow text action, tree list below); learning tree map centre on bare slate, conversation nodes as raised slate cards with a chalk-colour dot and title, branches as 2px rounded chalk-white lines, the active branch and focused node in chalk yellow with a yellow outline offset 3px; focused chat right (~560px, raised slate, hairline seam), header with title and quiet provider/model, inherited context as a yellow-ruled quote, replies in the serif at 16px/1.7 and at most 62ch, the branched passage underlined in chalk yellow, composer at the bottom with a yellow Send. Signature move: on branch creation the new chalk line draws from the source passage's anchor to the new node (stroke draw-on, ~350ms ease-out), and the passage underline and the line share the same yellow; reduced motion shows the line at once.

FORM: Lecture-hall Slate, position 6 of the seven grounded candidates (reading room at night, university-press paperback, transit diagram, field notebook, herbarium plate, lecture-hall slate, study-group whiteboard). seed:fd686b1db47bf6f9. Raises kept from declined challengers: hierarchy by scale contrast alone (type specimen); flat colour, one branch geometry drives line, highlight and focus (guide map); vast empty slate, the map owns its field (catalog sleeve); one alert colour held until noticed (gate board); hairline seams and isolated destructive actions (dark console).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Pinned inputs the roll must respect:

- Success: "a place to think" first; a recognisable learning tree map second.
- Feels wrong: childish or gamified; generic SaaS dashboard; neon hacker-dark; decoration that competes with reply text; cramped or tool-dense.
- Dark is the default appearance; light is designed with equal care.
- Astryx stays the component library; the world ships as a custom Astryx theme.
- Bubble tint presets stay as a feature, with presets re-derived from the new palette.
- Figtree and the current neutral palette are not pinned.

### Per-screen rules

1. **Learning tree map.** Bare slate field, no grid dots, no watermark, nothing printed around the tree. Conversation nodes keep the chat-style content the PRD requires (whole conversation visible), set as raised slate cards: 4px corners, hairline seam, chalk dot plus title in Public Sans 600, body in muted chalk. Branch lines 2px chalk-white at ~75% with round caps, attached beside their source message; the focused path and node in chalk yellow (line 2.5px, node outline offset 3px). Hidden-branch stubs are short dashed chalk lines with a count. Map controls are quiet ghost buttons on a raised slate strip with hairline seam, bottom left. Signature draw-on runs here.
   Map details: keep the 16rem conversation width and three-line message previews, with every message retained. The title dot is muted chalk at rest and pulsing yellow while replying (static with reduced motion). The last opened conversation and its root-to-conversation path stay yellow when chat is collapsed; keyboard focus uses the same yellow ring. Each stub's count includes its hidden child and all descendants beneath it. Only a newly created branch draws on, for 350ms ease-out; opening a saved learning tree or unfolding one shows its lines immediately. The empty map uses the bare field, a centred “Start a learning tree” heading, brief supporting copy and a yellow text New chat action; loading and retry states keep their current actions. Controls stay bottom left at narrow widths too, clear of the sidebar toggle at the top. Bringing a conversation into view reserves the strip's space at the bottom.
2. **Focused chat.** Raised slate column with a hairline seam to the map; draggable divider is the seam itself, highlighted yellow on hover and drag. Header: title in Public Sans 600, provider and model as small muted text, token stats behind a quiet toggle. Replies in Source Serif 4 16px/1.7, max 62ch, no bubble; question bubbles are a 12%-chalk fill, right aligned, Public Sans. Question bubbles default to the Neutral tint (the 12%-chalk fill); other tint presets stay selectable. Reply metadata ("Tutor · provider · model" and the token line, shown on hover and focus) is small muted chalk. Reply status sits under its reply as small text behind a 2px left rule: responding is muted text with a pulsing chalk-yellow dot and yellow rule (static under reduced motion); interrupted is muted text with a muted rule; failed is the one alert colour, text and rule. Suggestion underlines are 1px dotted muted chalk (primary chalk on hover); an explored suggestion is the branched passage, 2px solid chalk yellow. The source passage revealed when returning from a child and text selection share the chalk-yellow selection fill. Code inside replies keeps the theme code face at the small size. Inherited context section is a yellow left rule with muted quote text, collapsible. Branched passages underlined 2px chalk yellow. Diagram and video cards are raised slate with hairline seams, fit the column, open enlarged on a dimmed slate overlay. Composer: hairline-bordered field, yellow Send as the only filled button. Reply copy buttons (adopted) sit quiet under each reply, shown on hover and focus: a small ghost copy icon before the token line copies the reply's original Markdown, and each code block carries the same icon in its top-right corner, copying the block's source without fences. Both swap to a check and the accessible name "Copied" for two seconds, announced politely; questions and unfinished replies have none.
   Surround details: the default side column is 35rem (~560px), still bounded by the existing 22rem minimum and 70% workspace maximum; saved widths keep their value. Short conversations start below the header with empty space after the last reply; the composer stays at the bottom on an opaque raised surface, without a blur or gradient. Header actions stay ghost buttons; the return-to-parent row wraps long titles and passages. A collapsed **Token stats** disclosure in the header lists the conversation's completed replies using the existing usage formatting (including suggestion costs and unavailable usage); app-wide totals stay in Settings. The inherited section uses a 2px yellow left rule, with its read-only passage, question and snapshot in muted reading type when opened. Diagram and video cards have 4px corners and hairline seams; their controls are ghost actions, and the enlarged viewer uses the theme's dimmed slate overlay. The composer keeps its hairline field and Send/Stop control, with a four-line visible input before scrolling; narrow windows keep the input and action reachable.
3. **Learning tree sidebar.** Deeper slate rail, wordmark top, New chat as the yellow text action, tree search field (adopted) under it, tree list with the current tree on a 12%-chalk fill; rename and delete in a quiet overflow menu; settings gear joins the rail foot with its label so the foot is not a lone icon.
   Sidebar details: the desktop rail is 14.5rem (~232px), with the TreeTutor wordmark in Public Sans 600 and “Tutor” in chalk yellow. Keep the existing open/closed browser preference (open for a fresh browser), collapse control and map-menu entry. Saved trees retain Today, Yesterday, Previous 7 days and Older grouping, newest first, two-line titles and descendant counts; the current root keeps its fill while any conversation in that tree is open. One always-visible muted ellipsis per row opens Rename chat and Delete chat…; it stays reachable by keyboard and touch without selecting that tree. Rename completion/cancellation and delete cancellation return focus to that row's ellipsis. Knowledge and Settings are labelled ghost actions at the foot, separated from the scrolling list by a hairline seam. Below the existing 48rem breakpoint, use the same rail in the focus-trapped drawer with the library's viewport clearance, Escape/collapse return to the opener, and tree selection dismissing the drawer. Empty saved study keeps the existing first-question guidance and New chat action. Tree search is a small search field with a magnifier and clear button under New chat. Any non-blank text replaces the dated list with matching trees, newest first: a case-insensitive match on the tree title or on text in any of its conversations, one row per tree in the same row style, with a muted two-line snippet for a message match. Choosing a title match reopens the tree as saved; choosing a message match opens that conversation in chat. No match shows a plain muted “No learning trees match “…”.” line. Arrow Down/Up move between the field and results, Enter opens (Enter in the field opens the first result), and clearing the field restores the dated list.
4. **Settings window.** Raised slate dialog, hairline seam, 6px corners, Public Sans throughout; sections divided by seams and small-caps labels, not cards. Appearance (Dark, Light, System) is the first setting. Bubble tint presets show as chalk swatches.
   Settings details: Interface (Appearance, question bubbles, Vim, map help) is the first section in the list and the one the window opens on at desktop width; Models, Connections and Usage follow, and Help, the custom endpoint shortcut and narrow-window list behave as before. Section labels are Public Sans 600 small caps in muted chalk, with seams between sections; the panel's own title keeps the heading size. The seam is the theme's inset hairline, never a drop shadow.
5. **Knowledge page.** Same slate field and chalk-line language as the map: concept nodes as small raised cards, relations as 1.5px chalk lines, the selected concept in yellow; side detail panel uses the focused chat's serif for explanatory text.
   Knowledge details: topics stay as labelled groups (muted Public Sans 600) on the bare field, each concept a 4px raised card with a dot, its name in Public Sans 600 and a short familiarity or correction label; a multi-topic concept has a card in each topic. A relation is one line between the closest pair of its concepts' cards, drawn behind the cards; the selected concept (first by name until the learner picks one, the kept concept after a merge) has a yellow outline offset like the focused map node, and its relations turn yellow. The detail panel (raised, 6px corners, hairline seam, sticky at desktop width, below the field under the 48rem breakpoint) shows the selected concept's familiarity, evidence and links in the reading serif, then its corrections and merge as before. Cards are buttons in reading order, so Tab reaches the detail panel after the field.
6. **Dialogs and menus.** Delete confirmation: raised slate, the destructive button outlined in the alert colour and separated from Cancel by space, filled only on focus. Model menu: plain list on raised slate, current model marked with a yellow check, signed-out providers in muted text with their sign-in action. Passage prompt box: anchored to the selection, raised slate, yellow ring, compact. If the prompt would overlap the chat header above its passage, open it below the passage instead; recheck when the prompt grows or the viewport/reading position changes.
   Dialog and menu details: every floating surface uses the theme popover or surface fill with the inset hairline, never a drop shadow. The delete confirmation keeps its title naming the chat or branch and its consequence text (conversation count, what is permanently deleted, active work stopping, “This cannot be undone.”); Keep conversations keeps initial focus, and Delete is an alert-outlined ghost at least 24px from it that fills with the alert colour on keyboard focus. In the model menu the current model shows a yellow check in the radio slot (still a menu radio for assistive tech); a signed-out or unset provider's group label reads “Provider · not connected” in muted text above its existing sign-in or settings action. The map menu and the rows' overflow menu are the same plain list. Rename stays the inline title field where it was opened. The passage prompt has 6px corners, a 1px chalk-yellow ring on the popover fill and keeps its 28rem maximum width.
7. **Mermaid diagram theming.** Mermaid reads the resolved appearance; nodes in raised slate with chalk-white text and hairline strokes, edges chalk-white, one series per chalk hue (yellow, blue, pink, green) in that order; light appearance uses the darkened chalk set.
   Series details: series fills (pie slices, mindmap/timeline sections, git branches, xy plots) are solid chalk hues from the theme's text-hue tokens, with labels in the raised-slate surface colour on top; pie slices are fully opaque.
   Bubble tint presets: Neutral (default, the 12%-chalk fill), Yellow, Blue, Pink, Green, each the theme's chalk-hue background token resolved per appearance. Question text must meet WCAG AA on every preset over the chat surface in both appearances. Presets saved under the old palette map to the nearest hue (Accent and Amber to Yellow, Purple to Pink).

### Optional features

Adopted (each its own child ticket under this epic, after the focused chat ticket and before the finish review):

- **Copy buttons** on tutor replies (and code blocks): reply text is the product, and copying it out supports "a place to think" without adding chrome while reading.
- **Search across learning trees** in the sidebar: the tree list grows over long use, and finding a tree fast keeps the room calm.

Not adopted, with reasons:

- **Map overview (minimap):** contradicts "the map owns its field"; fit-view and keyboard navigation already cover orientation.
- **Markdown export:** a behavior feature with no role in this visual world; it can return as its own PRD increment.

## User Stories

1. As a learner, I want TreeTutor to open in a dark appearance by default, so that long evening sessions are comfortable without configuration.
2. As a learner, I want an Appearance setting with Dark, Light and System, so that I can choose how TreeTutor looks.
3. As a learner, I want my Appearance choice to persist in this browser, so that I do not have to pick it again after a reload.
4. As a learner choosing System, I want TreeTutor to follow my operating system's light or dark preference, so that it matches my other apps.
5. As a learner, I want light mode to feel as deliberately designed as dark mode, so that neither choice looks like an afterthought.
6. As a learner, I want long tutor replies set in comfortable reading type with a sensible line length, so that I can read for a long time without strain.
7. As a learner, I want my questions and the tutor's replies to be clearly distinct, so that I can tell at a glance who said what.
8. As a learner, I want reply metadata (provider, model, token usage, status) to be present but quiet, so that it does not compete with the reply text.
9. As a learner, I want failed, interrupted and in-progress replies to stay clearly visible, so that I never miss a reply that did not finish.
10. As a learner, I want the focused chat to use its space well when a conversation is short, so that it does not feel like an empty column.
11. As a learner, I want the composer to stay reachable and obvious, so that asking the next question is always one step away.
12. As a learner, I want the inherited context of a child conversation to be presented in the same world as the rest of the chat, so that it feels part of the conversation rather than a debug panel.
13. As a learner, I want diagrams and video cards to sit naturally in the reply, so that media feels like part of the explanation.
14. As a learner, I want Mermaid diagrams to follow TreeTutor's Appearance rather than my operating system, so that a diagram never clashes with the workspace.
15. As a learner, I want the learning tree map to have a recognisable identity, so that I know I am in TreeTutor from a single glance.
16. As a learner, I want branches on the map to read clearly against the canvas, so that I can follow how conversations connect.
17. As a learner, I want each branch to visibly leave its parent beside the message it came from, so that I can see which passage started it.
18. As a learner, I want the focused conversation node to stand out on the map, so that I know where I am in the learning tree.
19. As a learner, I want folded conversation nodes and hidden-branch indicators to remain clear in the new look, so that I know when branches are hidden.
20. As a learner, I want the activity indicator on a replying conversation node to be noticeable but calm, so that I can see work in progress without distraction.
21. As a learner, I want the map controls to fit the new world, so that zoom, fit and the map menu feel part of the product.
22. As a learner, I want no third-party watermark on the map, so that the workspace looks finished.
23. As a learner, I want the learning tree sidebar to feel like navigation through my saved study, not an empty list, so that returning to earlier work is inviting.
24. As a learner, I want the current learning tree to be clearly marked in the sidebar, so that I know which one is open.
25. As a learner, I want rename and delete actions to stay easy to find but unobtrusive, so that managing learning trees does not clutter the list.
26. As a learner, I want the Settings window to share the same world as the workspace, so that it does not feel bolted on.
27. As a learner, I want the Appearance setting to sit alongside the other personal display settings such as question bubble tint, so that related choices are together.
28. As a learner, I want bubble tint presets that suit the new palette in both appearances, so that every preset looks intentional.
29. As a learner, I want the Knowledge page (concepts, topics, concept links and familiarity) in the same world, so that it feels like part of TreeTutor.
30. As a learner, I want dialogs such as delete confirmation to stay clear about what is removed and that it cannot be undone, so that the redesign never makes destructive actions ambiguous.
31. As a learner, I want the model menu and passage prompt box to match the new world, so that every floating surface feels consistent.
32. As a learner, I want suggestion underlines to stay visible but quiet in both appearances, so that they hint without shouting.
33. As a learner, I want text selection and focus outlines to stay clearly visible in both appearances, so that I never lose my place.
34. As a keyboard learner, I want every action that works by keyboard today to keep working after the redesign, so that I can still use TreeTutor without a mouse.
35. As a Vim-bindings learner, I want the optional Vim canvas bindings to keep working, so that the redesign does not break my navigation.
36. As a learner who prefers reduced motion, I want any new motion to respect that preference, so that the app stays comfortable.
37. As a learner on a narrow window, I want the redesigned screens to keep working when chat fills the workspace, so that the redesign does not regress small screens.
38. As a learner, I want my saved learning trees, layouts and preferences to survive the redesign untouched, so that I lose nothing.
39. As a learner, I want copy, search, a map overview or Markdown export only where the chosen direction includes them, so that new features arrive as part of a coherent design rather than bolted on.
40. As the owner, I want one written direction contract and per-screen rules, so that every implementation ticket builds the same world.
41. As the owner, I want every color, type, radius, shadow and spacing value to come from the theme, so that screens cannot drift apart.
42. As the owner, I want reference screenshots of the map and focused chat in both appearances, so that later screens can be checked against them.
43. As the owner, I want a single command that runs every fixture browser check, so that regressions from a redesign this wide are caught immediately.
44. As the owner, I want a final Impeccable finish review across all screens and a rewritten DESIGN.md, so that the shipped world is reviewed and documented.
45. As the owner, I want PRD.md to say that this spec owns look and layout while the PRD owns behavior, so that agents do not treat old layout details as binding.

## Implementation Decisions

- **Scope.** All seven screens: learning tree map (conversation nodes, branches, map controls); focused chat (replies, question bubbles, composer, header, inherited context, diagram and video cards); learning tree sidebar; Settings window; Knowledge page; dialogs and menus (delete confirmation, model menu, passage prompt box); Mermaid diagram theming.
- **Behavior is fixed, look and layout are open.** The direction may change layout and structure, including the shapes delivered by the UI refresh epic (chat-style conversation nodes, hidden-branch stubs, draggable divider, inherited context section, organized message layout), provided every current behavior and every PRD acceptance flow still works.
- **Theme.** The world ships as a project-owned custom Astryx theme authored with the Astryx theme tooling and registered in place of the neutral theme. It carries both appearances. Application CSS uses only Astryx semantic roles and theme tokens; no raw color literals or font family names outside the theme. Fonts are self-hosted (`@fontsource/public-sans`, `@fontsource/source-serif-4`); no remote font imports. The theme lives at `src/themes/slate/` (source `slateTheme.ts`, built with `npx astryx theme build`), extends the neutral theme only for roles it does not restate, and exposes the reading serif as `--treetutor-font-reading`. Text selection is chalk yellow (`--treetutor-selection`: solid in light, ~30% in dark) with text keeping its own colour; the page ground and the React Flow pane take `--color-background-body`, and React Flow's colour mode follows the resolved appearance.
- **Appearance.** A new browser-stored preference, following the existing per-preference browser storage convention, with values Dark, Light and System; absent value means Dark. It sets the Astryx color scheme for the whole document. Mermaid rendering and the diagram card read the app's resolved appearance instead of the operating system preference. Bubble tint presets resolve per appearance from theme tokens.
- **Map watermark.** Hidden through React Flow's attribution option, which its MIT license permits.
- **Single source of truth.** This spec's Direction contract and per-screen rules are the only design authority during the epic. A ticket that needs a rule not written here edits this spec first, in the same commit. Impeccable's surface brief carries the same direction contract for Impeccable tooling.
- **PRD relationship.** PRD.md gains a short section stating that this spec supersedes its look and layout details (for example the collapsed-by-default sidebar, the control strip composition and node dimensions), while PRD behavior and acceptance criteria stay binding. PRD lines that the chosen direction contradicts are updated in the ticket that changes them.
- **PRODUCT.md** is refreshed before the direction round: it currently describes an early increment and a "quiet light surface", both stale.
- **Optional features.** Copy buttons, search across learning trees, a map overview and Markdown export are not committed. The Direction contract lists which ones the chosen direction adopts; each adopted feature becomes its own ticket with its own acceptance checks.
- **Ticket order.**
  0. Verify runner: one command runs every fixture browser script that needs no live provider and prints a pass/fail summary. Known failures tracked in TreeTutor-wpc are reported, not hidden.
  1. Direction round with the owner (interactive), PRODUCT.md refresh, Direction contract and per-screen rules recorded here, PRD note.
  2. Theme, Appearance setting and dark default.
  3. Learning tree map. Produces map reference screenshots in both appearances.
  4. Focused chat. Produces chat reference screenshots in both appearances.
  5. Learning tree sidebar.
  6. Settings window.
  7. Knowledge page.
  8. Dialogs and menus.
  9. Mermaid theming and bubble tint presets.
  10. One ticket per optional feature the Direction contract adopts.
  11. Impeccable finish review across all screens, fixes, and DESIGN.md rewritten by the Impeccable documenter.
- **Sync guards on every screen ticket.** Links this spec; uses theme tokens only; matches the reference screenshots' type, color, spacing and corner language; attaches its own dark and light screenshots; runs the Impeccable detector on changed files and fixes what it flags; leaves the verify runner green apart from failures already recorded.

## Testing Decisions

- A good test drives the built app the way a learner does and asserts what the learner sees or can do, never component internals or class names chosen for styling.
- **Fixture browser scripts are the main seam.** The existing scripts build the app, use an isolated SQLite store and synthetic providers, and drive Chromium through agent-browser. The new verify runner runs all of them that need no live provider. Every redesign ticket leaves the runner green; where a redesign moves or renames UI, the ticket updates that script's selectors and visual assertions while keeping its behavioral assertions.
- **Appearance gets one new fixture script:** fresh browser storage opens Dark; choosing Light persists across reload; System follows an emulated color scheme preference; Mermaid diagrams and bubble tints follow the app's appearance rather than the operating system.
- **Token lint is one new `node --test` test:** it fails when application source outside the theme contains a raw color literal or a font family name. Today the application source contains no raw hex colors, so the test starts green.
- **Screenshots** use the existing screenshot helper pattern in the fixture scripts and are saved under docs/verification for each screen in both appearances.
- Prior art: the settings window, focused chat layout, chat divider, chat-style nodes and hidden-branch stub scripts from the UI refresh epic; the integration tests under the test directory for server behavior.
- Live-provider scripts are not part of the runner; the redesign does not change provider behavior.

## Out of Scope

- Retrying failed or interrupted replies, and editing or regenerating questions (declined by the owner).
- Any change to provider, storage, branching, inherited context, suggestion or knowledge graph behavior.
- Optional features the Direction contract does not adopt.
- A hosted or desktop delivery; TreeTutor stays a local web app.
- Replacing Astryx or React Flow.
- Fixing TreeTutor-wpc itself; the runner reports it until that bug is closed.

## Further Notes

- Impeccable method: a replacement visual world goes through the direction round (`concept-seed --scope direction --mode operate`) and is code-led because TreeTutor is an Operate surface. Canned aesthetic lanes are avoided; the earlier "study desk, forest green, serif replies" picks were dropped because they match the known AI-default rut of warm paper plus serif.
- The redesign epic follows the UI refresh epic (TreeTutor-u7v) in release order; u7v.11 and TreeTutor-wpc may still be open when it starts.
- Child tickets for steps 2 onward are filed after the Direction contract is recorded, so they can name concrete rules.
