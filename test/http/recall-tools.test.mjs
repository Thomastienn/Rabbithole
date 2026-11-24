import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeOpenAI, streamReply, streamToolCalls } from '../support/fake-openai.mjs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { open } from '../support/openai-kit.mjs';
import { Store } from '../../server/store.mjs';
import { recallTools } from '../../server/tools/recall.mjs';

// Lock-like wording shares one direction, so a reworded query matches only through the embedder.
const LOCKING = /mutex|exclusive|one thread/i;

async function launch(t) {
    const fake = await fakeOpenAI(t);
    fake.models = [{ id: 'tooled', capabilities: { tools: true } }];
    const embedder = { down: false, calls: [] },
        warnings = [];
    const env = await open(
        t,
        {},
        {
            log: (line) => line.includes(' WARN ') && warnings.push(line),
            videoEmbed: async (texts) => {
                embedder.calls.push(texts);
                if (embedder.down) throw new Error('Embedder unavailable.');
                return texts.map((text) => (LOCKING.test(text) ? [1, 0] : [0, 1]));
            },
        },
    );
    const endpoint = (
        await (
            await env.post('/api/settings/endpoints', {
                name: 'Fake',
                baseUrl: fake.baseUrl,
                apiKey: 'sk-test',
            })
        ).json()
    ).at(-1).id;
    const current = env.store.create('Current', endpoint, 'tooled');
    let compactions = 0,
        offered;
    // One reply: the model calls the tool once, then answers; returns the tool output it saw.
    const call = async (name, input) => {
        let output;
        fake.reply = (req, res, body) => {
            if (!body.tools) {
                compactions++;
                return streamReply(res, [`Compact paragraph ${compactions}.`]);
            }
            offered = body.tools.map((d) => d.function.name);
            const tool = body.messages.at(-1);
            if (tool.role !== 'tool') return streamToolCalls(res, [{ name, input }]);
            output = tool.content;
            streamReply(res, ['Done.']);
        };
        await (await env.post(`/api/trees/${current.id}/messages`, { text: 'Recall.' })).text();
        return JSON.parse(output);
    };
    return {
        ...env,
        current,
        embedder,
        warnings,
        call,
        compactions: () => compactions,
        offered: () => offered,
    };
}

function seed(store) {
    const concurrency = store.create('Concurrency');
    const question = store.message(concurrency.id, 'user', 'How do locks work?', 'completed');
    const answer = store.message(
        concurrency.id,
        'assistant',
        'A mutex lets one thread in at a time.',
        'completed',
    );
    store.observe(question, [{ concept: 'Mutex', level: 4, confidence: 'high' }]);
    store.addGraph(
        {
            concepts: ['Mutex', 'Semaphore', 'Soil'].map((name) => ({
                name,
                topics: ['Concurrency'],
            })),
            links: [{ from: 'Mutex', to: 'Semaphore', kind: 'builds on' }],
        },
        question,
    );
    const child = store.branch(
        store.tree(concurrency.id),
        { messageId: answer, start: 2, end: 7, text: 'mutex', question: 'Why only one?' },
        'Locks were introduced.',
    );
    store.message(child.id, 'user', 'Why only one?', 'completed');
    store.message(
        child.id,
        'assistant',
        'Exclusive access keeps shared data consistent.',
        'completed',
    );
    const garden = store.create('Gardening');
    store.message(garden.id, 'user', 'Which plants like acidic soil?', 'completed');
    store.message(garden.id, 'assistant', 'Blueberries prefer acidic soil.', 'completed');
    return { concurrency, child, garden };
}

test('recall tools return their shapes, mix embedding and keyword matches, and add no resources', async (t) => {
    const env = await launch(t);
    const { concurrency, child, garden } = seed(env.store);

    // Embedder down: keywords still find an exact-word match; the background job warns and leaves messages unembedded.
    env.embedder.down = true;
    const keyword = await env.call('search_conversations', { description: 'blueberries' });
    assert.deepEqual(keyword.conversations, [
        {
            conversation_id: garden.id,
            learning_tree: 'Gardening',
            address: '1',
            title: 'Gardening',
            match: 'Blueberries prefer acidic soil.',
        },
    ]);
    await env.app.settled();
    assert.ok(env.store.recallMessages().every((m) => !m.embedding));
    assert.match(env.warnings.join('\n'), /message embedding failed.*Embedder unavailable/);

    // Embedder back: the search embeds only the query, so unembedded messages match by keyword alone.
    env.embedder.down = false;
    const description = 'exclusive lock for threads';
    const early = await env.call('search_conversations', { description });
    assert.deepEqual(
        early.conversations.map((c) => c.conversation_id),
        [child.id],
    );
    assert.deepEqual(
        env.embedder.calls.filter((texts) => texts.includes(description)),
        [[description]],
    );
    // The settled reply started the background job, which embedded every completed message.
    await env.app.settled();
    assert.ok(env.store.recallMessages().every((m) => m.embedding));

    // Now a reworded query also finds the branch's parent by meaning, in another learning tree.
    const reworded = await env.call('search_conversations', { description });
    assert.deepEqual(reworded.conversations[0], {
        conversation_id: child.id,
        learning_tree: 'Concurrency',
        address: '1.1',
        title: 'Why only one?',
        match: 'Exclusive access keeps shared data consistent.',
    });
    assert.ok(reworded.conversations.some((c) => c.conversation_id === concurrency.id));
    assert.ok(!reworded.conversations.some((c) => c.conversation_id === env.current.id));

    // One call answers several items, in order, one entry each.
    const { lookups } = await env.call('look_up_concept', {
        concepts: ['one thread at a time', 'Semaphore'],
    });
    assert.deepEqual(
        lookups.map((l) => l.query),
        ['one thread at a time', 'Semaphore'],
    );
    const [concept, semaphore] = lookups;
    assert.equal(concept.concepts[0].name, 'Mutex');
    assert.deepEqual(Object.keys(concept.concepts[0]).sort(), [
        'familiarity',
        'links',
        'name',
        'topics',
    ]);
    assert.equal(typeof concept.concepts[0].familiarity, 'number');
    assert.deepEqual(concept.concepts[0].topics, ['Concurrency']);
    assert.deepEqual(concept.concepts[0].links, [
        { from: 'Mutex', to: 'Semaphore', kind: 'builds on' },
    ]);
    assert.equal(semaphore.concepts[0].name, 'Semaphore');
    assert.equal(typeof semaphore.concepts[0].guess, 'number');
    // Embedder down: an unobserved concept and an item with no match are both unknown.
    env.embedder.down = true;
    const [soil, missing] = (
        await env.call('look_up_concept', { concepts: ['Soil', 'Quasar spectroscopy'] })
    ).lookups;
    assert.equal(soil.concepts[0].familiarity, 'unknown');
    assert.deepEqual(missing, { query: 'Quasar spectroscopy', familiarity: 'unknown' });

    assert.deepEqual(await env.call('read_conversation', { conversation_id: child.id }), {
        title: 'Why only one?',
        inheritedContext: {
            snapshot: 'Locks were introduced.',
            selectedPassage: 'mutex',
            question: 'Why only one?',
        },
        messages: [
            { role: 'user', text: 'Why only one?' },
            { role: 'assistant', text: 'Exclusive access keeps shared data consistent.' },
        ],
    });
    assert.equal(env.compactions(), 0);
    assert.deepEqual(env.store.resources(env.current.id), []);
});

test('on startup older unembedded messages are embedded in small batches until none remain', async (t) => {
    const store = new Store(join(mkdtempSync(join(tmpdir(), 'tt-recall-')), 'trees.sqlite'));
    const tree = store.create('Backlog');
    for (let i = 0; i < 40; i++) store.message(tree.id, 'user', `Question ${i}`, 'completed');
    store.message(tree.id, 'assistant', 'Half', 'interrupted');
    const batches = [];
    const env = await open(
        t,
        {},
        {
            store,
            log: () => {},
            videoEmbed: async (texts) => {
                batches.push(texts.length);
                return texts.map(() => [1, 0]);
            },
        },
    );
    await env.app.settled();
    assert.deepEqual(batches, [16, 16, 8]);
    assert.ok(store.recallMessages().every((m) => m.embedding));
});

test('a long conversation arrives as one cached compact paragraph until it changes', async (t) => {
    const env = await launch(t);
    const long = env.store.create('Long');
    env.store.message(long.id, 'user', 'x'.repeat(25000), 'completed');
    const read = () => env.call('read_conversation', { conversation_id: long.id });
    assert.deepEqual(await read(), { title: 'Long', compacted: 'Compact paragraph 1.' });
    assert.deepEqual(await read(), { title: 'Long', compacted: 'Compact paragraph 1.' });
    assert.equal(env.compactions(), 1);
    env.store.message(long.id, 'assistant', 'More.', 'completed');
    assert.deepEqual(await read(), { title: 'Long', compacted: 'Compact paragraph 2.' });
    assert.deepEqual(env.store.resources(env.current.id), []);
});

test('each recall tool has its own Settings switch, on by default', async (t) => {
    const env = await launch(t);
    const recall = ['look_up_concept', 'search_conversations', 'read_conversation'];
    const listed = await (await env.get('/api/settings/tutor-tools')).json();
    assert.deepEqual(
        listed.filter((tool) => recall.includes(tool.name)),
        [
            { name: 'look_up_concept', label: 'Look up concepts', enabled: true },
            { name: 'search_conversations', label: 'Search earlier conversations', enabled: true },
            { name: 'read_conversation', label: 'Read earlier conversations', enabled: true },
        ],
    );
    await env.call('look_up_concept', { concepts: ['x'] });
    assert.deepEqual(
        env.offered().filter((name) => recall.includes(name)),
        recall,
    );
    for (const name of recall) {
        await env.post('/api/settings/tutor-tools', { name, enabled: false });
        await env.call('look_up_concept', { concepts: ['x'] }).catch(() => {});
        assert.ok(!env.offered().includes(name), `${name} is switched off`);
    }
});

test('look_up_concept refuses an empty list and one longer than 10', async (t) => {
    const env = await launch(t);
    const { lookUpConcept } = recallTools({ store: env.store });
    for (const concepts of [[], Array(11).fill('Mutex'), undefined, ['']])
        await assert.rejects(lookUpConcept({ concepts }, {}), /Give concepts/);
    assert.equal(
        JSON.parse(await lookUpConcept({ concepts: Array(10).fill('Mutex') }, {})).lookups.length,
        10,
    );
});
