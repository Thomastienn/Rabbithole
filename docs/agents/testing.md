# Testing

Use the cheapest test level that proves the change. The levels are listed cheapest first. Unit
tests come first, then component tests, then integration tests, then browser tests. Browser
tests are never the check for a routine ticket.

## Levels

1. **Unit (default).** Test plain functions from `src/**/*.ts` and `server/` modules. Do not
   use HTTP, a SQLite file or real timers. Each test takes milliseconds. Behaviour may live
   inside a component. If so, move it into a plain `.ts` module next to the component and test
   that module.
2. **Component.** Render a React component into jsdom inside `node --test`, without Chromium.
   Use this to check what the component shows, its aria attributes, its focus target and its
   event handlers. Use the harness in `test/support/`.
   `test/support/tsx.mjs` (loaded by `npm test` through `node --import`) lets tests import
   `.tsx`, extensionless relative imports and CSS. `render(element)` from
   `test/support/render.mjs` mounts into a fresh jsdom with `act` and returns
   `{ container, act, cleanup }`; pass `cleanup` to `t.after`. Put the test at
   `test/<area>/<component>.test.mjs`; `test/chat/turn-rail.test.mjs` is the example. Run one
   with `node --import ./test/support/tsx.mjs --test test/chat/turn-rail.test.mjs`; for a folder
   pass a quoted glob (`"test/chat/*.test.mjs"`), since `node --test` rejects a bare directory.
   `render(element, setupWindow)` optionally supplies missing DOM APIs before mounting. Keep
   those stubs local to the test; they do not prove native browser behavior. The map tests
   register the loader before dynamically importing TSX, so `node --test test/map/map-parts.test.mjs`
   and `node --test test/map/tree-search.test.mjs` also work directly.
3. **Integration.** Run `createApp` or `Store` in-process with a temp database and fake
   providers. Use this only for behaviour at the HTTP, storage or provider boundary.
4. **Browser (E2E).** These are the smoke scripts in `scripts/verify/`, which drive a real
   Chromium. Run them only for release tickets, or when the acceptance names one.

Live-provider scripts (the `live` set in `scripts/verify/verify-all.mjs`) need a real sign-in.
Run them by hand only.

## Layout

Test files live in folders by area: `test/http`, `test/store`, `test/providers`,
`test/media`, `test/chat`, `test/map`, `test/usage`, `test/shell` and `test/scripts`. Shared
helpers and fakes (`fake-openai.mjs`, `fake-narration.mjs`, `protocol-fixture.mjs`,
`video-kit.mjs`, `diagram-kit.mjs` and the other `*-kit.mjs` setup files) live in `test/support/`; data files live in
`test/fixtures/`. `npm test` runs `test/**/*.test.mjs`.

## Commands

- While you work, run only the test files covering the change:
  `node --test test/<file or folder>`.
- Run `npm test` once at the end.
- Run `npm run build` when you change TSX or the build.
- Run `npm run test:render` only when you change video rendering.
- Run `npm run verify` only when the acceptance asks for it. It builds the app and runs the
  browser scripts. Run it in the background and read only the final table.

Tests must not sleep for real. Inject a clock or a budget, or await the event the code
already exposes.

## Smoke set

`verify-first-conversation`, `verify-branch-first`, `verify-keyboard-journey`,
`verify-settings-window`, `verify-video-player`.

## Not covered

These checks were dropped when their browser scripts were replaced. Each one needs a real
browser (pixel geometry, CSS cascade, pointer gestures, scrolling or media playback). To
cover one again, add it to a smoke script.

<!-- One line per lost check: script, check, reason. -->

- `verify-tree-overview`: exact rendered viewport stays unchanged on return from focused chat; browser transforms and resizing.
- `verify-tree-overview`: the narrow composer stays inside the viewport without horizontal overflow; responsive CSS geometry.
- `verify-tree-overview`: the mobile learning-tree drawer finishes sliding before its controls can be clicked; browser animation and hit testing.
- `verify-canvas-navigation`: pan, zoom and Fit paint the expected viewport; React Flow browser geometry.
- `verify-canvas-navigation`: closing chat, switching trees and reloading restore the exact rendered viewport; browser transforms and resizing (saved values remain tested).
- `verify-canvas-navigation`: source reveal opens the chat column directly beside the map; CSS column geometry.
- `verify-canvas-navigation`: shared-element transitions become ready without duplicate names and animate changing bounds; native View Transitions.
- `verify-canvas-navigation`: reduced motion bypasses native View Transitions during navigation; browser media query and transition integration.
- `verify-canvas-navigation`: the selected conversation stays inside the resized map beside focused chat; browser measurements (selection-fit math remains unit tested).
- `verify-canvas-navigation`: Ctrl-wheel stays uncancelled and does not zoom the rendered map; native wheel event propagation.
- `verify-canvas-navigation`: narrow map controls and composer fit the screen without overflow; responsive CSS geometry.
- `verify-canvas-positions`: initial conversation nodes do not overlap using measured transcript heights; browser layout (placement math remains tested).
- `verify-canvas-positions`: branch paths meet both measured handles exactly; SVG geometry.
- `verify-canvas-positions`: source handles sit at the right edge within their source row, with a midpoint fallback for missing messages; browser geometry (row association remains component tested).
- `verify-canvas-positions`: same-message handles fan out and different-message handles leave different rows; browser geometry (handle percentages remain component tested).
- `verify-canvas-positions`: the new child is to the right and level with its measured source handle; browser measurements (placement math remains tested).
- `verify-canvas-positions`: actual pointer drags move parent/child nodes without moving siblings; native pointer gestures (position persistence remains tested).
- `verify-canvas-positions`: handles and paths stay attached through movement, folds, polling, streaming, reload, app restart and resize; SVG geometry and browser measurement updates.
- `verify-canvas-positions`: shrinking a preceding row moves the measured source handle; browser transcript reflow.
- `verify-canvas-positions`: streaming growth moves the missing-message midpoint; browser transcript reflow.
- `verify-canvas-positions`: the revealed repeated/emoji passage is fully visible in the viewport; native scrolling (exact offsets remain tested).
- `verify-canvas-positions`: the narrow map has no horizontal overflow after resizing; responsive CSS geometry.
- `verify-canvas-positions`: a new child clears all measured existing conversation nodes after movement; browser geometry (collision math remains tested).
- `verify-full-map`: full Map fills the workspace below the band; CSS geometry in both appearances.
- `verify-full-map`: the ink legend stays inside the map and clear of its controls; CSS geometry in wide/narrow windows.
- `verify-full-map`: computed family/trunk ink colors match theme tokens in both appearances; CSS cascade (ink assignments remain tested).
- `verify-full-map`: current-node outlines and keyboard focus rings use solid paper outlines; computed CSS and focus-visible rendering.
- `verify-full-map`: failure text uses the error color and hovered nodes use the secondary border; computed CSS.
- `verify-full-map`: legend, failures, body, trunk and family bands meet AA contrast and current outline reaches 3:1; computed theme colors.
- `verify-full-map`: folded stubs remain uncovered and clickable after Fit; browser hit testing.
- `verify-full-map`: compact Read hides the full-map ink legend; responsive CSS visibility.
- `verify-large-map`: viewport culling mounts fewer than 50 of 200 conversations after measuring all transcripts; browser viewport geometry.
- `verify-large-map`: seeded 200-conversation/8000-message open, pan/zoom, fold/unfold and selection latency profiling; real-browser performance.
- `verify-large-map`: pointer pan and wheel zoom change the viewport under load; native gestures.
- `verify-large-map`: Fit contains all 200 full transcripts; browser geometry.
- `verify-large-map`: reopening chat makes a tall selected conversation readable and clear of controls; measured browser bounds (fit math remains tested).
- `verify-large-map`: actual React Flow culling and SSE chunks rerender only the replying conversation; browser render profiling (node reference reconciliation remains unit tested).
- `verify-layout-restore`: browser reload restores the exact rendered viewport beside/inside expanded chat; browser transforms (per-tree snapshots remain tested).
- `verify-layout-restore`: narrow expanded chat hides the map and returning restores its rendered viewport; responsive CSS and browser resizing.
- `verify-map-gestures`: wheel zoom keeps the world coordinate under the cursor; native wheel gesture and measured coordinates.
- `verify-map-gestures`: Ctrl-wheel remains uncancelled; native browser zoom isolation.
- `verify-map-gestures`: dragging empty canvas pans the viewport; native pointer gestures.
- `verify-map-gestures`: dragging conversation padding moves it without opening focused chat; native drag/click suppression.
- `verify-map-gestures`: a moved branch path still touches its source handle; SVG geometry.
- `verify-map-identity`: the bare field has no rendered watermark/grid; browser rendering.
- `verify-map-identity`: conversation corner radius, outline offset, title weight and focused outline match the design; computed CSS in both appearances.
- `verify-map-identity`: focused/plain branches have the expected width, round caps, family colors and no opening animation; SVG/CSS rendering.
- `verify-map-identity`: family bands, descendant branches, trunk, passage underlines and address chips share computed theme colors; CSS cascade.
- `verify-map-identity`: controls sit 12px from the bottom-left, inside the map and clear of the band; browser geometry in wide/narrow windows.
- `verify-map-identity`: a new branch draws on for 350ms from source to child; browser animation.
- `verify-map-identity`: the replying dot pulses and both pulse/draw stop under reduced motion; CSS animation and media query.
- `verify-map-identity`: folding/unfolding does not replay the branch draw animation; browser animation timing.
- `verify-map-identity`: the 390px map has no horizontal overflow; responsive CSS geometry.
- `verify-map-message-jump`: first, middle and last message tops align with the reading area and stay there after frames settle; native scrolling (button names and callback targets remain component tested).
- `verify-node-growth`: actual streamed transcript height changes trigger collision clearing; browser measurement updates (growth rules remain tested).
- `verify-node-growth`: growth during a held pointer drag defers the entire dragged branch and resolves on release; native gestures and browser measurement updates.
- `verify-node-growth`: Fit encloses all measured conversations after unfolding; browser geometry.
- `verify-node-growth`: exact rendered positions survive a fresh server process and browser reload; browser transforms (SQLite persistence remains tested).
- `verify-node-growth`: narrow layout has no horizontal overflow; responsive CSS geometry.
- `verify-node-previews`: message text clamps to three visible lines; computed CSS.
- `verify-node-previews`: questions align right on a filled bubble, replies left on transparent text; computed CSS and geometry.
- `verify-node-previews`: no descendant inside a conversation node introduces scrolling; computed overflow cascade.
- `verify-subtree-folding`: visible branches remain attached and Fit excludes folded descendants; browser geometry (fold visibility and branch metadata remain tested).
- `verify-tree-search`: the Library list overflows and scrolls with the wheel; native scrolling.
- `verify-tree-search`: the scrollbar has a rounded thumb and transparent track, quiet at rest and visible on hover/scroll/focus; browser scrollbar CSS.
- `verify-tree-search`: focusing the oldest saved tree scrolls it fully into view; native focus scrolling (date grouping remains tested).
- `verify-tree-search`: the floating palette and Library scrollbar fit wide/narrow windows in both appearances; responsive CSS geometry.
