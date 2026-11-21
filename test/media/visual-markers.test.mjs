import { test } from 'node:test';
import assert from 'node:assert/strict';
import { source, complete, deferred, open, until } from '../support/visual-kit.mjs';

const INTRO = 'Binary search halves the list.';
const fields = {
    title: 'Predict the half',
    shows: 'Seven sorted numbers with the midpoint 8 marked',
    alt: 'Search for 12 in 2 to 14; the midpoint is 8. Which half remains?',
    check_answer: 'The right half remains, because 12 is greater than 8.',
};
const marker = `[[visual: predict-half | title: ${fields.title} | shows: ${fields.shows} | alt: ${fields.alt} | check: ${fields.check_answer}]]`;

const events = async (response) =>
    (await response.text())
        .split('\n\n')
        .filter((f) => f.startsWith('data: '))
        .map((f) => JSON.parse(f.slice(6)));
// Streams text in small deltas so a marker arrives across chunks.
const stream = (emit, text) => {
    for (let i = 0; i < text.length; i += 7)
        emit({ type: 'delta', item: 'answer', text: text.slice(i, i + 7) });
};
const writing = (workers, started) => ({
    generate: async (tree, text, emit) => {
        workers.push(JSON.parse(text));
        started?.resolve();
        complete(emit, source);
    },
});

test('a closed visual marker starts drawing at once, lands at the marker and keeps its check answer hidden', async () => {
    const started = deferred(),
        workers = [];
    let offered;
    const env = await open(
        {
            generate: async (tree, text, emit) => {
                offered = tree.tools.map((t) => t.name);
                stream(emit, `${INTRO}\n\n${marker}\n`);
                // The writer runs before the reply goes on.
                await Promise.race([
                    started.promise,
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('writer not started')), 5000),
                    ),
                ]);
                stream(emit, 'Think about it, then reveal.');
                emit({ type: 'status', status: 'completed' });
            },
        },
        writing(workers, started),
    );
    try {
        const streamed = await events(
            await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Check me.' }),
        );
        assert.deepEqual(streamed.at(-1), { type: 'done', status: 'completed' });
        assert.ok(!offered.includes('show_visual'));
        assert.ok(offered.includes('make_video'));
        for (const e of streamed.filter((e) => e.type === 'text'))
            assert.doesNotMatch(e.text, /\[|visual:|right half|greater/);
        const saved = await env.get(`/api/trees/${env.tree.id}`);
        const reply = saved.messages.at(-1);
        assert.equal(reply.text, `${INTRO}\n\n\nThink about it, then reveal.`);
        assert.equal(saved.artifacts.length, 1);
        const [visual] = saved.artifacts;
        assert.equal(visual.kind, 'visual');
        assert.equal(visual.position, `${INTRO}\n\n`.length);
        assert.equal(visual.title, fields.title);
        assert.equal(visual.description, fields.alt);
        // The writer gets the check answer and the reply so far; the learner-facing text does not.
        assert.deepEqual(workers[0].request, { ...fields, context: INTRO });
        assert.doesNotMatch(reply.text + visual.title + visual.description, /right half|greater/);
    } finally {
        await env.close();
    }
});

test('a visual marker is repaired: long fields cut, title and alt fall back, a repeated title drawn once', async () => {
    const workers = [],
        logs = [];
    const env = await open(
        {
            generate: async (tree, text, emit) =>
                complete(
                    emit,
                    [
                        'Look.',
                        '[[visual: halves | shows: A list cut at 8]]',
                        `[[visual: long | title: ${'t'.repeat(200)} | shows: ${'s'.repeat(300)} | alt: a\u0007b]]`,
                        '[[visual: again | title:  HAL ves | shows: The same cut]]',
                    ].join('\n'),
                ),
        },
        writing(workers),
        { log: (line) => logs.push(line) },
    );
    try {
        await events(await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Show me.' }));
        const [halves, long, ...rest] = env.store.tree(env.tree.id).artifacts;
        assert.equal(rest.length, 0);
        assert.deepEqual([halves.title, halves.description], ['halves', 'A list cut at 8']);
        assert.equal(long.title, 't'.repeat(120));
        assert.equal(long.description, 'ab');
        await until(() => workers.length === 2);
        assert.equal(workers.find((w) => w.request.alt === 'ab').request.shows, 's'.repeat(280));
        const drops = logs.filter((l) => /visual marker dropped/.test(l));
        assert.equal(drops.length, 1);
        assert.match(drops[0], /cause="title already shown in this reply"/);
    } finally {
        await env.close();
    }
});

test('a visual marker inside :::wide or :::figure lands at its marker', async () => {
    const text =
        ':::wide\n[[visual: a | shows: A]]\n:::\n\n:::figure{side=right}\n[[visual: b | shows: B]]\nThe loop runs twice.\n:::';
    const env = await open(
        { generate: async (tree, _text, emit) => complete(emit, text) },
        writing([]),
    );
    try {
        await events(await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Show me.' }));
        const saved = env.store.tree(env.tree.id);
        const reply = saved.messages.at(-1).text;
        assert.equal(reply, ':::wide\n\n:::\n\n:::figure{side=right}\n\nThe loop runs twice.\n:::');
        assert.deepEqual(
            saved.artifacts.map((a) => a.position),
            [':::wide\n'.length, ':::wide\n\n:::\n\n:::figure{side=right}\n'.length],
        );
    } finally {
        await env.close();
    }
});

test('a visual marker without shows, or not closed by the end of its line, draws nothing, shows nothing and is logged', async () => {
    const logs = [],
        texts = [];
    const raw =
        'Fusion.\n[[visual: lost | title: T | check: ANSWER-1]]\n[[visual: cut | shows: S | check: ANSWER-2 [x] y\nEnd. [[visual: z | shows: Q | check: ANSWER-3';
    const env = await open(
        {
            generate: async (tree, text, emit) => {
                stream(emit, raw);
                emit({ type: 'status', status: 'completed' });
            },
        },
        writing([]),
        { log: (line) => logs.push(line) },
    );
    try {
        const streamed = await events(
            await env.post(`/api/trees/${env.tree.id}/messages`, { text: 'Show me.' }),
        );
        assert.deepEqual(streamed.at(-1), { type: 'done', status: 'completed' });
        for (const e of streamed.filter((e) => e.type === 'text')) texts.push(e.text);
        const saved = env.store.tree(env.tree.id);
        const reply = saved.messages.at(-1);
        assert.equal(reply.text, 'Fusion.\n\n\nEnd. ');
        for (const text of [...texts, reply.text]) assert.doesNotMatch(text, /ANSWER|visual|\[/);
        assert.equal(saved.artifacts.length, 0);
        const drops = logs.filter((l) => /visual marker dropped/.test(l));
        assert.equal(drops.length, 3);
        assert.match(drops[0], new RegExp(`id="${reply.id}" conversation="${env.tree.id}"`));
        assert.match(drops[0], /cause="no shows"/);
        assert.match(drops[1], /cause="not closed by the end of its line"/);
        assert.match(drops[2], /cause="not closed by the end of its line"/);
        assert.ok(!logs.some((l) => /ANSWER/.test(l)));
    } finally {
        await env.close();
    }
});

test('a model without tool calling gets no show_visual text tool and its visual markers still draw', async () => {
    const workers = [],
        logs = [];
    let offered;
    const writer = writing(workers).generate;
    const env = await open(
        {
            generate: async (tree, text, emit) => {
                if (tree.instructions?.startsWith('You create one self-contained visual'))
                    return writer(tree, text, emit);
                offered = { tools: tree.tools, text: tree.textTools?.map((t) => t.name) };
                // A show_visual call written as text is hidden and refused.
                const call = `<tool_call>${JSON.stringify({ name: 'show_visual', arguments: { title: 'Old', shows: 'S', alt: 'A', name: 'old' } })}</tool_call>`;
                stream(emit, `${INTRO}\n${call}\n[[visual: half | shows: The right half]]\nDone.`);
                emit({ type: 'status', status: 'completed' });
            },
        },
        { generate: writer },
        { log: (line) => logs.push(line) },
    );
    try {
        const tree = env.store.create('Endpoint', 'openai', 'smart', 'high');
        const streamed = await events(
            await env.post(`/api/trees/${tree.id}/messages`, { text: 'Show me.' }),
        );
        assert.deepEqual(streamed.at(-1), { type: 'done', status: 'completed' });
        assert.deepEqual(offered, { tools: undefined, text: ['make_video'] });
        for (const e of streamed.filter((e) => e.type === 'text'))
            assert.doesNotMatch(e.text, /tool_call|[{}[]/);
        const saved = await env.get(`/api/trees/${tree.id}`);
        assert.equal(saved.messages.at(-1).text, `${INTRO}\n\n\nDone.`);
        assert.deepEqual(
            saved.artifacts.map((a) => [a.title, a.position]),
            [['half', `${INTRO}\n\n`.length]],
        );
        await until(() => workers.length === 1);
        assert.ok(
            logs.some((l) => /tool="show_visual" cause="show_visual is not a text tool/.test(l)),
        );
    } finally {
        await env.close();
    }
});
