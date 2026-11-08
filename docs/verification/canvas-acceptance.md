# Branching canvas acceptance

Verified 2026-11-08 for `TreeTutor-7t3.7`, the acceptance rollup for
`TreeTutor-7t3.7.1`, `TreeTutor-7t3.7.2` and `TreeTutor-7t3.7.3`.
Existing implementation satisfies the rollup; no application changes were needed.

All checks below ran against the current production build. Browser checks use
isolated loopback servers, temporary SQLite databases, separate browser sessions
and synthetic providers. They do not contact subscription providers or use account
credentials.

| Acceptance | Evidence |
| --- | --- |
| Boxes and connections preserve the branching tree | Overview browser check renders a root, child and grandchild with two connections, then switches to another root without leaking boxes or connections. |
| New boxes avoid existing boxes where feasible | Position browser check measures non-overlapping initial boxes and inserts a new child after manual movement without moving existing boxes. Placement unit test checks occupied rectangles. |
| Movement keeps exact source associations | Position browser check moves a box with pointer and keyboard, reloads, and reveals the original repeated/emoji passage using its exact UTF-16 range. It measures passage-handle alignment and rejects stale anchors. |
| Focus fills the canvas area | Navigation browser check compares the focused-chat rectangle with its workspace within one CSS pixel and verifies the overview is invisible, inert and hidden from accessibility. |
| Return restores previous pan, zoom and focus | Navigation browser check verifies exact viewport restoration and the originating Reveal control after both Return to tree and Escape. Overview check also covers Open-control return. |
| Smooth transitions respect reduced motion | Navigation browser check observes shared-element keyframes with changing bounds; reduced-motion mode bypasses View Transitions. |
| Positions survive reopening | Position browser check verifies exact stored coordinates and unchanged anchors after reload; integration test reopens SQLite with saved positions and anchors intact. Navigation check verifies exact saved viewport values after root switching and reload. |

Commands and results:

```sh
npm test                                  # 20/20 pass
npm run build                             # pass
node scripts/verify-canvas-navigation.mjs  # pass
node scripts/verify-canvas-positions.mjs   # pass
node scripts/verify-tree-overview.mjs      # pass
npx astryx doctor --built dist            # zero failures
npx astryx doctor --built .               # zero failures
```

The browser checks also cover concurrent fixture replies while navigating,
preserved drafts and focus, mobile composer bounds, keyboard movement, failed
position-save retry, and corrupt or denied viewport storage. Existing build-size,
theme-font and source-convention advisories remain. Viewport persistence belongs
to the same browser and app origin; box coordinates belong to the saved database.
These checks establish canvas acceptance, not a complete text-release or live
provider acceptance run.
