# Visual identity redesign

Agreed with the owner on 2026-11-10 in a grilling session. This spec owns TreeTutor's look and layout from the moment the direction contract below is recorded; PRD.md keeps authority over behavior and acceptance criteria.

## Problem Statement

The learner finds TreeTutor unattractive to spend time in. The workspace is grey on grey: no accent color and no identity, so nothing tells the eye where to look. The focused chat is a tall white column with messages pushed to the bottom and a large empty area above them. Conversation nodes are plain white boxes joined by thin grey branch lines that barely read. The learning tree sidebar is mostly empty, with a lone settings gear at its foot and a visible "React Flow" watermark on the map. Reply metadata such as provider, model and token counts is visually noisy. Dark mode is the stock neutral grey. The result reads like a generic admin panel rather than a place to think, even though the product is used for long sessions of reading and asking.

## Solution

Give TreeTutor a complete new visual world, chosen through Impeccable's direction round and applied to every screen at once, while every existing behavior keeps working.

- The learner opens TreeTutor and lands in a dark workspace that feels made for thinking: long tutor replies are comfortable to read, and the learning tree map is recognisable at a glance as TreeTutor.
- The learner can switch Appearance between Dark, Light and System in Settings; both modes are designed, not inverted.
- Layout and structure may change where the chosen direction calls for it, but every flow the learner relies on today (branching from a passage, map navigation, folding, keyboard and Vim access, model switching, saving and restoring, media, suggestions, the knowledge graph) still works the same way.
- Copy buttons, search across learning trees, a map overview (minimap) and Markdown export of a learning tree are included only when the chosen direction calls for them; the direction contract states which.

## Direction contract

Pending. The first step of this epic is the Impeccable direction round, run with the owner present: seven candidate worlds from the learner's cultural world, the `concept-seed` roll, and the decision page where the owner picks. The chosen direction is recorded here (and in the Impeccable surface brief) as THESIS, OWN-WORLD, STORY, FIRST VIEWPORT, FORM and FINISH blocks, followed by a per-screen rule list and the list of optional features the direction adopts. No screen ticket starts before this section is filled.

Pinned inputs the roll must respect:

- Success: "a place to think" first; a recognisable learning tree map second.
- Feels wrong: childish or gamified; generic SaaS dashboard; neon hacker-dark; decoration that competes with reply text; cramped or tool-dense.
- Dark is the default appearance; light is designed with equal care.
- Astryx stays the component library; the world ships as a custom Astryx theme.
- Bubble tint presets stay as a feature, with presets re-derived from the new palette.
- Figtree and the current neutral palette are not pinned.

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
- **Theme.** The world ships as a project-owned custom Astryx theme authored with the Astryx theme tooling and registered in place of the neutral theme. It carries both appearances. Application CSS uses only Astryx semantic roles and theme tokens; no raw color literals or font family names outside the theme. Fonts are self-hosted, as Figtree is today; no remote font imports.
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
