import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  videoPlan,
  cutSource,
  cutJoin,
  PLAN_INSTRUCTIONS,
  EXHIBITS_NOTE,
  CLIPS_NOTE,
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
  assert.throws(() => videoPlan(' '.repeat(65537)), /64 KiB/);
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
  const raw = JSON.stringify(plan);
  assert.deepEqual(videoPlan(raw, { exhibits: true }).cuts[0].exhibits, plan.cuts[0].exhibits);
  assert.throws(() => videoPlan(raw), /cut 1 exhibits/);
  for (const bad of [
    { kind: 'clip', query: 'x', show: 'x' },
    { kind: 'image', query: 'x' },
    { kind: 'quote', query: 'x', text: 'x'.repeat(281) },
  ])
    assert.throws(
      () =>
        videoPlan(JSON.stringify({ ...plan, cuts: [{ ...plan.cuts[0], exhibits: [bad] }] }), {
          exhibits: true,
        }),
      /cut 1 exhibits/,
    );
  const manim = { ...plan.cuts[0], engine: 'manim' };
  assert.throws(
    () => videoPlan(JSON.stringify({ ...plan, cuts: [manim] }), { exhibits: true }),
    /cut 1 exhibits/,
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
  const raw = JSON.stringify(plan);
  assert.deepEqual(videoPlan(raw, { exhibits: true, clips: true }).cuts[0].exhibits, [clip]);
  assert.throws(() => videoPlan(raw, { exhibits: true }), /cut 1 exhibits/);
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
        videoPlan(JSON.stringify({ ...plan, cuts: [{ ...plan.cuts[0], exhibits: [bad] }] }), {
          exhibits: true,
          clips: true,
        }),
      /cut 1 exhibits/,
    );
  const loud = { ...clip, sound: true, sentence: 0 };
  const loudPlan = (exhibits) => JSON.stringify({ ...plan, cuts: [{ ...plan.cuts[0], exhibits }] });
  assert.deepEqual(
    videoPlan(loudPlan([loud, clip]), { exhibits: true, clips: true }).cuts[0].exhibits,
    [loud, clip],
  );
  assert.throws(
    () => videoPlan(loudPlan([loud, loud]), { exhibits: true, clips: true }),
    /cut 1 exhibits/,
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
