import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../support/tsx.mjs';
import { cameraAt } from '../../server/media/video-kit.tsx';
import { CUT_3D } from '../../server/media/video-cut.mjs';

test('3D cuts move the kit camera between timed keys and are told to', () => {
  const keys = [
    { at: 0, position: [0, 0, 12] },
    { at: 30, position: [6, 3, 6], target: [0, 1, 0] },
  ];
  assert.deepEqual(cameraAt(keys, -5), { position: [0, 0, 12], target: [0, 0, 0] });
  assert.deepEqual(cameraAt(keys, 99), { position: [6, 3, 6], target: [0, 1, 0] });
  const mid = cameraAt(keys, 15);
  assert.ok(
    mid.position[0] > 0 && mid.position[0] < 6 && mid.position[2] < 12 && mid.position[2] > 6,
  );
  assert.deepEqual(cameraAt([keys[1]], 7), { position: [6, 3, 6], target: [0, 1, 0] });
  assert.match(CUT_3D, /never a fixed view[\s\S]*<Camera keys=\{\[\{at, position/);
});
