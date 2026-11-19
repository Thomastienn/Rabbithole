import { readFileSync } from 'node:fs';

// Hidden, fixed skills vendored from pinned upstream excerpts; sources and licences are in prompts/README.md.
const read = (name) =>
  readFileSync(new URL(`./prompts/${name}.md`, import.meta.url), 'utf8').trim();
// The everyday-analogy guidance is Rabbithole's own text, appended to the vendored teaching excerpt.
export const ANALOGY_SKILL = read('analogy');
export const TEACHING_SKILL = `${read('teaching')}\n\n${ANALOGY_SKILL}`;
export const HUMANIZER_SKILL = read('humanizer');
export const MANIM_TEACHING_SKILL = read('manim-teaching');
export const REMOTION_SKILL = read('remotion');
export const REMOTION_3D_SKILL = read('remotion-3d');
export const MANIM_SKILL = read('manim-practices');
export const VISUAL_SKILL = read('frontend-design');
// Loaded by the visual writer through load_skill.
export const THREEJS_SKILL = read('threejs');
export const MOTION_DESIGN_SKILL = read('motion-design');
// Rabbithole's own texts, not vendored.
export const HOUSE_STYLE_SKILL = read('house-style');
export const FOCAL_OBJECT_SKILL = read('focal-object');
