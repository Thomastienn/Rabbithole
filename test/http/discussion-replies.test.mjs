import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../../server/store.mjs';
import { open, complete } from '../support/diagram-kit.mjs';
import { discussion, discussionBlock } from '../fixtures/discussion.mjs';

const verdict =
    '\n```rabbithole-verdict\n[{"concept":"Hyphae","level":5,"confidence":"high"}]\n```';
const responseLines = [
    { speaker: 'Theo', text: 'Then the plant can trade less when soil is rich?' },
    { speaker: 'Tutor', text: 'Yes, that follows from what you explained.' },
];
const continuation = responseLines.map((l) => JSON.stringify(l)).join('\n') + verdict;
const events = (wire) =>
    wire
        .split('\n\n')
        .filter((s) => s.startsWith('data: '))
        .map((s) => JSON.parse(s.slice(6)));
const seed = (store, conversation, saved = discussion) => {
    store.message(conversation, 'user', 'Discuss Hyphae.', 'completed');
    const message = store.message(conversation, 'assistant', 'Here is a discussion.', 'completed');
    const artifact = store.pendingArtifact(
        conversation,
        message,
        'Discussion',
        '',
        'discussion',
        null,
        21,
    );
    return store.finishArtifact(conversation, artifact.id, JSON.stringify(saved));
};

test('card replies stream saved named lines, carry context and hidden levels, and observe only the learner', async (t) => {
    const calls = [];
    const env = await open(
        {
            generate: async (tree, prompt, emit) => {
                calls.push({ tree, prompt });
                for (const character of continuation)
                    emit({ type: 'delta', item: 'turn', text: character });
                emit({ type: 'status', status: 'completed' });
                emit({ type: 'usage', usage: { input: 40, output: 30, cacheRead: 0 } });
            },
        },
        { log: () => {}, saveEvery: 0 },
    );
    t.after(env.close);
    const { id } = await (await env.post('/api/trees')).json();
    const artifact = seed(env.store, id);
    const earlier = env.store.create('Elsewhere');
    const prior = env.store.message(earlier.id, 'user', 'I know Hyphae.', 'completed');
    env.store.observe(prior, [{ concept: 'Hyphae', level: 3, confidence: 'high' }]);
    env.store.addGraph(
        {
            concepts: [
                { name: 'Hyphae', topics: [] },
                { name: 'Fungus', topics: [] },
            ],
            links: [{ from: 'Hyphae', to: 'Fungus', kind: 'builds on' }],
        },
        prior,
    );
    const response = await env.post(`/api/trees/${id}/discussions/${artifact.id}/replies`, {
        text: 'Theo, Hyphae trade less when phosphorus is plentiful.',
    });
    assert.equal(response.status, 200);
    const wire = await response.text(),
        updates = events(wire)
            .filter((e) => e.type === 'artifact')
            .map((e) => e.artifact);
    assert.doesNotMatch(wire, /rabbithole-verdict|"level"|"voice"|"confidence"|below|above/);
    assert.doesNotMatch(wire, /lowercase|sceptical/);
    const learner = {
        speaker: 'Learner',
        text: 'Theo, Hyphae trade less when phosphorus is plentiful.',
    };
    assert.deepEqual(updates[0].discussion.lines, [...discussion.lines, learner]);
    assert.equal(updates[0].discussion.turn.status, 'streaming');
    assert.ok(updates.some((a) => a.discussion.lines.at(-1)?.text === 'Then'));
    assert.deepEqual(updates.at(-1).discussion.lines, [
        ...discussion.lines,
        learner,
        ...responseLines,
    ]);
    assert.equal(updates.at(-1).discussion.turn.status, 'completed');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].tree.thread, null);
    assert.ok(calls[0].tree.messages.some((m) => m.text === 'Discuss Hyphae.'));
    const prompt = JSON.parse(calls[0].prompt);
    assert.deepEqual(prompt.discussion.classmates, discussion.classmates);
    assert.deepEqual(prompt.discussion.lines.at(-1), learner);
    assert.ok(
        prompt.neighbourhood.concepts.some(
            (c) => c.name === 'Hyphae' && typeof c.familiarity === 'number',
        ),
    );
    assert.ok(
        prompt.neighbourhood.concepts.some(
            (c) => c.name === 'Fungus' && typeof c.guess === 'number',
        ),
    );
    const graph = env.store.graph();
    assert.equal(graph.concepts.find((c) => c.name === 'Hyphae').observations[5], 1);
    assert.equal(
        graph.concepts.find((c) => c.name === 'Hyphae').observations.reduce((a, b) => a + b),
        2,
    );
    assert.equal(
        env.store.tree(id).messages.length,
        2,
        'card lines do not become main-thread messages',
    );
    assert.ok(env.store.usageEvents().events.some((e) => e.task === 'chat' && e.input === 40));
    const reopened = new Store(env.path);
    assert.deepEqual(reopened.discussion(id, artifact.id).lines.slice(-2), responseLines);
    reopened.close();
});

test('a streamed turn saves and sends at most once per save interval and always saves its end', async (t) => {
    let mode = 'complete';
    const env = await open(
        {
            generate: async (_, __, emit) => {
                for (const character of continuation)
                    emit({ type: 'delta', item: 'turn', text: character });
                if (mode === 'fail') throw new Error('Fixture provider timed out');
                emit({ type: 'status', status: 'completed' });
            },
        },
        { log: () => {}, saveEvery: 60_000 },
    );
    t.after(env.close);
    const { id } = await (await env.post('/api/trees')).json();
    const artifact = seed(env.store, id);
    let writes = 0;
    const update = env.store.updateDiscussion.bind(env.store);
    env.store.updateDiscussion = (...args) => (writes++, update(...args));
    for (mode of ['complete', 'fail']) {
        writes = 0;
        const updates = events(
            await (
                await env.post(`/api/trees/${id}/discussions/${artifact.id}/replies`, {
                    text: 'I think both benefit.',
                })
            ).text(),
        ).filter((e) => e.type === 'artifact');
        // The learner's line, the first token, and the end.
        assert.equal(writes, 2);
        assert.equal(updates.length, 3);
        const last = updates.at(-1).artifact.discussion;
        assert.deepEqual(last.lines.slice(-2), responseLines);
        assert.equal(last.turn.status, mode === 'fail' ? 'failed' : 'completed');
        assert.deepEqual(env.store.discussion(id, artifact.id).lines.slice(-2), responseLines);
    }
});

test('discussions saved before voices still load and accept replies', async (t) => {
    const calls = [];
    const env = await open(
        {
            generate: async (tree, prompt, emit) => {
                calls.push(prompt);
                emit({ type: 'delta', item: 'turn', text: continuation });
                emit({ type: 'status', status: 'completed' });
            },
        },
        { log: () => {} },
    );
    t.after(env.close);
    const { id } = await (await env.post('/api/trees')).json();
    const older = {
        ...discussion,
        classmates: discussion.classmates.map(({ voice, ...c }) => c),
    };
    const artifact = seed(env.store, id, older);
    const saved = await (await env.get(`/api/trees/${id}`)).json();
    assert.deepEqual(saved.artifacts[0].discussion.classmates, ['Maya', 'Theo', 'Jun']);
    const wire = await (
        await env.post(`/api/trees/${id}/discussions/${artifact.id}/replies`, { text: 'Both win.' })
    ).text();
    const last = events(wire)
        .filter((e) => e.type === 'artifact')
        .at(-1).artifact;
    assert.equal(last.discussion.turn.status, 'completed');
    assert.deepEqual(last.discussion.lines.slice(-2), responseLines);
    assert.deepEqual(JSON.parse(calls[0]).discussion.classmates, older.classmates);
});

test('main-thread send closes every open discussion once and uses paragraphs in all later model context', async (t) => {
    const calls = [];
    const env = await open(
        {
            generate: async (tree, prompt, emit, saveThread) => {
                calls.push({ tree, prompt });
                const compacting = tree.instructions?.includes(
                    'background a new focused conversation',
                );
                complete(
                    emit,
                    compacting
                        ? 'The classmates discussed a useful exchange. The learner explained its limits.'
                        : 'Continue with the topic.',
                );
                saveThread('native-thread', 'fixture');
            },
        },
        { log: () => {} },
    );
    t.after(env.close);
    const { id } = await (await env.post('/api/trees')).json();
    const artifacts = [seed(env.store, id), seed(env.store, id)];
    env.store.thread(id, 'old-session-with-raw-discussion');
    const wire = await (
        await env.post(`/api/trees/${id}/messages`, { text: 'What comes next?' })
    ).text();
    const updates = events(wire).filter((e) => e.type === 'artifact');
    for (const a of artifacts) {
        assert.ok(updates.some((e) => e.artifact.id === a.id && e.artifact.discussion.closed));
        const data = env.store.discussion(id, a.id);
        assert.equal(data.closed, true);
        assert.equal(
            data.summary,
            'The classmates discussed a useful exchange. The learner explained its limits.',
        );
        assert.deepEqual(data.lines, discussion.lines);
        assert.equal(
            (await env.post(`/api/trees/${id}/discussions/${a.id}/replies`, { text: 'Reopen?' }))
                .status,
            409,
        );
    }
    assert.equal(calls.length, 3, 'two compactions then the main chat');
    assert.equal(calls.at(-1).tree.thread, null, 'raw provider history cannot survive closing');
    assert.match(JSON.stringify(calls.at(-1).tree.messages), /The learner explained its limits/);
    assert.doesNotMatch(
        JSON.stringify(calls.at(-1).tree.messages),
        /Is the fungus a parasite|"classmates"|"speaker"/,
    );
    await (await env.post(`/api/trees/${id}/messages`, { text: 'And after that?' })).text();
    assert.equal(calls.length, 4, 'completed paragraphs never compact again');
    const reopened = new Store(env.path);
    assert.ok(reopened.discussion(id, artifacts[0].id).closed);
    reopened.close();
});

test('failed and malformed turns keep prior and partial lines and allow a fresh learner reply', async (t) => {
    let mode = 'fail';
    const env = await open(
        {
            generate: async (_, __, emit) => {
                emit({
                    type: 'delta',
                    item: 'turn',
                    text: JSON.stringify(responseLines[0]) + '\n{"speaker":"Jun","text":"Partial',
                });
                if (mode === 'fail') throw new Error('Fixture provider timed out');
                emit({ type: 'status', status: 'completed' });
            },
        },
        { log: () => {} },
    );
    t.after(env.close);
    const { id } = await (await env.post('/api/trees')).json();
    const artifact = seed(env.store, id);
    for (mode of ['fail', 'malformed']) {
        const before = env.store.discussion(id, artifact.id).lines;
        const wire = await (
            await env.post(`/api/trees/${id}/discussions/${artifact.id}/replies`, {
                text: 'I think both benefit.',
            })
        ).text();
        const result = events(wire)
            .filter((e) => e.type === 'artifact')
            .at(-1).artifact;
        assert.equal(
            result.status,
            'ready',
            'a failed turn does not make the transcript unavailable',
        );
        assert.equal(result.discussion.turn.status, 'failed');
        assert.deepEqual(
            result.discussion.lines.slice(0, before.length),
            before.map(({ speaker, text }) => ({ speaker, text })),
        );
        assert.equal(result.discussion.lines.at(-1).text, 'Partial');
        assert.match(result.error, mode === 'fail' ? /Fixture provider timed out/ : /incomplete/);
    }
    assert.ok(env.store.graph().concepts.every((c) => c.observations.every((n) => n === 0)));
});

test('closing during a streamed card turn cancels it and late events cannot mutate the closed transcript', async (t) => {
    const started = Promise.withResolvers(),
        late = Promise.withResolvers();
    const env = await open(
        {
            generate: async (tree, _, emit, __, signal) => {
                if (tree.instructions?.startsWith('Continue this discussion')) {
                    emit({
                        type: 'delta',
                        item: 'turn',
                        text: '{"speaker":"Jun","text":"In flight',
                    });
                    started.resolve(signal);
                    await late.promise;
                    emit({ type: 'delta', item: 'turn', text: ' LATE"}' });
                    emit({ type: 'status', status: 'completed' });
                } else complete(emit, 'A compact paragraph.');
            },
        },
        { log: () => {} },
    );
    t.after(env.close);
    const { id } = await (await env.post('/api/trees')).json();
    const artifact = seed(env.store, id);
    const reply = env.post(`/api/trees/${id}/discussions/${artifact.id}/replies`, {
        text: 'Both benefit?',
    });
    const signal = await started.promise;
    assert.equal(
        (await env.post(`/api/trees/${id}/discussions/${artifact.id}/replies`, { text: 'Again?' }))
            .status,
        409,
    );
    await (
        await env.post(`/api/trees/${id}/messages`, { text: 'Continue the conversation.' })
    ).text();
    assert.equal(signal.aborted, true);
    const saved = env.store.discussion(id, artifact.id);
    assert.equal(saved.closed, true);
    assert.equal(saved.lines.at(-1).text, 'In flight');
    late.resolve();
    await (await reply).text();
    await env.app.settled();
    assert.deepEqual(env.store.discussion(id, artifact.id), saved);
});

test('failed compaction keeps cards closed, refuses a chat without context, and retry prepares the paragraph', async (t) => {
    let fail = true,
        chatCalls = 0,
        compactions = 0;
    const env = await open(
        {
            generate: async (tree, _, emit) => {
                if (tree.instructions?.includes('background a new focused conversation')) {
                    compactions++;
                    if (fail) throw new Error('Fixture quick thinking unavailable');
                    complete(emit, 'Recovered discussion paragraph.');
                } else {
                    chatCalls++;
                    complete(emit, 'Now continue.');
                }
            },
        },
        { log: () => {} },
    );
    t.after(env.close);
    const { id } = await (await env.post('/api/trees')).json();
    const artifact = seed(env.store, id);
    const wire = await (await env.post(`/api/trees/${id}/messages`, { text: 'Continue.' })).text();
    assert.match(wire, /Discussion context preparation failed/);
    assert.equal(chatCalls, 0);
    assert.equal(env.store.discussion(id, artifact.id).closed, true);
    fail = false;
    await (await env.post(`/api/trees/${id}/retry`)).text();
    assert.equal(chatCalls, 1);
    assert.equal(compactions, 2);
    assert.equal(env.store.discussion(id, artifact.id).summary, 'Recovered discussion paragraph.');
});

test('invalid and foreign card replies are refused before changing the discussion', async (t) => {
    const env = await open(
        {
            generate: async () => {
                throw new Error('should not call');
            },
        },
        { log: () => {} },
    );
    t.after(env.close);
    const { id } = await (await env.post('/api/trees')).json();
    const artifact = seed(env.store, id);
    for (const text of ['', 123, 'x'.repeat(10001)])
        assert.equal(
            (await env.post(`/api/trees/${id}/discussions/${artifact.id}/replies`, { text }))
                .status,
            400,
        );
    const other = env.store.create('Other');
    assert.equal(
        (
            await env.post(`/api/trees/${other.id}/discussions/${artifact.id}/replies`, {
                text: 'No.',
            })
        ).status,
        404,
    );
    assert.deepEqual(env.store.discussion(id, artifact.id), discussion);
});

test('restarting preserves partial discussion lines, marks the turn failed, and starts no inference', async (t) => {
    let calls = 0;
    const env = await open(
        {
            generate: async (_, __, emit) => {
                calls++;
                complete(emit, JSON.stringify(responseLines[0]) + verdict);
            },
        },
        { log: () => {} },
    );
    t.after(env.close);
    const { id } = await (await env.post('/api/trees')).json();
    const artifact = seed(env.store, id);
    const started = env.store.replyDiscussion(id, artifact.id, 'My saved answer.');
    const turn = JSON.parse(started.source).turn;
    env.store.updateDiscussion(id, artifact.id, turn.id, [
        { speaker: 'Jun', text: 'Partial before restart' },
    ]);
    const reopened = new Store(env.path);
    const saved = reopened.discussion(id, artifact.id);
    assert.equal(saved.turn.status, 'failed');
    assert.equal(saved.lines.at(-1).text, 'Partial before restart');
    assert.match(reopened.artifact(id, artifact.id).error, /interrupted/);
    assert.equal(calls, 0);
    reopened.close();
    await (
        await env.post(`/api/trees/${id}/discussions/${artifact.id}/replies`, {
            text: 'Try again.',
        })
    ).text();
    assert.equal(calls, 1);
    assert.equal(env.store.artifact(id, artifact.id).error, null);
    assert.ok(
        env.store
            .discussion(id, artifact.id)
            .lines.some((l) => l.text === 'Partial before restart'),
    );
});

test('deleting a conversation cancels its discussion turn and never resurrects its lines', async (t) => {
    const started = Promise.withResolvers();
    const env = await open(
        {
            generate: async (_, __, emit, ___, signal) => {
                emit({ type: 'delta', item: 'turn', text: '{"speaker":"Jun","text":"In flight' });
                started.resolve(signal);
                await new Promise((resolve) =>
                    signal.addEventListener('abort', resolve, { once: true }),
                );
                emit({ type: 'delta', item: 'turn', text: ' late"}' });
            },
        },
        { log: () => {} },
    );
    t.after(env.close);
    const { id } = await (await env.post('/api/trees')).json();
    const artifact = seed(env.store, id);
    const reply = env.post(`/api/trees/${id}/discussions/${artifact.id}/replies`, {
        text: 'Both benefit?',
    });
    const signal = await started.promise;
    assert.equal((await env.post(`/api/trees/${id}/delete`, { conversation: id })).status, 200);
    await (await reply).text();
    await env.app.settled();
    assert.equal(signal.aborted, true);
    assert.ok(!env.store.tree(id));
    assert.ok(!env.store.artifact(id, artifact.id));
});
