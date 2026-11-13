---
name: TreeTutor
description: A learning tree as a volume in a paperback series, read at a book measure and inked by branch family.
colors:
  leaf-action: "#9dba6e"
  leaf-text: "#a9c67a"
  on-leaf: "#171c0f"
  leaf-wash: "#9dba6e26"
  amber-ink: "#dfae4e"
  rust-ink: "#d68560"
  lichen-ink: "#86b8ae"
  bark-ground: "#1a1613"
  raised-bark: "#241f1a"
  popover-bark: "#2d2620"
  deep-panel: "#14110e"
  paper: "#efe6d6"
  paper-muted: "#ab9e8b"
  paper-faint: "#84786a"
  seam: "#efe6d61f"
  seam-strong: "#efe6d64d"
  selection: "#9dba6e59"
  moss-band: "#33432a"
  band-ink: "#e9efd9"
  band-muted: "#b3c19d"
  rose-failure: "#f07f8a"
  rose-wash: "#f07f8a26"
  on-rose: "#240a0e"
typography:
  display:
    fontFamily: "Archivo, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "34px"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.015em"
  headline:
    fontFamily: "Archivo, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Archivo, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  reading:
    fontFamily: "Literata, Georgia, \"Times New Roman\", serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.7
  reading-heading:
    fontFamily: "Literata, Georgia, \"Times New Roman\", serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
  reading-aside:
    fontFamily: "Literata, Georgia, \"Times New Roman\", serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Archivo, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4286
  small:
    fontFamily: "Archivo, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.35
  label:
    fontFamily: "Archivo, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1.6667
  section-label:
    fontFamily: "Archivo, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    letterSpacing: "0.06em"
    fontFeature: "\"smcp\", \"c2sc\""
  address-chip:
    fontFamily: "Archivo, \"Segoe UI\", Helvetica, Arial, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1.45
    fontFeature: "\"tnum\""
  code:
    fontFamily: "ui-monospace, \"SF Mono\", Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  tick: "1px"
  inner: "2px"
  element: "3px"
  container: "4px"
  full: "9999px"
spacing:
  half: "4px"
  module: "8px"
  module-1-5: "12px"
  module-2: "16px"
  module-3: "24px"
  module-4: "32px"
  module-5: "40px"
  module-7: "56px"
  module-8: "64px"
components:
  button-primary:
    backgroundColor: "{colors.leaf-action}"
    textColor: "{colors.on-leaf}"
    typography: "{typography.body}"
    rounded: "{rounded.element}"
    padding: "0 12px"
    height: "32px"
  button-outlined:
    backgroundColor: "transparent"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.element}"
    padding: "0 12px"
    height: "32px"
  button-delete-focus:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.bark-ground}"
    rounded: "{rounded.element}"
  band:
    backgroundColor: "{colors.moss-band}"
    textColor: "{colors.band-ink}"
    height: "56px"
    padding: "0 16px"
  band-tab:
    backgroundColor: "transparent"
    textColor: "{colors.band-muted}"
    rounded: "{rounded.element}"
    padding: "0 12px"
    height: "32px"
  band-tab-current:
    backgroundColor: "{colors.band-ink}"
    textColor: "{colors.moss-band}"
    rounded: "{rounded.element}"
    padding: "0 12px"
    height: "32px"
  contents-panel:
    backgroundColor: "{colors.deep-panel}"
    textColor: "{colors.paper}"
    width: "264px"
  contents-row:
    backgroundColor: "transparent"
    textColor: "{colors.paper}"
    typography: "{typography.body}"
    rounded: "{rounded.element}"
    padding: "6px 8px"
    height: "32px"
  contents-row-current:
    backgroundColor: "{colors.raised-bark}"
    textColor: "{colors.paper}"
    rounded: "{rounded.element}"
  composer:
    backgroundColor: "{colors.raised-bark}"
    textColor: "{colors.paper}"
    rounded: "{rounded.container}"
    width: "640px"
  question-bubble:
    backgroundColor: "{colors.seam}"
    textColor: "{colors.paper}"
    rounded: "{rounded.element}"
    padding: "8px 12px"
  passage-address:
    backgroundColor: "{colors.amber-ink}"
    textColor: "{colors.bark-ground}"
    typography: "{typography.address-chip}"
    rounded: "{rounded.inner}"
    padding: "0 4px"
  conversation-node:
    backgroundColor: "{colors.raised-bark}"
    textColor: "{colors.paper}"
    rounded: "{rounded.element}"
    width: "16rem"
  volume:
    backgroundColor: "{colors.raised-bark}"
    textColor: "{colors.paper}"
    rounded: "{rounded.element}"
    width: "176px"
  volume-cover:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.bark-ground}"
    typography: "{typography.title}"
    padding: "12px"
    height: "144px"
  concept-card:
    backgroundColor: "{colors.raised-bark}"
    textColor: "{colors.paper}"
    rounded: "{rounded.element}"
    padding: "6px 10px"
  failure-banner:
    backgroundColor: "{colors.rose-wash}"
    textColor: "{colors.paper}"
    rounded: "{rounded.element}"
    padding: "8px 12px"
  band-failure:
    backgroundColor: "{colors.rose-failure}"
    textColor: "{colors.on-rose}"
    rounded: "{rounded.element}"
    padding: "0 8px"
    height: "24px"
---

# Design System: TreeTutor

## Overview

**Creative North Star: "The Paperback Series"**

A learning tree is a volume in a paperback series. The trunk conversation is paper; each first-level branch family takes one muted seasonal ink (amber, leaf, rust, lichen), and that ink follows the family everywhere: the passage underline it was branched from, the address chip after that passage, the dot in the Contents outline, the branch line on the map, the conversation node's band and the tick on the volume's spine in the Library. Structure, not ornament, is what makes the screen recognisable.

The app is dark by default on bark-black with paper text, and the light appearance has the same structure on warm paper with darkened inks. A moss band runs across the top as the series' cover strip. Below it, a numbered Contents outline sits on the left, the reply is read at a book measure in the centre, and the learning tree map is docked on the right. Everything sits on one 8px module, divided by hairline seams and flat ink bands. There is no texture, no drop shadow and no blur. Chrome steps back while the learner reads: the reply is set in Literata with no bubble, and the interface is set in Archivo.

The world rejects the category default of a grey chat column beside a sidebar list with one blue accent. It also rejects what PRODUCT.md names: childish or gamified, generic SaaS dashboard, neon hacker-dark, and decoration that competes with reply text.

**Key Characteristics:**
- Bark-black ground, paper text, moss shell band; a designed light appearance with the same roles.
- Four series inks cycle per first-level branch family; the trunk wears paper.
- Leaf green is the one action colour; paper is focus; rose red means failure and nothing else.
- Archivo for what you operate, Literata for what you read.
- 3px element and 4px container corners, hairline seams, an 8px module, flat ink bands.
- Motion is brief and structural: a 350ms branch draw-on, which is instant under reduced motion.

## Colors

The palette is a warm bark-and-paper neutral, a single moss band, and four equal-weight seasonal inks. Every token is a light/dark pair (CSS `light-dark()`), and dark is the default. The frontmatter records the dark values, and the sidecar carries each pair.

### Primary
- **Leaf Green** (leaf-action): the one action colour. It is used for the Send button, primary buttons (New chat in the Library), the streaming caret and dot, the "responding" activity dot, the current-model check in the model menu, and the pressed Knowledge filter (as Leaf Wash with a leaf hairline). **Leaf Text** is the same hue, lifted for legibility in text links and accent labels. Text on a leaf fill is **On Leaf**.

### Secondary
- **Amber Ink** (amber-ink): series ink 1. It is also used for the pending-video storyboard mark and progress bar.
- **Leaf Ink**: series ink 2 shares the Leaf Green value. On a passage underline, branch line or node band it marks a family. On a filled button or caret it means action. Placement tells the two apart.

### Tertiary
- **Rust Ink** (rust-ink): series ink 3.
- **Lichen Ink** (lichen-ink): series ink 4.

The series inks fill Astryx's hue slots so that soft fills, badges and usage-chart series follow the world: yellow = amber, green = leaf, pink = rust, blue = lichen. Each ink has a low-alpha wash (light `24` / dark `2e` alpha) for badges and soft fills. The question bubble always takes the theme's neutral colour; it has no picker of its own.

### Neutral
- **Bark Ground** (bark-ground): the page ground, the reading column and the open map canvas. It is also the text colour on paper and on inks in dark mode.
- **Raised Bark** (raised-bark): the surface for cards, the composer, conversation nodes, volumes, the current Contents row and concept cards.
- **Popover Bark** (popover-bark): the raised sheet for dialogs, dropdown menus, lightboxes and the branch form.
- **Deep Panel** (deep-panel): the recessed field used by the Contents outline, the docked map, the Knowledge field and code blocks.
- **Paper** (paper): primary text, the trunk's ink, the focus ring, the selected-link stroke and the volume cover.
- **Paper Muted** (paper-muted): secondary text, addresses, labels and the context-meter fill.
- **Paper Faint** (paper-faint): disabled text only.
- **Seam** / **Seam Strong**: hairline dividers and borders. Seam Strong is for input and outlined-button strokes.
- **Moss Band** (moss-band) with **Band Ink** and **Band Muted**: the shell band. Moss keeps the same value in both appearances.
- **Selection** (selection): text selection, the revealed passage highlight and `mark`.
- **Rose Failure** (rose-failure), **Rose Wash**, **On Rose**: failure states only.

### Named Rules
**The Family Ink Rule.** Each first-level branch takes the next ink in the cycle amber, leaf, rust, lichen, repeating, in creation order. Its descendants inherit that ink, and the trunk wears paper. A family's ink appears in the same six places: the passage underline, the address chip, the Contents dot, the branch line, the node band and the spine tick. Never assign an ink by topic, status or decoration.

**The One Action Colour Rule.** Leaf green is the only fill that means "do this". There is never a second action hue. Secondary actions are outlined neutral.

**The Paper Focus Rule.** Keyboard focus is a paper outline (band ink on the moss band). Focus is never leaf and never blue.

**The Rose Means Failure Rule.** Rose red appears only for something that failed: an unsaved map layout, a failed reply, a failed visual or video, a failed deletion. Deletion itself is not a failure. It is an outlined neutral button, set 32px apart from the other actions, and it fills with paper on keyboard focus.

## Typography

**Interface Font:** Archivo (with "Segoe UI", Helvetica, Arial, sans-serif), self-hosted at weights 400, 500, 600 and 700
**Reading Font:** Literata (with Georgia, "Times New Roman", serif), self-hosted at 400, 400 italic and 600
**Code Font:** ui-monospace (with "SF Mono", Menlo, Consolas, monospace)

**Character:** Archivo is a compact grotesque that carries the chrome, titles and labels with tight negative tracking at display sizes. Literata is a book face for long evening reading. The pairing marks which text is something to operate and which is something to read.

### Hierarchy
The app's own ramp is 10, 12, 13, 14, 15, 17, 20 and 34px. Astryx's generated scale (base 14, ratio 1.2: 10, 12, 14, 17, 20, 24, 29, 35px) supplies the 10, 12, 14, 17 and 20 steps. The 13, 15 and 34px steps are deliberate members of the app ramp. They come from the mockup's own scale and are not drift from Astryx.

- **Display** (Archivo 700, 34px, 1.12, -0.015em): page titles. Used for Library, Settings and the conversation title in the reading column. There is one per page.
- **Headline** (Archivo 700, 20px, 1.2, -0.01em): the learning-tree title at the head of Contents, the Knowledge detail title and the first-question prompt. The 20px wordmark on the band uses this size at regular weight.
- **Title** (Archivo 700, 17px, 1.15, -0.01em): volume titles on the Library shelf. They are balanced and wrap freely.
- **Reading** (Literata 400, 17px, 1.7): tutor replies, set at a 640px measure with no bubble. Inherited-context passages use Literata at 14px/1.7.
- **Reading heading** (Literata 600, 20px, 1.3): headings inside replies.
- **Reading aside** (Literata 400, 15px, 1.55–1.6): secondary reading text in Paper Muted. Used for Knowledge concept explanations and video figure captions (max 65ch).
- **Body** (Archivo 400, 14px, 1.4286): interface text, Contents rows, tables inside replies (14px/1.45), and diagram card titles at 600.
- **Small** (Archivo 13px, weight 500–600): Library date headings, Knowledge evidence, video draft steps and elapsed time. Also used for code inside replies, in the code face at 13px/1.6.
- **Label** (Archivo 600, 12px): the Contents and Figures section labels, Knowledge topic headings, the model picker and reply status. Supporting text at 12px/1.6667 uses weight 400.
- **Section label** (Archivo 600, 14px, all small caps, 0.06em, Paper Muted): Settings group and panel headings, which are the headings themselves and not tags above them.
- **Address chip** (Archivo 700, 10px, 1.45, tabular): the inked address superscript after a branched passage.

On touch devices narrower than 1024px, Astryx raises the whole scale one step (base 16px). Every address, token count, date and meter uses tabular figures.

### Named Rules
**The Two Faces Rule.** Use Literata for anything the learner reads as prose: replies, reply headings, inherited context, the passage quoted in the branch form, Knowledge explanations and figure captions. Use Archivo for everything else, including tables and code captions inside a reply.

**The Numbered Address Rule.** Every conversation has an address (trunk 1, children 1.1, 1.2 in creation order, grandchildren 1.1.1). A later sibling never renumbers an earlier one. The address appears in tabular figures wherever the conversation is named.

## Layout

The layout is built on an 8px cover-grid module, and every band, column and major gap is a multiple of it. The shell band is 56px (7 modules) with 16px inline padding, and its controls are 32px tall. The Read view has three columns. The Contents outline is 264px (33 modules) on the Deep Panel. The reading column has a 640px measure plus 24px gutters on each side, with the composer sharing that measure. The learning tree map docks on the right at 440px (27.5rem) by default. The map is resizable from a draggable seam on its left edge, between 320px (20rem) and 60% of the workspace, so the reading column always keeps at least 40%; the arrow, Home and End keys also move the seam. When the pane resizes and the learner has not moved the map, it refits with a readable 75% zoom floor and reveals the selected node. A map the learner has panned keeps its centre.

The Map view drops the reading column, so Contents sits beside the full canvas. The Library, Knowledge and Settings pages use a 70rem (1120px) page with 40px / 32px / 64px padding (5 / 4 / 8 modules). The Library shelf is a grid of 176px volumes with 32px row and 24px column gaps. Settings uses a 216px sticky section nav beside a 640px column with a 48px gap. Knowledge pairs a flexible concept field with a 16rem–360px detail panel.

Contents rows are 32px tall and indent 16px per depth level, up to three levels. Fine-tuning values of 4px, 6px, 10px and 12px appear inside rows and chips. They are internal padding, not layout spacing.

**Narrow (max-width 48rem):** the band wraps. Contents moves into a drawer that holds the view links, then the outline, then Settings. The docked map hides while a chat is open. Settings collapses to one column with the nav above it, the Library list drops its date column, and page padding falls to 24px / 16px / 48px.

## Elevation & Depth

The system is flat, and depth comes from tone. The order runs from Deep Panel (recessed) through Bark Ground and Raised Bark to Popover Bark (sheets), and hairline seams separate them. All three Astryx shadow tokens (low, med, high) resolve to the same 1px inset hairline, `inset 0 0 0 1px` in Seam. Lightbox and dialog backdrops are a flat dimmed overlay (Bark at 72% in dark mode) with the backdrop filter explicitly removed. The floating composer fades into the ground with a gradient instead of sitting on a drawn band.

### Named Rules
**The Hairline Rule.** Separate surfaces with a seam or a tonal step, never with a drop shadow or blur. The only rings are selection and focus rings. The current Library volume wears a 3px ground gap and a 2px paper ring, which is a selection mark and not elevation.

## Shapes

Corners are barely softened, which keeps the pages printed and square. Interactive elements (buttons, tabs, rows, chips, nodes, volumes, concept cards, failure banners) use the element radius (3px). Containers and sheets (the composer, code blocks, diagram cards, the Knowledge field, dialogs, lightboxes, video frames) use the container radius (4px). Inline marks (address chips, inline code, the context meter, highlight marks, usage swatches) use the inner radius (2px). Volume spine ticks are 4×6px with a 1px tick radius.

Circles are reserved for meaning-bearing dots. The full radius (rendered as `50%`) shapes family ink dots in Contents and the map legend, activity dots, the streaming dot and the familiarity rings in Knowledge (empty, half-filled or filled to show familiarity). The scrollbar thumb is the only pill shape (999px). Neither is a pattern for buttons. Ink bands (the volume cover and node bands) are flat fills that inherit the container's top corners.

## Components

### Buttons
- **Shape:** gently squared (3px), 32px tall in chrome, weight 600 in the band.
- **Primary:** a Leaf Green fill with On Leaf text, used for Send and New chat in the Library. On the band, New chat is outlined in band ink at 35% alpha.
- **Outlined (secondary):** transparent, with a Seam Strong inset hairline and paper text. Hover adds an 8% paper tint.
- **Delete:** looks like Outlined in dialogs, never rose, and sits 32px from the other actions. On keyboard focus it fills with Paper and Bark text.
- **Ghost:** used for Contents rows, crumbs and toolbar icons. Hover is a 6% paper overlay and press is 12%.
- **Focus:** a paper outline everywhere, and a band-ink outline on the moss band.

### Navigation (shell band)
- The Moss Band holds, in order, the TreeTutor wordmark (20px), the learning-tree switcher (32px, outlined in band ink at 22% alpha, max 280px, ellipsised), the view tabs (Read, Map, Knowledge, Videos, each with a 16px Heroicons outline icon), and then search, New chat and Settings, pushed to the end.
- **Tabs:** Band Muted at rest and Band Ink on hover. The current tab is a Band Ink fill with Moss text.
- **Idle save state:** there is none. Map layout batches once a minute, and only a failure shows: a 24px Rose Failure pill reading "Map layout not saved." with an underlined Retry.

### Contents outline (signature)
- A 264px Deep Panel. The head shows the tree title as a headline, with a count of conversations and figures below it.
- A **Contents** list of rows shows the address (tabular, min 34px, Paper Muted), an 8px family ink dot and the title, ellipsised. The current row is a Raised Bark fill at weight 600, with no ring.
- A **Figures** list numbers every diagram, visual and video as "Fig n" with its kind.
- A **Context meter** sits at the foot behind a seam: a 4px bar on Seam filled with Paper Muted, over tabular token counts.

### Reading column
- The reply is set in Literata 17px/1.7 at the 640px measure, with no bubble. The learner's question is a bubble in the theme's neutral colour, aligned right (3px, 8px 12px padding).
- **Suggestions** are dotted 2px Paper Muted underlines. A branched passage is underlined solid in its family's ink and followed by an inked **address chip**.
- **Composer:** Raised Bark, a 4px container corner and a Seam Strong hairline. On focus, the border and a 1px ring turn Paper. Send is a Leaf Green square at 3px. The model chip and Stop inside it rest on a hover-tone fill with no outline of their own.
- **Streaming:** an 8px leaf caret after the last written block, and a pulsing 8px leaf dot in the reply status.

### Learning tree map (signature)
- **Conversation node:** a 16rem Raised Bark box at 3px with a seam border, topped by a flat **ink band** (Paper for the trunk) that carries the address and title. On hover the border becomes Paper Muted, and focus draws a paper outline.
- **Branch lines:** 2px, round-capped, in the family ink (Paper at 75% for the trunk). The focused branch is 2.5px. A new branch draws on over 350ms ease-out and appears at once under reduced motion. Folded branches end in a dashed ink stub with a dashed pill showing the count.
- The canvas sits on Bark Ground when the map is its own view and on Deep Panel when docked. A zoom toolbar sits bottom-left, and an ink legend sits bottom-right (Map view only).
- **Seam:** an 8px hit area whose 2px line turns Paper on hover, drag or focus (120ms).

### Library volumes (signature)
- **Shelf:** 176px volumes. Each has a 144px **Paper cover** carrying the title (17px bold) and start date in Paper Ink, then a Raised Bark meta strip with a **spine**: one 4×6px tick per conversation in its ink, trunk first. The menu sits top-right on the cover.
- **List:** the same volumes as seam-separated 48px rows, with the date column hidden when the layout is narrow.

### Cards / Containers
- **One frame per object.** A frame (a border or ring) appears once per object, and an outlined container never holds another outlined container. Inside a frame, parts are separated by tone (Deep Panel, Raised Bark, hover fills) or spacing. Inputs, the composer, floating sheets and failure banners keep their stroke; the rows, fields, buttons and cards inside them do not. One-sided rules (separators, table row lines, the inherited passage's ink rule) are not frames, and focus outlines are unchanged.
- On Read, inherited context and diagram cards sit on Raised Bark and code blocks (and a diagram's source) on Deep Panel, with container corners, no border, no shadow and 12–24px of internal padding. Tables in replies separate rows with one Seam line under each row (Seam Strong under the header). The branch form is one paper-edged sheet; its question field shows only its focus ring. The visual action bar is one floating sheet with ghost buttons.
- Visuals and videos sit inside the reply with no card chrome. Their action bars appear on hover or focus, and always on touch.

### Inputs / Fields
- Inputs have a Seam Strong stroke and a 3px radius on Raised Bark. Focus is a Paper outline.
- **Error:** Rose text and a rose border. Failure banners use Rose Wash with a rose hairline, a 3px radius and 8px 12px padding.

### Knowledge
- The concept field is a borderless Deep Panel at the container corner; the detail panel beside it has no frame or fill and is set apart by spacing. Concepts are familiarity rings with a name on a soft tonal label, with no border. Topic names are plain text over their translucent region, never chips. The selected concept's ring gets a 2px paper outline offset by 3px. Links between concepts are 1.5px Seam Strong lines, "builds on" links are drawn in Paper Muted, and the selected link is a 2px paper line.

### Settings
- Settings is a page, not a modal. A page title sits over a sticky section nav. Sections are divided by seams and headed by small-caps section labels, not cards. Usage shows bar series in lichen (input), leaf (output) and amber (cache read).

## Do's and Don'ts

### Do:
- **Do** set every band, column and major gap on the 8px module (56px band, 264px Contents, 640px measure, 440px map).
- **Do** give each first-level branch family one series ink, in the order amber, leaf, rust, lichen, and carry it to the underline, address chip, Contents dot, branch line, node band and spine tick. The trunk wears paper.
- **Do** reserve Leaf Green fills for the one action in a region: Send, primary New chat, a pressed filter.
- **Do** draw focus as a paper outline, or band ink on the moss band.
- **Do** set replies and other prose for reading in Literata 17px/1.7 at a 640px measure, and everything operable in Archivo.
- **Do** use 3px corners for elements, 4px for containers and 2px for inline marks.
- **Do** make every animation instant under `prefers-reduced-motion`. That includes the branch draw-on, pulses, the selection rise and view transitions.
- **Do** show failures persistently in rose and stay silent about success. There is no "Saved" idle label.

### Don't:
- **Don't** use drop shadows, blur or texture. Depth comes from tone and hairline seams.
- **Don't** use rose red for deletion, warnings or emphasis. It means something failed.
- **Don't** introduce a second action hue, or use blue anywhere as an accent or a focus colour.
- **Don't** add a fifth series ink or assign inks by topic. The four-ink cycle is the identity.
- **Don't** put tutor replies in bubbles or cards. Only the learner's question sits in a bubble.
- **Don't** make the interface childish or gamified, a generic SaaS dashboard, or neon hacker-dark, and don't let decoration compete with reply text.
