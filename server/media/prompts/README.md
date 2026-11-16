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
- `humanizer.md` (tutor and video planner): blader/humanizer v3.1.0 `SKILL.md`
  (MIT, © 2025 Siqi Chen; `humanizer-LICENSE.txt`), commit
  `225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8`:
  https://github.com/blader/humanizer/blob/225a6f39ac85f76ee48dbad772ea4abe4ed6c9d8/SKILL.md
  Kept: the six group summaries, the 26 pattern names, each recast as a
  one-line writing rule, the "add no fact" rule and a shortened "When not to
  act". Excluded: "How to work", voice matching, the return modes, the word
  lists beyond a few examples, and every before/after example. v4.0.0 is not
  used because it allows added specifics. The Wikipedia "Signs of AI writing"
  page (CC BY-SA 4.0) that Humanizer credits was not copied.
- `manim-teaching.md` (video planner, scoped to Manim cuts):
  adithya-s-k/manim_skill `skills/manim-composer/references/visual-techniques.md`
  and `narrative-patterns.md` (MIT, © 2026 Adithya S Kolavi;
  `manim_skill-LICENSE.txt`), commit `cef045011722d285692e3381d12d4d637da56e18`:
  https://github.com/adithya-s-k/manim_skill/blob/cef045011722d285692e3381d12d4d637da56e18/skills/manim-composer/references/visual-techniques.md
  https://github.com/adithya-s-k/manim_skill/blob/cef045011722d285692e3381d12d4d637da56e18/skills/manim-composer/references/narrative-patterns.md
  Excluded: the SKILL.md workflow, code snippets, the named colours (palette
  roles replace them), 3D techniques (Manim cuts are 2D), the colour palettes,
  timing and pacing tables, opening hooks and the emotional arc.
