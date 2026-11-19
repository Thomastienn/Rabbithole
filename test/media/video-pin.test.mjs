import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../support/tsx.mjs';
import { cameraAt, screenAt } from '../../server/media/video-kit.tsx';
import { CUT_3D, AUDIT_3D } from '../../server/media/video-cut.mjs';

const keys = [
  { at: 0, position: [0, 2, 12], target: [0, 1, 0] },
  { at: 60, position: [8, 4, 6], target: [1, 0, 0], pace: 2 },
];

test('a point at the camera target projects to the frame centre on every frame', () => {
  for (const f of [0, 17, 45, 90]) {
    const s = screenAt(keys, f, cameraAt(keys, f).target);
    assert.ok(Math.abs(s.x - 960) < 1e-6 && Math.abs(s.y - 540) < 1e-6, `${f}: ${s.x},${s.y}`);
    assert.equal(s.front, true);
    assert.equal(s.opacity, 1);
  }
});

test('a point behind the camera is hidden and its pin fades out', () => {
  const { position, target } = cameraAt(keys, 30);
  const behind = position.map((p, i) => 2 * p - target[i]);
  assert.deepEqual(
    [screenAt(keys, 30, behind).front, screenAt(keys, 30, behind).opacity],
    [false, 0],
  );
});

test('a fixed point moves on screen as the camera moves, and fades at the frame edge', () => {
  const point = [2, 1, 0];
  const at = [0, 10, 20, 30].map((f) => screenAt(keys, f, point));
  for (let i = 1; i < at.length; i++) assert.notDeepEqual(at[i], at[i - 1]);
  // Right of the target, up the screen as a camera above looks down: x past centre.
  assert.ok(at[0].x > 960);
  const wide = screenAt(keys, 0, point, { fov: 20 });
  assert.ok(wide.x > at[0].x, 'a narrower fov spreads points apart');
  const off = screenAt(keys, 0, [40, 1, 0]);
  assert.equal(off.front, true);
  assert.equal(off.opacity, 0);
});

test('3D cut guidance pins labels with Pin and the 3D audit checks them', () => {
  assert.match(CUT_3D, /Pin every label to its object with the kit.s <Pin/);
  assert.match(CUT_3D, /Titles and legends may stay unpinned/);
  assert.match(AUDIT_3D, /label or pen mark that is not on the object/);
});
