import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeRender, job } from '../support/video-kit.mjs';

const MINUTE = 60000;

// Each model call answers after `minutes` of fake time; the clock runs until the job ends.
async function slowJob(t, minutes) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let done = false;
  const running = job(fakeRender, null, undefined, 3, {
    slow: () => new Promise((r) => setTimeout(r, minutes * MINUTE)),
  }).finally(() => (done = true));
  while (!done) {
    for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r));
    t.mock.timers.tick(MINUTE);
  }
  return running;
}

test('a video whose calls take over 20 minutes in total still completes', async (t) => {
  const { result, published } = await slowJob(t, 9);
  assert.equal(result, null);
  assert.equal(published, true);
});

test('a video still running after 2 hours fails as running over two hours', async (t) => {
  const { result, published } = await slowJob(t, 130);
  assert.equal(result, 'Video generation ran over two hours.');
  assert.equal(published, false);
});
