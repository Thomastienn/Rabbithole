import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeRender, job } from '../support/video-kit.mjs';

const MINUTE = 60000;

// Only model calls advance the fake clock, so real file I/O cannot consume the deadline.
async function slowJob(t, minutes) {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    const started = Date.now();
    const outcome = await job(fakeRender, null, undefined, 3, {
        slow: async () => {
            const end = Date.now() + minutes * MINUTE;
            // Let the pipeline arm its deadline before the model answers.
            await new Promise((resolve) => setImmediate(resolve));
            t.mock.timers.tick(Math.max(0, end - Date.now()));
        },
    });
    return { ...outcome, elapsed: Date.now() - started };
}

test('a video whose calls take over 20 minutes in total still completes', async (t) => {
    const { result, published, elapsed } = await slowJob(t, 11);
    assert.ok(elapsed > 20 * MINUTE);
    assert.equal(result, null);
    assert.equal(published, true);
});

test('a video still running at two hours fails', async (t) => {
    const { result, published, elapsed } = await slowJob(t, 120);
    assert.equal(elapsed, 120 * MINUTE);
    assert.match(result, /over two hours/);
    assert.equal(published, false);
});
