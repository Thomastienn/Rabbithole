import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';

const DAY = 24 * 60 * 60 * 1000;

test('stats figures come from the stored concepts, observations and replies', (t) => {
    const store = new Store(join(mkdtempSync(join(tmpdir(), 'rabbithole-stats-')), 'db.sqlite'));
    t.after(() => store.close());
    const now = Date.now();
    const tree = store.create('Root').id;
    store.addGraph(
        {
            concepts: [
                { name: 'Mutex', topics: ['Concurrency'] },
                { name: 'Scheduler', topics: ['Operating systems'] },
                { name: 'Heap', topics: ['Concurrency', 'Operating systems'] },
                { name: 'Lock', topics: ['Concurrency'] },
            ],
            links: [],
        },
        store.message(tree, 'assistant', 'Intro', 'completed'),
    );
    store.db.prepare('UPDATE evidence SET at=?').run(now - 20 * DAY);
    // One learner message per call, observed at a chosen time.
    const say = (text, at, concept, level, confidence = 'low') => {
        const id = store.message(tree, 'user', text, 'completed');
        store.observe(id, [{ concept, level, confidence }]);
        store.db.prepare('UPDATE observations SET at=? WHERE message=?').run(at, id);
    };
    // Mutex was known two weeks ago and has faded; Lock is known now.
    say('a', now - 14 * DAY, 'Mutex', 5, 'high');
    say('b', now - 14 * DAY, 'Mutex', 5, 'high');
    say('Is the scheduler a lock?', now - 10 * DAY, 'Scheduler', 0);
    say('c', now - 9 * DAY, 'Scheduler', 4);
    say('Is a heap sorted?', now - 2 * DAY, 'Heap', 0);
    say('d', now - DAY, 'Heap', 2);
    say('e', now - 60_000, 'Lock', 5, 'high');
    say('f', now - 60_000, 'Lock', 5, 'high');
    // Two replies one day, one another; a call with no saved reply (a discussion turn) is not a learner message.
    const noon = new Date(now - 3 * DAY).setHours(12, 0, 0, 0);
    const reply = () => store.message(tree, 'assistant', 'r', 'completed');
    store.record(`chat:${reply()}`, 'chat', null, null, noon);
    store.record(`chat:${reply()}`, 'chat', null, null, noon + 60_000);
    store.record(`chat:${reply()}`, 'chat', null, null, noon + DAY);
    store.record('chat:turn-1', 'chat', null, null, noon);

    const stats = store.graphStats(now);
    assert.equal(stats.since, now - 20 * DAY);
    assert.deepEqual(stats.growth, [
        { at: now - 14 * DAY, met: 4, known: 1 },
        { at: now - 7 * DAY, met: 4, known: 0 },
        { at: now, met: 4, known: 1 },
    ]);
    // Topic rank is the mean of the graph's own familiarity values.
    const graph = new Map(store.graph().concepts.map((c) => [c.name, c.familiarity]));
    const mean = (...names) =>
        Math.round((names.reduce((s, n) => s + graph.get(n), 0) / names.length) * 100) / 100;
    assert.deepEqual(
        stats.topics,
        [
            { name: 'Concurrency', familiarity: mean('Mutex', 'Heap', 'Lock'), concepts: 3 },
            { name: 'Operating systems', familiarity: mean('Scheduler', 'Heap'), concepts: 2 },
        ].sort((a, b) => b.familiarity - a.familiarity),
    );
    assert.ok(graph.get('Lock') >= 0.8 && graph.get('Mutex') < 0.8);
    // Only once-known concepts fade; Mutex stayed known for hours after its last message.
    assert.deepEqual(
        stats.fading.map((f) => f.name),
        ['Mutex'],
    );
    const until = stats.fading[0].until - (now - 14 * DAY);
    assert.ok(until > 0 && until < DAY, `${until}`);
    assert.deepEqual(stats.misconceptions, [
        { name: 'Heap', at: now - 2 * DAY, text: 'Is a heap sorted?', cleared: null },
        {
            name: 'Scheduler',
            at: now - 10 * DAY,
            text: 'Is the scheduler a lock?',
            cleared: now - 9 * DAY,
        },
    ]);
    const day = (at) => new Date(at).toLocaleDateString('sv');
    assert.deepEqual(stats.activity, [
        { day: day(noon), messages: 2 },
        { day: day(noon + DAY), messages: 1 },
    ]);
});
