# Visual identity finish review

TreeTutor-nwx.12 · 2026-11-11. Authority: [visual identity spec](../../visual-identity-spec.md), [PRD](../../../PRD.md), and the recorded Lecture-hall Slate Direction contract. This evidence covers the production web build over an isolated SQLite store and synthetic providers, driven through Chromium with agent-browser. It does not establish native Claude/Codex inference or the full text-release gates.

## Review

The shipped Impeccable finish reviewer ran in a fresh agent context. [Full report](review.md): **disposition: ship**, no material fixes requested. The report includes persistence, fidelity, ceiling, material_fixes and keep sections, and compares all seven screens to the Direction contract, the decision HTML sketch, and map/focused-chat references. No separate QUALITY BAR raster was recorded; the reviewer explicitly limits its ceiling judgment to the contract and craft floor. A fix/verdict round was unnecessary after `ship`.

[Round 1 captures and hashes](round-1/manifest.json): 46 screenshots, dark/light at 1440 × 900 and 390 × 844. They cover map, focused chat, sidebar, Settings, Knowledge, dialogs/menus and Mermaid, plus child/inherited context, sidebar search, narrow Settings list/content, delete, model menu and passage prompt. Every capture was opened by both the build agent and reviewer. The browser's fonts and finite animations settled; reduced motion was enabled. Chat captures show scrollable transcript viewports. The Knowledge and Settings narrow captures show their distinct layouts.

Regenerate locally after `npm run build` with `node scripts/capture-finish.mjs <round>`; images land under `.impeccable/review/finish-<round>/`. The committed images are exact copies of `finish-review-1`.

## Finished details

The carried-over implementation batch marks manually branched passages in replies, embeds self-hosted Public Sans in SVG diagram images, uses slate backgrounds for diagram edge labels, removes diagram-viewer blur and its duplicate caption, puts tint swatches next to their labels, hides redundant visible radio-group labels while keeping accessible labels, removes a redundant overflow tooltip, and fixes singular/plural Knowledge evidence copy.

An attempted selected-conversation-plus-children viewport fit was removed: it caused the map to move during passage selection. The existing selected-conversation framing remains; the complete Vim fixture passes. The dialog fixture now finds the same `locks` passage across text nodes split by the new underline, and asserts that a manual branch stays marked. The suggestion-model fixture waits for the selected value to appear on its closed, enabled trigger and for the save status, preventing the previous toggle's stale success message from satisfying the wait.

The suggestion-model check also waits for search focus and filtered options before pressing the selection keys. The existing `TreeTutor-wpc` classifications for tree overview and canvas source visibility are retained. An incoming change had removed the latter after an intermittent pass; the full run reproduced the same existing source-visibility failure. No assertion or product requirement was weakened.

## Documentation

The Impeccable documenter replaced [DESIGN.md](../../../DESIGN.md) and [.impeccable/design.json](../../../.impeccable/design.json) from the built world. The theme source remains [slateTheme.ts](../../../src/themes/slate/slateTheme.ts), generated into slate.css. The design frontmatter records the actual tokens; the sidecar carries extensions and illustrative component previews. [Documentation validation](documentation-check.json) confirms valid YAML, all 31 colour values matching the generated theme, canonical section order, resolved references and synchronized narrative. All ten snippets parse and render inside shadow DOM with the correct primary colour in both appearances; their states remain illustrative.

## Validation

The [source detector](source-detector.json) reports one advisory against the outgoing DESIGN.md type ramp: the spec-mandated `1rem` reply size. The replacement documentation includes that role. No second manual detector pass was run; normal design hooks remain active. Astryx doctor reports zero failures; its existing warnings concern font discovery (the fonts are imported in main.tsx) and agent-doc markers.

- `npm test`: [168 passed, zero failures](tests.txt), including token lint and the real sandboxed short-video integration.
- `npm run build`: passes; production input/output fingerprints match. The existing bundle-size warning remains.
- `npm run verify`: [38 passed, 2 flaky, zero new failures, 2 known TreeTutor-wpc failures, 9 live skipped](runner-final.txt), exit 0. Flaky checks were suggestion-model selection and inherited-context navigation. The suggestion-model helper was then stabilized as described above.
- Final runner on the latest `verify-break-down-ui.mjs` and `verify-dialog-identity.mjs`: [2 passed, zero flaky/failures](runner-targeted-final.txt), exit 0. The full Vim check passes; no keyboard assertion was relaxed.
- [Before repair](runner-before-repair.txt): the earlier full run exposed the dialog text-node assumption, the suggestion-model race, and the removed existing-bug marker. These were repaired before the passing runs.
- Astryx doctor: zero failures; `git diff --check`: clean.

The fixture runner skips its nine named native-provider checks by design. No production raster assets are introduced by this flat/vector world; screenshots are verification artifacts with capture provenance in their manifest. Fresh captures and results live in this directory; unrelated generated evidence was restored to its incoming bytes. Git staging and commits are left to Ralph.
