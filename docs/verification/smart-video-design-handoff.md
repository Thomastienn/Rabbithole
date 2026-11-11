# Smart video design handoff

Disposition: ship for the existing-surface extension in TreeTutor-133.1, consistent with the five-section [finish review](smart-video-ui-review.md). This pass documents the built extension; it introduces no palette, typography, geometry or system decisions. `DESIGN.md` and `.impeccable/design.json` are preserved.

## Authority and scope

Compared [PRODUCT.md](../../PRODUCT.md), the media scope in [PRD.md](../../PRD.md), and the loading/playback requirements in [workspace-media-refinement-spec.md](../workspace-media-refinement-spec.md) with the Smart video loading extension in the [surface brief](../../.impeccable/surfaces/index-html.md). The incumbent [DESIGN.md](../../DESIGN.md) and [slateTheme.ts](../../src/themes/slate/slateTheme.ts) remain the visual authority. This is an ordinary extension of Lecture-hall Slate, with no replacement world or new component vocabulary.

Source compared: [VideoCard.tsx](../../src/VideoCard.tsx), [TreeOverview.tsx](../../src/TreeOverview.tsx), [artifacts.ts](../../src/artifacts.ts), and the video geometry, overlay-action, reduced-motion and viewer rules in [layout.ts](../../src/layout.ts). The card reuses Astryx Skeleton, Heading, Text, stacks, small ghost Button and Lightbox, plus the incumbent diagram-card seam and surface.

## Compared visual evidence

Directly inspected all eight `.impeccable/review/smart-video-{loading|ready}-{dark|light}-{1280|390}.png` captures and the separate `smart-video-failure.png` and `smart-video-canceled.png` captures. Loading and decoded paused-ready states retain the title/frame/description hierarchy at both widths and in both appearances. The narrow card fits its reading column; the ready action sits at the upper right, separate from the native playback controls. Failure remains a simple message with Retry; cancellation shows Retry with a visible keyboard focus ring. No production code, script, stages or logs appear in these states.

The fixture video's white frame and serif scene lettering are generated content, not new app palette or type rules. The reserved rectangle, quiet loading text and small Cancel action preserve the surrounding reading hierarchy rather than becoming a second dashboard.

## Recorded component behavior

The built frame reserves a 16:9 area using the existing element corner token. Pending shows Skeleton and one generic status; reduced motion disables its animation. The same action remains mounted as Cancel, Retry, Regenerate or Open large, preserving focus across state changes. Ready uses a labeled native player without autoplay; enlargement is explicit. Description remains below the frame, and the map reports a compact video status in the originating conversation.

The supplied [player report](smart-video-player.json) records matching loading/player dimensions (501 × 281.8125), a narrow frame of 332 × 186.75 without overflow, both appearances, reduced-motion freezing, native keyboard controls, completion without focus/scroll movement, enlarged-viewer Escape focus return, and reopening without another provider request. The [recovery report](smart-video-recovery.json) records explicit keyboard retry/cancel, restart interruption, missing-file regeneration and recovery without adding a learner message. These are supplied execution results, not tests rerun by this documenter.

## Preserved system

- Palette: semantic dark green slate and pale slate-paper, chalk text and the incumbent yellow action/provenance accent.
- Type: Public Sans controls/headings, supporting status text and the existing Source Serif 4 reading voice; no new type role.
- Working Chalk Rule: yellow retains action, focus and branch provenance roles.
- Reading Voice Rule: tutor prose retains its reading face; controls retain Public Sans.
- Slate Seam Rule: small corners, tonal layering and hairlines; no added drop shadows, blur or texture.

## Drift and verification limits

Pre-existing metadata drift remains: `DESIGN.md` is newer than `.impeccable/design.json` (filesystem timestamps 2026-11-11 03:50 versus 00:02, UTC−06). No sidecar refresh is needed to document this ordinary extension. The detector advisory at `src/layout.ts:21` is the incumbent scrollbar thumb's `999px` radius, outside this media change. It is reported without repair or promotion into a general shape token.

The supplied [native Codex report](smart-video-native-codex.json) establishes one short three-second 640 × 360 H.264 render using the subscription adapter; the UI reports use synthetic providers with actual sandboxed rendering. No browser or provider tools were run in this pass. Native Claude success, narration/subtitles, longer duration, Three.js, library operations and instructional quality are outside this handoff's evidence; the broader refinement requirements remain separate work.
