import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { PARAGRAPH_LIMIT, retrieveNeighbourhood } from '../../server/neighbourhood.mjs';
import { fakeOpenAI, streamReply } from '../support/fake-openai.mjs';
import { open } from '../support/openai-kit.mjs';

async function launch(t, embed = null) {
    const fake = await fakeOpenAI(t);
    const env = await open(t, {}, { videoEmbed: embed, log: () => {} });
    await env.post('/api/settings/endpoint', { baseUrl: fake.baseUrl, apiKey: 'fixture-key' });
    const created = await env.post('/api/trees', { provider: 'openai', model: 'local-tutor' });
    assert.equal(created.status, 201);
    const tree = await created.json();
    const system = () =>
        fake.calls.filter((c) => c.path.endsWith('/chat/completions')).at(-1).body.messages[0]
            .content;
    return {
        ...env,
        fake,
        tree,
        neighbourhood: () =>
            system().includes('\nConcept neighbourhood')
                ? JSON.parse(system().split('\n').at(-1))
                : { concepts: [], links: [] },
        ask: async (text, action = 'messages') => {
            const response = await env.post(`/api/trees/${tree.id}/${action}`, { text });
            assert.equal(response.status, 200);
            return response.text();
        },
    };
}

const add = (store, names, links = [], message) =>
    store.addGraph(
        { concepts: names.map((name) => ({ name, topics: ['Concurrency'] })), links },
        message,
    );

test('the provider receives cross-tree familiarity, guesses, unknowns, two hops and builds-on links', async (t) => {
    const env = await launch(t, async (texts) =>
        texts.map((text) => (text.includes('Mutex') ? [1, 0] : [0, 1])),
    );
    const earlier = env.store.create('Earlier learning tree');
    const learner = env.store.message(earlier.id, 'user', 'My understanding.', 'completed');
    env.store.observe(learner, [
        { concept: 'Mutex', level: 3, confidence: 'high' },
        { concept: 'Semaphore', level: 0, confidence: 'high' },
        { concept: 'Atomic access', level: 5, confidence: 'high' },
    ]);
    add(
        env.store,
        ['Mutex', 'Semaphore', 'Atomic access', 'Race condition', 'Ordering', 'Soil', 'Unrelated'],
        [
            { from: 'Mutex', to: 'Semaphore', kind: 'builds on' },
            { from: 'Mutex', to: 'Atomic access', kind: 'builds on' },
            { from: 'Mutex', to: 'Race condition', kind: 'related' },
            { from: 'Race condition', to: 'Ordering', kind: 'builds on' },
            { from: 'Ordering', to: 'Unrelated', kind: 'related' },
        ],
        learner,
    );
    await env.ask('Explain Mutex and Soil.');
    const context = env.neighbourhood();
    const named = (name) => context.concepts.find((c) => c.name === name);
    assert.deepEqual(
        context.concepts.map((c) => c.name),
        ['Mutex', 'Soil', 'Atomic access', 'Race condition', 'Semaphore', 'Ordering'],
    );
    assert.equal(named('Mutex').familiarity, 0.5);
    assert.equal(named('Atomic access').familiarity, 0.77);
    assert.deepEqual(named('Semaphore'), {
        name: 'Semaphore',
        topics: ['Concurrency'],
        familiarity: 0.1,
        recentMisconception: true,
    });
    assert.equal(named('Race condition').guess, 0.5);
    assert.equal(named('Race condition').familiarity, undefined);
    assert.equal(named('Ordering').familiarity, 'unknown', 'guesses do not propagate');
    assert.equal(named('Soil').familiarity, 'unknown');
    assert.deepEqual(context.links, [
        { from: 'Mutex', to: 'Atomic access', kind: 'builds on' },
        { from: 'Mutex', to: 'Semaphore', kind: 'builds on' },
        { from: 'Race condition', to: 'Ordering', kind: 'builds on' },
    ]);

    // A newer observation, even in another learning tree, reaches the very next reply and Retry.
    env.store.observe(env.store.message(earlier.id, 'user', 'Corrected.', 'completed'), [
        { concept: 'Semaphore', level: 5, confidence: 'high' },
    ]);
    env.fake.reply = (_, res) => {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end('{"error":{"message":"Fixture provider unavailable"}}');
    };
    assert.match(await env.ask('Semaphore?'), /"status":"failed"/);
    assert.equal(env.neighbourhood().concepts[0].name, 'Semaphore');
    assert.equal(env.neighbourhood().concepts[0].recentMisconception, undefined);
    env.fake.reply = (_, res) => streamReply(res, ['Recovered.']);
    assert.match(await env.ask(undefined, 'retry'), /"status":"completed"/);
    assert.equal(env.neighbourhood().concepts[0].recentMisconception, undefined);

    const source = env.store.message(env.tree.id, 'assistant', 'Mutex', 'completed');
    const child = env.store.branch(
        env.store.tree(env.tree.id),
        {
            messageId: source,
            start: 0,
            end: 5,
            text: 'Mutex',
            question: 'What does this mean?',
        },
        'Earlier background.',
    );
    const response = await env.post(`/api/trees/${child.id}/messages`, {
        text: 'What does this mean?',
    });
    assert.match(await response.text(), /"status":"completed"/);
    assert.equal(
        env.neighbourhood().concepts[0].name,
        'Mutex',
        'a branch question includes its passage',
    );
});

test('provider context cuts to fifteen nearest concepts, keeping message matches before either hop', async (t) => {
    const env = await launch(t);
    const close = Array.from({ length: 20 }, (_, i) => `Neighbour ${String(i).padStart(2, '0')}`);
    add(
        env.store,
        ['Mutex', 'Direct second', 'Beyond budget', ...close],
        [
            ...close.map((name) => ({ from: 'Mutex', to: name, kind: 'builds on' })),
            { from: close[0], to: 'Beyond budget', kind: 'builds on' },
        ],
    );
    await env.ask('Mutex and Direct second');
    const { concepts, links } = env.neighbourhood();
    assert.equal(concepts.length, 15);
    assert.deepEqual(
        concepts.slice(0, 2).map((c) => c.name),
        ['Direct second', 'Mutex'],
    );
    assert.deepEqual(
        concepts.slice(2).map((c) => c.name),
        close.slice(0, 13),
    );
    assert.equal(links.length, 13);
    assert.ok(
        links.every(
            (l) => concepts.some((c) => c.name === l.from) && concepts.some((c) => c.name === l.to),
        ),
    );
});

test('whole names and aliases work offline, then semantic matching backfills and survives reopening', async (t) => {
    let available = false;
    const batches = [];
    const embed = async (texts) => {
        batches.push(texts);
        if (!available) throw new Error('Fixture embedder unavailable');
        return texts.map((text) => (/mutex|lock thing/i.test(text) ? [1, 0, 0] : [0, 1, 0]));
    };
    const env = await launch(t, embed);
    add(env.store, ['Mutex', 'Mutual exclusion', 'Unrelated']);
    env.store.mergeConcepts('Mutual exclusion', 'Mutex');
    await env.ask('the lock thing');
    assert.deepEqual(env.neighbourhood().concepts, []);
    await env.ask('MUTUAL EXCLUSION?');
    assert.deepEqual(
        env.neighbourhood().concepts.map((c) => c.name),
        ['Mutex'],
    );
    await env.ask('supermutexes');
    assert.deepEqual(env.neighbourhood().concepts, [], 'whole names, never substrings');
    available = true;
    await env.ask('the lock thing');
    assert.equal(env.neighbourhood().concepts[0].name, 'Mutex');
    assert.deepEqual(batches.at(-1), ['the lock thing', 'Mutex', 'Unrelated']);
    await env.ask('the lock thing again');
    assert.deepEqual(batches.at(-1), ['the lock thing again'], 'saved names are not re-embedded');
    add(env.store, ['New while usable']);
    await env.ask('the lock thing');
    assert.deepEqual(batches.at(-1), ['the lock thing', 'New while usable']);

    const reopened = new Store(join(env.dir, 'trees.sqlite'));
    t.after(() => reopened.close());
    const context = await retrieveNeighbourhood(reopened, embed, 'the lock thing');
    assert.equal(context.concepts[0].name, 'Mutex');
    assert.deepEqual(batches.at(-1), ['the lock thing'], 'embeddings persist across restart');
});

test('Stop during local embedding ends the reply and never starts provider inference', async (t) => {
    const started = Promise.withResolvers();
    const resume = Promise.withResolvers();
    let wait = true;
    const batches = [];
    const env = await launch(t, async (texts) => {
        batches.push(texts);
        if (wait) {
            started.resolve();
            await resume.promise;
        }
        return texts.map(() => [1, 0]);
    });
    t.after(() => resume.resolve());
    add(env.store, ['Mutex']);
    const response = env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Mutex?' });
    await started.promise;
    assert.equal((await env.post(`/api/trees/${env.tree.id}/stop`)).status, 200);
    assert.match(await (await response).text(), /"status":"interrupted"/);
    assert.equal(env.fake.calls.filter((c) => c.path.endsWith('/chat/completions')).length, 0);
    wait = false;
    resume.resolve();
    await env.ask('Mutex again?');
    assert.deepEqual(
        batches.at(-1),
        ['Mutex again?', 'Mutex'],
        'an aborted call saves no embeddings',
    );
    assert.equal(env.neighbourhood().concepts[0].name, 'Mutex');
});

test('a concept merge during embedding keeps current names, observations and embeddings', async (t) => {
    const started = Promise.withResolvers();
    const resume = Promise.withResolvers();
    const env = await launch(t, async (texts) => {
        started.resolve();
        await resume.promise;
        return texts.map((text) => (text === 'Mutex' ? [1, 0] : [0, 1]));
    });
    t.after(() => resume.resolve());
    add(env.store, ['Lock', 'Mutex']);
    const source = env.store.message(env.tree.id, 'user', 'Wrong.', 'completed');
    env.store.observe(source, [{ concept: 'Lock', level: 0, confidence: 'high' }]);
    const response = env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Mutex' });
    await started.promise;
    env.store.mergeConcepts('Mutex', 'Lock');
    env.store.observe(source, [{ concept: 'Lock', level: 5, confidence: 'high' }]);
    add(env.store, ['New concept']);
    resume.resolve();
    assert.match(await (await response).text(), /"type":"done","status":"completed"/);
    assert.deepEqual(env.neighbourhood().concepts, [
        {
            name: 'Lock',
            topics: ['Concurrency'],
            familiarity: 0.77,
        },
    ]);
    const result = await retrieveNeighbourhood(
        env.store,
        async (texts) => {
            assert.deepEqual(
                texts,
                ['Mutex', 'New concept'],
                'a recycled row id must still need its own embedding',
            );
            return texts.map(() => [1, 0]);
        },
        'Mutex',
    );
    assert.ok(result.concepts.some((c) => c.name === 'Lock'));
});

test('semantic matching scores each concept by its closest paragraph', async (t) => {
    const env = await launch(t);
    add(env.store, ['Mutex', 'Unrelated']);
    const batches = [];
    const result = await retrieveNeighbourhood(
        env.store,
        async (texts) => {
            batches.push(texts);
            return texts.map((text) =>
                text === 'Unrelated'
                    ? [0, 0, 1]
                    : text === 'Mutex' || (/lock/.test(text) && !/cats/.test(text))
                      ? [1, 0, 0]
                      : [0, 1, 0],
            );
        },
        'An intro about cats.\n\n  \nThe lock thing matters.',
    );
    assert.deepEqual(batches, [
        ['An intro about cats.', 'The lock thing matters.', 'Mutex', 'Unrelated'],
    ]);
    assert.deepEqual(
        result.concepts.map((c) => c.name),
        ['Mutex'],
        'a whole-reply vector would have missed it',
    );
});

test('attachment text is never embedded; only the typed question is', async (t) => {
    const batches = [];
    const env = await launch(t, async (texts) => {
        batches.push(texts);
        return texts.map(() => [1, 0, 0]);
    });
    add(env.store, ['Mutex']);
    const { csrf } = await (await env.get('/api/state')).json();
    const form = new FormData();
    form.set('text', 'What is this file about?');
    form.append(
        'files',
        new File([Array(600).fill('A long paragraph about locks.').join('\n\n')], 'notes.txt', {
            type: 'text/plain',
        }),
    );
    const response = await fetch(`${env.origin}/api/trees/${env.tree.id}/messages`, {
        method: 'POST',
        headers: { 'X-Rabbithole-CSRF': csrf },
        body: form,
    });
    assert.match(await response.text(), /"status":"completed"/);
    assert.deepEqual(batches, [['What is this file about?', 'Mutex']]);
});

test('the largest typed message embeds at most a fixed number of paragraphs', async (t) => {
    const env = await launch(t);
    add(env.store, ['Mutex']);
    const batches = [];
    // The send route accepts at most 100,000 characters of typed text.
    const text = Array(20_000).fill('Lock.').join('\n\n').slice(0, 100_000);
    await retrieveNeighbourhood(
        env.store,
        async (texts) => {
            batches.push(texts);
            return texts.map(() => [1, 0, 0]);
        },
        text,
    );
    assert.equal(batches[0].length, PARAGRAPH_LIMIT + 1, 'paragraphs plus the one pending name');
});
