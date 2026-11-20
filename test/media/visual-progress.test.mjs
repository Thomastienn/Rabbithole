import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { visualProgress, visualsReady } = await import('../../src/media/visualProgress.ts');

test('visual state follows status, arrived source and start time', () => {
    const base = { source: null, created: 1_000, startedAt: undefined };
    assert.deepEqual(visualProgress({ ...base, status: 'pending' }, 66_000), {
        state: 'drawing',
        partial: false,
        elapsed: '1:05',
    });
    assert.deepEqual(
        visualProgress({ ...base, status: 'pending', source: '<p>', startedAt: 60_000 }, 66_000),
        { state: 'drawing', partial: true, elapsed: '0:06' },
    );
    assert.deepEqual(visualProgress({ ...base, status: 'ready', source: '<p>' }, 0), {
        state: 'interactive',
        partial: false,
    });
    assert.equal(visualProgress({ ...base, status: 'failed' }, 0).state, 'failed');
    assert.equal(visualProgress({ ...base, status: 'interrupted' }, 0).state, 'interrupted');
    assert.equal(visualProgress({ ...base, status: 'canceled' }, 0), undefined);
});

test('reply count shows only while a visual is drawing and ignores videos and canceled visuals', () => {
    const v = (status, kind = 'visual') => ({ kind, status });
    assert.equal(visualsReady([v('ready'), v('pending'), v('failed')]), '1 of 3 visuals ready');
    assert.equal(visualsReady([v('pending')]), '0 of 1 visual ready');
    assert.equal(
        visualsReady([v('ready'), v('pending'), v('pending', 'video'), v('canceled')]),
        '1 of 2 visuals ready',
    );
    assert.equal(visualsReady([v('ready'), v('failed'), v('pending', 'video')]), undefined);
    assert.equal(visualsReady(), undefined);
});
