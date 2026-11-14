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
3. **Integration.** Run `createApp` or `Store` in-process with a temp database and fake
   providers. Use this only for behaviour at the HTTP, storage or provider boundary.
4. **Browser (E2E).** These are the smoke scripts in `scripts/verify/`, which drive a real
   Chromium. Run them only for release tickets, or when the acceptance names one.

Live-provider scripts (the `live` set in `scripts/verify/verify-all.mjs`) need a real sign-in.
Run them by hand only.

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
