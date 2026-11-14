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
   `test/<area>/<component>.test.mjs`; `test/chat/navigation.test.mjs` is the example. Run one
   with `node --import ./test/support/tsx.mjs --test test/chat/navigation.test.mjs`; for a folder
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

- `verify-read`: the map is 440px wide and directly to the right of focused chat; responsive CSS geometry.
- `verify-read`: prose is 640px wide with a 60–76 character measure and Literata at 17px/1.7; loaded fonts and browser text layout.
- `verify-read`: inherited context has no border or shadow; computed CSS.
- `verify-read`: code blocks have no border or shadow; computed CSS.
- `verify-read`: diagram cards have no border or shadow; computed CSS.
- `verify-read`: expanded Mermaid source has no border or shadow; computed CSS.
- `verify-read`: table cells have only a bottom rule; computed CSS.
- `verify-read`: current Contents rows use a visible fill without a shadow; computed CSS.
- `verify-read`: the composer model chip has no border or shadow; computed CSS.
- `verify-read`: the branch form has one outer frame and no internal frames/shadows; computed CSS.
- `verify-read`: Read text, copy/model/stats/media controls and breadcrumbs meet AA in both appearances; composited browser colors.
- `verify-read`: native Tab draws a solid paper focus ring at least 2px wide; browser focus traversal and computed CSS.
- `verify-read`: expanding chat hides the divider and showing the map restores it; CSS layout (the keyboard-journey smoke remains).
- `verify-read`: opening token stats from a later reply scrolls them fully between the header and composer while retaining toggle focus; native scrolling and measured bounds (toggle state and stats remain component tested).
- `verify-read`: inline visuals and videos have no border; computed CSS (artifact states and actions retain component/boundary coverage).
- `verify-read`: the ready video starts paused with working native controls; browser media playback (video-player smoke remains).
- `verify-read`: the generated iframe's Check yourself reveal opens on native Enter with a solid summary focus ring; native iframe execution and focus/CSS.
- `verify-read`: pending visuals have a 180px shimmer; computed CSS geometry (pending artifact state remains tested).
- `verify-read`: Stop has no outline or shadow in the composer; computed CSS.
- `verify-read`: at 390px focused chat fills the viewport and Send remains onscreen without document overflow; responsive CSS geometry.
- `verify-inherited-context`: collapsed context stays above the first message and its body is visually hidden until expanded; browser bounds and collapse CSS (DOM order, expanded state and plain-text contents remain component tested).
- `verify-passage-corrections`: native Tab reaches the correction overflow with a visible focus outline; browser traversal and computed focus styles (menu handlers remain component tested).
- `verify-passage-corrections`: native Enter/Space selects correction items and closing the menu restores trigger focus; browser menu keyboard/focus integration (saved/checked/error states remain component tested).
- `verify-passage-corrections`: passage controls fit desktop and 390px viewports after reload; responsive CSS geometry (correction persistence remains boundary tested).
- `verify-passage-popup`: the passage quote is visually clipped to screen-reader-only width; CSS clipping (its text and aria-describedby link remain component tested).
- `verify-passage-popup`: CSS Custom Highlights visibly paint the exact passage while typing and after late suggestions in both appearances; native highlight rendering (range mapping and highlight registry lifecycle remain tested).
- `verify-passage-popup`: popup bounds fit wide and narrow viewports; responsive CSS geometry.
- `verify-passage-popup`: the send control is square, correction controls are visually quiet, and the popup is under 160px high; computed CSS/visibility and geometry (control names/structure remain tested).
- `verify-passage-popup`: native empty Enter submits nothing and nonempty Enter creates the branch; browser default form submission (disabled states, submit handler and request bodies remain tested).
- `verify-passage-popup`: Escape and outside pointer clicks restore/retain native focus off the body; browser focus integration (dismissal callbacks and selection focus targets remain tested; keyboard-journey smoke remains).
- `verify-passage-popup`: dragging a manual highlight preserves a copyable native selection through Ask; native pointer gestures and clipboard integration (DOM Range capture and selection preservation remain tested).
- `verify-passage-popup`: Escape in a portalled familiarity menu closes only the menu; native popup keyboard/focus integration (synthetic menu Escape and outside-click exclusion remain tested).
- `verify-passage-selection`: real mouse drags select repeated emoji and rich Markdown passages across line wraps; native pointer gestures and measured text geometry (UTF-16/raw-range mapping remains tested).
- `verify-passage-selection`: native Shift-arrow selection and Tab reach Ask, and sending the branch focuses its composer; browser keyboard/default-action integration (read-only selection handlers remain tested; branching/keyboard smoke remains).
- `verify-passage-selection`: source reveal focuses and scrolls old/new rich-text and syntax-only anchors into view after reload; native scrolling (saved offsets, reveal markup and raw ranges remain tested).
- `verify-passage-selection`: streaming additions preserve the measured vertical position of earlier content; browser reflow (heading/code DOM identity remains component tested).
- `verify-passage-selection`: activating a reply link opens an isolated new tab with a null opener and leaves the original conversation in place; browser tab navigation (safe href/target/rel remain tested).
- `verify-passage-selection`: rich replies fit desktop/390px widths with colored syntax, larger headings and nonzero math width in both appearances; computed CSS and browser text/math layout.
- `verify-suggestion-branching`: the popup sits above/below its underline without covering it; browser text/header geometry.
- `verify-suggestion-branching`: explored underlines paint solid while unexplored ones paint dotted; computed CSS (explored classes, names and routing remain tested).
- `verify-suggestion-branching`: an actual drag inside an explored underline creates a new selection instead of opening its child; native pointer gesture/click suppression (synthetic Range precedence remains component tested).
- `verify-break-down-ui`: late suggestions preserve the scrolled transcript position; browser scrolling (focus, announcement and passage state remain component tested).
- `verify-break-down-ui`: native Tab/Enter/Space complete manual branching, suggestion activation, switch toggling and model selection; browser keyboard/default actions (DOM controls/callbacks remain component tested; keyboard-journey smoke remains).
- `verify-break-down-ui`: reply usage and Settings copy fit desktop and phone widths without document overflow; responsive CSS geometry.

- `verify-knowledge`: correction controls have visible focus outlines; computed CSS and focus-visible rendering.
- `verify-knowledge`: switching to Knowledge and back restores the exact rendered map transform; browser transforms (graph state and correction persistence remain tested).
- `verify-knowledge`: desktop and phone panels fit without horizontal overflow; responsive CSS geometry.
- `verify-knowledge`: whole topic labels remain readable and clear of points at phone Fit; measured text and SVG geometry.
- `verify-knowledge-map`: concept rings are round, have the specified paper outline and sit inside the fitted field without overlap; computed CSS and measured bounds (placement/fit math remains unit tested).
- `verify-knowledge-map`: topic regions use distinct translucent inks and contain their measured points; CSS cascade and SVG geometry (membership and containment math remain tested).
- `verify-knowledge-map`: topic labels are centered, clear of points, fully fitted, unbroken and unchanged in text size at every zoom and phone width; browser text layout and transforms.
- `verify-knowledge-map`: selected and plain relation strokes have the specified paper/quiet colors and widths; computed SVG styles (relation kinds, selected attributes and arrow markers remain tested).
- `verify-knowledge-map`: knowledge text and topic labels meet AA contrast in both appearances; computed CSS (theme token contrast remains tested).
- `verify-knowledge-map`: field, detail and concepts are frameless, labels have no chip, the field is deep and details cast no drop shadow; computed CSS.
- `verify-knowledge-map`: details use Literata, point labels use Archivo and controls have paper focus rings; loaded fonts and computed CSS.
- `verify-knowledge-map`: concept labels actually hide below 75% while accessible names remain in Chromium's accessibility tree; CSS clipping and native accessibility (classes and DOM names remain tested).
- `verify-knowledge-map`: wheel zoom, pointer drag and Fit restore the rendered transform; native gestures and measured field bounds.
- `verify-knowledge-map`: Tab reaches every concept and focus pans each fully inside the field; native focus traversal and browser bounds.
- `verify-vim-bindings`: aliases pan/move/zoom/fit the rendered map by the specified distances while preserving conversation focus and announcements; React Flow measurements (key mappings, movement math and standard keyboard smoke coverage remain).
- `verify-vim-bindings`: checkbox focus is visible and native Tab/Space activation works; native traversal and computed focus styles (checkbox state/callbacks remain component tested).
- `verify-vim-bindings`: letters in real editable/read-only fields and open menus never move the rendered map; browser keyboard/IME integration (modifier/IME exclusions remain unit tested).
- `verify-narrow`: every page fits at 390px with no sideways scroll outside code/map surfaces; responsive CSS geometry.
- `verify-narrow`: Read is one 390px column with the map hidden, the composer onscreen and Map fills the width; responsive CSS visibility and measured bounds.
- `verify-narrow`: the Contents drawer's native Escape/Close path restores band focus after its animation; native modal behavior and transitions (drawer controls and callbacks remain tested).
- `verify-narrow`: band/drawer text is AA, focus rings reach 3:1 and focused controls stay inside the drawer; computed CSS and geometry.
- `verify-narrow`: the layout-save alert and Retry fit inside the phone band; responsive CSS geometry (alert and Retry handler remain tested).
- `verify-palette`: saved legacy bubble tints never change the rendered question bubble color; CSS cascade (neutral theme tokens and absence of tint controls remain tested).
- `verify-palette`: actual bubble text meets AA over its composited fill in both appearances; computed CSS (token compositing remains unit tested).
- `verify-palette`: Mermaid SVGs render paper text on the raised surface with all series inks in order; browser rendering and computed CSS (palette inputs and series order remain unit tested).
- `verify-shell-band`: native Tab order traverses the band and Settings restores opener focus; browser focus navigation (DOM control order and callback wiring remain tested; Settings also retains its smoke script).
- `verify-shell-band`: Read/Map/Knowledge/Videos and Library paint the expected visible page; CSS visibility (current-view attributes and action callbacks remain tested).
- `verify-shell-band`: band/current-tab/tooltip text and paper focus rings meet contrast minima; computed CSS including hover tooltip rendering.
- `verify-shell-band`: search results keep popover colors and AA contrast outside the band; CSS cascade (search behavior remains component tested).
- `verify-shell-band`: layout failure pill text meets AA against its rendered background; computed CSS (failure status, saver recovery and Retry remain tested).
- `verify-polish`: visible map, chat, model menu and Connections text meet AA after compositing ancestor fills; browser visibility, typography and CSS cascade.
- `verify-polish`: reduced motion leaves no visible transitions/animations and opening chat never shifts the composer; native media queries and measured animation/layout.
- `verify-polish`: every visible whole-app control has an accessible name; browser visibility and native accessibility audit (component names remain tested).
- `verify-polish`: 75 native Tab stops through map/chat show focus rings and stay onscreen; browser traversal, scrolling and computed focus styles.
- `verify-polish`: 390px, 720px (emulated 200% zoom), 768px and 2560px views avoid horizontal overflow and keep the composer reachable; responsive CSS geometry.
- `verify-states`: the first-run composer is exactly 560px wide in both appearances; CSS geometry (first-question controls remain tested).
- `verify-states`: inherited context uses its branch-family border ink; computed CSS (family ink assignments remain tested).
- `verify-states`: the generated iframe's native details reveal opens on Enter with a solid focus outline; native iframe execution, focus and CSS.
- `verify-states`: visual, diagram and video viewers trap native Tab focus and Escape returns to their openers; native modal/iframe focus behavior (video-player smoke remains).
- `verify-states`: ready diagrams load with nonzero natural image width; native image decoding.
- `verify-states`: failed media use the error border while cancellation has no border, and failure/reply text meets AA; computed CSS (failure labels, reasons and retries remain tested).
- `verify-states`: loading skeletons have the specified rendered widths/heights; browser geometry (four labelled skeletons remain component tested).
- `verify-states`: failed video text and Retry fit inside their card at 390px in both appearances; responsive CSS geometry.
- `verify-themes`: applying each theme changes actual surfaces, branch inks and neutral bubbles on the map and chat; CSS cascade (all authored/shipped token values remain tested).
- `verify-themes`: theme tiles render their own ground, neutral bubble, accent and four inks, matching the applied palette; nested theme CSS (tile structure and token inputs remain tested).
- `verify-themes`: selected theme tiles draw the solid outline; computed CSS (checked state and check icon remain tested).
- `verify-themes`: the saved theme paints on the first render after a real reload; browser startup/paint timing (stored choices and fallbacks remain tested).
- `verify-themes`: Settings tiles fit without overflow at 390px for all six themes; responsive CSS geometry.
- `verify-appearance`: map background and React Flow dark class follow app Appearance across reload and live OS-scheme changes; browser media query/CSS integration (preference restoration remains tested).
- `verify-appearance`: Archivo/Literata fonts load from self-hosted resources with no remote font stylesheet; native font loading (theme typography remains tested).
- `verify-appearance`: Mermaid output repaints in app ink when Appearance/System changes despite the opposite OS scheme; browser media query/render integration (palette mode inputs remain unit tested).
- `verify-appearance`: native ArrowDown selects the next appearance radio and moves focus; browser radio-key behavior (labelled radios and selection callbacks remain component tested).

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
- `verify-chat-defaults`: Settings and the conversation model menu fit 390px without horizontal overflow in both appearances; responsive CSS geometry (saved choices, offered efforts and recovery alert remain tested).
- `verify-chat-defaults`: native Enter/Home/Enter in the Astryx effort selector and menu radios commit by keyboard; browser keyboard/default actions (option lists and save requests remain component/boundary tested).
- `verify-chat-divider`: a real pointer drag widens the map by the dragged distance and clamps at 20rem/60%; native pointer capture and measured geometry (clamp, key and reset math plus separator aria remain tested).
- `verify-chat-divider`: expanded chat fills the workspace, map-only hides chat and the divider, and 390px has no divider with full-width chat; responsive CSS layout.
- `verify-chat-divider`: the saved width restores the rendered map width after reload; browser storage plus CSS variables (saved-width parsing remains unit tested).
- `verify-chat-expand`: expand hides the map with chat at full workspace width and collapse restores the exact prior map transform; CSS layout and React Flow transforms (keyboard-journey smoke keeps the toggle focus).
- `verify-chat-expand`: expanded mode, a live reply and a draft survive resizing across 390px and back; browser resizing with responsive CSS.
- `verify-chat-expand`: expand runs one View Transition with motion allowed and none under reduced motion; native View Transitions and media queries.
- `verify-chat-sidebar`: drafts stay per conversation across switches, and a late reply or slow selection response never replaces the conversation now open; ChatPage orchestration that jsdom cannot mount before the ChatPage split (owning-turn reconciliation remains unit tested).
- `verify-chat-sidebar`: the band, focused chat and map sit side by side, and the opened node stays inside the canvas; CSS geometry.
- `verify-compact-chat`: the header is one row of at most 57px with all controls visible and level; computed CSS geometry (control names and actions remain component tested).
- `verify-compact-chat`: Send is 3px-rounded, accent-filled and below the input beside the model button, and the rounded composer clears the latest reply; computed CSS and geometry.
- `verify-compact-chat`: long titles wrap in the reading measure and Rename shows the full-title tooltip on hover and focus; browser text layout and tooltips.
- `verify-compact-chat`: the overflow menu opens without movement under reduced motion; native animations and media queries (menu actions remain component tested).
- `verify-compact-chat`: Shift+Enter inserts a newline, Vim letters type into the composer without moving the map, Enter sends and Stop interrupts; native contenteditable input (Vim exclusions remain unit tested; first-conversation smoke sends).
- `verify-compact-controls`: Fit encloses every node inside the canvas and Zoom in changes the shown percentage; React Flow geometry (zoom label formatting remains unit tested).
- `verify-compact-controls`: Escape from the Map menu restores focus to its trigger and Learning trees opens the Library; Astryx menu focus integration (keyboard-journey smoke covers map menus).
- `verify-contents`: Contents is 264px with AA text, a 3:1 solid focus ring, 8px family dots and no document overflow in both appearances; computed CSS (family ink assignment remains component tested).
- `verify-contents`: Figures open their owning conversation and scroll/focus visual, diagram and failed-video figures, consumed once; native scrolling and ChatPage focus orchestration (figure callbacks remain component tested).
- `verify-contents`: a branch made through the passage popup and an SSE visual appear live in Contents; ChatPage orchestration (live turn reconciliation remains unit tested).
- `verify-contents`: at 390px the drawer opens by keyboard, Settings opens on Interface after it closes, figure navigation closes it and chat is full width; native modal behavior and responsive CSS.
- `verify-contents-collapse`: collapsing leaves a rail under 64px, widens chat by over 100px (full width with Expand chat) and moves focus between the toggles; CSS geometry and post-unmount focus (toggle aria, callbacks and saved preference remain tested).
- `verify-contents-collapse`: the narrow drawer shows full contents without a collapse button while collapsed; responsive CSS visibility.
- `verify-copy-buttons`: reply Copy is visible at rest while code Copy is hidden until hover or keyboard focus, in both appearances; computed opacity and hover CSS (copy text and Copied label remain component tested).
- `verify-copy-buttons`: native Tab/Shift+Tab reach Copy reply and Copy code with Enter/Space activation; browser focus traversal.
- `verify-focused-chat-layout`: the question bubble is right-aligned and tinted, replies are 640px Literata 17px, metadata is muted, and the turn gap exceeds twice the question–reply gap; computed CSS and geometry in both appearances.
- `verify-focused-chat-layout`: passage text, then artifacts, then the usage footer render in order, and the footer stays visible at rest, on hover and on focus; browser layout and hover CSS (footer content remains tested).
- `verify-focused-chat-layout`: failed and interrupted statuses use the alert and muted colors and suggestion underlines are dotted; computed CSS (status labels remain unit/component tested).
- `verify-focused-chat-surround`: Archivo 700 title, frameless tonal inherited context and diagram cards, accent Send as the only filled button, hairline opaque composer and no nested frames; computed CSS in both appearances.
- `verify-focused-chat-surround`: the divider seam paints paper ink on hover; hover CSS.
- `verify-focused-chat-surround`: at 390px and 320×568 the composer, long drafts, long parent titles and the failure banner fit with Send reachable and no overflow; responsive CSS geometry.
- `verify-reply-retry`: the failed reply with Retry and its in-place replacement render correctly in both appearances; screenshots and computed CSS (Retry visibility, request and replacement remain tested).
- `verify-turn-rail`: clicking a tick scrolls its question to the reading-area top and scrolling by hand moves the current tick; native scrolling and measured bounds (tick names, jump callback and current-question choice remain tested).
- `verify-turn-rail`: the rail hides at narrow widths and returns when wide; responsive media query.
- `verify-chat-management`: rename and delete confirmations stay inside desktop and narrow viewports with safe focus, and a 200-character unbroken title fits; CSS geometry and native dialog focus (prompt copy and title limits remain tested).
- `verify-chat-management`: deleting the open chat opens the next saved chat with composer focus, or New chat when none remain, and Library rename never selects another chat; ChatPage orchestration (subtree selection, deletion and rename persistence remain unit/integration tested).
