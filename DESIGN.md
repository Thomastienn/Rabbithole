---
name: TreeTutor
description: A quiet reading and question workspace.
colors:
  accent: "light-dark(#1b1b1b, #f1f1f1)"
  surface: "light-dark(#ffffff, #262626)"
  body: "light-dark(#f1f1f1, #1b1b1b)"
  text-primary: "light-dark(#000000, #ffffff)"
  text-secondary: "light-dark(#474747, #9e9e9e)"
  border: "light-dark(#00000014, #ffffff1A)"
  border-emphasized: "light-dark(#d4d4d4, #525252)"
  neutral: "light-dark(#0000000F, #ffffff1A)"
  selection: "light-dark(#b9d7ff, #253c5a)"
typography:
  headline:
    fontFamily: 'Figtree, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.3333
  title:
    fontFamily: 'Figtree, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: 'Figtree, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4286
  supporting:
    fontFamily: 'Figtree, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.6667
rounded:
  element: "0.625rem"
  page: "1.75rem"
spacing:
  "1": "0.25rem"
  "2": "0.5rem"
  "3": "0.75rem"
  "4": "1rem"
  "5": "1.25rem"
  "6": "1.5rem"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    rounded: "{rounded.element}"
  button-secondary:
    backgroundColor: "{colors.neutral}"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.element}"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.text-primary}"
    rounded: "{rounded.element}"
---

# Design System: TreeTutor

## Overview

**Creative North Star: "Room to follow a question"**

TreeTutor uses a quiet light workspace for repeated reading and asking. Restrained neutrals, compact controls and clear heading levels keep attention on the transcript. Saved learning trees sit beside the active conversation on desktop.

The system is code-led: Astryx supplies primitives and the neutral theme. Preserve its spacing, control states and native keyboard behavior when extending the app. No decorative imagery is needed for the text-focused use scene established in PRODUCT.md.

**Key Characteristics:**
- Quiet neutral surfaces
- Readable text hierarchy
- Compact saved-tree navigation
- Visible composer and explicit reply status

Sources: [PRODUCT.md](PRODUCT.md), [ChatPage.tsx](src/ChatPage.tsx), [layout.ts](src/layout.ts), [main.tsx](src/main.tsx), and [theme registration](src/astryx-themes.ts). Visual references: [desktop](.impeccable/review/desktop.png) and [mobile](.impeccable/review/mobile.png). These references show a synthetic failed reply; they do not establish live subscription or model verification, which remains pending consent.

## Colors

### Primary
The charcoal accent gives primary actions emphasis without introducing a separate brand hue. The frontmatter preserves Astryx's native light-dark values; the reviewed surface is light.

### Neutral
White surface, pale body gray, black primary text and medium gray secondary text carry the hierarchy. Translucent borders separate the application header, navigation and conversation. The neutral fill marks secondary actions and the selected tree. Pale body gray backs the sidebar and alert region; the surface role colors scrollbar tracks. Text selection uses the blue background role.

**The Semantic Color Rule.** Use Astryx's existing color roles; let the theme own palette values.

Token authority: installed `@astryxdesign/theme-neutral/dist/theme.css`, generated from `src/neutralTheme.ts` inside that package. The entries above correspond to `--color-accent`, `--color-background-surface`, `--color-background-body`, `--color-text-primary`, `--color-text-secondary`, `--color-border`, `--color-border-emphasized` `--color-neutral` and `--color-background-blue` in that order. Do not copy this snapshot into application CSS as overrides.

## Typography

Figtree serves headings, body and controls with platform sans-serif fallbacks. The theme uses a base of 14 and a scale ratio of 1.2; the frontmatter records the reused desktop roles. The application title uses heading level 1, tree and navigation titles use level 2, and the empty-chat prompt uses level 3. Supporting text carries save status, privacy context and keyboard hints.

The installed theme adapts coarse-pointer narrow devices to a 16px body floor and re-derived scale. This is a theme adaptation, separate from the application's navigation breakpoint.

Font delivery is self-hosted: [vite.config.ts](vite.config.ts) aliases the theme font stylesheet to `@fontsource/figtree/index.css`; [astryx-themes.ts](src/astryx-themes.ts) imports that stylesheet. Do not restore the theme's remote font import.

## Layout

The viewport shell uses dynamic viewport height. Desktop places a fixed-width saved-tree sidebar (18rem) beside a flexible conversation. Headers and sidebar sections use the spacing-5 inset; small relationships use spacing-1 through spacing-4. The transcript uses Astryx's balanced chat density and fills available width; no additional reading-column maximum is implemented.

At the application breakpoint (48rem), navigation becomes a toggleable region above the conversation, capped at 45dvh. Selecting a tree closes it. The conversation retains flexible height so the composer remains visible in the reviewed mobile layout. Long labels and transcripts wrap.

**The Composer Rule.** Preserve the flexible-height conversation and collapsible mobile navigation when adding controls.

## Elevation & Depth

The workspace is flat. Thin dividers and subtle selected fills establish structure. The composer explicitly uses no elevation; ghost message bubbles preserve the plain transcript. Only floating controls lift: the map toolbar uses `--shadow-low`, the selected map node and the **Ask about selection** action use the medium shadow.

## Shapes

Controls use Astryx's gently rounded element corners. The larger composer has the theme's page radius. Keep native component shapes rather than introducing application-specific radii.

## Components

Use the Astryx components already imported by [ChatPage.tsx](src/ChatPage.tsx). The sidecar contains framework-free illustrative previews of these primitives; runtime Astryx remains authoritative for their full states and metrics.

- **Buttons:** primary create action, secondary account and selected-tree actions, ghost unselected-tree and mobile navigation actions. Empty names disable creation; active generation exposes Stop.
- **Text field:** persistently labelled new-tree input, followed by the create action. Native form submission supports keyboard use.
- **Navigation:** saved trees form a compact button list. The selected tree has a secondary fill and `aria-current`; mobile navigation exposes its expanded state.
- **Transcript:** explicit You/Tutor labels, preserved line breaks, wrapped long content, and visible responding or failed status.
- **Composer:** labelled input, subdued prompt, send/stop action and visible Enter/Shift+Enter instructions. New tree creation focuses the composer.
- **Map:** the tree map fills the workspace on the body background. Conversation nodes are 16rem boxes: title button, two-line question and answer previews, a pulsing activity dot while replying, a fold chevron and a hover/focus-revealed source link. Fit never zooms past 100%. Zoom, fit, the map menu and **Reopen chat** float as one toolbar at the top left. A tree without a first question shows a centered empty map with **Start conversation**.
- **Chat panel:** a compact header holds the title, a `model · saved automatically` subtitle and three icon buttons: model menu (grouped by provider, with sign-in actions for signed-out providers), expand/collapse, and **Return to tree** (Esc). Branches add a **Return to parent conversation** row with the source passage.
- **Passage actions:** no persistent controls. Selecting reply text floats **Ask about selection** above the selection; a focus-revealed **Select passage in tutor reply N** button opens keyboard selection. The branch form opens inline under its source reply.
- **Feedback:** request failures appear in an alert region; loading and empty states explain the next available action in plain text.

## Do's and Don'ts

### Do:
- Do use Astryx components and semantic theme tokens.
- Do preserve native keyboard operation and visible focus.
- Do wrap long tree titles and message text.
- Do keep the composer reachable at narrow widths.

### Don't:
- Don't add decorative imagery to this reading workspace.
- Don't replace the flat transcript with card-wrapped messages.
- Don't hide failed or interrupted reply states.
