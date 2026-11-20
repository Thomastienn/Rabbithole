import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SAVED, start } from '../support/suggestion-kit.mjs';

// Graph shape without the derived familiarity fields.
const shape = (g) => ({ ...g, concepts: g.concepts.map(({ name, topics }) => ({ name, topics })) });

const GRAPH = {
    topics: ['Concurrency', 'operating systems'],
    concepts: [
        { name: 'Mutual exclusion', topics: ['Concurrency', 'operating systems'] },
        { name: "Peterson's algorithm", topics: ['Concurrency'] },
    ],
    links: [{ from: "Peterson's algorithm", to: 'Mutual exclusion', kind: 'builds on' }],
};

test('the same suggestion call fills one global knowledge graph that survives restart and reuses concepts across learning trees', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-graph-'));
    let env = await start(dir);
    t.after(async () => {
        await env.close();
    });
    const a = JSON.parse(await env.post('/api/trees'));
    await env.post(`/api/trees/${a.id}/messages`, { text: 'Explain locks' });
    await env.settled();
    // One tutor call and one suggestion call: graph data adds no model call.
    assert.equal(env.calls.length, 2);
    assert.equal(env.suggestionCalls().length, 1);
    assert.deepEqual(
        shape(await env.get('/api/graph')),
        GRAPH,
        'invalid concepts and links are dropped',
    );
    assert.equal((await env.get(`/api/trees/${a.id}`)).suggestions[0].passages.length, 2);
    await env.close();

    env = await start(dir);
    assert.deepEqual(shape(await env.get('/api/graph')), GRAPH);
    // Another learning tree on another provider: the question names mutual exclusion, so its neighbourhood (with linked "Peterson's algorithm") is sent, and the model reuses that name instead of "Peterson lock".
    const b = JSON.parse(await env.post('/api/trees'));
    await env.post(`/api/trees/${b.id}/model`, { provider: 'codex', model: 'fixture-model' });
    await env.post(`/api/trees/${b.id}/messages`, {
        text: 'Explain locks again, mutual exclusion',
    });
    await env.settled();
    assert.equal((await env.get(`/api/trees/${b.id}`)).suggestions[0].status, 'ready');
    // A differently cased name reuses its concept; the new link joins the existing concepts.
    assert.deepEqual(shape(await env.get('/api/graph')), {
        ...GRAPH,
        links: [
            { from: 'Mutual exclusion', to: "Peterson's algorithm", kind: 'related' },
            ...GRAPH.links,
        ],
    });
    // Graph data never enters tutor history.
    env.store.forgetThread(a.id);
    await env.post(`/api/trees/${a.id}/messages`, { text: 'Continue' });
    await env.settled();
    for (const call of env.calls.filter((c) => !c.system.startsWith('You mark')))
        assert.doesNotMatch(call.system + call.input, /Peterson|knownConcepts|"concepts"/);
    const last = env.suggestionCalls().at(-1).input,
        newline = last.indexOf('\n');
    // The known topics go out as data after the instruction line; a reply naming no concept sends every topic but no concept names.
    assert.deepEqual(JSON.parse(last.slice(newline + 1)).knownConcepts, {
        Concurrency: [],
        'operating systems': [],
    });
});

test('meeting replies, naming concepts, branching and ignored suggestions do not move familiarity', async (t) => {
    const env = await start(mkdtempSync(join(tmpdir(), 'tt-evidence-')));
    t.after(env.close);
    const tree = JSON.parse(await env.post('/api/trees'));
    await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain locks' });
    await env.settled();
    const concept = async (name) =>
        (await env.get('/api/graph')).concepts.find((c) => c.name === name);
    const M = 'Mutual exclusion',
        P = "Peterson's algorithm";
    assert.deepEqual(await concept(M), {
        name: M,
        topics: ['Concurrency', 'operating systems'],
        familiarity: 0.3,
        met: 1,
        observations: [0, 0, 0, 0, 0, 0],
    });
    const reply = (await env.get(`/api/trees/${tree.id}`)).messages.at(-1);
    for (const passage of SAVED) {
        const child = JSON.parse(
            await env.post(`/api/trees/${tree.id}/branches`, {
                messageId: reply.id,
                ...passage,
                suggestion: true,
                question: 'explain',
            }),
        );
        assert.ok(child.id);
    }
    await env.post(`/api/trees/${tree.id}/messages`, { text: `What about ${P.toLowerCase()}?` });
    await env.settled();
    assert.equal((await concept(M)).familiarity, 0.3);
    assert.equal((await concept(P)).familiarity, 0.3);
    assert.deepEqual(
        env.store.db
            .prepare('SELECT DISTINCT kind FROM evidence')
            .all()
            .map((r) => r.kind),
        ['met'],
    );
    assert.equal(env.store.db.prepare('SELECT COUNT(*) AS n FROM observations').get().n, 0);
    // Only a verdict observation changes what the suggestion model receives.
    const learner = env.store.tree(tree.id).messages.at(-2);
    env.store.observe(learner.id, [{ concept: P, level: 4, confidence: 'high' }]);
    const estimate = (await concept(P)).familiarity;
    assert.ok(estimate > 0.6);
    await env.post(`/api/trees/${tree.id}/messages`, { text: `Explain ${P} once more` });
    await env.settled();
    const sent = JSON.parse(
        env.suggestionCalls().at(-1).input.split('\n').slice(1).join('\n'),
    ).familiarity;
    assert.equal(sent[P], estimate);
});

test('Knowledge merge combines topics, observations and links; aliases and passages keep working after restart', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-merge-'));
    let env = await start(dir);
    t.after(async () => env.close());
    const keep = "Peterson's algorithm",
        from = 'Peterson lock',
        mutex = 'Mutual exclusion';
    const a = JSON.parse(await env.post('/api/trees'));
    await env.post(`/api/trees/${a.id}/messages`, { text: 'Explain locks' });
    await env.settled();
    const b = JSON.parse(await env.post('/api/trees'));
    await env.post(`/api/trees/${b.id}/messages`, { text: 'Explain duplicate locks' });
    await env.settled();
    // Seed one overlapping source event and a tagged saved passage, as a model can return both names for the same reply.
    const reply = (await env.get(`/api/trees/${b.id}`)).messages.at(-1);
    env.store.addGraph(
        { concepts: [{ name: keep, topics: ['Concurrency'] }], links: [] },
        reply.id,
    );
    env.store.db
        .prepare('UPDATE suggestions SET passages=? WHERE message=?')
        .run(
            JSON.stringify([{ start: 0, end: 13, text: 'Authoritative', concept: from }]),
            reply.id,
        );
    await env.post(`/api/trees/${a.id}/messages`, {
        text: "Peterson's algorithm and Peterson lock",
    });
    await env.settled();
    const learnerA = env.store.tree(a.id).messages[0].id;
    const learnerB = env.store.tree(b.id).messages[0].id;
    const shared = env.store.tree(a.id).messages.at(-2).id;
    env.store.observe(learnerA, [{ concept: keep, level: 3, confidence: 'high' }]);
    env.store.observe(learnerB, [{ concept: from, level: 4, confidence: 'low' }]);
    env.store.observe(shared, [
        { concept: keep, level: 0, confidence: 'low' },
        { concept: from, level: 4, confidence: 'high' },
    ]);
    // A message observed under both names keeps the target concept's verdict.
    const merged = await env.request('/api/graph/merge', { from: keep, into: from });
    assert.equal(merged.status, 200);
    let graph = await merged.json(),
        c = graph.concepts.find((c) => c.name === from);
    assert.equal(graph.concepts.length, 2);
    assert.deepEqual(c.topics, ['Algorithms', 'Concurrency']);
    assert.equal(c.met, 2);
    assert.deepEqual(c.observations, [0, 0, 0, 1, 2, 0]);
    assert.deepEqual(graph.links, [
        { from: mutex, to: from, kind: 'related' },
        { from, to: mutex, kind: 'builds on' },
    ]);
    assert.ok(graph.links.every((l) => l.from !== l.to));
    await env.close();
    env = await start(dir);
    assert.deepEqual(await env.get('/api/graph'), graph);
    // Merge back through a third canonical name, retaining aliases transitively and rewriting the old passage tag.
    env.store.addGraph({
        concepts: [{ name: 'Peterson mutex', topics: ['Concurrency'] }],
        links: [],
    });
    await env.post('/api/graph/merge', { from, into: 'Peterson mutex' });
    assert.equal(
        (await env.get(`/api/trees/${b.id}`)).suggestions[0].passages[0].concept,
        'Peterson mutex',
    );
    const branched = JSON.parse(
        await env.post(`/api/trees/${b.id}/branches`, {
            messageId: reply.id,
            start: 0,
            end: 13,
            text: 'Authoritative',
            question: 'Explain',
        }),
    );
    assert.ok(branched.id);
    await env.post(`/api/trees/${a.id}/messages`, {
        text: "Peterson's algorithm and Peterson lock duplicate locks",
    });
    await env.settled();
    const latest = env.store.tree(a.id).messages.at(-2).id;
    env.store.observe(latest, [
        { concept: keep, level: 4, confidence: 'low' },
        { concept: from, level: 5, confidence: 'high' },
    ]);
    graph = await env.get('/api/graph');
    c = graph.concepts.find((c) => c.name === 'Peterson mutex');
    assert.equal(
        graph.concepts.length,
        2,
        'old names from the next suggestion result do not recreate duplicates',
    );
    assert.deepEqual(
        c.observations,
        [0, 0, 0, 1, 2, 1],
        'aliases share one observation per learner message',
    );
    const familiarity = env.store.mentioned(keep + ' and ' + from);
    assert.equal(familiarity[keep], c.familiarity);
    assert.equal(familiarity[from], c.familiarity);
    const before = graph;
    for (const body of [
        null,
        {},
        { from },
        { from, into: from },
        { from: 'Peterson mutex', into: keep },
    ])
        assert.equal((await env.request('/api/graph/merge', body)).status, 400);
    assert.equal(
        (await env.request('/api/graph/merge', { from: 'missing', into: from })).status,
        404,
    );
    assert.equal(
        (
            await env.request(
                '/api/graph/merge',
                { from: mutex, into: from },
                { 'X-Rabbithole-CSRF': '' },
            )
        ).status,
        403,
    );
    assert.deepEqual(
        await env.get('/api/graph'),
        before,
        'invalid requests leave the graph unchanged',
    );
});

test('a failed Knowledge merge rolls back observations, met, topics, links, aliases and saved passage references', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-merge-rollback-')),
        env = await start(dir);
    t.after(async () => env.close());
    const tree = JSON.parse(await env.post('/api/trees'));
    await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain locks' });
    await env.settled();
    env.store.observe(env.store.tree(tree.id).messages[0].id, [
        { concept: "Peterson's algorithm", level: 0, confidence: 'high' },
    ]);
    const graph = await env.get('/api/graph'),
        saved = await env.get(`/api/trees/${tree.id}`);
    env.store.db.exec(
        "CREATE TRIGGER reject_concept_delete BEFORE DELETE ON concepts BEGIN SELECT RAISE(ABORT, 'fixture merge failure'); END;",
    );
    assert.equal(
        (
            await env.request('/api/graph/merge', {
                from: "Peterson's algorithm",
                into: 'Mutual exclusion',
            })
        ).status,
        500,
    );
    assert.deepEqual(await env.get('/api/graph'), graph);
    assert.deepEqual(await env.get(`/api/trees/${tree.id}`), saved);
    assert.deepEqual(env.store.db.prepare('PRAGMA foreign_key_check').all(), []);
    env.store.db.exec('DROP TRIGGER reject_concept_delete');
    assert.equal(
        (
            await env.request('/api/graph/merge', {
                from: "Peterson's algorithm",
                into: 'Mutual exclusion',
            })
        ).status,
        200,
    );
});
