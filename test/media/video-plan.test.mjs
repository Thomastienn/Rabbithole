import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cutSource,
  cutJoin,
  PLAN_INSTRUCTIONS,
  EXHIBITS_NOTE,
  CLIPS_NOTE,
} from '../../server/media/video-plan.mjs';
import { planFor, planThrough, composition, spatial, styleBrief } from '../support/video-kit.mjs';
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
import { MAX_CLIP_SECONDS } from '../../server/media/clips.mjs';

test('the planner carries Manim teaching notes scoped to Manim cuts only', () => {
  assert.ok(PLAN_INSTRUCTIONS.endsWith(MANIM_TEACHING_SKILL));
});

test('the house style and focal-object rule reach the planner and Remotion writers, never Manim', () => {
  for (const prompt of [PLAN_INSTRUCTIONS, CUT_INSTRUCTIONS, AUDIT_INSTRUCTIONS]) {
    assert.ok(prompt.includes(HOUSE_STYLE_SKILL));
    assert.ok(prompt.includes(FOCAL_OBJECT_SKILL));
  }
  for (const prompt of [PIECES_INSTRUCTIONS, PIECE_IMPROVE_INSTRUCTIONS])
    assert.ok(prompt.includes(HOUSE_STYLE_SKILL));
  for (const prompt of [MANIM_INSTRUCTIONS, MANIM_AUDIT_INSTRUCTIONS])
    assert.ok(!prompt.includes(HOUSE_STYLE_SKILL) && !prompt.includes(FOCAL_OBJECT_SKILL));
});

test('plan calls validate the brief and ordered cuts, including the Manim engine', () => {
  const good = planFor(composition, 3);
  assert.deepEqual(planThrough(good), good);
  good.cuts[1].engine = 'manim';
  assert.deepEqual(planThrough(good), good);
  good.cuts[2].dimension = '3d';
  // The planner's loose camera note for a 3D cut passes through to the cut writers.
  good.cuts[2].camera = 'brisk sweep low across the surface';
  assert.deepEqual(planThrough(good), good);
  // A neutral object needs no colorRole; models send null or omit it.
  good.styleBrief.recurringObjects[0].colorRole = null;
  const { colorRole, ...neutral } = good.styleBrief.recurringObjects[0];
  assert.deepEqual(planThrough(good).styleBrief.recurringObjects, [neutral]);
  delete good.styleBrief.recurringObjects[0].colorRole;
  assert.deepEqual(planThrough(good), good);
  // A real object's reference query passes through; an empty or overlong one is rejected.
  good.styleBrief.recurringObjects[0].referenceQuery = 'Saturn V rocket';
  assert.deepEqual(planThrough(good), good);
  for (const referenceQuery of ['', 'x'.repeat(201), 7])
    assert.throws(
      () =>
        planThrough({
          ...good,
          styleBrief: {
            ...good.styleBrief,
            recurringObjects: [{ ...good.styleBrief.recurringObjects[0], referenceQuery }],
          },
        }),
      /^Error: referenceQuery/,
    );
  delete good.styleBrief.recurringObjects[0].referenceQuery;
  // Each bad call gets an error naming its field.
  for (const [field, mutate] of [
    ['title', (p) => (p.title = '')],
    ['description', (p) => (p.description = 'x'.repeat(281))],
    ['description', (p) => (p.styleBrief.layoutAreas[0].description = 12)],
    ['ink', (p) => (p.styleBrief.paletteRoles.winner = 'red')],
    ['role', (p) => (p.styleBrief.paletteRoles = ['amber'])],
    ['position', (p) => (p.styleBrief.recurringObjects[0].position = '')],
    ['colorRole', (p) => (p.styleBrief.recurringObjects[0].colorRole = 'missing')],
    ['term', (p) => (p.styleBrief.exactTerms = [''])],
    ['narration', (p) => (p.cuts[0].narration = '')],
    ['engine', (p) => (p.cuts[0].engine = 'other')],
    ['endState', (p) => (p.cuts[0].endState = '')],
    ['dimension', (p) => delete p.cuts[0].dimension],
    ['dimension', (p) => (p.cuts[0].dimension = '4d')],
  ]) {
    const bad = structuredClone(good);
    mutate(bad);
    assert.throws(() => planThrough(bad), new RegExp(`^Error: ${field} `), field);
  }
  // Missing areas, roles, objects and terms are empty; a 3D Manim cut becomes 2D.
  const sparse = structuredClone(good);
  sparse.styleBrief = { layoutAreas: [], paletteRoles: {}, recurringObjects: [], exactTerms: [] };
  Object.assign(sparse.cuts[1], { engine: 'manim', dimension: '3d' });
  const built = planThrough(sparse);
  assert.deepEqual(built.styleBrief, sparse.styleBrief);
  assert.equal(built.cuts[1].dimension, '2d');
  assert.throws(() => planThrough({ ...good, cuts: [] }), /^Error: The plan has no cuts;/);
});

test('plan joins accept continue and scene transitions, a bad join becomes a scene change, and old plans read as scene with fade', () => {
  const good = planFor(composition, 4);
  Object.assign(good.cuts[0], { join: 'scene', transition: 'iris' });
  good.cuts[1].join = 'continue';
  Object.assign(good.cuts[2], { join: 'scene', transition: 'wipe', direction: 'from-top-left' });
  Object.assign(good.cuts[3], { transition: 'slide', direction: 'from-right' });
  assert.deepEqual(planThrough(good), good);
  assert.deepEqual(good.cuts.map(cutJoin), [
    { join: 'scene', transition: 'iris' },
    { join: 'continue' },
    { join: 'scene', transition: 'wipe', direction: 'from-top-left' },
    { join: 'scene', transition: 'slide', direction: 'from-right' },
  ]);
  const old = planFor(composition, 2);
  assert.deepEqual(planThrough(old), old);
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
    const { join, transition, direction } = planThrough(bad).cuts[1];
    assert.deepEqual(
      [join, transition, direction],
      ['scene', undefined, undefined],
      JSON.stringify(cut),
    );
  }
  const first = structuredClone(old);
  first.cuts[0].join = 'continue';
  assert.equal(planThrough(first).cuts[0].join, 'scene', 'cut 1 is always a scene');
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

test('plans may name image and quote exhibits on Remotion cuts only when web search is set up', () => {
  const plan = planFor();
  plan.cuts[0].exhibits = [
    { kind: 'image', query: 'Ada Lovelace portrait', show: 'The person who wrote the notes' },
    {
      kind: 'quote',
      query: 'Lovelace algebraic patterns',
      text: 'It weaves algebraic patterns.',
      by: 'Ada Lovelace',
    },
  ];
  assert.deepEqual(planThrough(plan, { exhibits: true }).cuts[0].exhibits, plan.cuts[0].exhibits);
  assert.throws(() => planThrough(plan), /^Error: Use .*finish_video\.$/);
  for (const bad of [
    { kind: 'clip', query: 'x', show: 'x' },
    { kind: 'image', query: 'x' },
    { kind: 'quote', query: 'x', text: 'x'.repeat(281) },
  ])
    assert.throws(
      () =>
        planThrough({ ...plan, cuts: [{ ...plan.cuts[0], exhibits: [bad] }] }, { exhibits: true }),
      /missing a field/,
    );
  const manim = { ...plan.cuts[0], engine: 'manim' };
  assert.throws(
    () => planThrough({ ...plan, cuts: [manim] }, { exhibits: true }),
    /Manim cuts have no exhibits/,
  );
  assert.ok(!PLAN_INSTRUCTIONS.includes(EXHIBITS_NOTE));
});

test('plans may name clip exhibits with the wanted seconds and sound only when the clip downloader is ready', () => {
  const plan = planFor();
  const clip = {
    kind: 'clip',
    query: 'Apollo 11 landing footage',
    show: 'The landing',
    start: 30,
    end: 36.5,
    sound: false,
  };
  plan.cuts[0].exhibits = [clip];
  assert.deepEqual(planThrough(plan, { exhibits: true, clips: true }).cuts[0].exhibits, [clip]);
  assert.throws(() => planThrough(plan, { exhibits: true }), /missing a field/);
  for (const bad of [
    { ...clip, start: undefined },
    { ...clip, end: 30 },
    { ...clip, start: -1 },
    { ...clip, end: 30 + MAX_CLIP_SECONDS + 1 },
    { ...clip, show: undefined },
    { ...clip, sound: undefined },
    { ...clip, sound: true },
    { ...clip, sound: true, sentence: -1 },
  ])
    assert.throws(
      () =>
        planThrough(
          { ...plan, cuts: [{ ...plan.cuts[0], exhibits: [bad] }] },
          { exhibits: true, clips: true },
        ),
      /missing a field/,
    );
  const loud = { ...clip, sound: true, sentence: 0 };
  const loudPlan = (exhibits) => ({ ...plan, cuts: [{ ...plan.cuts[0], exhibits }] });
  assert.deepEqual(
    planThrough(loudPlan([loud, clip]), { exhibits: true, clips: true }).cuts[0].exhibits,
    [loud, clip],
  );
  assert.throws(
    () => planThrough(loudPlan([loud, loud]), { exhibits: true, clips: true }),
    /at most one clip with sound/,
  );
  assert.ok(!EXHIBITS_NOTE.includes(CLIPS_NOTE));
});

test('cuts may place the kit Exhibit component; raw image tags and URLs are still rejected', () => {
  const cut = `import { AbsoluteFill } from 'remotion';
import { Exhibit, palette } from './kit';
export default function Video() {
  return <AbsoluteFill style={{ background: palette.ground }}><Exhibit id="exhibit1" x={1300} y={460} width={560} scale={1.1} rotation={-3} /></AbsoluteFill>;
}`;
  assert.equal(cutSource(cut, styleBrief), cut);
  for (const bad of [
    cut.replace('<Exhibit', '<img src={x} /><Exhibit'),
    cut.replace('"exhibit1"', '"https://museum.example/ada.png"'),
    cut.replace('<Exhibit', '<Img src={x} /><Exhibit'),
  ])
    assert.throws(() => cutSource(bad, styleBrief), /disallowed import or resource/);
});
