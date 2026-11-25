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
   1440x900 in dark and light, the same state in each pair; add 390x844 when
   the mockup has a narrow view.
3. **Compare** region by region and fix every structural difference and
   every colour used in the wrong role. A colour that differs only because the
   theme differs is a match. Try a CSS change live first by injecting the rule
   with `agent-browser eval`, then write it to the file. Each image costs
   context, so keep the loop lean:
   check sizes, spacing and fonts as text first (computed styles via
   `agent-browser eval`), screenshot only the region you are fixing
   (`agent-browser screenshot <selector>`), and iterate in one scheme. Take
   the full-page pairs in every scheme once, at the end. The step is done
   when each final pair matches side by side.
4. **Record** the final pairs as WebP (`cwebp`) under
   `docs/verification/<issue-id>/`, named `<state>-<scheme>-mockup.webp` and
   `<state>-<scheme>-app.webp`, commit them with the code, and list them in
   the PR body (sequential runs: the issue notes).
5. **Escalate** a difference you cannot remove (data the app does not have, a
   behaviour the mockup assumes, a conflict with an acceptance criterion): it
   is an owner decision, never a default. Name the region, what the mockup
   shows, what the app can show, and the options. In PR mode add
   `needs-human` with that note; in sequential runs record it in the notes and
   end without the completion signal.

## Reviewing

Open each mockup page and the committed pairs side by side, region by region.
A missing pair, a structural difference, or a colour in the wrong role that
neither the ticket nor the owner approved is a Must fix.
