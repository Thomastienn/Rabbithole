import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeOpenAI, streamReply, streamToolCalls } from '../support/fake-openai.mjs';
import { open } from '../support/openai-kit.mjs';

// Lock-like wording shares one direction, so a reworded query matches only through the embedder.
const LOCKING = /mutex|exclusive|one thread/i;

async function launch(t) {
    const fake = await fakeOpenAI(t);
    fake.models = [{ id: 'tooled', capabilities: { tools: true } }];
    const embedder = { down: false };
    const env = await open(
        t,
        {},
        {
            log: () => {},
            videoEmbed: async (texts) => {
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

    // Embedder down: keywords still find an exact-word match, and messages wait to be embedded.
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
    assert.ok(env.store.recallMessages().some((m) => !m.embedding));

    // Embedder back: the backlog is embedded and a reworded query finds the branch in another learning tree.
    env.embedder.down = false;
    const reworded = await env.call('search_conversations', {
        description: 'exclusive lock for threads',
    });
    assert.deepEqual(reworded.conversations[0], {
        conversation_id: child.id,
        learning_tree: 'Concurrency',
        address: '1.1',
        title: 'Why only one?',
        match: 'Exclusive access keeps shared data consistent.',
    });
    assert.ok(reworded.conversations.some((c) => c.conversation_id === concurrency.id));
    assert.ok(!reworded.conversations.some((c) => c.conversation_id === env.current.id));
    // Messages saved after the search (this reply) wait for the next one.
    assert.ok(
        env.store
            .recallMessages()
            .filter((m) => m.tree !== env.current.id)
            .every((m) => m.embedding),
    );

    const concept = await env.call('look_up_concept', { description: 'one thread at a time' });
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
    const semaphore = await env.call('look_up_concept', { description: 'Semaphore' });
    assert.equal(semaphore.concepts[0].name, 'Semaphore');
    assert.equal(typeof semaphore.concepts[0].guess, 'number');
    env.embedder.down = true;
    assert.equal(
        (await env.call('look_up_concept', { description: 'Soil' })).concepts[0].familiarity,
        'unknown',
    );

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
    await env.call('look_up_concept', { description: 'x' });
    assert.deepEqual(
        env.offered().filter((name) => recall.includes(name)),
        recall,
    );
    for (const name of recall) {
        await env.post('/api/settings/tutor-tools', { name, enabled: false });
        await env.call('look_up_concept', { description: 'x' }).catch(() => {});
        assert.ok(!env.offered().includes(name), `${name} is switched off`);
    }
});
