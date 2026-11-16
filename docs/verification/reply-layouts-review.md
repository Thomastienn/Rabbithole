# Reply layout design review

TreeTutor-z8g.4 · 2026-11-16 · Impeccable polish review: **ship this CSS pass**.

The existing Paperback reading surface remains the authority. This is a refinement of
`src/markdown/layouts.css`, with no renderer, directive, component, theme-token or DOM changes.
Existing Astryx Section, Text and Heading components and native list elements remain in use.

## Appearance evidence

Manually inspected Chromium captures use the real Reply component, generated Paperback theme,
Astryx styles, Literata and Archivo. Content and the signal diagram are local review fixtures;
these are not provider-generated replies or a live-generation check. A temporary Vite server
served the fixtures without accessing the owner's trees or changing their preferences.

| Appearance | Desktop, 640px reply measure | Minimum layout width, 480px | Phone, plain flow |
| --- | --- | --- | --- |
| Dark | [1440px viewport](reply-layouts-dark-desktop.webp) | [543px viewport](reply-layouts-dark-threshold.webp) | [390px viewport](reply-layouts-dark-phone.webp) |
| Light | [1440px viewport](reply-layouts-light-desktop.webp) | [543px viewport](reply-layouts-light-threshold.webp) | [390px viewport](reply-layouts-light-phone.webp) |

The minimum-width captures constrain the fixture reading column to exactly 480px; browser
scrollbar width otherwise changes that measure. Native ResizeObserver updates were inspected:
480px produces all ten fixture sections' layout wrappers; 479px produces none. Both appearances
had zero horizontal document overflow. An intermediate 820px viewport was also inspected.

## Findings and disposition

Each of the seven layouts was reviewed in both appearances at desktop, minimum layout width
and phone fallback.

| Layout | Finding and final result |
| --- | --- |
| Figure | Cramped gap and inherited image margins. A 24px gap separates media and explanation; image and visual margins reset inside media items. Default and right/wide variants retain their column ratios and reading order. |
| Gallery | Uneven image stages and tight spacing. Images now share a 12rem contained stage with a muted ground, without cropping. A 16px grid gap and flexible tracks distribute space; credits remain below each image. Interactive visuals retain intrinsic height. |
| Comparison | Outlined cards competed with the prose. Borderless tonal sections, 16px padding and gaps give columns a shared rhythm. Two/three-column cases and long headings wrap inside their tracks. |
| Steps | List sibling margins added uneven spacing. A single grid gap now controls the rhythm; tonal rows keep their ordered list and tabular step counters. |
| Callout | Astryx Section's inner surface created a second panel. Scoped CSS removes that inner fill and padding. One tonal surface, 24px padding and a neutral hairline carry the emphasis; the labelled region stays unchanged. |
| Timeline | Entries felt crowded against the rule. More inset and space between entries clarify the continuous line; the native ordered list and one heading per entry remain intact. |
| Wide | Media inherited unnecessary margins. Full-width media now aligns to the reply edges with the shared section spacing; images retain their proportions and unlimited height. |

All layouts keep the existing plain-flow fallback on the phone. No extra controls, animation,
dependency or decorative accent was added. Gallery letterboxing is intentional: complete image
content takes precedence over filling every pixel. Source links remain keyboard reachable;
native Tab showed a visible focus outline. Sampled primary text contrast was 13.19:1 or higher
in dark and 14.90:1 or higher in light across the changed surfaces.

## Checks and limits

- Existing layout component suites: **22/22 passed**.
- Final `npm test`, run once: **693 tests, 688 passed, 5 skipped, 0 failed** (34.93s).
- Final `npm run build`: passed, including TypeScript; Vite retains its large-chunk advisory.
- Changed stylesheet: Prettier and `git diff --check` passed. Impeccable detector returned `[]`.
- Repository `format:check` flags eight untouched files: `scripts/verify/verify-settings-window.mjs`,
  `src/chat/useTreeActions.ts`, `test/chat/suggestions-models.test.mjs`,
  `test/media/artifact-render.test.mjs`, `test/media/video-plan.test.mjs`,
  `test/media/visual-ask.test.mjs`, `test/providers/tool-loop.test.mjs` and
  `test/shell/endpoint-settings.test.mjs`. Every file also fails formatting on its unchanged HEAD
  contents. Left outside this issue's scope.
- Existing layout suites emit a React list-key warning; assertions pass. No renderer was changed.
- Existing corner tokens differ from DESIGN.md's older corner sizes. This pass uses current
  theme tokens; it does not repair the theme or documentation. The existing pending-visual badge
  still uses its current blue status fill; status styling is outside this layout pass.
- Pending/failed visual shells were inspected in the gallery. The Vite fixture's opaque-origin
  iframe reports CORS refusals for `/@vite/client` and `/src/media/sandbox.ts`; iframe execution
  and ready visual generation were not verified or claimed. Runtime restrictions were retained.
- No browser regression script, live provider, slow suite or video-render suite was required or
  run. Native screen-reader behavior and other theme palettes were not tested. Existing component
  coverage proves the retained lists, region label, source offsets, media placement, figure
  options and width fallback. No structure or accessibility semantics changed.

The temporary fixture files, tabs and Vite process were removed after review. No user data was
changed. Git staging and commit are left to Ralph.
