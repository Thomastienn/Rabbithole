# Keyboard learning journey

Verified under **TreeTutor-7t3.22**, **2026-11-09 America/Edmonton
(2026-11-10 UTC)** against the clarified New chat workspace. Check:
`scripts/verify-keyboard-journey.mjs`, built app in agent-browser/Chromium,
1440×900, reduced motion. [Fresh 17-step output](text-release-fixture-checks.json).
Every user interaction is a key press. `eval` observes state, except for explicitly
synthetic IME composition events because agent-browser cannot drive a real IME.
Answers, compaction and model catalog are **synthetic fixtures**. Native model /
provider continuity and every semantic check remain **TreeTutor-7t3.12** work.

## Bindings

| Context | Keys | Result |
| --- | --- | --- |
| Anywhere | Tab / Shift+Tab | Move through controls in page order; visible focus, no trap |
| No tree / chat list | Enter on **New chat** | Immediately creates one root titled New chat, opens its map and side panel, focuses composer; no name field or Start conversation step |
| Composer | Enter / Shift+Enter | Send / new line; first saved question titles the root. Arrow, Home, End, Space, Backspace and IME input stay in the text |
| Chat | Escape / Enter on **Return to tree** | Collapse panel, restore focus to its opening control or selected conversation's title |
| Collapsed panel | Enter on **Reopen chat**, or box/title Enter | Open the selected conversation beside the map; composer focused |
| Chat with model menu open | Escape | Close only the menu and return focus to its trigger; a second Escape returns to the map |
| Tutor reply | Enter on **Select passage in tutor reply N** (revealed on focus) | Open read-only reply text; Home/Arrows move, Shift+Arrows select; Tab → **Ask about selection** |
| Selection / branch form | Escape or **Cancel branch** | Close branch action/form and restore its focus target |
| Branch form | Tab → **Create focused chat**, Enter | Save exact selected offsets, reveal child and focus its composer |
| Chat header | Space/Enter on **Model for next reply**; Home/Arrows/Enter | Choose a menu model for this conversation; disabled while its reply runs |
| Chat header | Enter on **Expand chat** / **Show map beside chat** | Switch expanded/beside modes, keeping focus on the toggle |
| During a reply | Enter on **Stop** | Interrupt and save partial text |
| Tree canvas region | Arrows / Shift+Arrows | Pan 100 / 300 px |
| Focused conversation box | Arrows / Shift+Arrows | Move 10 / 100 map units, announced; Enter/Space opens |
| Box controls | Enter/Space on fold chevron | Collapse/expand descendants, retaining node and toggle focus |
| Box controls | Enter on title / **Reveal source passage for …** | Open chat / open parent with exact source passage highlighted and focused |
| Map toolbar | Enter on **Zoom out**, **Zoom in**, **Fit tree**, **Map menu** | Menu contains Learning trees, Settings, Expand all, Collapse all, Keep current branch, Help; Arrows/Home/Enter/Escape operate it |

## Fresh browser observations (PASS)

1. Tab → **New chat**, visible focus ring, Enter → one root box titled New chat,
   chat open beside map and composer focused. No naming form or empty-map step.
2. Type **How do fungi trade?**, Enter → exactly one saved question/reply; header
   and root take the first question as their title.
3. Shift+Tab → **Select passage in tutor reply 1**, Enter → read-only text.
   Home, ArrowRight ×19, Shift+ArrowRight ×11 selects the second **Fungi trade**.
   Tab → **Ask about selection**, Enter; edit draft with Ctrl+A, type the question,
   Tab → **Create focused chat**, Enter → exact offsets **19–30** saved and child
   composer focused.
4. Same flow from the child selects **sugar**, offsets **12–17**, and creates a
   nested child with its composer focused.
5. Synthetic IME composition, committed CJK text (**菌根**) and
   Arrow/Home/End/Space/Backspace stay in the composer; map transform is unchanged.
6. Model menu opens with Space. Escape closes only the menu and restores trigger
   focus; chat stays open. Enter/Home/ArrowDown/Enter selects **Keyboard B** for
   the grandchild; child retains **Keyboard A**. These are fixture catalog choices,
   not native provider-switch evidence.
7. Send a held reply. Menu is `aria-disabled`, turn captures `kb-b`;
   Shift+Tab → **Stop**, Enter → **Reply interrupted**.
8. Enter on **Expand chat**, then **Show map beside chat**, changes panel modes
   and retains focus on the toggle.
9. Escape collapses chat and returns focus to **Open What is sugar?** on the map.
   Tab/Shift+Tab → **Reopen chat**, Enter restores beside mode and composer focus;
   Escape collapses it and returns focus to the same box title.
10. Tab/Shift+Tab to the canvas; ArrowRight and Shift+ArrowDown pan it.
11. Focus the child box by Tab; ArrowDown and Shift+ArrowRight move it by 10/100
    units and announce **Why trade water? moved to …**.
12. Reach **Zoom in**, **Zoom out** and **Fit tree** with Tab/Shift+Tab and invoke
    each with Enter.
13. Child fold chevron: Enter hides the grandchild, Space restores it, and focus
    remains on that chevron.
14. **Map menu**, Enter/ArrowDown/Enter: **Collapse all**, **Expand all**, then
    **Keep current branch**. Other fixtures verify side branches actually fold
    while the current path and descendants remain visible.
15. Enter on child title opens its chat and focuses composer. Escape returns
    focus to the same title.
16. Enter on **Reveal source passage for Why trade water?** opens the parent and
    focuses the exact **Fungi trade** mark. Escape restores focus to the reveal
    control. This action is on the child title row; there is no bottom passage list.
17. Sixty Tabs visit **20 distinct controls**; Shift+Tab returns to the reveal
    control, demonstrating no focus trap.

The same fresh suite covers expanded return and narrow **Reopen chat**
(`verify-chat-expand`), real side-branch preservation (`verify-bulk-folding`),
source-message Handles and exact repeated/emoji offsets after moves/growth/reopen
(`verify-canvas-positions`), every message in order (`verify-node-previews`),
minute-batched fold/selection/viewport/panel restore (`verify-layout-restore`),
and narrow full-workspace chat (`verify-chat-sidebar`, `verify-chat-expand`,
`verify-tree-overview`). [All actual outputs](text-release-fixture-checks.json).

No product fix was needed in this recheck. The keyboard fixture now also checks
**Reopen chat** through Tab/Enter and the following Escape focus return.
Earlier focus/menu fixes remain covered:
Escape closes a portal menu first; branching return focuses a box title; folded
box remounts do not steal chevron focus; canceling restores the remounted selection
button. Physical keyboard/IME/touch hardware was not tested; these results use
browser-generated key events and viewport emulation.
