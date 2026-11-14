import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cursorAt, sketchAt, sketchPath } from '../../server/media/video-kit.tsx';
import { videoPlan } from '../../server/media/video-plan.mjs';
import { PLAN_INSTRUCTIONS } from '../../server/media/video-plan.mjs';
import { CUT_INSTRUCTIONS } from '../../server/media/video-cut.mjs';
import { planFor } from '../support/video-kit.mjs';

const sentences = [
  { startFrame: 0, endFrame: 60 },
  { startFrame: 60, endFrame: 120 },
  { startFrame: 120, endFrame: 180 },
];
const cursor = [
  { tool: 'cursor', sentence: 0, x: 400, y: 300, label: 'Winner' },
  { tool: 'cursor', sentence: 2, x: 1400, y: 700 },
];

test('cursor glides to each timed target, labels it on arrival and fades after the last sentence', () => {
  const at = (f) => cursorAt(cursor, sentences, f);
  assert.equal(at(-10).opacity, 0);
  assert.deepEqual([at(0).x, at(0).y, at(0).opacity], [400, 300, 1]);
  assert.equal(at(0).labelOpacity, 0);
  assert.equal(at(30).label, 'Winner');
  assert.equal(at(30).labelOpacity, 1);
  assert.equal(at(80).labelOpacity, 0); // first sentence is over
  assert.deepEqual([at(119).x, at(119).y], [400, 300]); // waits until its next sentence starts
  const mid = at(125);
  assert.ok(mid.x > 400 && mid.x < 1400 && mid.y > 300 && mid.y < 700);
  assert.deepEqual([at(135).x, at(135).y, at(135).label], [1400, 700, undefined]);
  assert.equal(at(180).opacity, 1);
  assert.equal(at(190).opacity, 0);
  assert.equal(cursorAt([{ ...cursor[0], sentence: 9 }], sentences, 0), null); // untimed target
});

test('sketch strokes draw progressively from their sentence start and fade when it ends', () => {
  const circle = {
    tool: 'sketch',
    shape: 'circle',
    sentence: 1,
    points: [
      [800, 380],
      [1120, 460],
    ],
  };
  const at = (f) => sketchAt(circle, sentences, f);
  assert.deepEqual(at(59), { draw: 0, opacity: 0 });
  assert.deepEqual(at(60), { draw: 0, opacity: 1 });
  assert.ok(at(70).draw > 0.5 && at(70).draw < 1);
  assert.deepEqual(at(80), { draw: 1, opacity: 1 });
  assert.ok(at(125).opacity > 0 && at(125).opacity < 1);
  assert.equal(at(130).opacity, 0);
  for (const shape of ['circle', 'underline', 'arrow', 'freehand']) {
    const d = sketchPath({
      ...circle,
      shape,
      points: [
        [100, 200],
        [500, 260],
        [700, 240],
      ],
    });
    assert.match(d, /^M[\d. ]+( L[\d. ]+)+/);
    assert.equal(
      d,
      sketchPath({
        ...circle,
        shape,
        points: [
          [100, 200],
          [500, 260],
          [700, 240],
        ],
      }),
    );
  }
  // The hand-drawn wobble keeps an underline near, but not exactly on, its line.
  const ys = sketchPath({
    ...circle,
    shape: 'underline',
    points: [
      [100, 500],
      [900, 500],
    ],
  })
    .match(/\d+\.\d (\d+\.\d)/g)
    .map((p) => Number(p.split(' ')[1]));
  assert.ok(ys.some((y) => y !== 500) && ys.every((y) => Math.abs(y - 500) <= 3));
});

test('plan accepts timed emphasis marks in frame space and rejects malformed ones', () => {
  const plan = planFor(undefined, 2);
  plan.cuts[0].emphasis = [
    ...cursor,
    {
      tool: 'sketch',
      shape: 'arrow',
      sentence: 1,
      points: [
        [200, 200],
        [600, 400],
      ],
    },
    {
      tool: 'sketch',
      shape: 'freehand',
      sentence: 0,
      points: [
        [1, 1],
        [2, 2],
        [3, 5],
      ],
    },
  ];
  assert.deepEqual(videoPlan(JSON.stringify(plan)), plan);
  for (const bad of [
    { tool: 'cursor', sentence: 0, x: 2000, y: 10 },
    { tool: 'cursor', sentence: -1, x: 10, y: 10 },
    { tool: 'cursor', sentence: 0, x: 10, y: 10, label: 'x'.repeat(41) },
    { tool: 'laser', sentence: 0, x: 10, y: 10 },
    {
      tool: 'sketch',
      shape: 'star',
      sentence: 0,
      points: [
        [1, 1],
        [2, 2],
      ],
    },
    { tool: 'sketch', shape: 'circle', sentence: 0, points: [[1, 1]] },
    {
      tool: 'sketch',
      shape: 'underline',
      sentence: 0,
      points: [
        [1, 1],
        [2, '2'],
      ],
    },
  ]) {
    plan.cuts[1].emphasis = [bad];
    assert.throws(() => videoPlan(JSON.stringify(plan)), /malformed/, JSON.stringify(bad));
  }
});

test('prompts document cursor and sketch usage', () => {
  for (const words of [
    'cursor',
    'label',
    'circle',
    'underline',
    'arrow',
    'freehand',
    'Manim cuts rarely need',
  ])
    assert.ok(PLAN_INSTRUCTIONS.includes(words), words);
  assert.match(CUT_INSTRUCTIONS, /cut\.emphasis/);
});
