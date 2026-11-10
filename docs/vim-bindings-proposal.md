# Optional Vim canvas bindings

Decision gate: `TreeTutor-vm4.6.1`. Status: **agreed by the project owner on
2026-11-09**, exactly as proposed below. Prepared 2026-11-09. Implementation
belongs to `TreeTutor-vm4.6`, after the initial text release. Implemented and
verified in [verification/vim-bindings.md](verification/vim-bindings.md).

## Agreed mapping

Reuse the standard controls documented in
[keyboard-journey.md](verification/keyboard-journey.md). Each alias invokes the
same action, including its persistence, bounds, movement announcement and focus
behavior. It does not introduce a new way to select conversations.

| Keys | Required focus | Existing standard action |
| --- | --- | --- |
| `h` / `j` / `k` / `l` | Map region itself | `ArrowLeft` / `ArrowDown` / `ArrowUp` / `ArrowRight`: pan by the existing 100 px step. |
| `H` / `J` / `K` / `L` (Shift) | Map region itself | Corresponding Shift+arrow: pan by the existing 300 px step. |
| `h` / `j` / `k` / `l` | Conversation box wrapper itself | Corresponding arrow: move that box by the existing 10 canvas-coordinate units. |
| `H` / `J` / `K` / `L` (Shift) | Conversation box wrapper itself | Corresponding Shift+arrow: move that box by the existing 100 canvas-coordinate units. |
| `=` or `+` | Map region or box wrapper itself | **Zoom in** toolbar action, with its existing zoom limits. |
| `-` | Map region or box wrapper itself | **Zoom out** toolbar action, with its existing zoom limits. |
| `f` | Map region or box wrapper itself | **Fit tree** toolbar action, with its existing fit options. |

All standard controls remain available when enabled and disabled: Tab/Shift+Tab
for focus traversal; Enter/Space for activation and opening a focused box; arrows
for pan/move; Escape for the existing menu, branch and chat return behavior.
There are no new focus-jump, chat, branch, folding, return or browser shortcuts.
Shift selects the listed uppercase directions and `+`; other shifted letters
such as `F`, and `_`, have no alias. Direction aliases follow the existing arrow
direction and repeat behavior, rather than defining a separate pan convention.

## Activation and boundaries

- Add a labeled **Vim canvas bindings** checkbox inside the existing Settings
  surface. Default off for a browser/app origin with no saved preference.
  Remember only this boolean locally for that browser and app origin, across
  reloads and tree switches; missing or unreadable preference means off. Turning
  it off immediately restores standard controls alone.
- Switching the checkbox takes effect immediately without moving focus to the
  map. Tab to the map region or a box wrapper to use aliases. Leaving that focus
  suspends them. There is no normal/insert mode, activation key or global handler.
- Accept aliases only on the map region itself or a conversation box wrapper
  itself. Child controls keep their own keyboard behavior, including node title
  buttons, fold/source buttons, toolbar controls and links.
- Do not intercept input in composers, branch questions, tree names, text inputs,
  selects, textareas (including read-only passage selection), contenteditable
  regions, provider/model controls, dialogs, menus or media players. Media
  playback, seeking, volume and fullscreen keys stay with the player. Suspend all
  aliases while a dialog or menu is open, even if the map retains focus.
- Ignore aliases during IME composition, including the composition key-code
  fallback, and when an event has already been handled. Ctrl, Meta and Alt
  combinations remain available to their existing owner, including browser
  find/zoom. Consume an event only when an enabled, in-scope alias runs.
- Describe the mapping, off/on state and focus requirement in existing Help.
  Keep the checkbox keyboard accessible, with visible focus and an exposed
  checked state. The choice does not depend on provider or conversation data.

## Alternatives and rationale

Standard controls alone need no extra preference or letter shortcuts. The
proposed opt-in aliases support familiar Vim directions while retaining one
canvas action path and the complete standard keyboard journey. Default-off and
exact focus boundaries limit accidental box movement and preserve native text,
selection, assistive-technology and media interaction. The tradeoff is that
`h`/`j`/`k`/`l` move a focused box rather than choosing a neighboring conversation;
learners still use Tab to reach another control.

The owner accepted this exact proposal on 2026-11-09, answering "yes" when asked
whether to accept the mapping in this document. Standard controls alone and a
different mapping were the alternatives not chosen.

## Evidence and remaining checks

- `TreeTutor-b1z.4` is closed, checked through local Beads on 2026-11-09. Its
  keyboard-journey evidence is a synthetic-provider browser check; it is not live
  provider evidence and was not rerun for this documentation-only proposal.
- Source review of [TreeOverview.tsx](../src/TreeOverview.tsx) confirms the two
  focus contexts, directional steps, box open/move actions, and Zoom in/out/Fit
  actions. [ChatPage.tsx](../src/ChatPage.tsx) supplies the existing Settings/Help
  entry points, text-selection controls, model menu and Escape handling. This is
  static evidence of existing standard controls, not a test of future aliases.
- The exact table, activation rules, boundaries, alternatives and rationale were
  presented on 2026-11-09 and **accepted by the owner the same day**.
- Implementation checks remain in `TreeTutor-vm4.6`: compare aliases with their
  standard actions in both allowed focus contexts; verify off/on and reload/tree
  switching; exercise editable and read-only controls, IME, nested controls,
  dialogs/menus, browser modifiers, media and disabled mode; preserve the full
  standard keyboard journey. Record fixture and live results separately. Run
  focused integration checks, `npm test`, `npm run build` and Astryx built-output
  doctor for that UI implementation. These checks have not passed by virtue of
  this proposal.
