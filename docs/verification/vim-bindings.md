# Optional Vim canvas bindings

Verified under **TreeTutor-vm4.6** on 2026-11-09 against the mapping agreed in
[vim-bindings-proposal.md](../vim-bindings-proposal.md). Check:
`scripts/verify-vim-bindings.mjs` (built app, agent-browser/Chromium, 1440×900,
isolated database, **synthetic provider fixture**; no live provider involved).
Key presses drive the UI. `eval` reads state, selects saved trees during setup and
dispatches the noted synthetic events (Ctrl/Meta/Alt, IME `isComposing` and
`keyCode` 229, and a keydown aimed at the map while a menu is open).

## Implementation

- `vimAction` in `src/canvas.ts` maps only `h j k l`, `H J K L`, `=`, `+`, `-`,
  `f`. It returns nothing with Ctrl/Meta/Alt, an already-handled event or IME
  composition. Covered by `test/canvas.test.mjs`.
- `TreeOverview` uses the alias only when the event target is the map region or a
  box wrapper itself and no popup trigger is expanded and no dialog/modal is open.
  The alias goes through the same arrow pan/move code and the same Zoom in/out/Fit
  tree handlers as the toolbar buttons.
- A **Vim canvas bindings** checkbox under Settings (side panel), default off.
  `localStorage['treetutor.vim']` stores `on`/`off`, and any other value means
  off. Help describes the mapping, the current state and the focus requirement.

## Browser observations (PASS, fixture)

1. Off by default: `l`, `Shift+J`, `f`, `=` and `-` leave the map unchanged, and `j`
   leaves a box unchanged. The arrows still pan and move.
2. Help shows "Vim canvas bindings are off". Tab reaches the checkbox with visible
   focus. Space checks it, focus stays on the checkbox, storage holds `on` and Help
   shows "on".
3. Map: each of `l`, `h`, `j`, `k`, `Shift+L` and `Shift+K` is exactly undone by
   the opposite arrow. `l` pans 100 px and `Shift+L` 300 px. `=` and `+` zoom in,
   `-` zooms out, and `f` gives the same view as **Fit tree**.
4. Box wrapper: `l` and `Shift+J` are undone exactly by ArrowLeft and
   Shift+ArrowUp. `k` moves the box 10 units, the existing move announcement plays,
   `-` and `f` act and focus stays on the box.
5. No alias for `Shift+F`, `_`, `g`, `a`, Ctrl+f, Meta+l, Alt+l, IME composition,
   keyCode 229 or Escape. Box title buttons and toolbar buttons keep their own
   keys. While the Map menu is open, `l` aimed at the map is not consumed.
6. Typing `hjkl HJKL =+-f` in the composer enters the text and the map does not
   move. Letters in the read-only passage text leave the map alone. Escape twice
   returns focus to the box title that opened the chat.
7. On survives a reload and switching trees. Turning it off under Settings makes
   `l` and `j` do nothing straight away, while arrows, Shift+arrows, Enter-to-open
   and Escape-return keep working. A corrupt stored value reads as off.

Regression: `scripts/verify-keyboard-journey.mjs` (17 steps) and
`scripts/verify-canvas-navigation.mjs` pass with the preference off. Also passing:
`npm test` (79/79), `npm run build`, and `astryx doctor --built dist` (0 fail, 2
pre-existing theme warnings).

Limits: the app has no dialogs or media players yet. The guard covers open
`<dialog>`, `aria-modal` and expanded popup triggers. Media keys belong to a
player's own focused controls, which are never the map or a box wrapper. A real
IME cannot be driven by agent-browser, so composition is synthetic.
