# Inline video review — TreeTutor-zhf.6

Disposition: ship within the [Videos inline specification](../inline-visuals-spec.md). This supersedes the focused-chat card/loading-rectangle treatment in the older Smart video review; library cards retain that treatment.

The implementation reuses stored positions and Markdown slots, the existing VideoCard player and Astryx controls, and semantic theme tokens. No schema, provider permissions, generation policy or dependencies changed. Positions survive Cancel, Retry and restart; legacy videos with no position remain after the reply. Phase and bounded progress exist only on pending runtime responses, with attempt ownership checked before updates.

## Evidence

- `npm test`: 202 passed, zero failed/skipped. HTTP integration covers exact reply text and positions, progress bounds, ownership/private inputs, compact previews, terminal cleanup, stale callbacks, retry and restart compatibility. Existing real sandboxed 2D/3D rendering checks passed.
- `npm run build` and `git diff --check`: passed. Vite retains its existing large-chunk warning.
- [Player report](smart-video-player.json): fixture tutor/worker, fake narration and a real sandboxed Remotion render in the production UI through agent-browser. Videos sit between the recorded paragraphs, fill the column without border/fill, and retain native keyboard playback, seeking, volume, fullscreen and enlargement. Pending is 28px tall; ready is 16:9. Both appearances at 1280px/390px fit without overflow; reduced motion is respected. Completion preserves mid-thread focus/scroll and reload starts no inference.
- [Recovery report](smart-video-recovery.json): positioned failure with safe reason/Retry, private-error fallback, interrupted/unavailable recovery, keyboard Cancel/Retry focus retention, missing-file regeneration and no duplicate messages. Both appearances and widths passed.
- [Library report](video-library.json): disposable copy of an existing native-generated database/MP4; migration, keyboard navigation, playback/seeking, unavailable state and survival after source deletion passed, without new provider calls or usage changes.
- Existing visual sandbox check passed: placement, legacy Mermaid, themes, shimmer, enlarge and hostile isolation. Its immediate map-preview assertion raced the preview request once; waiting for that same preview text fixed the check.

## Visual assessment

Inspected the generated pending/ready/failure captures in `.impeccable/review/` at desktop and narrow sizes, light and dark. Transparent placement follows the surrounding prose; controls fit beside status/reason text, and native controls remain unobstructed. The white video frame is fixture content, not an app surface.

Inspection caught reading typography leaking into inline controls. Restored Public Sans through the existing supporting/label tokens. The [final computed-style check](inline-video-typography.json) confirms pending/failed status at 12px and actions at 14px in both appearances and widths, with no inference. Status contrast is 5.96:1 dark and 6.65:1 light. The design detector reported only the pre-existing scrollbar radius advisory at `src/layout.ts:21`, outside this change.

The slim placeholder intentionally grows into the player, following the newer spec. Fresh Claude/Codex generation, online TTS and a broad E2E suite were outside this placement slice. Existing native media was reused for library playback; it does not establish a fresh native-provider run. Changes remain unstaged and uncommitted for Ralph.
