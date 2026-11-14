import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateVideoProgress, videoStepDetail, elapsed } from '../../src/media/videoProgress.ts';

test('estimated video progress stays inside each phase share and below 100% until ready', () => {
  const t0 = 1_000_000;
  const at = (job, seconds) =>
    estimateVideoProgress({ startedAt: t0, phaseStartedAt: t0, ...job }, t0 + seconds * 1000);
  // Planning creeps with time but never reaches writing's share, however long it takes.
  const planning = [0, 10, 60, 600, 6000].map((s) => at({ phase: 'planning' }, s));
  assert.deepEqual(
    planning,
    [...planning].sort((a, b) => a - b),
  );
  assert.ok(planning[0] === 0 && planning.at(-1) < 0.3);
  // Legacy 'creating' is planning; a real character count can move it ahead of the time estimate.
  assert.equal(at({ phase: 'creating' }, 10), at({ phase: 'planning' }, 10));
  assert.ok(at({ phase: 'planning', characters: 3000 }, 1) > at({ phase: 'planning' }, 1));
  assert.ok(at({ phase: 'planning', characters: 999999 }, 1) < 0.3);
  // Writing and playable map real cut counts; narrating creeps inside its share.
  assert.equal(at({ phase: 'writing', cut: 0, cuts: 4 }, 99), 0.3);
  assert.ok(
    at({ phase: 'writing', cut: 2, cuts: 4 }, 0) > at({ phase: 'writing', cut: 1, cuts: 4 }, 0),
  );
  assert.ok(at({ phase: 'narrating' }, 0) >= 0.55 && at({ phase: 'narrating' }, 999) < 0.6);
  assert.ok(Math.abs(at({ phase: 'playable', cut: 1, cuts: 2 }, 0) - 0.65) < 1e-9);
  // Saving maps real render progress into its share and stays below 100% until ready.
  assert.equal(at({ phase: 'saving', progress: 0 }, 99), 0.7);
  assert.ok(at({ phase: 'saving', progress: 1 }, 999) < 1);
  // Clock skew never produces negative time.
  assert.equal(at({ phase: 'planning' }, -5), 0);
});

test('video step detail shows only real counts', () => {
  assert.equal(
    videoStepDetail({ phase: 'planning', characters: 12345 }),
    '12,345 characters written',
  );
  assert.equal(
    videoStepDetail({ phase: 'saving', progress: 0.5, frames: 1800 }),
    'Frame 900 of 1,800',
  );
  assert.equal(videoStepDetail({ phase: 'writing', cut: 1, cuts: 3 }), '1 of 3 cuts written');
  assert.equal(videoStepDetail({ phase: 'playable', cut: 2, cuts: 3 }), '2 of 3 cuts ready');
  assert.equal(videoStepDetail({ phase: 'narrating' }), '');
  assert.equal(elapsed({ startedAt: 0 }, 75_000), '1:15');
});
