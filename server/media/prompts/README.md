The visual worker prompt in `visual.md` adapts the task-first generative UI
guidance and the Interaction and quality, Data and calculations, and Controls and
layout guidance from CopilotKit/OpenIntelligentUI (MIT), retrieved 2026-11-11:

- https://github.com/CopilotKit/OpenIntelligentUI/blob/8391a94c1c3939c679e40ddd7bfc08a9ef690e70/apps/agent/src/prompt.py
- https://github.com/CopilotKit/OpenIntelligentUI/blob/8391a94c1c3939c679e40ddd7bfc08a9ef690e70/apps/agent/skills/advanced-visualization/SKILL.md

Its full copyright and permission notice is retained in
`OpenIntelligentUI-LICENSE.txt` and in the prompt file itself. The prompt uses rewritten guidance, with our own
TreeTutor fragment, theme, library, motion, accessibility and tagging rules.
The upstream streaming contract, parameter ordering, bridge calls, imports/CDNs,
maps/trip animator, query_data/A2UI, gsap and chart.js are excluded. The upstream
SVG-diagram skill and leaked or unlicensed prompts (including claude.ai widget
guidelines) were not used as sources.
