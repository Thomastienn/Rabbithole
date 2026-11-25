import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { suggestionJobs } from '../../server/http/jobs/suggestions.mjs';
import { backgroundJobs } from '../../server/http/jobs/background.mjs';

const tempStore = (t) => {
    const store = new Store(join(mkdtempSync(join(tmpdir(), 'tt-auto-merge-')), 'trees.sqlite'));
    t.after(() => store.close());
    return store;
};
// Names in one group embed to the same direction; every other name gets a direction of its own.
const GROUPS = [
    ['Threads', 'thread'],
    ['Lock', 'Locking'],
    ['Networking', 'Computer networking'],
];
const directions = new Map(GROUPS.flatMap((g, i) => g.map((n) => [n, i])));
const embed = async (texts) =>
    texts.map((text) => {
        if (!directions.has(text)) directions.set(text, directions.size);
        return Array.from({ length: 64 }, (_, i) => (i === directions.get(text) ? 1 : 0));
    });
const topicsOf = (store, name) => store.graph().concepts.find((c) => c.name === name)?.topics;

test('one confirmation call per reply merges only confirmed pairs, keeping the older name as an alias, and meters and logs it', async (t) => {
    const real = tempStore(t);
    real.addGraph(
        {
            concepts: [
                { name: 'Threads', topics: ['Concurrency'] },
                { name: 'Lock', topics: ['Concurrency'] },
                { name: 'TCP', topics: ['Networking'] },
            ],
            links: [],
        },
        'earlier',
    );
    // The reply row itself is not under test: only the graph and the calls.
    const store = Object.assign(Object.create(real), {
        tree: () => ({ provider: 'claude' }),
        suggestionSettings: () => ({ enabled: true }),
        pendingSuggestions: () => true,
        finishSuggestions: () => {},
        startBriefs: () => {},
    });
    const prompts = [],
        meters = [],
        logs = [];
    const quick = {
        generate: async ({ role }, text, emit) => {
            prompts.push({ role, text });
            const answer =
                role === 'merge'
                    ? {
                          same: JSON.parse(text.slice(text.lastIndexOf('\n') + 1))
                              .pairs.filter((p) => !p.names.includes('Locking'))
                              .map((p) => p.pair),
                      }
                    : {
                          suggestions: [],
                          concepts: [
                              { name: 'thread', topics: ['Concurrency'] },
                              { name: 'Locking', topics: ['Concurrency'] },
                              { name: 'Socket', topics: ['Computer networking'] },
                          ],
                      };
            emit({ type: 'item', item: 'a', text: JSON.stringify(answer) });
            emit({ type: 'status', status: 'completed' });
        },
    };
    const jobs = backgroundJobs();
    const { noteSuggestions } = suggestionJobs({
        store,
        suggestions: true,
        jobs,
        videoEmbed: embed,
        neighbourhood: async () => ({ concepts: [] }),
        pick: () => quick,
        logged: (provider) => provider,
        metered: (provider, task, id, selection, detail) => (
            meters.push([task, id, detail]),
            provider
        ),
        log: (line) => logs.push(line),
        toolCapable: async () => false,
        quickModel: async () => ({ provider: 'claude', model: 'haiku', effort: null }),
        startBriefs: () => {},
    });
    noteSuggestions('c', 'r', 'completed', { passages: [], groundwork: [] }, 'Q', 'Threads');
    await jobs.get('suggestion', 'r').done;

    const merges = prompts.filter((p) => p.role === 'merge');
    assert.equal(merges.length, 1, 'every candidate of the reply reaches one call');
    const sent = JSON.parse(merges[0].text.slice(merges[0].text.lastIndexOf('\n') + 1)).pairs;
    assert.deepEqual(
        sent.map((p) => [p.kind, ...p.names]),
        [
            ['concept', 'Locking', 'Lock'],
            ['concept', 'thread', 'Threads'],
            ['topic', 'Computer networking', 'Networking'],
        ],
    );
    // Confirmed: equal evidence keeps the older name, the other resolves as an alias.
    assert.equal(real.concept('thread').name, 'Threads');
    assert.equal(topicsOf(real, 'thread'), undefined);
    // Unconfirmed pairs stay apart.
    assert.deepEqual(topicsOf(real, 'Locking'), ['Concurrency']);
    // A confirmed topic merge moves its concepts, and the old topic name keeps resolving.
    assert.deepEqual(real.graph().topics, ['Concurrency', 'Networking']);
    assert.deepEqual(topicsOf(real, 'Socket'), ['Networking']);
    real.addGraph({ concepts: [{ name: 'UDP', topics: ['computer networking'] }], links: [] });
    assert.deepEqual(topicsOf(real, 'UDP'), ['Networking']);
    assert.deepEqual(meters, [['merge', 'r', { message: 'r' }]]);
    assert.equal(logs.length, 2);
    assert.match(
        logs[0],
        /INFO suggestions concept merged .*names="thread, Threads" kept="Threads"/,
    );
    assert.match(
        logs[1],
        /INFO suggestions topic merged .*names="Computer networking, Networking" kept="Networking"/,
    );
});

test('a duplicate merge keeps the name with more evidence even when it is newer', (t) => {
    const store = tempStore(t);
    store.addGraph({ concepts: [{ name: 'promise', topics: ['JavaScript'] }], links: [] }, 'a');
    for (const message of ['b', 'c'])
        store.addGraph({ concepts: [{ name: 'Promises', topics: ['Async'] }], links: [] }, message);
    assert.deepEqual(store.mergeDuplicate('concept', 'promise', 'Promises'), {
        kept: 'Promises',
        merged: 'promise',
    });
    assert.equal(store.concept('promise').name, 'Promises');
    assert.equal(store.mergeDuplicate('concept', 'promise', 'Promises'), null, 'already one');
    // A topic's evidence is its concepts: Async holds two, JavaScript one.
    store.addGraph({ concepts: [{ name: 'Event loop', topics: ['Async'] }], links: [] });
    assert.deepEqual(store.mergeDuplicate('topic', 'JavaScript', 'Async'), {
        kept: 'Async',
        merged: 'JavaScript',
    });
    assert.deepEqual(store.graph().topics, ['Async']);
});
