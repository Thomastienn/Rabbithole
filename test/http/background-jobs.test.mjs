import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backgroundJobs } from '../../server/http/jobs/background.mjs';

test('a background job is listed by kind until it settles, and a replaced job leaves its successor', async () => {
    const jobs = backgroundJobs();
    let finish;
    const first = jobs.start('verdict', 'm', 'c', () => new Promise((r) => (finish = r)));
    jobs.start('title', 'c', 'c', async () => {});
    assert.deepEqual(
        jobs.list('verdict').map((j) => [j.kind, j.key, j.conversation]),
        [['verdict', 'm', 'c']],
    );
    first.controller.abort();
    let release;
    const second = jobs.start('verdict', 'm', 'c', () => new Promise((r) => (release = r)));
    finish();
    await first.done;
    assert.ok(jobs.get('verdict', 'm') === second);
    assert.deepEqual(
        jobs.list().map((j) => j.kind),
        ['verdict'],
    );
    release();
    await second.done;
    assert.deepEqual(jobs.list(), []);
});

test('a kept job stays after it settles until it is removed, and can take over a running controller', async () => {
    const jobs = backgroundJobs();
    const controller = new AbortController();
    const kept = jobs.start('compaction', 'child', 'child', async () => {}, {
        keep: true,
        controller,
    });
    await kept.done;
    assert.ok(jobs.get('compaction', 'child') === kept);
    assert.ok(kept.controller === controller);
    const newer = jobs.start('compaction', 'child', 'child', async () => {}, { keep: true });
    jobs.remove(kept);
    assert.ok(jobs.get('compaction', 'child') === newer);
    jobs.remove(newer);
    assert.deepEqual(jobs.list(), []);
});

test('stopping a conversation aborts and removes every kind of its jobs and waits for them to end', async () => {
    const jobs = backgroundJobs();
    const until = (job) => new Promise((r) => job.controller.signal.addEventListener('abort', r));
    let videoEnded = false;
    for (const kind of ['title', 'verdict', 'suggestion', 'brief', 'reply'])
        jobs.start(kind, 'c', 'c', until);
    jobs.start('video', 'v', 'c', (job) => until(job).then(() => (videoEnded = true)));
    jobs.start('compaction', 'c', 'c', async () => {}, { keep: true });
    const other = jobs.start('title', 'd', 'd', until);
    const library = jobs.start('export', 'v', null, until);
    await jobs.stop(['c']);
    assert.ok(videoEnded, 'stopping waits for each job to end');
    assert.deepEqual(jobs.list(), [other, library]);
    assert.ok(!other.controller.signal.aborted && !library.controller.signal.aborted);
    await jobs.stop();
    assert.deepEqual(jobs.list(), []);
});

test('settled waits for every job but those started with settle: false, or for one key', async () => {
    const jobs = backgroundJobs();
    let finish;
    jobs.start('reply', 'c', 'c', () => new Promise(() => {}), { settle: false });
    jobs.start('video', 'v', 'c', () => new Promise((r) => (finish = r)));
    let ended = false;
    jobs.start('title', 'c', 'c', async () => {});
    const all = jobs.settled().then(() => (ended = true));
    await jobs.settled('c');
    assert.equal(ended, false);
    finish();
    await all;
});
