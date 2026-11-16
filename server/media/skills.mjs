import { readFileSync } from 'node:fs';

// Hidden, fixed skills vendored from pinned upstream excerpts; sources and licences are in prompts/README.md.
const read = (name) =>
  readFileSync(new URL(`./prompts/${name}.md`, import.meta.url), 'utf8').trim();
export const TEACHING_SKILL = read('teaching');
export const HUMANIZER_SKILL = read('humanizer');
export const MANIM_TEACHING_SKILL = read('manim-teaching');
