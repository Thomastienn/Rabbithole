The visual worker prompt in `visual.md` adapts the task-first generative UI
guidance and the Interaction and quality, Data and calculations, and Controls and
layout guidance from CopilotKit/OpenIntelligentUI (MIT), retrieved 2026-11-11:

- https://github.com/CopilotKit/OpenIntelligentUI/blob/8391a94c1c3939c679e40ddd7bfc08a9ef690e70/apps/agent/src/prompt.py
- https://github.com/CopilotKit/OpenIntelligentUI/blob/8391a94c1c3939c679e40ddd7bfc08a9ef690e70/apps/agent/skills/advanced-visualization/SKILL.md

Its full copyright and permission notice is retained in
`OpenIntelligentUI-LICENSE.txt` and in the prompt file itself. The prompt uses rewritten guidance, with our own
Rabbithole fragment, theme, library, motion, accessibility and tagging rules.
The upstream streaming contract, parameter ordering, bridge calls, imports/CDNs,
maps/trip animator, query_data/A2UI, gsap and chart.js are excluded. The upstream
SVG-diagram skill and leaked or unlicensed prompts (including claude.ai widget
guidelines) were not used as sources.

## Hidden skills

Fixed skill excerpts loaded by `server/media/skills.mjs`. Each is rewritten and
shortened guidance from a pinned upstream commit, retrieved 2026-11-15 and
licence re-checked at that commit on 2026-11-16. Each upstream copyright and
permission notice is kept beside the prompt.

- `teaching.md` (tutor and video planner):
  - nweii/agent-stuff `skills/teach-me/SKILL.md` (MIT, © 2025 Nathan Cheng;
    `teach-me-LICENSE.txt`), commit `8a76a190d0a4a9b58788c8dbf2d418e258d060c5`:
    https://github.com/nweii/agent-stuff/blob/8a76a190d0a4a9b58788c8dbf2d418e258d060c5/skills/teach-me/SKILL.md
    Softened so the tutor explains directly when asked: "Move one step per
    turn" and "Hold the line under pressure" apply only while the learner works
    a problem, and quiz answers are not withheld. Excluded: the walkthrough and
    durable-learning files, "Capturing anything durable", "What you're teaching
    about", grounding the session in the learner's motive, and the
    deadline/impatience rule.
  - EveryInc/compound-engineering-plugin `skills/ce-explain/SKILL.md` (MIT,
    © 2025 Every; `ce-explain-LICENSE.txt`), commit
    `ee46dde75a40e297bd8eac4055a410a771d3ac1d`, Phase 3 only (fact, inference
    and unknown; disclose selection):
    https://github.com/EveryInc/compound-engineering-plugin/blob/ee46dde75a40e297bd8eac4055a410a771d3ac1d/skills/ce-explain/SKILL.md
    Excluded: everything else (evidence gathering, subagents, artifact roots,
    shell blocks, publishing, check-in files).
  - Trimmed to its core rules for the lean tutor prompt (Rabbithole-tcl.6):
    one short paragraph per habit, without the examples and asides.
- `humanizer.md` (tutor and video planner): blader/humanizer v3.1.0 `SKILL.md`
  (MIT, © 2025 Siqi Chen; `humanizer-LICENSE.txt`), commit
  `225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8`:
  https://github.com/blader/humanizer/blob/225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8/SKILL.md
  Kept: the six group summaries, the 26 pattern names, each recast as a
  one-line writing rule, the "add no fact" rule and a shortened "When not to
  act". Excluded: "How to work", voice matching, the return modes, the word
  lists beyond a few examples, and every before/after example. v4.0.0 is not
  used because it allows added specifics. The Wikipedia "Signs of AI writing"
  page (CC BY-SA 4.0) that Humanizer credits was not copied. Trimmed for the
  lean tutor prompt (Rabbithole-tcl.6): the 26 rules are folded into five
  one-line groups (the "wrong reader" rule joins the leftovers).
- `manim-teaching.md` (video planner, scoped to Manim cuts):
  adithya-s-k/manim_skill `skills/manim-composer/references/visual-techniques.md`
  and `narrative-patterns.md` (MIT, © 2026 Adithya S Kolavi;
  `manim_skill-LICENSE.txt`), commit `cef045011722d285692e3381d12d4d637da56e18`:
  https://github.com/adithya-s-k/manim_skill/blob/cef045011722d285692e3381d12d4d637da56e18/skills/manim-composer/references/visual-techniques.md
  https://github.com/adithya-s-k/manim_skill/blob/cef045011722d285692e3381d12d4d637da56e18/skills/manim-composer/references/narrative-patterns.md
  Excluded: the SKILL.md workflow, code snippets, the named colours (palette
  roles replace them), 3D techniques (Manim cuts are 2D), the colour palettes,
  timing and pacing tables, opening hooks and the emotional arc.

### Media craft skills

Retrieved and licence re-checked at the pinned commits on 2026-11-16 (via
`gh api`). Each excerpt is rewritten and shortened, with code examples dropped.

- `remotion.md` (Remotion cut writer, set-piece writer and piece improvement)
  and `remotion-3d.md` (added only for cuts planned as 3D): remotion-dev/skills
  `skills/remotion-markup/SKILL.md` ("General rules" only), `timing.md` and
  `3d.md`, commit `7e541aa4d7361dfaca0780a565a47307eb7bdfbb` (skill version
  4.0.543):
  https://github.com/remotion-dev/skills/blob/7e541aa4d7361dfaca0780a565a47307eb7bdfbb/skills/remotion-markup/SKILL.md
  https://github.com/remotion-dev/skills/blob/7e541aa4d7361dfaca0780a565a47307eb7bdfbb/skills/remotion-markup/timing.md
  https://github.com/remotion-dev/skills/blob/7e541aa4d7361dfaca0780a565a47307eb7bdfbb/skills/remotion-markup/3d.md
  The skills repository has no licence file of its own; it is generated from
  the Remotion monorepo, whose Remotion License (source-available, free for
  individuals, small companies and non-profits; © 2026 Remotion) applies and is
  kept in `remotion-LICENSE.md`, from commit
  `b0c3781e6acc736aeaf2102511068094032ea061`:
  https://github.com/remotion-dev/remotion/blob/b0c3781e6acc736aeaf2102511068094032ea061/LICENSE.md
  Rabbithole already uses Remotion under the same licence. Excluded: install
  commands, `Interactive.*` components and every Studio-editability rule
  (inline interpolations, transform shorthands, timeline structure), the
  example colours, assets, media, fonts, maps, captions, voiceover, effects,
  "Preserve user changes", visual checks, `transitions.md` (the app owns
  transitions) and all other rule files. The excerpt holds no font or colour
  advice; the house kit fixes both.
- `manim-practices.md` (Manim cut writer, repairs and fixes):
  adithya-s-k/manim_skill `skills/manimce-best-practices/rules/*.md`, the
  "Best Practices" sections of animations, creation-animations,
  transform-animations, animation-groups, grouping, latex, text, positioning,
  updaters, axes, graphing, shapes and lines (MIT, © 2026 Adithya S Kolavi;
  `manim_skill-LICENSE.txt`, identical to the skill's own `LICENSE.txt`),
  commit `cef045011722d285692e3381d12d4d637da56e18`:
  https://github.com/adithya-s-k/manim_skill/tree/cef045011722d285692e3381d12d4d637da56e18/skills/manimce-best-practices/rules
  Excluded: `3d.md`, `camera.md`, `colors.md`, `styling.md`, `config.md`,
  `cli.md`, scenes, text animations, mobjects, colour advice inside other
  sections (graph colours, MarkupText colours), font installation, and any
  object the kit does not export (Succession, TransformFromCopy, Uncreate,
  RegularPolygon, RoundedRectangle, Vector, DashedLine, there_and_back,
  ease_out_bounce).
- `frontend-design.md` (visual writer, after `visual.md`): anthropics/skills
  `skills/frontend-design/SKILL.md` (Apache-2.0; full text in
  `frontend-design-LICENSE.txt`; no NOTICE file upstream), commit
  `1780c5e5a552fd4d1c9d6a7b0cab26b0c2bef064`:
  https://github.com/anthropics/skills/blob/1780c5e5a552fd4d1c9d6a7b0cab26b0c2bef064/skills/frontend-design/SKILL.md
  **This file was changed** (Apache-2.0 section 4(b)): it is a rewritten,
  shortened excerpt of the visual-structure, motion, typographic-tells,
  restraint, quality-floor and writing guidance, keeping clustered traits 4
  and 5 only. Excluded: the design-lead persona and aesthetic risk, subject
  grounding and client confirmation, the hero, typeface, type-scale and palette
  choices, traits 1 and 2 (they resemble the house dark-paper and amber look)
  and trait 3, the two-pass plan, CSS specificity, screenshots and self-critique
  notes.

### Loadable visual skills

The visual writer loads these with its `load_skill` tool (`server/media/visuals.mjs`);
the server rejects a fragment that uses three.js or animation without the
matching skill once and retries with it in the prompt. Retrieved and licence
checked at the pinned commits on 2026-11-19 (via `gh api`). Each excerpt is
rewritten and shortened, with code examples dropped.

- `threejs.md`: CloudAI-X/threejs-skills
  `skills/threejs-fundamentals/SKILL.md`, "Quick Start", "Cleanup",
  "Performance" and "Common Mistakes" (MIT, © 2026 CloudAI-X;
  `threejs-skills-LICENSE.txt`), commit
  `0e181866f095b5f06d005133876e926515390d95`:
  https://github.com/CloudAI-X/threejs-skills/blob/0e181866f095b5f06d005133876e926515390d95/skills/threejs-fundamentals/SKILL.md
  Adapted to the preloaded `THREE` global. Excluded: imports and import maps,
  WebGPU and TSL, cameras other than the perspective camera, ArrayCamera and
  CubeCamera, the math, loading-manager and LOD sections, and the other skills.
- `motion-design.md`: LottieFiles/motion-design-skill
  `skills/motion-design/reference/quality-checklist.md` and
  `timing-easing-tables.md` (MIT, © 2025 LottieFiles;
  `motion-design-skill-LICENSE.txt`), commit
  `2e1f3c052dd70c60b598413e2fc5d7704d9e9896`:
  https://github.com/LottieFiles/motion-design-skill/blob/2e1f3c052dd70c60b598413e2fc5d7704d9e9896/skills/motion-design/reference/quality-checklist.md
  https://github.com/LottieFiles/motion-design-skill/blob/2e1f3c052dd70c60b598413e2fc5d7704d9e9896/skills/motion-design/reference/timing-easing-tables.md
  The d3 easing names are Rabbithole's. Excluded: brand personality and
  emotional-quality items, the personality, material, spring and Apple tables,
  severity tiers, `SKILL.md` and the director, pattern and export files.

### Rabbithole's own texts

Written for Rabbithole, not vendored; no upstream licence applies.

- `house-style.md` (video planner, set-piece writer, piece improvement,
  Remotion cut writers, Remotion cut audit and visual writer): detailed flat
  illustration in 2D, stylised Blender-like modelling in 3D.
- `focal-object.md` (video planner, Remotion cut writers and Remotion cut
  audit): one focal object at a time, unlabelled overviews, short-lived labels.
  Manim prompts and the Manim audit get neither text.
- `analogy.md` (appended to the teaching skill, so tutor replies and video
  narration get it, and given to the visual writer): open a new or abstract
  concept with an everyday analogy, map it, say where it breaks down, and skip
  it for quick facts, casual turns and known concepts. Discussion prompts do
  not get it.
