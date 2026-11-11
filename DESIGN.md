---
name: TreeTutor
description: A flat slate workspace for reading and branching connected questions.
colors:
  "accent": "light-dark(#7a6510, #e8d27a)"
  "accent-muted": "light-dark(#7a65101f, #e8d27a29)"
  "text-accent": "light-dark(#6b5800, #e8d27a)"
  "on-accent": "light-dark(#ffffff, #1c2724)"
  "body": "light-dark(#e7ebe6, #1c2724)"
  "surface": "light-dark(#f3f5f1, #24312d)"
  "popover": "light-dark(#f7f8f5, #2a3833)"
  "rail": "light-dark(#dce2dc, #16201d)"
  "neutral": "light-dark(#1c27241a, #ebe7dc1f)"
  "text-primary": "light-dark(#1c2724, #ebe7dc)"
  "text-secondary": "light-dark(#4a5a53, #9fb0a8)"
  "text-disabled": "light-dark(#7d8b85, #6c7d76)"
  "border": "light-dark(#1c272424, #ebe7dc1f)"
  "border-emphasized": "light-dark(#1c272452, #ebe7dc47)"
  "overlay": "light-dark(#1c272466, #0b110fb3)"
  "hover": "light-dark(#1c27240f, #ebe7dc14)"
  "pressed": "light-dark(#1c27241f, #ebe7dc24)"
  "selection": "light-dark(#e8d27a, #e8d27a4d)"
  "branch": "light-dark(#1c2724bf, #ebe7dcbf)"
  "error": "light-dark(#a8382c, #e88a7a)"
  "error-muted": "light-dark(#a8382c1f, #e88a7a29)"
  "on-error": "light-dark(#ffffff, #1c2724)"
  "on-error-muted": "light-dark(#7d281f, #f2b3a8)"
  "yellow": "light-dark(#6b5800, #e8d27a)"
  "blue": "light-dark(#2d5f8a, #9cc3e6)"
  "pink": "light-dark(#8f3a64, #e7a6c6)"
  "green": "light-dark(#2f6b47, #9fd3b0)"
  "tint-yellow": "light-dark(#7a651024, #e8d27a2e)"
  "tint-blue": "light-dark(#2d5f8a24, #9cc3e62e)"
  "tint-pink": "light-dark(#8f3a6424, #e7a6c62e)"
  "tint-green": "light-dark(#2f6b4724, #9fd3b02e)"
typography:
  headline:
    fontFamily: "Public Sans, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3333
  title:
    fontFamily: "Public Sans, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
  node-title:
    fontFamily: "Public Sans, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Public Sans, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4286
  label:
    fontFamily: "Public Sans, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.4286
  supporting:
    fontFamily: "Public Sans, \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.6667
  reply:
    fontFamily: "Source Serif 4, Georgia, \"Times New Roman\", serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.7
  code:
    fontFamily: "ui-monospace, \"SF Mono\", Monaco, Consolas, \"Liberation Mono\", monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  "inner": "2px"
  "element": "4px"
  "container": "6px"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.25rem"
  "6": "1.5rem"
  "8": "2rem"
  "10": "2.5rem"
  "12": "3rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.element}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.element}"
  button-destructive:
    backgroundColor: "transparent"
    textColor: "{colors.error}"
    rounded: "{rounded.element}"
  search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.element}"
  navigation-current:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.element}"
  question:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.element}"
    padding: "0.5rem 0.75rem"
    typography: "{typography.body}"
  conversation-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.element}"
    width: "16rem"
  reply:
    textColor: "{colors.text-primary}"
    typography: "{typography.reply}"
  inherited-context:
    textColor: "{colors.text-secondary}"
    padding: "0 0 0 0.75rem"
---

# Design System: TreeTutor

## Overview

**Creative North Star: "Lecture-hall Slate"**

TreeTutor is a calm room for following a question. Flat green-black slate, chalk-white reading text and passage-linked branches make the learning tree the visual identity. Chrome stays quiet during long reading sessions; yellow locates the active question, its source and the next action.

Dark is the default; light uses pale slate-paper and slate ink with the same hierarchy. Public Sans gives controls a plain voice and Source Serif 4 gives tutor replies a sustained reading rhythm. The world uses actual diagram structure rather than decorative imagery, grain, imitation chalk or handwriting.

**Key Characteristics:**
- Bare slate field and compact conversation cards
- One yellow action and provenance accent
- Unboxed serif replies against quiet grotesk controls
- Hairline seams, small corners and no drop shadows

Authority: [slateTheme.ts](src/themes/slate/slateTheme.ts) owns the palette, reading face, geometry and branch tokens; [slate.css](src/themes/slate/slate.css) is its generated Astryx output. [layout.ts](src/layout.ts) owns application composition and overrides. The frontmatter records reused built values, with `light-dark(light, dark)` preserved exactly. The [direction contract](docs/visual-identity-spec.md) and [surface brief](.impeccable/surfaces/index-html.md) explain the world.

The [finish review](docs/verification/visual-finish/review.md) is `ship`. Its [46 captures](docs/verification/visual-finish/round-1/) cover all seven screens in both appearances at desktop and narrow sizes, plus interaction states. They use production-build Chromium with isolated SQLite and synthetic providers; they establish the visual fixture, not live inference. Static captures do not establish temporal animation behavior.

## Colors

### Primary

Chalk yellow is the one action and orientation accent: Send, New chat text, keyboard focus, the active branch and the passage already explored. The light appearance darkens yellow to ochre for legibility; action fill and accent text have distinct semantic tokens. Selection uses its own yellow fill and retains primary text colour.

**The Working Chalk Rule.** Yellow identifies primary action, focus and branch provenance. Blue, pink and green are tint or diagram-series colours, never competing action accents.

### Neutral

Slate ground carries the map; raised slate carries chat, cards and details; the deeper rail contains saved learning trees. Popovers have a separate raised tone. Chalk-white primary text, muted chalk secondary text and subdued disabled text retain the same roles in light slate-paper. Translucent seams, hover, pressed and current-row fills provide state without another palette. Browser selection and scrollbar colours use the same semantic roles.

### Status and series

Chalk red marks save/generation failures and isolated destructive actions. Yellow, blue, pink and green are the Mermaid series order and bubble tint vocabulary. The theme's legacy purple background alias resolves to pink; it is not a fifth series hue. Syntax highlighting inherits Astryx's syntax roles, rather than repurposing action accents.

Dark, Light and System are stored per browser origin. Missing or unreadable storage defaults to Dark. The generated theme sets native browser `color-scheme`; System follows the resolved operating-system scheme. Never reverse the light/dark tuple order or infer app appearance from the operating system alone.

## Typography

Public Sans is the UI and heading face; Source Serif 4 is the tutor-reply and explanatory reading face. Both are self-hosted through `@fontsource`: Public Sans 400/500/600/700; Source Serif 4 400, 400 italic and 600. Code uses the theme's platform monospace stack. No display face is introduced for this working interface.

The frontmatter records the desktop hierarchy: headline, title, compact semibold node title, UI body and medium label, supporting metadata, serif reply and reply-code roles. The theme's base is 14 with ratio 1.2. Reply blocks keep their explicit reading size and measure regardless of UI density. Knowledge explanations and inherited quote text also use the reading serif. Question bubbles follow the focused-chat rule and retain Public Sans, overriding the broad direction wording about question text.

At widths below 1024px with a coarse pointer, Astryx raises UI body and label to 1rem/1.5, supporting text to 0.875rem/1.4286, title to 1.375rem/1.4545 and headline to 1.625rem/1.3846. This type adaptation is distinct from the application layout breakpoint.

**The Reading Voice Rule.** Tutor replies use the reading serif; questions and controls use Public Sans. Keep code in the code face.

## Layout

The viewport shell fills available height. Desktop puts the saved-tree rail (14.5rem, 232px at a 16px root) beside a flexible bare map and a focused-chat column (35rem, 560px by default). The seam is draggable and keyboard adjustable; width is stored per browser, with a 22rem minimum and a workspace-dependent maximum. Expanded chat takes the workspace. Conversation-map cards are 16rem wide and preserve the conversation preview rather than becoming decorative title-only nodes.

The rail scrolls its history above a labelled footer. It places the split-colour wordmark, yellow New chat text action, search and current-tree fill above saved items. Main spacing follows Astryx's quarter-rem rhythm: 1–6 for insets and related gaps, 8–12 for larger separation. The map's small control strip sits at the lower left. The field has no grid, watermark or minimap. Knowledge uses the same field language with a sticky detail column; content caps at 70rem.

At 48rem and below, chat takes the width when open, the map yields, and the rail becomes a drawer. Knowledge detail follows the field. The settings shell changes from a bounded dialog (`min(50rem, 100dvh - 2rem)`) to viewport height; narrow navigation and selected section are separate views. Header metadata wraps, long content scrolls within its region, and the composer remains reachable. Replies cap each content block at 62ch; media and tables fit the column or scroll locally.

## Elevation & Depth

Flat tonal layering and hairline seams provide depth. The three Astryx shadow slots all resolve to the same inset one-pixel seam; there are no cast/drop shadows. Cards, controls, the rail and reading panel are separated by fill, fine borders and focus outlines. Media overlays dim the slate without blur. The focus ring is a 2px accent outline with a 3px offset where the standard ring is used; local media and divider focus rules remain explicit in layout authority.

**The Slate Seam Rule.** Separate surfaces with tonal steps and hairlines. Do not add drop shadows, blur or texture.

## Shapes

Straight-sided forms use small corners: element corners, slightly softer panel corners and inner highlight corners are the frontmatter's element/container/inner roles. Hairline borders follow these silhouettes. Round geometry is reserved for activity dots, swatches where appropriate and diagram curves. Branch lines have round caps: ordinary paths use the branch width, focused paths use the slightly heavier focus width. Hidden branches end in a short dashed stub and count.

## Components

### Buttons and focus

Send uses yellow fill and the paired on-accent text; ghost controls remain quiet and receive semantic hover/pressed fills. New chat is a yellow text action. Standard controls preserve Astryx focus and disabled behavior. Delete confirmation separates Cancel from the outlined red destructive action; destructive fill appears on keyboard focus. No floating shadow treatment is added.

### Search and navigation

The rail search is a small labelled search input with an inline magnifier, placeholder and clear control. Results use wrapped titles and optional muted two-line snippets; the current tree has the neutral translucent fill. Arrow keys move through field/results and Enter opens the focused result. Overflow actions retain accessible labels, and the footer pairs its settings icon with text. Model menus are plain lists: the current model has a yellow check; disconnected providers keep muted labels and explicit sign-in actions.

### Conversation cards and question bubbles

Map cards use raised slate, fine seams, compact semibold Public Sans titles and a chalk dot. Focus outlines the card in yellow; secondary node controls reveal on hover or focus and remain visible on touch. Question bubbles align right, use the selected chalk tint (neutral by default), keep small corners and wrap long content. Tutor replies have no enclosing bubble.

### Reading, inherited context and copy

Tutor prose uses the reply role; code blocks sit on the ground tone with the code face, and tables retain fine cell seams. Suggestions begin as muted dotted underlines. Explored passages switch to a solid 2px accent underline, shared with their focused map path. The inherited context disclosure is a yellow left rule and muted serif quotation. The compact passage prompt anchors to the selection with an accent border.

Reply copy buttons sit quietly below the reply and code copy buttons at the block's upper right. They reveal on hover/focus, stay visible without hover capability, and confirm with a check and an announced “Copied.” They copy the source text. The sidecar's static snippets show visual states; they do not implement clipboard or navigation behavior.

### Signature: source-to-branch chalk draw

On creation, the new path draws from its source-message anchor to the child node with stroke draw-on (`350ms ease-out`). Its active stroke and the explored passage underline share yellow. Existing edges do not replay merely because focus changes. Reduced motion displays the completed path immediately and removes activity pulses, selection rise and chat view transitions. Quiet copy/divider state fades use 120ms; chat view transitions use 220ms with `cubic-bezier(0.16, 1, 0.3, 1)`.

### Settings, media and Mermaid

Settings use Public Sans, seams and functional small-cap section labels rather than card stacks; Appearance leads and chalk swatches preview bubble tints. Knowledge concept cards repeat map corners and focus, with serif explanatory details. Diagram/video cards use raised slate and fine seams and enlarge against the dimmed slate overlay.

Mermaid resolves colours from the rendered card and current app appearance: raised surface fills, primary text and edges, border seams, and yellow/blue/pink/green series. Diagram labels use Public Sans. Generated SVG image content carries an inline self-hosted Latin-400 Public Sans font face because an SVG image cannot inherit page fonts; bold may be synthesized. Enlarged diagrams preserve this delivery. No claim of every Mermaid family is derived from the flowchart captures.

## Do's and Don'ts

### Do:

- Do keep palette values in the project theme and consume semantic CSS variables.
- Do preserve the shared yellow between the branched passage, focused line and focused node.
- Do give tutor replies a 1rem/1.7 reading face and at most 62ch per block.
- Do preserve keyboard focus, accessible names and visible copy controls on touch.
- Do implement both appearances and reduced motion when extending a surface.

### Don't:

- Don't add grid dots, watermarks or decoration to the bare map field.
- Don't add drop shadows, glass, grain, chalk texture or handwriting fonts.
- Don't turn the secondary chalk hues into competing primary-action colours.
- Don't introduce remote fonts or replace questions with the reply serif.
- Don't replace quiet metadata with badges, decorative eyebrows or extra panels.

Not canonized or repaired: no material visual defect was reported by the finish review. Its old-ramp detector advisory is resolved here by documenting the built 1rem reply role; it does not justify a source change. The diagram Latin-only font subset is an implementation limit, not a universal typography constraint.
