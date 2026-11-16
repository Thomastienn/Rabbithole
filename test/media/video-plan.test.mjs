import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  videoPlan,
  cutSource,
  cutJoin,
  CUT_PAUSE_FRAMES,
  PLAN_INSTRUCTIONS,
} from '../../server/media/video-plan.mjs';
import { planFor, composition, spatial, styleBrief } from '../support/video-kit.mjs';
import {
  MANIM_TEACHING_SKILL,
  HOUSE_STYLE_SKILL,
  FOCAL_OBJECT_SKILL,
} from '../../server/media/skills.mjs';
import {
  CUT_INSTRUCTIONS,
  PIECES_INSTRUCTIONS,
  PIECE_IMPROVE_INSTRUCTIONS,
  AUDIT_INSTRUCTIONS,
} from '../../server/media/video-cut.mjs';
import { MANIM_INSTRUCTIONS, MANIM_AUDIT_INSTRUCTIONS } from '../../server/media/manim-cut.mjs';

test('the planner carries Manim teaching notes scoped to Manim cuts only', () => {
  assert.ok(PLAN_INSTRUCTIONS.endsWith(MANIM_TEACHING_SKILL));
  assert.match(
    MANIM_TEACHING_SKILL,
    /^Manim teaching notes[^\n]*engine "manim"[^\n]*ignore them when the plan has none/,
  );
});

test('the house style and focal-object rule reach the planner and Remotion writers, never Manim', () => {
  assert.match(HOUSE_STYLE_SKILL, /detailed flat illustration/);
  assert.match(HOUSE_STYLE_SKILL, /Blender/);
  assert.match(FOCAL_OBJECT_SKILL, /one focal object/);
  assert.match(FOCAL_OBJECT_SKILL, /unlabelled/);
  assert.match(FOCAL_OBJECT_SKILL, /fade it once its point has landed/);
  for (const prompt of [PLAN_INSTRUCTIONS, CUT_INSTRUCTIONS, AUDIT_INSTRUCTIONS]) {
    assert.ok(prompt.includes(HOUSE_STYLE_SKILL));
    assert.ok(prompt.includes(FOCAL_OBJECT_SKILL));
  }
  for (const prompt of [PIECES_INSTRUCTIONS, PIECE_IMPROVE_INSTRUCTIONS])
    assert.ok(prompt.includes(HOUSE_STYLE_SKILL));
  assert.match(CUT_INSTRUCTIONS, /vary layout and metaphor between videos, never the house style/);
  assert.doesNotMatch(CUT_INSTRUCTIONS, /different videos look different/);
  // The audit flags off-style objects and crowding labels as a preference, without a count.
  assert.match(
    AUDIT_INSTRUCTIONS,
    /labels crowding the focal object, a preference rather than a count/,
  );
  assert.match(AUDIT_INSTRUCTIONS, /objects drawn outside the house style/);
  // A reused library piece drawn off-style is flagged for redraw, not only the cut.
  assert.match(AUDIT_INSTRUCTIONS, /unreadable at its size, or drawn outside the house style\)/);
  for (const prompt of [MANIM_INSTRUCTIONS, MANIM_AUDIT_INSTRUCTIONS])
    assert.ok(!prompt.includes(HOUSE_STYLE_SKILL) && !prompt.includes(FOCAL_OBJECT_SKILL));
});

test('compact plan validates the brief and ordered cuts, including the Manim engine', () => {
  const good = planFor(composition, 3);
  assert.deepEqual(videoPlan(JSON.stringify(good)), good);
  good.cuts[1].engine = 'manim';
  assert.deepEqual(videoPlan('```json\n' + JSON.stringify(good) + '\n```'), good);
  good.cuts[2].dimension = '3d';
  assert.deepEqual(videoPlan(JSON.stringify(good)), good);
  // A neutral object needs no colorRole; models send null or omit it.
  good.styleBrief.recurringObjects[0].colorRole = null;
  assert.deepEqual(videoPlan(JSON.stringify(good)), good);
  delete good.styleBrief.recurringObjects[0].colorRole;
  assert.deepEqual(videoPlan(JSON.stringify(good)), good);
  assert.match(
    PLAN_INSTRUCTIONS,
    /request is the learner's own message[\s\S]*dimension of "2d" or "3d"[\s\S]*explicitly asks for 2D, use "2d" for every cut[\s\S]*explicitly asks for 3D, use "3d" for most cuts[\s\S]*"3d" only for a cut whose point is space, depth, rotation or orientation[\s\S]*Manim cuts are always "2d"/,
  );
  for (const mutate of [
    (p) => {
      p.title = '';
    },
    (p) => {
      p.description = 'x'.repeat(281);
    },
    (p) => {
      p.styleBrief = null;
    },
    (p) => {
      p.styleBrief.layoutAreas = [];
    },
    (p) => {
      p.styleBrief.layoutAreas[0].description = 12;
    },
    (p) => {
      p.styleBrief.paletteRoles = {};
    },
    (p) => {
      p.styleBrief.paletteRoles.winner = 'red';
    },
    (p) => {
      p.styleBrief.paletteRoles = ['amber'];
    },
    (p) => {
      p.styleBrief.recurringObjects[0].position = '';
    },
    (p) => {
      p.styleBrief.recurringObjects[0].colorRole = 'missing';
    },
    (p) => {
      p.styleBrief.exactTerms = [''];
    },
    (p) => {
      p.cuts = [];
    },
    (p) => {
      p.cuts[0].narration = '';
    },
    (p) => {
      p.cuts[0].engine = 'other';
    },
    (p) => {
      p.cuts[0].endState = '';
    },
    (p) => {
      delete p.cuts[0].dimension;
    },
    (p) => {
      p.cuts[0].dimension = '4d';
    },
    (p) => {
      p.cuts[1].engine = 'manim';
      p.cuts[1].dimension = '3d';
    },
  ]) {
    const bad = structuredClone(good);
    mutate(bad);
    assert.throws(() => videoPlan(JSON.stringify(bad)), /malformed/);
  }
  for (const raw of ['not json', 'null', '[]', '{}']) assert.throws(() => videoPlan(raw));
  const undimensioned = structuredClone(good);
  delete undimensioned.cuts[1].dimension;
  assert.throws(() => videoPlan(JSON.stringify(undimensioned)), /malformed: cut 2 dimension\.$/);
  assert.throws(() => videoPlan('not json'), /malformed: not a JSON object\.$/);
  assert.match(PLAN_INSTRUCTIONS, /"engine":"remotion","dimension":"2d"/);
  assert.throws(() => videoPlan(' '.repeat(65537)), /64 KiB/);
  assert.equal(CUT_PAUSE_FRAMES, 15);
});

test('plan joins accept continue and scene transitions, reject unknown values, and old plans read as scene with fade', () => {
  const good = planFor(composition, 4);
  Object.assign(good.cuts[0], { join: 'scene', transition: 'iris' });
  good.cuts[1].join = 'continue';
  Object.assign(good.cuts[2], { join: 'scene', transition: 'wipe', direction: 'from-top-left' });
  Object.assign(good.cuts[3], { transition: 'slide', direction: 'from-right' });
  assert.deepEqual(videoPlan(JSON.stringify(good)), good);
  assert.deepEqual(good.cuts.map(cutJoin), [
    { join: 'scene', transition: 'iris' },
    { join: 'continue' },
    { join: 'scene', transition: 'wipe', direction: 'from-top-left' },
    { join: 'scene', transition: 'slide', direction: 'from-right' },
  ]);
  const old = planFor(composition, 2);
  assert.deepEqual(videoPlan(JSON.stringify(old)), old);
  assert.deepEqual(old.cuts.map(cutJoin), [
    { join: 'scene', transition: 'fade' },
    { join: 'scene', transition: 'fade' },
  ]);
  for (const cut of [
    { join: 'cut' },
    { join: 'scene', transition: 'dissolve' },
    { join: 'scene', transition: 'slide', direction: 'from-top-left' },
    { join: 'scene', transition: 'fade', direction: 'from-left' },
    { join: 'continue', transition: 'fade' },
  ]) {
    const bad = structuredClone(old);
    Object.assign(bad.cuts[1], cut);
    assert.throws(() => videoPlan(JSON.stringify(bad)), /malformed/, JSON.stringify(cut));
  }
  const first = structuredClone(old);
  first.cuts[0].join = 'continue';
  assert.throws(() => videoPlan(JSON.stringify(first)), /malformed/, 'cut 1 is always a scene');
  assert.match(PLAN_INSTRUCTIONS, /"join":"scene","transition":"slide","direction":"from-right"/);
  assert.match(PLAN_INSTRUCTIONS, /"continue" .*hard cut.*cut 1 is always "scene"/);
  assert.match(PLAN_INSTRUCTIONS, /"fade", "slide", "wipe", "flip", "clockWipe" or "iris"/);
});

test('cut validation enforces kit imports, brief inks and house fonts before rendering', () => {
  const code = `import {colors, palette, fonts, type} from './kit';
export default () => <div style={{background:palette.ground,color:colors.winner,fontFamily:fonts.heading}}>Winner</div>;`;
  for (const source of [
    code,
    composition,
    spatial,
    code.replace('colors.winner', 'palette.amber'),
    code.replace('colors.winner', "'#dfae4e'"),
    code.replace('fonts.heading', 'fonts.reading'),
    code.replace('colors,', 'colors as inks,').replace('colors.winner', 'inks.winner'),
    code.replace('<div ', '<div hidden '),
    // Expressions built from kit values pass; real cuts use props, templates, series and helpers.
    code.replace('colors.winner', 'props.tint'),
    code.replace('colors.winner', 'series[0]'),
    code.replace('colors.winner', 'on && colors.winner'),
    code.replace('colors.winner', 'interpolateColors(0, [0, 1], [colors.winner, palette.paper])'),
    code.replace('background:palette.ground', 'border:`2px solid ${palette.line}`'),
    code.replace('background:palette.ground', 'border:0'),
    code.replace('fonts.heading', '`600 32px ${fonts.heading}`'),
  ])
    assert.equal(cutSource(source, styleBrief), source);
  for (const source of [
    code.replace('colors.winner', 'palette.leaf'),
    code.replace('colors.winner', 'colors.missing'),
    code.replace('colors.winner', "'red'"),
    code.replace('colors.winner', "on ? 'white' : colors.winner"),
    code.replace('background:palette.ground', 'border:`2px solid ${"x"} skyblue`'),
    code.replace('background:palette.ground', 'border:`2px solid #00f ${palette.line}`'),
    code.replace('colors.winner', "'#ff0000'"),
    code.replace('colors.winner', "'rgb(255,0,0)'"),
    code.replace('fonts.heading', "'Arial'"),
    code.replace('background:palette.ground', "backgroundImage:'linear-gradient(red, blue)'"),
    code.replace("from './kit'", "from './other'"),
    code + "\nimport 'unknown';",
    code + "\nexport {default as Bad} from 'fs';",
    code + "\nimport('fs');",
    code + '\n<svg><path fill="blue" /></svg>;',
    code + '\n<',
  ])
    assert.throws(() => cutSource(source, styleBrief));
});
