---
name: Rabbithole
description: A learning tree drawn as a transit line diagram, siblings at every fork on lines of their own colour, read at a 640px measure.
colors:
  porcelain: "#ffffff"
  on-porcelain: "#0b1230"
  line-cobalt: "#4d7dff"
  line-amber: "#ffc20e"
  line-green: "#22b14c"
  line-magenta: "#f06bb0"
  scarlet-failure: "#ff6b78"
  scarlet-wash: "#ff6b7826"
  midnight-ground: "#0b1230"
  deep-field: "#070d24"
  raised-enamel: "#141d42"
  hover-enamel: "#1f2a5a"
  ink: "#e9ecf7"
  muted-ink: "#97a1c4"
  seam: "#ffffff22"
  seam-strong: "#ffffff66"
  selection: "#4d7dff66"
  scrim: "#000000b8"
typography:
  display:
    fontFamily: "Barlow Semi Condensed, Barlow, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "38px"
    fontWeight: 700
    lineHeight: 1.08
  page-head:
    fontFamily: "Barlow Semi Condensed, Barlow, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Barlow Semi Condensed, Barlow, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.2
  section:
    fontFamily: "Barlow Semi Condensed, Barlow, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Barlow Semi Condensed, Barlow, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  card-title:
    fontFamily: "Barlow Semi Condensed, Barlow, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.15
  small-title:
    fontFamily: "Barlow Semi Condensed, Barlow, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.2
  wordmark:
    fontFamily: "Barlow Semi Condensed, Barlow, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.09em"
  wordmark-narrow:
    fontFamily: "Barlow Semi Condensed, Barlow, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.09em"
  reading:
    fontFamily: "\"Atkinson Hyperlegible Next\", \"Atkinson Hyperlegible\", Verdana, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.68
  reading-small:
    fontFamily: "\"Atkinson Hyperlegible Next\", \"Atkinson Hyperlegible\", Verdana, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.6
  title-chip:
    fontFamily: "Barlow Semi Condensed, Barlow, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.02em"
  body:
    fontFamily: "Barlow, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4286
  body-small:
    fontFamily: "Barlow, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.35
  label:
    fontFamily: "Barlow Semi Condensed, Barlow, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.07em"
  chip:
    fontFamily: "Barlow Semi Condensed, Barlow, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.02em"
    fontFeature: "\"tnum\""
  supporting:
    fontFamily: "Barlow, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  micro:
    fontFamily: "Barlow, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.2
  code:
    fontFamily: "ui-monospace, \"SF Mono\", Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  chip: "4px"
  element: "8px"
  line: "9999px"
spacing:
  half: "4px"
  module: "8px"
  "1.5": "12px"
  "2": "16px"
  "3": "24px"
  "4": "32px"
  "5": "40px"
  reading-gutter: "44px"
  "6": "48px"
  "8": "64px"
components:
  button-primary:
    backgroundColor: "{colors.porcelain}"
    textColor: "{colors.on-porcelain}"
    typography: "{typography.body}"
    rounded: "{rounded.element}"
    height: "32px"
  button-default:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.element}"
    height: "36px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.element}"
    height: "32px"
  button-ghost-hover:
    backgroundColor: "{colors.hover-enamel}"
  nav-item-current:
    backgroundColor: "{colors.raised-enamel}"
    textColor: "{colors.porcelain}"
    typography: "{typography.body}"
    rounded: "{rounded.element}"
  address-chip:
    backgroundColor: "{colors.line-cobalt}"
    textColor: "{colors.on-porcelain}"
    typography: "{typography.chip}"
    rounded: "{rounded.chip}"
    padding: "3px 6px 2px"
  address-chip-trunk:
    backgroundColor: "{colors.porcelain}"
    textColor: "{colors.on-porcelain}"
    typography: "{typography.chip}"
    rounded: "{rounded.chip}"
    padding: "3px 6px 2px"
  title-chip:
    backgroundColor: "{colors.line-cobalt}"
    textColor: "{colors.on-porcelain}"
    typography: "{typography.title-chip}"
    rounded: "{rounded.chip}"
    padding: "5px 8px 4px"
  question-bubble:
    backgroundColor: "{colors.raised-enamel}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.element}"
    padding: "9px 14px"
    width: "520px"
  composer:
    backgroundColor: "{colors.raised-enamel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.element}"
    padding: "12px 10px 10px 16px"
  conversation-card:
    backgroundColor: "{colors.raised-enamel}"
    textColor: "{colors.ink}"
    typography: "{typography.supporting}"
    rounded: "{rounded.element}"
    width: "160px"
  library-card:
    backgroundColor: "{colors.raised-enamel}"
    textColor: "{colors.porcelain}"
    typography: "{typography.card-title}"
    rounded: "{rounded.element}"
    padding: "14px 8px 12px 14px"
    height: "172px"
  overlay-sheet:
    backgroundColor: "{colors.raised-enamel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.element}"
  code-block:
    backgroundColor: "{colors.deep-field}"
    textColor: "{colors.ink}"
    typography: "{typography.code}"
    rounded: "{rounded.element}"
    padding: "12px 48px 12px 16px"
  failure-banner:
    backgroundColor: "{colors.scarlet-wash}"
    textColor: "{colors.ink}"
    rounded: "{rounded.element}"
    padding: "8px 12px"
  sidebar:
    backgroundColor: "{colors.deep-field}"
    textColor: "{colors.ink}"
    width: "272px"
---

# Design System: Rabbithole

## Overview

**Creative North Star: "The Line Diagram"**

A learning tree is a transit line diagram. The trunk conversation is a porcelain line; the children at every fork take lines of different colours; every conversation is a white-ringed station; and every branch point is an interchange ring placed at the passage the learner selected. The diagram is not decoration laid over a chat app: it is the navigation. A branch's colour runs from the passage underline in a reply, through the interchange ring and the address chip that leads a title, to the Contents route strip in the sidebar and the line on the map.

The world is midnight enamel by default: a deep navy ground, a deeper field for the sidebar and the docked map, and raised enamel for anything that sits on top. Light appearance swaps to a porcelain ground with midnight ink and action and the same lines darkened to AA. It is flat and dense in the way a printed network map is dense: thick round-capped lines that turn only at 45 or 90 degrees, hairline seams, condensed caps labels, and no shadow, gradient or blur. Reading is the exception to density: replies sit at a 640px measure in a large, open reading face.

The system ships as interchangeable themes that share every role and differ only in palette (Platform by default, then Main Line, Enamel, Tunnel, Timetable, Ferry, Terminus), each with a light and a dark variant chosen separately in Settings (Dark is the default appearance). Platform carries Main Line's four hues on a low-chroma graphite ground so long reading sessions are not spent on saturated navy; Main Line stays as the navy original.

**Key Characteristics:**
- Siblings at every fork take different colours from four lines; an only child stays on its parent's line; porcelain is the trunk.
- Depth shows as a stop row under the address chip, never as line weight or tint.
- Lines 5px in the sidebar, 7px on the map, round caps, 45/90 degree turns only.
- Stations and interchanges are porcelain rings; the current station is filled.
- Colour belongs to lines and their chips, never to running text.
- Flat enamel: tonal layers and hairline seams, no shadow, gradient or blur.
- One motion: a new line draws out of its interchange, then its station lands.

## Colors

A midnight enamel ground carrying one porcelain trunk and four equal-weight branch lines; scarlet is held back for failure. Frontmatter and the role values below are Main Line, dark appearance; Platform, the default, is in the theme table; every role is a `light-dark()` pair; the roles and icons are shared in `src/themes/lineDiagram.ts` and `src/themes/icons.ts`, and each theme source (`src/themes/<name>/<name>Theme.ts`) holds only its name and palette.

### Primary
- **Porcelain** (#ffffff dark / #0b1230 light): the trunk line, every station and interchange ring, the focus ring, conversation titles and current-item text, and the one action fill (New chat, Send, the primary button). Text on it is **On Porcelain** (#0b1230 dark / #ffffff light), which is also the text on any filled line chip.

### Secondary: the four branch lines
Assigned at every fork. The trunk's children take line 1, 2, 3, 4, 1, ... in address order. Below the trunk, siblings take the three lines other than their parent's in order, then the parent's line, repeating; an only child keeps its parent's line. All four carry equal weight; none is "the accent".
- **Cobalt Line** (line 1; #4d7dff dark / #1f4fd8 light).
- **Amber Line** (line 2; #ffc20e dark / #8f6200 light).
- **Signal Green Line** (line 3; #22b14c dark / #157a3a light).
- **Magenta Line** (line 4; #f06bb0 dark / #b8297a light).

The lines are also mapped into Astryx's hue slots (yellow = line 1, green = line 2, pink = line 3, blue = line 4) so tints, diagram series and charts follow the theme. Usage series take lines by role: input is line 1 (cobalt) solid, output is line 3 (green) and cache read is line 2 (amber), the latter two as patterned fills so the series read apart without colour.

### Tertiary
- **Signal Scarlet** (#ff6b78 dark / #c0152a light): failure only. Failure text, the failure icon, the failure border, and the failure wash behind a failure banner (**Scarlet Wash**, scarlet at 15% dark / 10% light).

### Neutral
- **Midnight Ground** (#0b1230 dark / #f4f6fb light): page body, reading column, full-screen map canvas.
- **Deep Field** (#070d24 dark / #e8ecf6 light): sidebar, docked map field, code blocks, the narrow header.
- **Raised Enamel** (#141d42 dark / #ffffff light): cards, question bubbles, the composer, popovers, dialogs, menus, the current nav item.
- **Hover Enamel** (#1f2a5a dark / #dde3f1 light): hover rows, neutral tint, skeletons.
- **Ink** (#e9ecf7 dark / #141b3a light): body text.
- **Muted Ink** (#97a1c4 dark / #4d587c light): secondary text, labels, addresses in lists, inactive icons.
- **Seam** (porcelain at 13% dark / 14% light): hairline borders between regions.
- **Strong Seam** (porcelain at 40% dark / 50% light): the 1.5px overlay seam, the composer frame, table header rule.
- **Selection** (line 1 at 40% dark / 20% light): text selection, passage highlight and revealed text.
- **Scrim** (black at 72% dark / porcelain at 40% light): backdrop behind dialogs and enlarged media.

### The themes
Each theme keeps every role above and changes only the palette. Values are dark / light.

| Theme | Ground | Deep field | Raised | Porcelain | Line 1 | Line 2 | Line 3 | Line 4 | Failure |
|---|---|---|---|---|---|---|---|---|---|
| Platform: graphite, Main Line colours (default) | #14171d / #f6f8fa | #0d1014 / #edeff3 | #1d2128 / #ffffff | #f3f5f9 / #191e27 | #6da5f8 / #225ebf | #edb24d / #976213 | #5dc47e / #287c42 | #e37fb0 / #a93772 | #f17070 / #be222a |
| Main Line: navy and porcelain | #0b1230 / #f4f6fb | #070d24 / #e8ecf6 | #141d42 / #ffffff | #ffffff / #0b1230 | #4d7dff / #1f4fd8 | #ffc20e / #8f6200 | #22b14c / #157a3a | #f06bb0 / #b8297a | #ff6b78 / #c0152a |
| Enamel: bottle green and cream | #0b2a22 / #f3f6ee | #061f19 / #e6ebdd | #12382e / #ffffff | #fff6df / #07271e | #ffd23f / #8a6400 | #6cc7ff / #0b6aa3 | #ff9a8a / #b23a2a | #d6a8ff / #7a3fb3 | #ff8a80 / #b3141f |
| Tunnel: charcoal, signal lamps | #151617 / #f3f3f1 | #0c0d0e / #e7e7e3 | #202224 / #ffffff | #ffffff / #151617 | #ff9433 / #b04e00 | #3cc8ff / #0a6a9e | #a6e22e / #48720a | #b48cff / #6a3fc4 | #ff6b6b / #c0152a |
| Timetable: printed paper, press inks | #1e1812 / #f6efdf | #150f0a / #ebe2cc | #2b231b / #fffaf0 | #fbf0d9 / #231a10 | #4fb8ea / #0b68a0 | #f2709f / #b32766 | #e6ad2f / #8a6200 | #45c49d / #0f755a | #ff7b6e / #b3141f |
| Ferry: deep-water teal, coral, sand | #07282f / #eff6f7 | #041d23 / #e0ecee | #0f3640 / #ffffff | #f1fbff / #07282f | #ff8f70 / #b8401f | #f2d27a / #846300 | #b9a2ff / #6046c7 | #8fe07a / #2a7a1c | #ff8088 / #b8142a |
| Terminus: carriage maroon, gold, cream | #2a0f18 / #f8f1ee | #1e0910 / #eee3de | #3a1722 / #ffffff | #fff2dc / #3a0f1c | #f2c14e / #876000 | #7cc4ff / #1565a8 | #7fd8a8 / #12754a | #ffab7a / #b0471a | #ff8f8f / #b8142a |

Ink, muted ink, hover, seams and selection follow the same recipe in every theme (see each theme source). Selection is always line 1 at reduced alpha.

**Adding a theme.** Copy an existing `<slug>Theme.ts` into a new `src/themes/<slug>/` folder and change only its name and palette, then:
1. `npx astryx theme build src/themes/<slug>/<slug>Theme.ts`, then `npx astryx theme add <slug>`; this regenerates `src/astryx-themes.ts`.
2. Add the entry to `themeChoices` in `src/shell/appearance.ts`; settings swatches and the visuals palette read it.
3. Add a `[data-theme="<slug>"]` block to `docs/mockups/line-diagram/ld.css`; `test/shell/themes.test.mjs` checks each shipped theme against it.
4. Add the theme's row to the table above and its name to the Overview list.

### Named Rules
**The Colour Belongs to Lines Rule.** Branch colour appears only as a line, a ring, a filled address chip, a passage underline, a line tick, or a line swatch in a key or legend (a short round-capped length of the line itself). Running text is never tinted to decorate; titles and current items are porcelain, everything else is ink or muted ink.

**The No Bar Beside Text Rule.** No coloured vertical or horizontal bar sits beside text as an accent. A branch's line shows as the filled address chip that leads a title. The Contents route strip and the swatches in keys and legends are the diagram itself, not accents, and are the only places a line runs alongside text.

**The Scarlet Means Failure Rule.** Scarlet appears only when something failed, and always with words ("Reply failed") and a way forward (Retry, Cancel, a reason). It is never a brand colour or a highlight. The one exception is the Delete button of a delete confirmation: outlined in scarlet, filled only on keyboard focus.

**The One Action Colour Rule.** Porcelain is the only action fill (New chat, Send, a dialog's primary); everything else is a quiet ghost control.

## Typography

**Display Font:** Barlow Semi Condensed (with Barlow, "Segoe UI", Helvetica, Arial, sans-serif)
**Body Font:** Barlow (with "Segoe UI", Helvetica, Arial, sans-serif)
**Reading Font:** Atkinson Hyperlegible Next (with Atkinson Hyperlegible, Verdana, sans-serif)
**Code Font:** ui-monospace (with "SF Mono", Menlo, Consolas, monospace)

All three faces are self-hosted (`@fontsource`). Settings offers System for the interface and the reading face; the system choice replaces the families only, never the sizes.

**Character:** The condensed grotesque of station signage for titles, caps labels, chips and the wordmark; a plain humanist grotesque for the interface; and a reading face built for legibility for everything the tutor writes. Signage above, reading below.

### Hierarchy
- **Display** (Semi Condensed 700, 38px, 1.08, balanced wrap): the conversation title in the reading column, in porcelain, led by its 16px title chip.
- **Page head** (Semi Condensed 700, 34px, 1.12, -0.015em): Library, Settings, Usage total and the page heads of Knowledge, Videos and Pieces.
- **Headline** (Semi Condensed 700, 24px): the Knowledge concept detail title.
- **Section** (Semi Condensed 700, 22px, 1.2): the shallowest heading a reply uses (its section titles, porcelain), the learning tree title at the head of Contents (1.15), the first-run card heading.
- **Title** (Semi Condensed 700, 20px, 1.2, -0.01em): Settings group headings and empty-state headings.
- **Card title** (Semi Condensed 700, 19px, 1.15, balanced): learning tree titles on Library shelf cards, in porcelain.
- **Small title** (15px, 600–700): theme card names in Settings, Knowledge detail subheads, the selected concept name and video captions.
- **Wordmark** (Semi Condensed 700, 20px, 1, 0.09em, uppercase, porcelain): the sidebar wordmark; 18px in the narrow header.
- **Reading** (Atkinson Hyperlegible Next 400, 17px, 1.68): replies, at most 640px wide. Discussion lines use 16px; video captions 15px. Tables inside replies switch to Barlow 14px/1.45.
- **Body** (Barlow 400, 14px, 1.4286): interface text, buttons, menus, question bubbles. Contents rows on the route strip are 14px with an 18px line so each first line meets its station.
- **Body small** (Barlow 400/500/600, 13px, 1.35): sidebar rows, settings keys, connection status. Code inside replies is 13px/1.6.
- **Label** (Semi Condensed 600, 12px, 1.2, 0.07em, uppercase, muted): section labels (CONTENTS, FIGURES, RESOURCES), date groups, table headers.
- **Chip** (Semi Condensed 700, 12px, 1, 0.02em, tabular figures): address chips in text, on map cards and in breadcrumbs.
- **Supporting** (Barlow 400, 13px, 1.45): hints, option descriptions, reply status, dates, map card previews, counts.
- **Micro** (Barlow, 11px): chart axes and scale in Usage, attachment type badges (700). Nothing is set smaller.

### Named Rules
**The Signage Above, Reading Below Rule.** Semi Condensed is for things you navigate by: titles, caps labels, chips, the wordmark. Anything the tutor wrote is set in the reading face. The interface between the two is Barlow.

**The Caps Are Labels Rule.** Uppercase is used only for the 12px label role and the wordmark. It never sits directly above a title as a kicker; where a screen needs to say where a conversation came from, the origin line under the title carries it.

## Layout

The grid is an 8px module (`--rabbithole-module`); gaps, bands and columns are multiples of it, with 4px as the half-step and 12px for tight inner padding.

- **Desktop shell (no top bar).** A 272px sidebar on the deep field holds, top to bottom: wordmark, New chat (porcelain) with search beside it, the six views, the tree title, Contents as a vertical route strip, Figures, Resources, the context meter, then Settings (and Downloads only while the list is non-empty) pinned at the foot. The whole sidebar scrolls as one.
- **Reading column.** The focused chat owns the centre at a 640px measure with 44px gutters (32px top, 24px bottom). The chat header row sits above on a seam; the composer floats at the foot on the ground colour, same width.
- **Docked map.** To the right of the reading column behind a resizable seam, on the deep field, 440px by default. Below 1024px the docked map hides and Map stays one click away in the sidebar. Expand chat hides the map.
- **Pages.** Library, Knowledge, Videos and Pieces sit on one 70rem column with Return to learning tree above the head. Settings is 70rem max with a 200px sticky section nav beside a 640px content column, 48px apart.
- **Library shelf.** An auto-fill grid of cards at least 208px wide, 16px gaps.
- **Narrow (48rem and below).** A 52px header on the deep field with menu, wordmark, search and New chat; the drawer holds the whole sidebar. One pane at a time; the reading gutters shrink to 16px; nothing scrolls sideways.

**The Fixed Columns Rule.** Columns do not reflow when state changes. State restyles the row (current, hover, failed); it never moves the layout.

## Elevation & Depth

The system is flat. Depth is three tonal layers (deep field below, ground, raised enamel above) separated by hairline seams. There are no drop shadows: every Astryx shadow token resolves to a 1px inset hairline in the seam colour. There is no gradient as a surface and no backdrop blur; dialogs and enlarged media dim the page with a flat scrim.

### Shadow Vocabulary
- **Hairline** (`box-shadow: inset 0 0 0 1px <seam>`): the only "shadow" the theme defines; used where Astryx expects an elevation shadow.
- **Selected tile** (`box-shadow: inset 0 0 0 2px <porcelain>`): the checked theme tile in Settings.

### Named Rules
**The Flat Enamel Rule.** No shadow, gradient or blur. An overlay is lifted by sitting on raised enamel with a 1.5px strong seam, not by casting a shadow. The one permitted hard colour split is the half-filled familiarity ring on Knowledge, which is a fill state, not a gradient.

**The Porcelain Seam Rule.** Menus, popovers, the passage box, dialogs and enlarged media share one frame: raised enamel, 8px corners, a 1.5px strong-seam border.

## Shapes

- **Corners:** gently rounded controls and containers (8px): buttons, inputs, the composer, cards, menus, dialogs, code blocks, question bubbles. Tighter on chips (4px): address chips, inline code, the context meter.
- **Round ends:** the full radius is reserved for things that are lines or points: line ticks on Library cards, line swatches in keys, status dots, scrollbar thumbs.
- **Lines:** thick, round caps and round joins. 5px on the Contents route strip, 4px in theme tiles, 7px on the map (9px when focused). Lines turn only at 45 or 90 degrees.
- **Stations:** circles with a porcelain ring on the deep field. Map handles are 12px with a 3px porcelain ring; the landing ring on a card's left edge is 15px. The route strip's stations have a 2.5px ring and the current station is filled porcelain. A branched passage's interchange ring is 13px with a 3px porcelain border on the ground colour.
- **Seams:** thin (1px) seams between regions; 1.5px strong seams on overlays and the composer; 1.5px dashed strong seam for ghost trees.

**The Routing Rule.** A line leaves its ring horizontally, turns 45 degrees, runs vertically through the centre of the gutter (at least 40px clear of any card edge) when the rise exceeds the run, turns 45 degrees again, and enters the target ring horizontally. Rings at the same height join with one straight horizontal. A child placed left of or above its parent is not drawn.

## Components

### Buttons
Plain and quiet, with one porcelain action.
- **Shape:** gently rounded (8px), 32px tall; the default button is 36px (30px small, at 13px).
- **Primary:** porcelain fill with on-porcelain text: New chat, Send, the primary of a dialog.
- **Default:** transparent with a 1px inset outline in ink at 40% and semibold ink text; hover lays the theme's gray tint. Settings actions, dialog secondaries.
- **Ghost:** transparent with ink text and muted icon; hover lays a 6 to 8% porcelain tint, pressed 12 to 14%.
- **Focus:** the one focus ring (see Inputs for the exception).
- **Disabled:** muted ink at 65%.
- **Segmented choice:** a 36px raised-enamel track with 3px padding; the chosen 30px segment is porcelain with on-porcelain 600 text.
- **Select button:** 36px, like the default button.
- **Progress bar:** porcelain fill on a hairline-seam track.

### Chips
- **Address chip:** filled with its conversation's line colour (porcelain for the trunk), on-porcelain text, Semi Condensed 700 12px with tabular figures, 4px corners, padding 3px 6px 2px. It leads every conversation title (title chip: 16px, padding 5px 8px 4px), map card headers and the current breadcrumb, and follows a branched passage in a reply (aria-hidden there).
- **Key chip:** one keyboard shortcut (Ctrl K is one chip; the Settings key list shows one per key): 18px tall, 1px seam outline, 4px corners, no fill, muted Semi Condensed 600 12px. The search window's footer chips are the exception: 20px, filled neutral, Barlow 600 12px.
- **Attachment and media chips on map cards:** deep field fill, ink text, 8px corners, 24px tall.

### Cards / Containers
- **Corner Style:** 8px.
- **Background:** raised enamel on the ground; deep field for code blocks and the sidebar.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** none at rest on cards; a strong seam on hover (map cards); a 2px porcelain border on the current Library card.
- **Internal Padding:** 12 to 16px; Library cards 14px 8px 12px 14px.

### Inputs / Fields
- **Style:** Astryx fields on raised enamel with a seam frame and 8px corners. The composer is raised enamel, 8px, a 1.5px strong seam, padding 12px 10px 10px 16px.
- **Focus:** fields show focus on their own frame (the composer frame turns porcelain); the control inside draws no second ring. The search window is framed by a 1.5px strong seam; its 56px input sits on a strong-seam underline, with an Esc key chip at its end.
- **Error:** scarlet text with words beneath the field.

### Navigation
- **Sidebar views:** full-width ghost rows, Barlow 14px 400 with muted icons; the current view is raised enamel with porcelain 600 text.
- **Contents route strip:** each conversation is a row beside a 5px line in its conversation's line colour with a ringed station; the current row is raised enamel with porcelain 600 text and a filled station. Addresses are muted 12px tabular.
- **Breadcrumbs:** muted 400 crumbs, current title porcelain 600 with its address chip.
- **Narrow:** a 52px deep-field header (menu, wordmark, search, New chat) and a drawer holding the sidebar.

### Overlays
Menus, popovers, the passage box, dialogs and enlarged media: raised enamel, 8px, 1.5px strong seam, no shadow, flat scrim behind modal ones.

### Failure banner
Scarlet wash fill, 1px scarlet border, 8px corners, padding 8px 12px, ink text with a scarlet icon, and the recovery action pushed to the end of the row.

### The Map (signature)
Conversation cards (160px wide, raised enamel, 8px) carry a header with the address chip and a two-line Semi Condensed title over turn previews. Under the address chip, depth stops mark how deep the card sits: one 6px porcelain ring per level below the trunk, 11px apart, joined by a 1.5px porcelain line, the last ring filled; the row has no cap. Branch lines (7px, round caps) leave an interchange ring beside their source message and land in the card's left ring; sibling lines from one card each take their own vertical run, so none covers another. The current card wears a 2.5px porcelain ring 3px off its edge; a marked card a dashed porcelain outline. Folded stubs read "address · N folded" behind a dashed line. Ghost trees are dashed, muted and drop their line colours; their links are 3px dotted muted lines. Controls sit bottom left on raised enamel; the line key sits top left on the deep field.

### Replies and passages
Replies have no bubble: Atkinson 17px/1.68 at 640px. Suggestions are a 2px muted dotted underline. A branched passage wears a 3px solid underline in its branch's line colour, then a porcelain interchange ring, then its address chip. Questions are right-aligned raised-enamel bubbles, at most 520px.

### Diagrams (Mermaid)
Mermaid renders on the base theme fed from the surrounding tokens: surface fills, ink text and lines, seam borders, the reading or interface face, and the four lines (in hue-slot order) as series colours. Nodes have 8px corners and a 1.5px stroke; links are 2px with round caps and joins.

### Motion
**The One Motion Rule.** Creating a branch draws the new line out of its interchange along its path in 350ms on an exponential ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`), then the station ring lands (a 125ms fade). With reduced motion it appears at once. Everything else changes state without travel: hover and reveal are opacity or colour changes of 120 to 165ms.

## Do's and Don'ts

### Do:
- **Do** give siblings at every fork different line colours, keep an only child on its parent's line, and carry each conversation's colour from passage underline to interchange ring, address chip, route strip and map line.
- **Do** lead every conversation title with its filled address chip (4px corners).
- **Do** draw lines thick and round-capped (5px sidebar, 7px map) and turn them only at 45 or 90 degrees, following the Routing Rule.
- **Do** mark stations and interchanges with porcelain rings, and the current one by filling it.
- **Do** set replies in Atkinson Hyperlegible Next 17px/1.68 at a 640px measure, and titles in Barlow Semi Condensed 700 (38px conversation title).
- **Do** put every overlay on raised enamel with a 1.5px strong seam and 8px corners.
- **Do** use one focus ring everywhere: 2px porcelain, 2px off the control. Fields show focus on their own frame instead.
- **Do** pair scarlet with words and a way forward (Retry, Cancel, a reason).
- **Do** take every value from the theme roles so every theme, light and dark, stay in step.

### Don't:
- **Don't** tint running text with a line colour to decorate it.
- **Don't** show depth with line weight or tint; lines stay 7px and full colour at every depth.
- **Don't** place a coloured bar beside text; the route strip and key swatches are the diagram, not accents.
- **Don't** use scarlet for anything but a failure.
- **Don't** add shadows, gradients or blur; depth is tonal enamel and seams.
- **Don't** add a second motion: no sliding panels, bouncing or travel beyond the line draw.
- **Don't** put a caps kicker above a title; the origin line under it says where it came from.
- **Don't** add a top bar; navigation lives in the sidebar (or the narrow header and drawer).
- **Don't** use a pill radius on chips or controls; full rounding is for lines, ticks and dots.
