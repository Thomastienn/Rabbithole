import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateVideoProgress, videoStepDetail, elapsed } from '../src/media/videoProgress.ts';

test('estimated video progress stays inside each phase share and below 100% until ready', () => {
  const t0 = 1_000_000;
  const at = (job, seconds) =>
    estimateVideoProgress({ startedAt: t0, phaseStartedAt: t0, ...job }, t0 + seconds * 1000);
  // Planning creeps with time but never reaches narration's share, however long it takes.
  const planning = [0, 10, 60, 600, 6000].map((s) => at({ phase: 'planning' }, s));
  assert.deepEqual(
    planning,
    [...planning].sort((a, b) => a - b),
  );
  assert.ok(planning[0] === 0 && planning.at(-1) < 0.55);
  // Legacy 'creating' is planning; a real character count can move it ahead of the time estimate.
  assert.equal(at({ phase: 'creating' }, 10), at({ phase: 'planning' }, 10));
  assert.ok(at({ phase: 'planning', characters: 15000 }, 1) > at({ phase: 'planning' }, 1));
  assert.ok(at({ phase: 'planning', characters: 999999 }, 1) < 0.55);
  assert.ok(at({ phase: 'narrating' }, 0) >= 0.55 && at({ phase: 'narrating' }, 999) < 0.65);
  // Rendering maps real progress linearly into its share.
  assert.equal(at({ phase: 'rendering', progress: 0 }, 99), 0.65);
  assert.ok(Math.abs(at({ phase: 'rendering', progress: 1 }, 0) - 0.97) < 1e-9);
  assert.ok(at({ phase: 'saving' }, 999) < 1);
  // Clock skew never produces negative time.
  assert.equal(at({ phase: 'planning' }, -5), 0);
});

test('video step detail shows only real counts', () => {
  assert.equal(
    videoStepDetail({ phase: 'planning', characters: 12345 }),
    '12,345 characters written',
  );
  assert.equal(
    videoStepDetail({ phase: 'rendering', progress: 0.5, frames: 1800 }),
    'Frame 900 of 1,800',
  );
  assert.equal(videoStepDetail({ phase: 'narrating' }), '');
  assert.equal(elapsed({ startedAt: 0 }, 75_000), '1:15');
});
