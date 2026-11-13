# Paperback Series finish review (TreeTutor-y36.12)

Date: 2026-11-13. Surface contract: `.impeccable/surfaces/docs-mockups-index-html.md` (direction), `.impeccable/surfaces/index-html.md` (shipped). Code-led build, so there is no approved comp. The chosen sketch `.impeccable/mocks/decision/paperback-seasonal.html` and the static mockup `docs/mockups/` were used as the critique reference.

Evidence: production build with a seeded SQLite fixture and a synthetic provider (no live model call), captured by `scripts/capture-finish.mjs` in dark and light at 1440x900 and 390x844 with reduced motion and fonts loaded. The capture rounds live in the gitignored `.impeccable/review/finish-paperback{,-2,-3}/`, and the mockup captures in `.impeccable/review/finish-paperback/mockup/`. Final captures are saved here as `finish-*-{dark,light}-desktop.png` and `finish-2-chat-{dark,light}-narrow.png`.

## Verdict

**Ship.** The reviewer's final pass scored fix 1 resolved and found no regressions. That pass covers the scored fixes only: it was not a second whole-surface review.

| Round | Disposition | Result |
|---|---|---|
| Full review | fix | 7 material findings. Ground, type, material, band, Contents, Read inks, Library, narrow layout and dialogs all match the mockup. |
| Verdict 1 | fix | Fix 6 resolved. Fix 1 partial: the map fitted at 40% zoom, too small to read. Every declined finding was accepted with its reason. |
| Verdict 2 | ship | Fix 1 resolved: the map refits at a 75% floor and the selected node is revealed. No regressions. |

## Fixed

1. **The docked map pane was not fitted.** The full Map view's viewport was carried into the 440px Read pane, so the tree landed outside the pane. Now, when switching between Map and Read resizes the canvas and the learner has not moved the map, it refits the whole tree with a 75% zoom floor and then reveals the selected node. A map the learner has navigated keeps its exact viewport, because `verify-canvas-navigation` and `verify-chat-expand` require that. Saved viewports still restore on reload. Change: `src/TreeOverview.tsx`.
6. **Knowledge and Videos.** The Return to learning tree row now sits on the content column (70rem, with the same inline padding). Secondary actions are outlined hairline buttons instead of grey fills, and pressed corrections keep the leaf border and fill. Change: `src/layout.ts`.

## Skipped findings, with reasons

2. **Top-down map with right-angled edges, Contents on the Map view, and a "Read address" return.** Declined. Left-to-right placement, edges anchored beside their source message, and persisted node positions are PRD map behaviour that saved trees rely on. TreeTutor-y36.7 accepted the full-workspace map. The "Reopen chat" toolbar button provides the return.
3, 4. **Settings small-caps labels, segmented Appearance control and swatch row.** Declined. TreeTutor-y36.9 had its own review (`settings-page-review.md`), which accepted the house Astryx radios and section labels.
5. **Root conversation heading.** Not a defect. The heading is rendered for every conversation (`src/ChatPage.tsx`), and the root capture is scrolled to the latest reply.
7. **The "Saved" label and the composer hint.** "Saved" was dropped on purpose in TreeTutor-y36.3: writes are batched once a minute, so an idle "Saved" could be false. The failure state with Retry stays. The composer hint was removed before the redesign, in TreeTutor-dx0.1.

## Provenance and documentation

- `impeccable embed-prompt --scan dist src` reports 0 rasters and 0 missing. The app ships no raster images.
- DESIGN.md and `.impeccable/design.json` were rewritten from the shipped build, replacing Lecture-hall Slate. The decision was to overwrite rather than merge, because the old world was replaced wholesale.
- Detector findings against the old DESIGN.md (font sizes 13/15/17/34px, radii 999px/1px, Archivo) are covered by the new type ramp and radius scale.
