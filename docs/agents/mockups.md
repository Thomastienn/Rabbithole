# Matching a mockup

A task whose description has a `Mockup:` line ships a screen that matches that
mockup's structure exactly: layout, elements, copy, sizes, spacing, hierarchy
and every state the mockup draws. Colour and font follow the app's current
theme, not the mockup's literal values: map each mockup colour to the theme
token with the same role (ground, ink, accent, family hue, muted), so the look
reads the same in every theme. The ticket's own description and acceptance
criteria are the only allowed source of a structural difference; anything else
needs the owner's approval.

## Planning

A `new-ui` ticket's acceptance criteria include, verbatim with its path:
"Matches the mockup at `docs/mockups/<issue-id>.html` in layout, elements,
copy, sizes and spacing, with its colours mapped to theme tokens by role; the
owner approves any difference." A
difference the owner already agreed to (an element dropped, a control renamed)
goes in the description so the worker builds without it. Before publishing,
check the mockup draws every state the ticket builds (populated, empty,
selected, error) with realistic data.

## Implementing

1. **Read the mockup** HTML and its CSS before writing UI. Take sizes,
   spacing and copy from it as drawn; take colours and fonts from the theme
   tokens whose role matches the mockup's. When a
   house component (Astryx) cannot reach the mockup's look, restyle or replace
   it: the mockup wins over reuse.
2. **Render both.** Build the client once in watch mode
   (`npx vite build --watch --minify false --outDir <tmp>`, run in the
   background: later edits rebuild in seconds, then reload the page), serve it over a seeded fixture the way
   `scripts/capture-finish.mjs` does (`createApp({ assets: '<tmp>' })`), with
   data shaped like the mockup's: the same number of items, every drawn state
   filled. Capture the mockup (`file://`) and the app with `agent-browser` at
   1440x900 in the dark scheme, the same state in each pair; add 390x844 when
   the mockup has a narrow view. Check the light scheme as text only: its
   computed colours use the light theme tokens of the same roles.
3. **Compare as text first.** Read sizes, spacing, fonts and colours of both
   pages with `agent-browser eval` (computed styles, bounding boxes) and fix
   every structural difference and every colour used in the wrong role. A
   colour that differs only because the theme differs is a match. Try a CSS
   change live first by injecting the rule with `agent-browser eval`, then
   write it to the file. Images cost a lot of context: open one only for a
   region the numbers cannot settle, screenshot only that region
   (`agent-browser screenshot <selector>`), never open a full-page capture,
   and open at most 6 images in the whole task. The step is done when the
   computed values match.
4. **Record** one full-page pair per drawn state, dark scheme only, as WebP
   (`cwebp`) under `docs/verification/<issue-id>/`, named
   `<state>-dark-mockup.webp` and `<state>-dark-app.webp`. Write them without
   opening them, commit them with the code, and list them in the PR body
   (sequential runs: the issue notes).
5. **Escalate** a difference you cannot remove (data the app does not have, a
   behaviour the mockup assumes, a conflict with an acceptance criterion): it
   is an owner decision, never a default. Name the region, what the mockup
   shows, what the app can show, and the options. In PR mode add
   `needs-human` with that note; in sequential runs record it in the notes and
   end without the completion signal.

## Reviewing

Open the committed pairs side by side, region by region; do not capture
again. Check light-scheme colours as text, from the CSS the diff adds.
A missing pair, a structural difference, or a colour in the wrong role that
neither the ticket nor the owner approved is a Must fix.
