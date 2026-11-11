# Narrated 3D video verification (TreeTutor-133.4)

Verified on 2026-11-11, after TreeTutor-133.2. Before starting I read TreeTutor-133.4, PRD.md, the existing 2D narration evidence and the video server, renderer and test code.

## What changed

- **Renderer.** Three.js scenes go through Remotion's own integration: pinned `@remotion/three` 4.0.542, `three` 0.187.0 and `@react-three/fiber` 9.8.2 (9.x is the line that supports React 19). They render in the same bundle, the same bubblewrap sandbox and the same headless-shell renderer as 2D. There is no second renderer and no scene DSL. WebGL worked inside the existing sandbox with no change to the Chromium options.
- **Import allow-list.** `server/videos.mjs` `videoSource` now accepts `react`, `remotion`, `@remotion/three`, `three` and `@react-three/fiber`. Every other module is still rejected, including `@react-three/drei`. It also rejects any `*Loader` identifier (`TextureLoader`, `useLoader`, `GLTFLoader`…), adding to the existing bans on network, file, dynamic import and media tags. The sandbox still blocks network access and hides home and app data. Owned audio and timing files stay read-only mounts.
- **Worker instructions.** The model decides the dimension first:
  - 2D for ordinary explanations.
  - 3D whenever spatial relationships are involved (orbits/tilt, orientation, depth, solids, surfaces, fields, molecules).
  - A request for 2D or 3D from the learner or the intent wins.

  3D motion must come from `useCurrentFrame`, not `useFrame` or clocks. Labels are HTML layered over the `ThreeCanvas`.
- **Duration guidance recalibrated.** The measured Edge pace was about 2.7 words/s (164 w / 61.1 s and 149 w / 54.5 s). At that pace the old "150–280 words" floor produced videos under one minute. The new guidance is roughly 180–320 words, and about 2.7 words per requested second for an explicit duration.
- **Parser fix.** A native Claude reply put a ```` ```tsx ```` fence *after* the two header comment lines. The old parser only removed a fence that wrapped the whole reply, so webpack compiled the backticks as a tagged template and rendering failed with `"" is not a function`. Fence-only lines are now dropped wherever they appear. This parses one response; it is not a repair loop or a second attempt.
- **Setup.** The new packages are in package.json and the lockfile. `scripts/start.mjs` reinstalls when `@remotion/three` is missing, so existing installs pick it up.
- **Unchanged.** Loading, Cancel, interruption, explicit Retry, no automatic repair, private source/logs and usage accounting were not touched.

## Native evidence

All native runs used the Claude subscription adapter, alias `sonnet`, effort low. In every run the chat handoff was controlled. These parts were real: smart inference, Edge narration (`en-US-AriaNeural`), the sandboxed render, SQLite/HTTP, restart and the browser player. Hardware: Intel i7-12700H, 16,368,893,952 bytes RAM, CPU (SwiftShader-class) WebGL, no GPU claim.

- **3D, dimension unspecified** ("Why Earth has seasons", 90 s requested). See [report](narrated-spatial-native-claude.json).
  - The model chose 3D.
  - Output: 68.03 s 640×360 H.264/AAC MP4, 3,444,550 bytes. 14 sentences, 181 Edge word boundaries, 28 caption groups.
  - Timing: Edge 2.533 s, render 122.802 s, request-to-ready 143.174 s.
  - Usage: input 887, output 2,651, cache-read 963. One inference call and one TTS call.
  - Restart served the media with no new calls.
  - The model still wrote fewer words than 90 s needs, so the length is inside the 1–2 minute target but about 76% of the requested 90 s.
- **2D, dimension unspecified** ("How a stack works", about 75 s implied by the intent). See [report](narrated-ordinary-native-claude.json).
  - The model chose 2D.
  - Output: 68.57 s, 18 sentences, 187 words.
  - Timing: render 99.213 s, request-to-ready 116.139 s.
  - Usage: input 1,749, output 2,295, cache-read 0.
- **Explicit 2D request.** The earlier Codex evidence still applies ([narrated-video.md](narrated-video.md)). The rule that a learner's or intent's dimension wins is in the worker instructions and asserted in HTTP tests. I did not re-run native Codex 2D because Codex was over quota.
- **Codex 3D attempt.** It failed before generation with "Subscription Sharing usage limit" ([record](narrated-spatial-native-codex.json)). The shared checks used Claude instead. There is no native Codex 3D claim.
- **Dimension choice is model behaviour, not a guarantee.** The wording went through four versions:

  | Wording | Spatial topic chose | Notes |
  |---|---|---|
  | v1, "3D only when…" | 2D (1 of 1) | |
  | v2, explicit spatial list | 2D (1 of 1) | |
  | v3, adds the label-overlay hint | 3D in 2 of 3 runs | One of those 3D runs hit the fence bug |
  | Final, "whenever…; do not substitute a flat diagram" | 3D in 2 of 2 runs | The ordinary topic chose 2D in 2 of 2 runs |

  The final sample is small and I make no reliability claim.

## Media inspection

- **Frames.** I inspected frames at 1, 20, 45 and 60 s ([frame](narrated-3d-frame.png)). They show real lit WebGL spheres, the tilted axis and the orbit ring, readable HTML titles, and embedded subtitles above the player controls.
- **Captions.** The caption visible at 1, 20 and 45 s matches the caption group in Edge's timing at that frame. At 60 s the timing has a gap and no caption is drawn, which is consistent.
- **Composition flaws (authored by the model).** The "Sun" label is partly hidden by the sun sphere. Around 45 s the Earth overlaps the legend and the subtitle band. The "JUNE" label is not tied to Earth's position. These are limits of the generated composition, not regressions in the app.
- **Audio.** I cannot listen, so I checked it numerically ([sync](narrated-3d-sync.json)):
  - I decoded the source MP3 and the MP4's AAC track and cross-correlated 2-second windows at 10, 30 and 55 s.
  - Every window had 0 ms lag at 1 ms resolution, with correlation of at least 0.99996.
  - The audio is 68.016 s in the MP3 and 68.053 s in the MP4.

  That shows the narration is present, intact and aligned. It says nothing about how natural the voice sounds.
- **Saved playback after restart.** The production app was restarted with a new store and opened the final 3D artifact in the real Chromium player ([playback](narrated-3d-playback.json)). The video decoded paused at 640×360 with controls and a 68.053 s duration, then played, sought and reloaded in dark and light with 0 inference and 0 TTS calls. The earlier passing 3D artifact (61.077 s) also passed the same check.

## Setup and gates

- **Clean checkout** ([setup](narrated-3d-clean-setup.json)): source and lockfile only. First `npm start` ran `npm ci`, downloaded the browser, built and returned HTTP 200 in 26.208 s. In that checkout the sandbox probe, a real 2D render and a real Three.js render passed (3 of 3). This is a supported Linux host that already has bubblewrap and Chromium's libraries; it is not a blank-OS claim.
- **`npm test`: 197/197, no skips.** It includes the token lint and these new checks:
  - the 3D allow-list, plus rejection of drei and loaders;
  - fence-after-header parsing;
  - the dimension and duration wording sent to the isolated worker;
  - a real sandboxed Three.js render whose centre pixel must be the cube's orange, so a blank WebGL frame fails.
- **Other gates.** `npm run build` passed with the existing chunk-size advisory. `git diff --check` passed.
- **Focused browser checks.** Recovery (Cancel/Retry/interruption) passed 7/7. Player/keyboard passed 13/13. The player check failed once: Escape on the video was reported as default-prevented. It passed on an immediate re-run. The frontend source did not change in this slice, so I recorded it as an intermittent existing flake.
- **npm audit.** Still the two existing low-severity KaTeX findings. The new packages add none.

## Limits

- Native evidence uses Claude only, because Codex was over quota.
- Rendering uses CPU WebGL. A roughly 68 s 3D video took about 123 s to render on this host. I make no speed comparison.
- 3D labels are HTML overlays, and the instructions ban file textures and loaders.
- The model's word count still falls short of long requested durations.
- Edge narration is online, so its availability and quota are outside the app's control.
- No broad E2E suite was added. Git is local only; Ralph owns the commit.
