# Keyboard learning journey

Tasks: TreeTutor-7t3.11.1 and TreeTutor-7t3.11, verified 2026-11-09 under TreeTutor-b1z.4.
Check: `scripts/verify-keyboard-journey.mjs` against the `npm run build` output in agent-browser (Chromium), 1440×900, reduced motion.
Every interaction is a key press. `eval` only reads state; IME composition events are dispatched because agent-browser cannot drive a real IME.
Provider: a **synthetic fixture** (no live provider). The shared journey allows either provider. Live Codex model evidence is in [model-switch.md](model-switch.md).

## Bindings

| Context | Keys | Result |
| --- | --- | --- |
| Anywhere | Tab / Shift+Tab | Move through controls in page order; no trap |
| No tree | Enter on **New tree** | Opens the tree list with focus in **New tree name**; Enter creates the tree |
| Empty map | Enter on **Start conversation** | Opens the chat with the composer focused; no node until the first question saves |
| Composer | Enter / Shift+Enter | Send / new line. Arrow, Home, End, Space, Backspace and IME input stay in the text |
| Chat | Escape | Back to the map. Focus returns to the control that opened the chat, or to the conversation's box title |
| Chat, open menu | Escape | Closes only the menu and returns focus to its trigger; a second Escape leaves the chat |
| Tutor reply | Enter on **Select passage in tutor reply N** (shown on focus) | Read-only copy of the reply; Home/Arrows move, Shift+Arrows select; Tab → **Ask about selection** |
| Selection / branch form | Escape or **Cancel branch** | Closes and returns focus to **Ask about selection** |
| Branch form | Tab → **Create focused chat**, Enter | Saves the child with exact offsets and opens it with the composer focused |
| Chat header | Space/Enter on **Model for next reply**; Home/Arrows/Enter | Choose the model for this conversation only; disabled while a reply runs |
| Chat header | Enter on **Expand chat** / **Show map beside chat** | Switches panel mode; focus stays on the toggle |
| During a reply | Enter on **Stop** | Interrupts; partial text is saved |
| Tree canvas region | Arrows / Shift+Arrows | Pan 100 / 300 px |
| Focused box | Arrows / Shift+Arrows | Move 10 / 100 px, announced; Enter/Space opens |
| Box controls | Enter on title, fold toggle, **Reveal source passage** | Open chat; Collapse/Expand descendants (focus stays); open parent with the passage highlighted and focused |
| Map toolbar | Enter on **Zoom out**, **Zoom in**, **Fit tree**, **Map menu** | Menu: Learning trees, Settings, Expand all, Collapse all, Keep current branch, Help (Arrows, Enter, Escape) |

## Browser results (2026-11-09, PASS)

1. Tab → **New tree** (visible focus ring), Enter → name field, typed, Enter → focus on **Start conversation** on the empty map.
2. Enter → composer focused; Enter sent the first question, which created the root.
3. Shift+Tab → **Select passage in tutor reply 1**, Enter, Home, ArrowRight ×19, Shift+ArrowRight ×11 picked the *second* "Fungi trade"; Tab → **Ask about selection**; question edited (Ctrl+A, retyped); **Create focused chat** saved offsets 19–30 exactly.
4. The same keys created a nested child (`sugar`, offsets 12–17) from the child reply.
5. Dispatched composition with ArrowLeft, committed CJK text (`菌根`), then Arrow/Home/End/Space/Backspace in the composer: the map transform did not change.
6. Model menu: Space opened it, Escape closed only the menu (chat stayed open, focus on trigger), Enter/Home/ArrowDown/Enter saved Keyboard B for the grandchild. The child kept Keyboard A.
7. Sent a held reply: the model menu was `aria-disabled` and the turn ran with its captured `kb-b`; Shift+Tab → **Stop**, Enter → "Reply interrupted".
8. **Expand chat** / **Show map beside chat** toggled with Enter, focus kept on the toggle; Escape → map with focus on **Open What is sugar?**.
9. Canvas region Arrow / Shift+Arrow panned; focused box Arrow / Shift+Arrow moved it and announced the move; Zoom in, Zoom out and Fit tree by Enter.
10. Fold toggle Enter/Space collapsed and expanded with focus kept; Map menu Collapse all, Expand all and Keep current branch through Enter/ArrowDown/Enter.
11. Enter on a box title opened its chat (composer focused); Escape returned focus to the title. **Reveal source passage** focused the exact `<mark>`; Escape returned to the reveal control.
12. 60 Tabs visited 20 distinct controls; Shift+Tab came back to the start, so there is no trap.

Defects found and fixed in this run:
- Escape inside the model menu also closed the chat, because React keydown bubbles through the menu portal. The chat's Escape handler now ignores events from `[role=menu]`.
- After returning from a chat reached by branching, focus fell to `body`. It now goes to that conversation's box title.
- A box remounting after a fold re-ran the return-focus effect and took focus from the fold toggle. That effect now runs only when focus is outside the map.
- **Cancel branch** returned focus to a detached button, because the ask button remounts. The ref object is kept instead.

Related focused checks cover the rest: mobile 390 px panel and composer (`verify-tree-overview`, `verify-chat-expand`), bulk folding and collapsed-panel keyboard (`verify-bulk-folding`), keyboard box moves (`verify-canvas-positions`) and pointer gestures (`verify-map-gestures`).
