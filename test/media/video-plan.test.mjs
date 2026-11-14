import { test } from 'node:test';
import assert from 'node:assert/strict';
import { videoPlan, cutSource, CUT_PAUSE_FRAMES } from '../../server/media/video-plan.mjs';
import { planFor, composition, spatial, styleBrief } from '../support/video-kit.mjs';

test('compact plan validates the brief and ordered cuts, including the Manim engine', () => {
  const good = planFor(composition, 3);
  assert.deepEqual(videoPlan(JSON.stringify(good)), good);
  good.cuts[1].engine = 'manim';
  assert.deepEqual(videoPlan('```json\n' + JSON.stringify(good) + '\n```'), good);
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
  ]) {
    const bad = structuredClone(good);
    mutate(bad);
    assert.throws(() => videoPlan(JSON.stringify(bad)), /malformed/);
  }
  for (const raw of ['not json', 'null', '[]', '{}']) assert.throws(() => videoPlan(raw));
  assert.throws(() => videoPlan(' '.repeat(65537)), /64 KiB/);
  assert.equal(CUT_PAUSE_FRAMES, 15);
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
