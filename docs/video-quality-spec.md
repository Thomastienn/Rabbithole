# Video quality refresh

Decided with the project owner on 2026-11-12 (grilling session). Refines the [workspace and media refinement spec](workspace-media-refinement-spec.md) and the [video flow proposal](video-flow-proposal.md) where they conflict; everything not named here keeps its current behavior.

## Problem

Generated videos render at 640×360 and look blurry. The worker invents its own palette (navy and teal), so videos do not match the Paperback inks. Motion is mostly linear with hard cuts. Subtitles are white sans-serif on a black box. In chat, the video's title and description are hidden, a reply holding only a video shows "No reply received." as if it failed, and the pending state is a slim status line with two phases.

## Decisions

1. **Resolution:** 1280×720 at 30 fps for 2D and 3D (`ThreeCanvas` 1280×720). Smoothness comes from motion, not frame rate.
2. **Dark paper identity:** every video uses one fixed dark-paper look regardless of app appearance: ground `#1a1613`, paper text `#efe6d6`, amber primary accent, leaf, rust and lichen as secondary series colors. The palette is fixed; it does not follow the conversation's branch family ink.
3. **Style kit, no templates:** compositions may import a small kit (`./kit`) of palette tokens, type, easing and transition helpers and 3D presets (background, ink materials, lighting). It holds building blocks only. The prompt asks for a layout and visual approach suited to each subject so videos still differ.
4. **No new validation:** the kit import is not required and colors are not checked, so the failure rate does not rise. The render wrapper itself applies the dark-paper ground, loads Archivo and Literata as default fonts and draws subtitles, so a composition that ignores the kit still lands in the house style.
5. **Type:** Archivo for headings and labels; Literata for longer explanatory sentences on screen.
6. **Motion:** the prompt requires eased or spring motion and cross-fades between scenes; no linear slides or hard cuts.
7. **Subtitles:** Archivo in paper color on a soft dark-paper band across the reserved bottom area (about 150 px at 720p), at most two lines, centered, fading between captions.
8. **Empty replies:** a completed reply with no text shows no placeholder text, with or without an artifact. "No reply received." is removed; failed and interrupted replies keep their own states.
9. **Placeholder frame:** a pending video occupies a 16:9 dark-paper frame at final player size. Ink lines slowly draw and erase rough storyboard panels behind the title, step list, elapsed time, overall bar and Cancel. Animation stops under `prefers-reduced-motion`.
10. **Verbose progress:** the server reports phases `planning` (with characters written), `narrating`, `rendering` (frame n of N) and `saving`. One overall bar maps them to 0–55%, 55–65%, 65–97% and 97–100%. Planning advances on an easing curve in time that slows toward 55% and never passes it; rendering maps real frame progress. The bar never moves backward, never reaches 100% before ready, and glides between polls. Step names and counts are real; only the bar position is estimated. This replaces "show progress only when reported by the renderer".
11. **Announcements:** the status region announces step changes, ready and failure only, not counts or percentages.
12. **Figure caption:** under the player, the title (Archivo semibold) and, once ready, the description (Literata). Pending shows the title only.
13. **Existing videos** are not re-rendered; "Try a different version" produces one in the new style.

## Acceptance

- A Claude and Codex video renders at 1280×720 in dark paper with Archivo/Literata, eased transitions and the new subtitles.
- A reply containing only a video shows no "No reply received." text.
- The pending frame matches the player size, shows each phase in order with real counts, and its bar never decreases.
- `npm test` and `npm run build` pass.
