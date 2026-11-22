import test from 'node:test';
import assert from 'node:assert/strict';
import { collectText } from '../../server/providers/chatStream.mjs';
import { videoCall } from '../../server/media/video-call.mjs';

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

const fakeProvider = (events) => ({
    generate: async (_tree, _text, emit) => events.forEach(emit),
});

test('a video call returns its collected text and fails once it passes the limit', async () => {
    const signal = new AbortController().signal;
    const partial = [];
    const answer = await videoCall(
        fakeProvider([
            { type: 'delta', item: 'a', text: 'Sce' },
            { type: 'item', item: 'a', text: 'Scene' },
            { type: 'delta', item: 'b', text: 'Two' },
            { type: 'status', status: 'completed' },
        ]),
        {},
        '',
        '',
        signal,
        (_bytes, text) => partial.push(text),
    );
    assert.equal(answer, 'Scene\n\nTwo');
    assert.deepEqual(partial, ['Sce', 'Scene', 'Scene\n\nTwo']);
    await assert.rejects(
        videoCall(
            fakeProvider([
                ...Array.from({ length: 33 }, (_, i) => ({ type: 'item', item: i, text: 'x' })),
                { type: 'delta', item: 0, text: 'more' },
                { type: 'status', status: 'completed' },
            ]),
            {},
            '',
            '',
            signal,
        ),
        /exceeds 64 KiB/,
    );
});
