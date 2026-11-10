# Chat divider verification (TreeTutor-u7v.10)

Fixture: built app with in-process fake provider (not a live model), `node scripts/verify-chat-divider.mjs`, 1600×1000 then 400×800.

- Default 26rem; `role=separator`, tabindex 0, aria-valuemin 22, aria-valuemax 57 (70% of 82rem workspace), aria-valuetext "Chat width 26 rem".
- Drag 160px left → 36rem; drag clamps at 57rem max and 22rem min.
- Double-click resets to 26rem.
- Keyboard: ArrowLeft +1rem, Shift+ArrowLeft +4rem, ArrowRight −1rem, Home 22rem, End max; stored in `localStorage['treetutor.chat-width']`.
- Reload keeps 30rem.
- Expanded mode fills the workspace with no divider; back beside keeps 30rem. Map-only hides chat and divider.
- Mobile 400px: no divider, chat full width.

Screenshots: `chat-divider.png` (desktop, 30rem), `chat-divider-mobile.png`.
Regression: verify-chat-expand, verify-keyboard-journey (17 ok), verify-focused-chat-layout pass.
