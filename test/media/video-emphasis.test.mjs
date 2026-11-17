import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../support/tsx.mjs';
import { createElement as h, useState } from 'react';
import { Thumbnail } from '@remotion/player';
import { render } from '../support/render.mjs';
import { ui } from '../support/ui.mjs';
const { cursorAt, penAt, Sketch, sketchAt, sketchPath } =
  await import('../../server/media/video-kit.tsx');
import { videoPlan } from '../../server/media/video-plan.mjs';
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

const penMark = (shape = 'underline') => ({
  tool: 'sketch',
  shape,
  sentence: 1,
  points: [
    [100, 300],
    [500, 300],
    [510, 600],
  ],
});

test('pen tip follows the revealed stroke by length for every tool, including the arrowhead', () => {
  for (const shape of ['circle', 'underline', 'arrow', 'freehand']) {
    const mark = penMark(shape);
    const points = sketchPath(mark)
      .slice(1)
      .split(' L')
      .map((p) => p.split(' ').map(Number));
    const lengths = points
      .slice(1)
      .map(([x, y], i) => Math.hypot(x - points[i][0], y - points[i][1]));
    const total = lengths.reduce((a, b) => a + b, 0);
    for (const f of [60, 62, 65, 70, 79, 80]) {
      let remaining = sketchAt(mark, sentences, f).draw * total;
      let i = 0;
      while (i < lengths.length - 1 && remaining > lengths[i]) remaining -= lengths[i++];
      const [x, y] = points[i],
        [bx, by] = points[i + 1];
      const at = penAt(mark, sentences, f);
      assert.ok(Math.abs(at.x - (x + ((bx - x) * remaining) / lengths[i])) < 0.001, shape);
      assert.ok(Math.abs(at.y - (y + ((by - y) * remaining) / lengths[i])) < 0.001, shape);
      assert.equal(at.opacity, 1);
    }
    assert.equal(penAt(mark, sentences, 59), null);
    const end = penAt(mark, sentences, 80),
      lift = penAt(mark, sentences, 83);
    assert.ok(lift.x > end.x && lift.y < end.y && lift.opacity > 0 && lift.opacity < 1);
    assert.equal(penAt(mark, sentences, 88), null);
    assert.equal(penAt(mark, sentences, 65, true), null);
    assert.equal(penAt({ ...mark, sentence: 9 }, sentences, 80), null);
  }
});

test('pen handles a stationary freehand and a sentence shorter than the normal draw time', () => {
  const mark = {
    ...penMark('freehand'),
    sentence: 0,
    points: [
      [100, 100],
      [100, 100],
    ],
  };
  for (const f of [0, 1, 2, 3]) {
    const at = penAt(mark, [{ startFrame: 0, endFrame: 3 }], f);
    assert.ok(Number.isFinite(at.x) && Number.isFinite(at.y));
  }
  assert.equal(penAt(mark, [{ startFrame: 0, endFrame: 3 }], 11), null);
});

test('overlay renders a pen during drawing, lifts it, then leaves only the mark; reduced motion hides it', async (t) => {
  const mark = penMark();
  const media = Object.getOwnPropertyDescriptor(globalThis, 'matchMedia');
  let reduced = false;
  globalThis.matchMedia = () => ({ matches: reduced });
  t.after(() =>
    media ? Object.defineProperty(globalThis, 'matchMedia', media) : delete globalThis.matchMedia,
  );
  let show;
  function Frame() {
    const [frameToDisplay, setFrame] = useState(65);
    show = setFrame;
    return h(Thumbnail, {
      component: Sketch,
      inputProps: { marks: [mark], sentences },
      compositionWidth: 1920,
      compositionHeight: 1080,
      fps: 30,
      durationInFrames: 200,
      frameToDisplay,
    });
  }
  const { container, act, cleanup } = await render(h(Frame), ui);
  t.after(cleanup);
  const tip = () => container.querySelector('[data-pen-tip]');
  assert.ok(tip());
  assert.equal(container.querySelector('svg').getAttribute('aria-hidden'), 'true');
  assert.equal(
    tip().getAttribute('transform'),
    `translate(${penAt(mark, sentences, 65).x} ${penAt(mark, sentences, 65).y})`,
  );
  await act(async () => show(83));
  assert.ok(Number(tip().getAttribute('opacity')) < 1);
  await act(async () => show(90));
  assert.equal(tip(), null);
  assert.ok(container.querySelector('path[stroke-dasharray]'));
  reduced = true;
  await act(async () => show(65));
  assert.equal(tip(), null);
  assert.ok(container.querySelector('path[stroke-dasharray]'));
});
