import { test } from 'node:test';
import assert from 'node:assert/strict';
import { linePath, routeLine } from '../../src/map/canvas.ts';

const parent = { x: 0, y: 0, width: 256, height: 400 };
const card = (x, y) => ({ x, y, width: 256, height: 300 });
// The ring points React Flow hands the edge: source on the right edge, target on the left edge.
const route = (to, sourceY = 200, targetY = to.y + 20) =>
  routeLine({ x: 256, y: sourceY }, { x: to.x, y: targetY }, parent, to);

function assertTransit(points) {
  const segments = points
    .slice(1)
    .map((p, i) => ({ dx: p.x - points[i].x, dy: p.y - points[i].y }));
  for (const { dx, dy } of segments)
    assert.ok(
      dx === 0 || dy === 0 || Math.abs(Math.abs(dx) - Math.abs(dy)) < 1e-9,
      'only 45° or 90° turns',
    );
  assert.equal(segments[0].dy, 0, 'leaves its ring horizontally');
  assert.equal(segments.at(-1).dy, 0, 'enters its ring horizontally');
}

test('a child right of and far below its parent runs vertically through the gutter centre, 40px clear', () => {
  const child = card(352, 900);
  const points = route(child);
  assertTransit(points);
  assert.deepEqual(points[0], { x: 256, y: 200 });
  assert.deepEqual(points.at(-1), { x: 352, y: 920 });
  const vertical = points.filter((p, i) => i && p.x === points[i - 1].x);
  assert.equal(vertical.length, 1);
  assert.equal(vertical[0].x, 304, 'centre of the 96px gutter');
  assert.ok(vertical[0].x - 256 >= 40 && 352 - vertical[0].x >= 40);
});

test('a child right of and above its parent mirrors the climb', () => {
  const points = route(card(352, -900));
  assertTransit(points);
  assert.ok(points[2].y < points[1].y, 'the first 45° turn heads up');
  assert.equal(points[2].x, 304);
});

test('a small rise is one 45° diagonal centred in the gutter, rings at the same height one horizontal', () => {
  const points = route(card(352, 200), 200, 240);
  assertTransit(points);
  assert.equal(points.length, 4);
  assert.equal((points[1].x + points[2].x) / 2, 304);
  assert.deepEqual(route(card(352, 180), 200, 200), [
    { x: 256, y: 200 },
    { x: 352, y: 200 },
  ]);
});

test('a child left of its parent leaves the facing side and enters its right side', () => {
  const child = card(-352, 900);
  const points = route(child);
  assertTransit(points);
  assert.deepEqual(points[0], { x: 0, y: 200 });
  assert.deepEqual(points.at(-1), { x: -96, y: 920 });
  assert.equal(points[2].x, -48);
  assert.ok(points[1].x < 0 && points[1].x > points[2].x, 'leaves leftwards');
});

test('a child directly above its parent runs outside both cards on the right', () => {
  const child = card(100, -800);
  const points = route(child, 200, -780);
  assertTransit(points);
  assert.deepEqual(points[0], { x: 256, y: 200 });
  assert.deepEqual(points.at(-1), { x: 356, y: -780 });
  assert.equal(points[2].x, 396, '40px clear of the rightmost card edge');
  assert.ok(points[1].x > 356 && points.at(-2).x > 356, 'enters the ring from outside the card');
});

test('linePath writes an SVG polyline', () => {
  assert.equal(
    linePath([
      { x: 0, y: 1 },
      { x: 2, y: 3 },
    ]),
    'M0 1L2 3',
  );
});
