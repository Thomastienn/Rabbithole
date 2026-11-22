import test from 'node:test';
import assert from 'node:assert/strict';
import { collectText } from '../../server/providers/chatStream.mjs';
import { mediaCall } from '../../server/media/media-call.mjs';

const collected = (events) => {
    const streamed = collectText();
    const changed = events.map(streamed.onEvent);
    return { text: streamed.text('|'), status: streamed.status, changed };
};

test('streamed text collects deltas, whole items and a mix of both', () => {
    assert.equal(
        collected([
            { type: 'delta', item: 'a', text: 'Hel' },
            { type: 'delta', item: 'a', text: 'lo' },
        ]).text,
        'Hello',
    );
    assert.equal(
        collected([
            { type: 'item', item: 'a', text: 'One' },
            { type: 'item', item: 'b', text: 'Two' },
        ]).text,
        'One|Two',
    );
    // A whole item replaces the deltas before it; later deltas add to it.
    assert.equal(
        collected([
            { type: 'delta', item: 'a', text: 'dra' },
            { type: 'item', item: 'a', text: 'Draft' },
            { type: 'delta', item: 'a', text: ' one' },
            { type: 'delta', item: 'b', text: 'Next' },
        ]).text,
        'Draft one|Next',
    );
});

test('streamed text keeps the last status and reports which events changed the text', () => {
    const { status, changed } = collected([
        { type: 'status', status: 'streaming' },
        { type: 'delta', item: 'a', text: 'x' },
        { type: 'usage', usage: {} },
        { type: 'status', status: 'completed' },
    ]);
    assert.equal(status, 'completed');
    assert.deepEqual(changed, [false, true, false, false]);
});

const fakeProvider = (events, trees = []) => ({
    generate: async (tree, _text, emit) => (trees.push(tree), events.forEach(emit)),
});
const KIND = {
    role: 'video',
    bytes: 64 * 1024,
    overflow: 'Video composition exceeds 64 KiB.',
    incomplete: 'Video composition did not complete.',
    failed: (reason) => `Video provider failed: ${reason}`,
};
const done = [{ type: 'status', status: 'completed' }];

test('a media call returns its collected text and fails once it passes the limit', async () => {
    const signal = new AbortController().signal;
    const partial = [];
    const answer = await mediaCall(
        fakeProvider([
            { type: 'delta', item: 'a', text: 'Sce' },
            { type: 'item', item: 'a', text: 'Scene' },
            { type: 'delta', item: 'b', text: 'Two' },
            ...done,
        ]),
        {},
        KIND,
        { instructions: '', input: '', signal, onText: (_bytes, text) => partial.push(text) },
    );
    assert.equal(answer, 'Scene\n\nTwo');
    assert.deepEqual(partial, ['Sce', 'Scene', 'Scene\n\nTwo']);
    await assert.rejects(
        mediaCall(
            fakeProvider([
                ...Array.from({ length: 33 }, (_, i) => ({ type: 'item', item: i, text: 'x' })),
                { type: 'delta', item: 0, text: 'more' },
                ...done,
            ]),
            {},
            { ...KIND, tooManyItems: 'Too many items.' },
            { instructions: '', input: '', signal },
        ),
        /^Error: Too many items\.$/,
    );
    await assert.rejects(
        mediaCall(
            fakeProvider([{ type: 'item', item: 'a', text: 'xx' }, ...done]),
            {},
            {
                ...KIND,
                bytes: 1,
            },
            { instructions: '', input: '', signal },
        ),
        (error) => error.invalidOutput && error.message === 'Video composition exceeds 64 KiB.',
    );
});

test('a media call names its role and gives text tools only to a model without tool calls', async () => {
    const signal = new AbortController().signal,
        trees = [];
    const tools = { tools: [{ name: 'finish' }], runTool: () => 'ok', textTools: ' Write calls.' };
    for (const capable of [true, false])
        await mediaCall(fakeProvider(done, trees), { model: 'm' }, KIND, {
            instructions: 'Plan.',
            input: '',
            signal,
            tools: { ...tools, capable },
        });
    await mediaCall(fakeProvider(done, trees), {}, KIND, {
        instructions: 'Plan.',
        input: '',
        signal,
    });
    assert.deepEqual(
        trees.map((t) => [t.role, t.model, t.instructions, t.tools?.length]),
        [
            ['video', 'm', 'Plan.', 1],
            ['video', 'm', 'Plan. Write calls.', undefined],
            ['video', undefined, 'Plan.', undefined],
        ],
    );
});
