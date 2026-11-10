# Focused chat layout (TreeTutor-u7v.8)

Fixture provider, local browser (agent-browser), 2026-11-10.

- `node scripts/verify-focused-chat-layout.mjs`: PASS. Learner bubble right-aligned, tinted, no "You" label; "Tutor · Codex · Fixture model" header labels the reply article; expanded chat caps reply text (738px of 1312px); order passage → diagram → usage footer; turn gap 32px vs 8px between question and reply; failed status stays on its reply; usage footer hidden at rest, shown on hover and on keyboard focus within the reply; streaming "Responding…" on the new reply. Hover-capable pointer is emulated with Chrome blink settings.
- `HOVER=none node scripts/verify-focused-chat-layout.mjs`: PASS, headless default `(hover: none)` shows the usage footer always.
- `verify-passage-selection`, `verify-suggestion-branching`, `verify-keyboard-journey`, `verify-node-previews`, `verify-chat-expand`, `verify-subtree-folding`: PASS.
- `verify-passage-corrections`: both correction steps PASS; the script then fails on the removed Knowledge tab (stale since u7v.4).
- `verify-diagram-rendering` fails at "Ask about selection" identically on unmodified HEAD f3a6c66 (stale: mouse highlight now opens the passage box directly). `verify-first-conversation`, `verify-branch-streaming` fail on HEAD too (stale sidebar selectors).

Screenshot: `focused-chat-layout.png` (expanded chat, first reply hovered with its usage footer).
