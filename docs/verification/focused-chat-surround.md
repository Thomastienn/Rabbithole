# Focused chat surround verification

TreeTutor-nwx.6 extends the existing Lecture-hall Slate focused chat. The [direction contract and focused-chat rules](../visual-identity-spec.md) own its appearance; [PRD.md](../../PRD.md) owns behavior. [PRODUCT.md](../../PRODUCT.md) supplies the reading-first product context. This report covers the header, inherited context, media-card surround, composer and divider. It does not approve the map, sidebar, menus or whole application. The final cross-screen finish review and DESIGN.md rewrite remain TreeTutor-nwx.12 work.

Map references are not yet available: TreeTutor-nwx.4 remains open. This ticket follows the written contract and the existing theme/transcript evidence, and supplies the focused-chat references for later screen tickets.

## Shipped surface

The title uses Public Sans 600 above muted provider/model text. Header actions remain ghost buttons. A collapsed **Token stats** disclosure lists completed replies through the existing usage formatter, including suggestion costs and unavailable usage; app-wide totals remain in Settings. The return-to-parent title and exact source passage wrap, and the header scrolls within its height cap on small screens.

The default side column is 35rem, with saved widths preserved and the existing 22rem minimum and 70% workspace maximum retained. Short conversations start below the header rather than after a growing leading spacer. The composer stays at the bottom on an opaque raised surface, with a hairline field and four visible input rows before scrolling. Send/Stop and Enter/Shift+Enter retain their existing behavior.

Inherited context remains a collapsible, read-only passage, question and snapshot, presented in muted reading type behind a 2px yellow rule. Diagram and video cards use the existing raised surface, hairline seams and 4px element corners; video actions are ghost buttons. The draggable seam uses the theme accent on hover, drag and keyboard focus. Enlarged media retain the theme's dimmed overlay.

These details are recorded in the focused-chat rule rather than promoted into new global tokens or system doctrine. Source evidence: [ChatPage.tsx](../../src/ChatPage.tsx), [layout.ts](../../src/layout.ts), [chatWidth.ts](../../src/chatWidth.ts) and [VideoCard.tsx](../../src/VideoCard.tsx).

## References and checks

The scoped finish reviewer initially required one fix: the parent source passage was still constrained to one line. Removing that clamp allowed exact text to wrap. The independent final fix-list review marked the finding **RESOLVED**, accepted the five recaptures below and returned **ship**. That verdict applies to this scoped fix list, not whole-app release approval.

| Capture | Viewport | Evidence |
| --- | --- | --- |
| [Dark reference](focused-chat-reference-dark.png) | 1440×900 | Header, collapsed stats, inherited context, short log and composer |
| [Light reference](focused-chat-reference-light.png) | 1440×900 | Same surround in the light appearance |
| [Narrow light](focused-chat-narrow-light.png) | 390×780 | Full-width chat and reachable composer |
| [Small light](focused-chat-narrow-small-light.png) | 320×568 | Long draft scrolls with input and Send reachable |
| [Long parent light](focused-chat-long-parent-light.png) | 320×568 | Parent title and exact passage wrap without horizontal overflow |
| [Video dark](focused-chat-video-dark.png) | 1280×800 | Paused decoded frame, slate card and ghost action |
| [Video light](focused-chat-video-light.png) | 1280×800 | Same media surround in the light appearance |

The [focused-chat fixture results](focused-chat-surround-results.json) pass on the built application with SQLite, HTTP and Chromium and a synthetic provider. Both appearances preserve the inherited text exactly; Token stats opens with Enter and closes with Space. With inherited context collapsed, the short log starts at a 24px inset with 165px of space after its content. The fixture also checks the yellow divider hover, return-to-parent navigation, Shift+Enter newline, Enter send, Stop, long-draft scrolling and long-parent wrapping.

The [diagram fixture](diagram-rendering-results.json) passes all ten checks after stale prompt/sidebar selectors were updated, preserving its behavioral assertions. The [video fixture](video-player-results.json) passes eleven checks, including its ten original behavioral checks and dark/light media surrounds. It fits the tree before selecting nodes, and its captures seek and briefly play/pause a fully buffered frame to clear the native loading indicator. Its renderer is a real sandboxed Remotion render; its tutor and worker providers are synthetic. Native provider inference was not exercised.

`npm test` passes 164/164 on the final source (`/tmp/treetutor-nwx6-tests.log`), including token lint. `npm run verify` builds successfully and exits 0: **20 passed, 0 flaky, 0 new failures, 16 known failures, 9 live-provider checks skipped** (`/tmp/treetutor-nwx6-verified.log`). Inherited context, divider, expand, transcript/surround, diagram, video, keyboard journey, subtree folding and passage selection all pass. The folding fixture now waits for the view transition to finish before addressing the composer.

Known failures remain visible under the existing TreeTutor-yms and TreeTutor-wpc exceptions, already recorded in prerequisite TreeTutor-nwx.5. Only the repaired diagram exemption was removed. `verify-canvas-positions` passed on this run; its existing wpc exception remains because this ticket did not repair that separate bug.

## Rule consistency and retained drift

The detector record (`/tmp/treetutor-nwx6-detector.json`) contains zero primary findings and one advisory: the pre-existing reply size of 1rem is absent from the old DESIGN.md type ramp. The current direction explicitly requires 16px/1.7 replies, so this advisory reflects deferred system-document drift rather than a new size introduced by this extension. No detector rerun or broader audit is claimed.

DESIGN.md still contains the earlier neutral palette, Figtree hierarchy and old layout descriptions. It and `.impeccable/design.json`, configuration and the surface brief are preserved for the authorized final documentation ticket. Their stale rules are neither repaired here nor canonized as guidance for this extension. The accepted spec and existing semantic theme roles remain the authority; this ticket invents no new durable design system.

Impeccable also reports unset `buildPath` metadata. The spec already fixes a code-led build; that metadata was left untouched for the final review.
