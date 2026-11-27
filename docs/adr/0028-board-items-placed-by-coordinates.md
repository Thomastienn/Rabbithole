# Board items are placed by coordinates

The tutor places every top-level board item itself, with pixel coordinates on a fixed 1600×900 board. Components such as a flow, tree or table lay out their own children, and the app runs an overlap and off-board guard after the model. There is no layout engine that turns relations like "right of t1" into positions. In the prototype, coordinates gave 0 overlaps in 4 topics, and the boards looked planned. Relations with a nearest-free-spot engine gave 12 overlaps, stacked items in columns and ran arrows through other items. An engine good enough to compete would need global planning, connector routing and reflow, and it would be the bulk of the board's complexity.

Coordinates first made the model plan silently for 13–17 s before its first sentence, because of thinking that streams almost nothing. The Claude Code CLI cannot turn thinking off for Sonnet. A speak-first prompt fixed it: the model writes sentence 1 and its ops at once, and places each item only when it draws it. That gave a first sentence 0.84 s after the request on average, with 0 thinking in 16 of 16 runs. Placing items as it goes costs a little precision: 6 of 16 runs had a label touching an arrow. That is why the guard is required.

The evidence is on the local branch `prototype/board-placement`. The spec is `docs/board-spec.md`.

## Considered Options

- Relations plus a layout engine: the model wrote less and started faster, but the boards were cluttered.
- Coarse regions, such as a 3×3 grid: not tested, because the speak-first prompt fixed the coordinates' slow start.
- Coordinates with thinking turned off: no CLI flag, setting or environment variable turns it off for Sonnet. It is also not needed once the prompt asks the model to speak first.
