# Bubble tints and Mermaid palette (TreeTutor-nwx.11)

Built app, isolated SQLite, synthetic providers, agent-browser Chromium at 1440x900. Fixture evidence only, no live provider.

## Bubble tint presets

The presets are Neutral (the default), Yellow, Blue, Pink and Green. Each one uses a chalk-hue theme token, so it resolves per appearance through `light-dark()`. The old ids still work: Accent and Amber map to Yellow, and Purple maps to Pink (`src/bubbleTint.ts`).

Question text contrast on each fill, composited over the chat surface. Measured in the rendered app (`palette-results.json`):

| Appearance | Neutral | Yellow | Blue | Pink | Green |
|---|---|---|---|---|---|
| Dark | 7.84 | 7.02 | 7.38 | 7.58 | 7.20 |
| Light | see `palette-results.json` (lowest 11.35) |||||

`test/bubble-tint.test.mjs` runs the same check against the theme source in `npm test`.

## Mermaid

Nodes use the raised slate surface with chalk text and hairline strokes, and edges use chalk. Series (pie, cScale, git and xy palettes) use the theme's yellow, blue, pink and green chalk tokens, in that order. They are read from the card in its current appearance. Labels on series fills use the surface colour. Pie slices are opaque.

## Screenshots

- `palette-diagrams-dark.png`, `palette-diagrams-light.png`: pie chart in the chat
- `palette-bubble-pink-dark.png`, `palette-bubble-pink-light.png`: Pink bubble after choosing it in Settings
- `palette-tints-settings-dark.png`, `palette-tints-settings-light.png`: chalk swatches in Settings

Reproduce with `npm run build && node scripts/verify-palette.mjs`. `npm run verify` discovers the script.
