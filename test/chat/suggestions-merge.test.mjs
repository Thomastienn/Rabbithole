import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { Store } from '../../server/store.mjs';
import { suggestionJobs } from '../../server/http/jobs/suggestions.mjs';
import { backgroundJobs } from '../../server/http/jobs/background.mjs';
import { roles } from '../../server/http/roles.mjs';
import { candidates } from '../../server/merges.mjs';

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
    const tree = real.create('Concurrency', 'claude', 'haiku');
    const reply = real.message(tree.id, 'assistant', 'Threads', 'completed');
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
    const prompts = [],
        logs = [];
    const usage = { input: 10, output: 2, cacheRead: 0 };
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
            if (role === 'merge') emit({ type: 'usage', usage });
            emit({ type: 'status', status: 'completed' });
        },
    };
    const jobs = backgroundJobs();
    const { noteSuggestions } = suggestionJobs({
        store: real,
        ...roles({ store: real, providers: { claude: quick }, log: () => {} }),
        suggestions: true,
        jobs,
        videoEmbed: embed,
        neighbourhood: async () => ({ concepts: [] }),
        log: (line) => logs.push(line),
        toolCapable: async () => false,
        quickModel: async () => ({ provider: 'claude', model: 'haiku', effort: null }),
        startBriefs: () => {},
    });
    noteSuggestions(tree.id, reply, 'completed', { passages: [], groundwork: [] }, 'Q', 'Threads');
    await jobs.get('suggestion', reply).done;

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
    const history = real.usageEvents().events.filter((e) => e.task === 'merge');
    assert.deepEqual(
        history.map(({ at, ...event }) => event),
        [
            {
                task: 'merge',
                provider: 'claude',
                model: 'haiku',
                ...usage,
                reasoning: null,
                tree: tree.id,
                treeTitle: tree.title,
            },
        ],
    );
    assert.equal(real.tree(tree.id).messages[0].mediaUsage, undefined);
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

const cleanupJob = (store, videoEmbed, generate, onMeter = () => {}) => {
    const jobs = backgroundJobs();
    const { cleanupMerges } = suggestionJobs({
        store,
        jobs,
        videoEmbed,
        pick: () => ({ generate }),
        metered: (provider, task) => {
            onMeter(task);
            return provider;
        },
        log: () => {},
        toolCapable: async () => false,
        chatDefault: () => ({ provider: 'claude', model: null, effort: null }),
        quickModel: async () => ({ provider: 'claude', model: 'haiku', effort: null }),
    });
    cleanupMerges();
    return jobs.get('merge-cleanup', 'all');
};

test('the candidate scan yields during a full graph check and ignores incompatible embeddings', async () => {
    const rows = Array.from({ length: 40 }, (_, i) => ({
        name: `Concept ${i}`,
        embedding: [1, 0],
    }));
    rows.push({ name: 'Incompatible vector', embedding: [1] });
    const scan = candidates(rows, null, 0.85, new AbortController().signal);
    assert.equal(await Promise.race([scan, setImmediate('yielded')]), 'yielded');
    assert.deepEqual(
        await scan,
        rows.slice(0, -1).flatMap((a, i) => rows.slice(i + 1, -1).map((b) => [a.name, b.name])),
    );
});

test('the one-time cleanup backs up the database, confirms existing duplicates in batches and never runs again', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-merge-cleanup-'));
    const path = join(dir, 'trees.sqlite');
    const store = new Store(path);
    t.after(() => store.close());
    // 21 duplicate concept pairs and one topic pair: two confirmation calls of at most 20 pairs.
    const groups = Array.from({ length: 21 }, (_, i) => [`Idea ${i}`, `Ideas ${i}`]);
    groups.push(['Networking', 'Computer networking']);
    const group = new Map(groups.flatMap((g, i) => g.map((n) => [n, i])));
    const embedOwn = async (texts) =>
        texts.map((text) => {
            if (!group.has(text)) group.set(text, group.size);
            return Array.from({ length: 256 }, (_, i) => (i === group.get(text) ? 1 : 0));
        });
    for (const [i, [a, b]] of groups.slice(0, 21).entries())
        store.addGraph(
            {
                concepts: [
                    { name: a, topics: [i ? 'Networking' : 'Computer networking'] },
                    { name: b, topics: ['Networking'] },
                ],
                links: [],
            },
            `m${i}`,
        );
    const calls = [],
        meters = [];
    const backupNames = () =>
        readdirSync(dir).filter((name) => /^trees\.sqlite\.backup-merge-.*\.sqlite$/.test(name));
    const generate = async ({ role }, text, emit) => {
        const pairs = JSON.parse(text.slice(text.lastIndexOf('\n') + 1)).pairs;
        calls.push({ role, pairs, backups: backupNames() });
        // Idea 0 stays apart from Ideas 0.
        const same = pairs.filter((p) => !p.names.includes('Idea 0')).map((p) => p.pair);
        emit({ type: 'item', item: 'a', text: JSON.stringify({ same }) });
        emit({ type: 'status', status: 'completed' });
    };
    await cleanupJob(store, embedOwn, generate, (task) => meters.push(task)).done;

    assert.deepEqual(
        calls.map((c) => [c.role, c.pairs.length]),
        [
            ['merge', 20],
            ['merge', 2],
        ],
    );
    assert.deepEqual(meters, ['merge', 'merge']);
    assert.equal(store.concept('Ideas 5').name, 'Idea 5', 'merged with the other kept as an alias');
    assert.equal(store.concept('Ideas 0').name, 'Ideas 0', 'an unconfirmed pair stays apart');
    assert.deepEqual(store.graph().topics, ['Networking']);
    // The backup holds the graph as it was before any merge.
    const backups = backupNames();
    assert.equal(backups.length, 1);
    assert.deepEqual(calls[0].backups, backups);
    const before = new Store(join(dir, backups[0]));
    t.after(() => before.close());
    assert.equal(before.concept('Ideas 5').name, 'Ideas 5');
    assert.deepEqual(before.graph().topics, ['Computer networking', 'Networking']);
    store.close();
    const reopened = new Store(path);
    t.after(() => reopened.close());
    assert.equal(cleanupJob(reopened, embedOwn, generate), undefined);
    assert.equal(calls.length, 2);
});

test('a malformed batch leaves the duplicates apart and the next startup retries', async (t) => {
    const store = tempStore(t);
    store.addGraph({
        concepts: [
            { name: 'Threads', topics: [] },
            { name: 'thread', topics: [] },
        ],
        links: [],
    });
    const answer = (same) => async (_selection, _text, emit) => {
        emit({ type: 'item', item: 'a', text: JSON.stringify({ same }) });
        emit({ type: 'status', status: 'completed' });
    };
    await cleanupJob(store, embed, answer([2])).done;
    assert.equal(store.concept('thread').name, 'thread');
    const path = store.path;
    store.close();
    const reopened = new Store(path);
    t.after(() => reopened.close());
    await cleanupJob(reopened, embed, answer([1])).done;
    assert.equal(reopened.concept('thread').name, 'Threads');
});

test('the usage task check widens to merge on an existing database and keeps every row', (t) => {
    const old = tempStore(t);
    const tree = old.create('Concurrency', 'claude');
    const reply = old.message(tree.id, 'assistant', 'Threads', 'completed');
    old.record(
        'video:a:1',
        'video',
        {},
        { input: 1, output: 2, cacheRead: 3, reasoning: 1 },
        5,
        reply,
        'plan',
        2,
    );
    old.record('brief:x', 'brief', { provider: 'claude', model: 'haiku' }, null, 6);
    const sql = old.db.prepare("SELECT sql FROM sqlite_master WHERE name='usage_events'").get().sql;
    old.db.exec(`ALTER TABLE usage_events RENAME TO usage_events_new;
    ${sql.replace(",'merge'", '')};
    INSERT INTO usage_events SELECT * FROM usage_events_new;
    DROP TABLE usage_events_new;`);
    assert.throws(() => old.record('merge:r', 'merge', {}, null), /CHECK/);
    const rows = () => old.db.prepare('SELECT * FROM usage_events ORDER BY id').all();
    const before = rows().map((r) => ({ ...r }));
    old.close();
    const store = new Store(old.path);
    t.after(() => store.close());
    assert.deepEqual(
        store.db
            .prepare('SELECT * FROM usage_events ORDER BY id')
            .all()
            .map((r) => ({ ...r })),
        before,
    );
    store.record('merge:r', 'merge', { provider: 'claude', model: 'haiku' }, null);
    assert.equal(store.usageEvents().events.at(-1).task, 'merge');
});
