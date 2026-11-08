# Saved viewport and focused-chat transitions

Verified 2026-11-08 for `TreeTutor-7t3.7.3` against the built app, using isolated temporary databases, browser sessions and synthetic providers. No account credentials or external inference were used.

Each root saves its pan coordinates and zoom in browser local storage under `treetutor.viewport.<root ID>`. Switching trees and reloading restore the exact saved values; focused-chat navigation leaves the mounted canvas in place. Storage belongs to this browser and app origin, so another browser or a changed server port has its own view. Corrupt or unavailable reads fall back to fitting the tree; denied writes show an explicit warning. New box placement stops automatically fitting once a saved view or user navigation exists.

The toolbar exposes Zoom in, Zoom out, Fit tree and four labelled pan buttons. Tab to the canvas region and use arrows to pan; Shift increases the distance. Box arrows retain their existing movement behavior. Nested controls and chat editing do not pan the view. Ctrl/Meta shortcuts, Ctrl+wheel and multi-touch browser zoom are left to the browser; ordinary wheel scrolling is not captured for canvas zoom.

Opening a conversation records its originating Open or Reveal source passage control. Return to tree and Escape restore that control without scrolling or changing the viewport. New branches retain their existing fallback focus on their Open control. Conversation loading finishes before switching views, and the composer receives focus only when its chat is visible.

When supported, View Transitions connect the selected box title to the focused-chat title over 220 ms. Only those titles are captured: the page, composer and navigation controls remain interactive during the animation. Unsupported browsers switch directly. Reduced-motion preference bypasses View Transitions, with a CSS fallback disabling their animations as well.

## Reproduce

Run:

```sh
npm test
npm run build
node scripts/verify-canvas-navigation.mjs
node scripts/verify-tree-overview.mjs
node scripts/verify-canvas-positions.mjs
npx astryx doctor --built dist
npx astryx doctor --built .
```

All passed:

- 20 unit/integration tests, including saved-viewport validation.
- Navigation browser check: pan buttons and canvas arrows, modifier isolation, zoom/fit, uncancelled Ctrl+wheel, exact viewport and originating Reveal-control return, per-root switching, reload and exact stored values, actual shared-element keyframes with changing bounds, reduced-motion bypass, invalid storage and denied-write feedback.
- Two fixture branches generate simultaneously while navigating. An idle root's composer remains editable; background checkpoint refresh preserves its focus and unsent draft. Both branch replies complete with one original user message each and no restarted generation.
- Existing overview and canvas-position browser checks: nested navigation, source reveal, keyboard/pointer movement, persistence, anchor geometry, generation continuity, new-branch focus, and mobile composer behavior.
- Desktop 1440×900 and mobile 390×844 captures reviewed under ignored `.impeccable/review/navigation-{desktop,mobile}.png`; controls wrap, canvas remains visible, and the document has no horizontal overflow.
- Astryx doctor: zero failures for built output and project source. Existing theme-font and source-convention advisories remain; the existing Vite font alias serves Figtree locally. Build retains its existing bundle-size advisory. Impeccable's detector reported no deterministic issues on the changed UI files.

These checks establish UI behavior with fixtures, not new live subscription-provider behavior.
