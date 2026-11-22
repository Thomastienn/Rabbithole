# Shortlist: open agent skills to vendor into TreeTutor's hidden guidance

Retrieved 2026-11-15. All facts below were checked against the primary GitHub repositories (via `gh api` and raw.githubusercontent.com at the pinned commit). Star counts are from the GitHub API on the retrieval date. Sizes are file bytes from the Git tree; tokens are estimated at about 4 bytes per token.

The constraints this shortlist filters for:

- Cut writers (`server/media/video-cut.mjs`, `server/media/manim-cut.mjs`) have no tools, files or network, produce one output in one shot, and may import only from a fixed list (Remotion: `react`, `remotion`, `./kit`, plus `@remotion/three`, `three`, `@react-three/fiber` for 3D; Manim: named objects from `kit` only).
- Visuals (`server/media/prompts/visual.md`) run in a no-network sandbox with only d3, THREE, katex and mermaid injected.
- The app fixes the palette and fonts (dark-paper ground `#1a1613`, paper text `#efe6d6`, Archivo and Literata). Generic advice about picking colours or fonts conflicts with this and must be cut.
- Attribution follows `server/media/prompts/README.md`: pinned blob URLs, the upstream licence text kept next to the prompt, rewritten guidance, and an explicit list of what was excluded.

## Slot 1: Remotion cut writing (`CUT_INSTRUCTIONS`)

**1. remotion-dev/skills, `remotion-markup` rule files (recommended)**

- Repo: `remotion-dev/skills` (7,260 stars). It is the official set and is generated from `remotion-dev/remotion/packages/skills`. Sources: https://github.com/remotion-dev/skills/blob/7e541aa4d7361dfaca0780a565a47307eb7bdfbb/README.md and https://github.com/remotion-dev/skills/blob/7e541aa4d7361dfaca0780a565a47307eb7bdfbb/package.json
- Commit: `7e541aa4d7361dfaca0780a565a47307eb7bdfbb` (skill version 4.0.543).
- Paths and sizes:
  - `skills/remotion-markup/3d.md`: 2.3 KB, about 600 tokens. https://github.com/remotion-dev/skills/blob/7e541aa4d7361dfaca0780a565a47307eb7bdfbb/skills/remotion-markup/3d.md
  - `skills/remotion-markup/timing.md`: 3.3 KB, about 850 tokens. https://github.com/remotion-dev/skills/blob/7e541aa4d7361dfaca0780a565a47307eb7bdfbb/skills/remotion-markup/timing.md
  - `skills/remotion-markup/SKILL.md`, "General rules" section only: about 2.5 KB of 13.8 KB. https://github.com/remotion-dev/skills/blob/7e541aa4d7361dfaca0780a565a47307eb7bdfbb/skills/remotion-markup/SKILL.md
- Licence: **not permissive, so flag it.** The skills repo has no LICENSE file, and GitHub reports no licence for it. Its source lives in the monorepo, whose root licence is the source-available "Remotion License". That licence is free for individuals, for-profits with up to 3 employees and non-profits, and requires a company licence otherwise. It forbids selling or relicensing derivatives of Remotion. It is not an SPDX/OSI licence. TreeTutor already depends on Remotion 4.0.542, so these terms already apply. The owner should still confirm that vendoring doc text into prompts is acceptable, and the attribution should cite the monorepo licence: https://github.com/remotion-dev/remotion/blob/b0c3781e6acc736aeaf2102511068094032ea061/LICENSE.md
- Fit:
  - `3d.md` states the rules the cut prompt already partly encodes. Wrap 3D content in `ThreeCanvas` with explicit `width`/`height` and include ambient and directional lighting. Nothing may animate by itself. `useFrame()` is forbidden. Drive rotation from `useCurrentFrame()`. Any `<Sequence>` inside `ThreeCanvas` needs `layout="none"`. That last rule is not in the current prompt.
  - `timing.md` covers clamped `interpolate()`, `Easing.bezier` and `Easing.spring`, multi-keyframe easing arrays, `output: 'perceptual-scale'` for scale, and `posterize`. Locally, `node_modules/remotion/dist/cjs/interpolate.d.ts` and `easing.d.ts` (4.0.542) declare `output`, `posterize`, `Easing.spring` and `Easing.bezier`, so the APIs match the installed version.
  - From "General rules", keep these: do not use CSS `transition`/`animation` or Tailwind animation classes (they do not render); use `fps` from `useVideoConfig()` for all seconds-to-frames conversion; keep `useCurrentFrame()` in the smallest component.
- Exclusions: install commands (`npx remotion add`); `Interactive.*` components and the Studio editability rationale; `staticFile`/`public/` assets; media, effects, fonts (Google/local), maps, captions, voiceover, lottie, gifs and FFmpeg; "Visual checks" and Studio/render steps; "Preserve user changes". Also exclude `transitions.md`, because the app owns cut-to-cut transitions in `server/media/video-kit.tsx` and cuts may not import `@remotion/transitions`. The router skill `remotion-best-practices` is tool and Studio workflow only, so skip it.

**2. remotion-dev/remotion, `template-prompt-to-motion-graphics` (runner-up)**

- Repo: `remotion-dev/remotion` (73,401 stars). Commit `b0c3781e6acc736aeaf2102511068094032ea061`.
- Paths:
  - `SYSTEM_PROMPT` in `packages/template-prompt-to-motion-graphics/src/app/api/generate/route.ts`: about 2.5 KB of a 21.6 KB file. https://github.com/remotion-dev/remotion/blob/b0c3781e6acc736aeaf2102511068094032ea061/packages/template-prompt-to-motion-graphics/src/app/api/generate/route.ts
  - `src/skills/{charts,spring-physics,sequencing}.md`: 2.5 to 2.8 KB each, about 2,000 tokens in total. https://github.com/remotion-dev/remotion/tree/b0c3781e6acc736aeaf2102511068094032ea061/packages/template-prompt-to-motion-graphics/src/skills
- Licence: Remotion License, as above. The template README says a company licence may be needed: https://github.com/remotion-dev/remotion/blob/b0c3781e6acc736aeaf2102511068094032ea061/packages/template-prompt-to-motion-graphics/README.md
- Fit: this is Remotion's own single-shot, no-tool code generator, the closest analogue to a cut writer. Useful parts: the "never shadow imports" reserved-names rule (`spring`, `interpolate`, ...), "always set the background from frame 0", "stagger multiple elements", and the chart rules (stagger bars by 3 to 5 frames, always label the axes).
- Exclusions: "ALWAYS use fontFamily: 'Inter'" and "2-4 colours" (conflict with the house kit); `COLORS` constants; the `MyAnimation` export name; imports from `@remotion/shapes`, `@remotion/transitions` and `useState/useEffect`; `messaging.md`, `social-media.md` and `typography.md`. Also exclude its `3d.md` example of `<ThreeCanvas>` without width/height, which contradicts candidate 1.

## Slot 2: Manim cut writing (`MANIM_INSTRUCTIONS`)

**1. adithya-s-k/manim_skill, `manimce-best-practices` (recommended)**

- Repo: `adithya-s-k/manim_skill` (1,319 stars; last push 2026-01-23). Commit `cef045011722d285692e3381d12d4d637da56e18`. https://github.com/adithya-s-k/manim_skill/tree/cef045011722d285692e3381d12d4d637da56e18/skills/manimce-best-practices
- Licence: MIT (root `LICENSE`, plus `skills/manimce-best-practices/LICENSE.txt`, © 2026 Adithya S Kolavi). https://github.com/adithya-s-k/manim_skill/blob/cef045011722d285692e3381d12d4d637da56e18/skills/manimce-best-practices/LICENSE.txt
- It targets ManimCE (`from manim import *`), which matches `server/media/manim-kit.py`.
- Paths and size: in `rules/`, `animations.md`, `transform-animations.md`, `animation-groups.md`, `latex.md`, `timing.md`, `updaters.md`, `positioning.md` and `grouping.md` total about 36 KB (about 9k tokens). That is too much to vendor whole. Vendor only the "Best Practices" sections plus a few key rules, about 5 to 7 KB (about 1.5k tokens). Example: https://github.com/adithya-s-k/manim_skill/blob/cef045011722d285692e3381d12d4d637da56e18/skills/manimce-best-practices/rules/latex.md
- Fit:
  - Use raw strings for LaTeX, and `MathTex` for math with `Tex` for mixed text.
  - Split equations and use `substrings_to_isolate` so parts can be coloured and transformed.
  - Choose between `Transform` and `ReplacementTransform`, and use `TransformMatchingTex`.
  - Use `LaggedStart` with `lag_ratio`.
  - Set `run_time` and `rate_func` on animations.
  - Use `ValueTracker` and `always_redraw` for live numbers.
  - Position with `next_to(buff=...)`.
  - All of these map onto objects the kit exports.
- Exclusions: `cli.md`, `config.md`, the Jupyter and install sections; `3d.md` and `camera.md` (the kit exposes only `HouseScene`, with no `ThreeDScene` or `MovingCameraScene`); `colors.md`, `styling.md` and the font advice in `text.md` (the house palette and fonts win); `from manim import *` and any API missing from the kit list (`TransformFromCopy`, `Succession`, `LaggedStartMap`, `MoveToTarget`). Add one line telling the model to use only kit names.
  - Risk: the repo has had no update for about 10 months. Re-check API names against the installed Manim.

**2. adithya-s-k/manim_skill, `manim-composer` references (runner-up, better for the planner)**

- Paths: `skills/manim-composer/references/visual-techniques.md` (5.6 KB) and `references/narrative-patterns.md` (3.5 KB). Same commit, same MIT licence. https://github.com/adithya-s-k/manim_skill/blob/cef045011722d285692e3381d12d4d637da56e18/skills/manim-composer/references/visual-techniques.md
- Fit: these hold teaching-oriented animation principles: progressive disclosure, "transform, don't replace", colour as meaning, spatial relationships, and pacing. Those suit `server/media/video-plan.mjs` (scene planning) more than the cut writer. Excerpt about 2 KB.
- Exclusions: the SKILL.md workflow (web research, asking the user questions, writing `scenes.md`); the "Color Palettes" section (3b1b, high contrast, soft academic).

**3. Yusuke710/manim-skill, timing-budget rules (optional addition)**

- Repo: `Yusuke710/manim-skill` (204 stars). Commit `a0048d9e265499038f34a9aa58ff16d306b5034c`. Licence MIT. https://github.com/Yusuke710/manim-skill/blob/a0048d9e265499038f34a9aa58ff16d306b5034c/skills/manim-skill/SKILL.md
- Fit: from the "Phase 3: Code" section, about 1 KB. Set an explicit `run_time=` on every `play()`. Keep the scheduled time within the narration budget. Close each segment with `self.wait(max(0, dur - used))`. Prefer `Tex` over `Text` for prose. This lines up with `self.sentences` and `self.audio_duration`.
- Exclusions: everything else, about 85% of the 7.4 KB file. That covers session folders, Kokoro TTS, `add_subcaption`, `config.pixel_*`, the render, mux and ffmpeg steps, and the viewer.

## Slot 3: Interactive HTML/SVG/d3/three.js visual fragments (`visual.md`)

Keep the existing CopilotKit/OpenIntelligentUI base (MIT, 4,240 stars, commit `8391a94c1c3939c679e40ddd7bfc08a9ef690e70`; see `server/media/prompts/README.md`). Add anti-slop rules from:

**1. anthropics/skills, `frontend-design` (recommended)**

- Repo: `anthropics/skills` (195,276 stars). Commit `1780c5e5a552fd4d1c9d6a7b0cab26b0c2bef064`. https://github.com/anthropics/skills/blob/1780c5e5a552fd4d1c9d6a7b0cab26b0c2bef064/skills/frontend-design/SKILL.md
- Licence: Apache-2.0, in the per-skill `LICENSE.txt`. The repo itself has no root licence according to GitHub. https://github.com/anthropics/skills/blob/1780c5e5a552fd4d1c9d6a7b0cab26b0c2bef064/skills/frontend-design/LICENSE.txt Attribution needed: ship a copy of the Apache-2.0 text, keep the copyright notices, and add a prominent statement that the files were modified (section 4). There is no NOTICE file in that directory.
- Size: 9.4 KB in total. The usable excerpt is about 3 KB (about 750 tokens).
- Fit:
  - "Visual structure is information": use numbered markers only for real sequences, and labels, dividers and outlines only when they carry information.
  - Non-user-triggered motion: one orchestrated moment, not fade-and-slide on everything. Motion that answers a user action is good.
  - Avoid typographic tells: no accenting a single word, no all-caps labels, no needless labels above content.
  - Of the clustered AI traits, keep item 4 (the SaaS-card kit: identical rounded cards, the same shadow, gradient washes) and item 5 (eyebrow labels, `A · B · C` meta strings, "WORD — fragment", a monospace face for data labels, `→` on links).
  - "Spend your boldness in one place" and the quality floor (keyboard focus, reduced motion).
  - The writing-in-design paragraphs: users' language, active voice, controls that name their action.
- Exclusions:
  - The design-lead persona and "take aesthetic risk".
  - Choosing typefaces, 4 to 6 hex palettes, the type scale, and the hero section.
  - The two-pass plan and confirming with the client (single shot, no dialogue).
  - Screenshots and self-critique loops.
  - **Traits 1 and 2** (warm cream with serif and terracotta; near-black with one acid accent). The house theme is a warm dark-paper ground with an amber accent, so these lines would push the model to fight the app's own palette.
  - The CSS specificity paragraph (fragments are small).

**2. pbakaus/impeccable, `craft-floor.md` "Refuse" list (runner-up)**

- Repo: `pbakaus/impeccable` (110,661 stars). Commit `2b86d9c07b97d4bed7de23583e1bd1e58dd2baae`. https://github.com/pbakaus/impeccable/blob/2b86d9c07b97d4bed7de23583e1bd1e58dd2baae/.agent/skills/impeccable/reference/craft-floor.md
- Licence: Apache-2.0, with a root `NOTICE.md`. The notice covers only `ios.md` and `android.md`, which derive from ehmo/platform-design-skills (MIT). It does not cover craft-floor, but cite it anyway. https://github.com/pbakaus/impeccable/blob/2b86d9c07b97d4bed7de23583e1bd1e58dd2baae/NOTICE.md
- Size: the file is 4.5 KB. The usable excerpt is about 1.2 KB (about 300 tokens).
- Fit: these refusals apply directly to chat fragments:
  - gradient text;
  - glass and blur used as decoration;
  - a coloured `border-left` above 1px on callouts;
  - hard offset shadows;
  - sparklines and progress rings standing in for content;
  - monospace as a costume;
  - emoji or Unicode glyphs as icons;
  - nested cards;
  - the hero-metric template;
  - eyebrow kickers.
- The contrast floor also fits (≥4.5:1 body text, ≥3:1 large text).
- Exclusions: rendered-result "Verify" loops (no screenshots); theming browser surfaces such as scrollbars and selection (the app owns them); "source and self-host a face"; picking light or dark; the design-hook references; and the rest of the skill (live mode, critique, document). Its references are page- and product-design oriented.

## Slot 4: Teaching like a good human teacher (`TUTOR_RULES` in `server/media/tutor-instructions.mjs`)

**1. nweii/agent-stuff, `teach-me` (recommended)**

- Repo: `nweii/agent-stuff` (10 stars, so low popularity). Commit `8a76a190d0a4a9b58788c8dbf2d418e258d060c5`. Licence MIT. https://github.com/nweii/agent-stuff/blob/8a76a190d0a4a9b58788c8dbf2d418e258d060c5/skills/teach-me/SKILL.md Its metadata credits a Socratic prompt by an Anthropic staffer, Anthropic's `learn` skill and Matt Pocock's `teach`. Those were synthesized, not copied.
- Size: 5.4 KB. The usable excerpt is about 3 KB (about 750 tokens).
- Fit: this one is about teacher behaviour, not workspace files.
  - "Locate the learner first": one calibrating question, and skip it when the message already shows where the learner stands.
  - Have the learner restate their understanding before you fill gaps.
  - Quizzes: vary where the correct answer sits.
  - A visual that solves the whole problem gives the answer away, so show one piece. Using a visual on every turn turns it into decoration.
  - The what, how and why-it-matters checklist; stop probing once the learner understands.
  - Tone: warm and direct, no "great question", praise only what is specific and earned, and admit shaky reasoning.
- Exclusions: the "Capturing anything durable" and walkthrough/durable-learning files (the memory note is handled separately). "Move one step per turn" and "Hold the line" are too Socratic for a tutor that should explain when asked; soften them to "when the learner is working a problem".

**2. mattpocock/skills, `teach` (runner-up for principles)**

- Repo: `mattpocock/skills` (325,020 stars). Commit `5863806dd4e15c63174bee4e7515a4256792ecfa`. Licence MIT. https://github.com/mattpocock/skills/blob/5863806dd4e15c63174bee4e7515a4256792ecfa/skills/productivity/teach/SKILL.md
- Size: 9.7 KB. The usable excerpt is about 1.5 KB.
- Fit: the fluency versus storage-strength distinction (retrieval, spacing, interleaving); "difficulty is the enemy" when acquiring knowledge but the tool when practising skills; small working memory, one tangible win per step; the zone of proximal development; and quiz answers of equal length with the correct position varied (this also fits the predict-then-reveal visuals).
- Exclusions: the whole workspace model (`MISSION.md`, lessons, assets, learning records, `NOTES.md`), HTML lessons, "open the lesson by running a CLI command", "never trust your parametric knowledge" (conflicts with a tutor without tools), and the community or wisdom delegation.

**3. EveryInc/compound-engineering-plugin, `ce-explain` (narrow add-on)**

- Repo: `EveryInc/compound-engineering-plugin` (26,110 stars). Commit `ee46dde75a40e297bd8eac4055a410a771d3ac1d`. Licence MIT. https://github.com/EveryInc/compound-engineering-plugin/blob/ee46dde75a40e297bd8eac4055a410a771d3ac1d/skills/ce-explain/SKILL.md https://github.com/EveryInc/compound-engineering-plugin/blob/ee46dde75a40e297bd8eac4055a410a771d3ac1d/skills/ce-explain/references/check-in.md
- Fit (about 1 KB): from Phase 3, separate verified fact, inference and unknown; disclose selection rather than present a partial account as complete. From `check-in.md`, test application rather than recall of the wording, and make each answer name the gap that a plausible wrong answer exposes.
- Exclusions: almost everything else. That covers repo evidence gathering, subagents, artifact roots, shell blocks, publishing, and static-only check-ins (which conflict with the predict-then-reveal `details`). It is built for explaining code and work history, not for tutoring.

## Slot 5: Humanizing prose (removing AI writing tells)

**1. blader/humanizer (recommended; this is the upstream of the local `~/.claude/skills/humanizer`)**

- Repo: `blader/humanizer` (69,432 stars). Licence MIT (© 2025 Siqi Chen). https://github.com/blader/humanizer/blob/b48c832f0f809c1b5658edbb838c2521b72f2413/LICENSE
- Local copy: `~/.claude/skills/humanizer` is byte-identical to tag **v3.1.0** (`225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8`). Upstream HEAD is v4.0.0 (`b48c832f0f809c1b5658edbb838c2521b72f2413`, 2026-11-10). https://github.com/blader/humanizer/blob/225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8/SKILL.md
- **Pin v3.1.0.** v4.0.0 changed step 2 to "Where the text is generic, add a specific detail you know to be true" (commit "Allow added specifics..."). That conflicts with a tutor that must not invent facts. v3.1.0 says to add nothing unless it comes from the source. https://github.com/blader/humanizer/blob/b48c832f0f809c1b5658edbb838c2521b72f2413/SKILL.md
- Size: SKILL.md is 32 KB (about 8k tokens), too large for every turn. Vendor the six group summaries (A Staging, B Rhythm by rule, C Inflation, D Formatting by rule, E Leftovers, F Wrong reader), the 26 pattern names with a one-line rule each, and "When not to act". That comes to about 4 to 5 KB (about 1.2k tokens).
- Fit: rephrase the editing skill as generation rules for the tutor. No not-X-but-Y contrasts, no one-line closers, no forced triads, no dashes everywhere, no stock AI words, no bold labels, no chatbot residue, and no re-explaining what the learner already knows.
- Exclusions: "How to work" steps 1 to 4 (a rewrite loop; the tutor writes once); file, pasted and embedded modes; matching a voice sample; and all the before/after example blocks.
- Licence note: the skill credits Wikipedia's "Signs of AI writing" as the source of its patterns. That page is CC BY-SA 4.0. Humanizer's text is its own MIT rewrite, and ideas are not copyrightable. To stay clear of share-alike, vendor only Humanizer's wording, not text from the Wikipedia page, and drop the example passages. https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing · https://en.wikipedia.org/wiki/Wikipedia:Copyrights

**2. conorbronsdon/avoid-ai-writing (runner-up)**

- Repo: `conorbronsdon/avoid-ai-writing` (5,663 stars). Commit `cc1d34319b4cc599bf503b80d35d7442bcde8047`. Version 3.38.0. Licence MIT, with a `NOTICE.md` naming Conor Bronsdon and a packaging co-author. https://github.com/conorbronsdon/avoid-ai-writing/blob/cc1d34319b4cc599bf503b80d35d7442bcde8047/SKILL.md https://github.com/conorbronsdon/avoid-ai-writing/blob/cc1d34319b4cc599bf503b80d35d7442bcde8047/NOTICE.md
- Size: SKILL.md is 33 KB, and `SKILL.full.md` is 158 KB. Excerpt the P0 and P1 severity tiers and "Never inject these", about 3 to 4 KB.
- Fit: its severity tiers (P0 credibility killers, P1 obvious AI smell) help pick which rules earn the always-on slot.
- Exclusions: modes (detect, edit, iterate), `--style` configs, voice profiles and output formats. Prefer Humanizer as the base, because it is more popular and is already the owner's tool.

## Not used / rejected

- **Wikipedia "Signs of AI writing" vendored directly.** It is CC BY-SA 4.0 (share-alike would attach to the prompt) and 182 KB. Use it through Humanizer instead. https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing
- **jwynia/agent-skills `gentle-teaching`** (189 stars, commit `e02ec7e2`). The frontmatter says `license: MIT`, but the repo has no LICENSE file and GitHub reports none, so the licence is ambiguous. Its core rule ("redirect direct-solution requests to guided learning", "don't solve equations") conflicts with a tutor that explains on request. The scaffold levels overlap with teach-me. https://github.com/jwynia/agent-skills/blob/e02ec7e226a6e4f8419fd3b88a1d8e472d421b32/skills/general/education/gentle-teaching/SKILL.md
- **anthropics/claude-plugins-official `learning-output-style`** (Apache-2.0). It is a session hook that makes the human write code. It is not tutoring guidance. https://github.com/anthropics/claude-plugins-official/tree/b5b01ac4f889fec0c4c6bb89f27ca7c8574473f6/plugins/learning-output-style
- **HKUDS/DeepTutor** (59,453 stars, Apache-2.0). Its prompts are agent plumbing (tool loops, runtime snapshots), not reusable teaching guidance. https://github.com/HKUDS/DeepTutor/blob/4c1e000d8563c5ac3b231baaaf149dc4dc4d2406/deeptutor/agents/chat/prompts/en/agentic_chat.yaml
- **haiderfarooq3/khan-explainer** (161 stars, MIT). It is a renderer workflow (Playwright, macOS `say`, ffmpeg), not teaching or cut guidance. https://github.com/haiderfarooq3/khan-explainer/blob/326bf9b5332bb30a09e9d11f0ba81e30e7a0e81f/SKILL.md
- **iart-ai/motion-skills and iart-ai/manim-skills** (1,572 and 20 stars, MIT). The umbrella repo holds only a README pointing to 19 packs. The packs are built around render, screenshot and check loops (they need tools) and promote iart.ai. https://github.com/iart-ai/motion-skills/blob/9b9ce041932da787cc856d4cdf23afb6cd13d4bf/README.md
- **CloudAI-X/threejs-skills** (4,210 stars, MIT). These are 18 to 30 KB API references per topic, written around ES-module imports and import maps. Visuals get a global THREE and no imports, and cuts must drive 3D through Remotion. Too large for the value. https://github.com/CloudAI-X/threejs-skills/tree/0e181866f095b5f06d005133876e926515390d95/skills
- **adithya-s-k/manim_skill `manimgl-best-practices`.** It targets ManimGL (`manimlib`), but TreeTutor uses ManimCE.
- **anthropics/skills `canvas-design`, `algorithmic-art`, `web-artifacts-builder`.** They rely on bundled fonts, p5.js or shadcn build scripts, which conflicts with the sandbox and house theme. https://github.com/anthropics/skills/tree/1780c5e5a552fd4d1c9d6a7b0cab26b0c2bef064/skills
- **remotion-dev/skills `remotion-best-practices` router, `remotion-create`, `-studio`, `-render`, `-maps`, `-captions`.** They cover tool, Studio, render or network workflows, or features the app owns (subtitles).
- **Leaked or unlicensed prompts (for example claude.ai widget guidelines).** Not used, as before (`server/media/prompts/README.md`).
