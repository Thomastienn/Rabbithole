import test from 'node:test';
import assert from 'node:assert/strict';
import { replyUsageLine, conversationUsageLine, withTurn } from '../../src/chat/turn.ts';

const counts = { input: 100, output: 20, cacheRead: 3 };
const media = [
    { task: 'diagram', ...counts },
    { task: 'diagram', ...counts },
    { task: 'diagram', input: null, output: null, cacheRead: null },
    { task: 'video', ...counts },
];

test('reply usage labels every task, sums attempts and keeps missing measurements explicit', () => {
    assert.equal(
        replyUsageLine(counts, counts, media),
        'Chat: 100 input · 20 output · 3 cache-read tokens · Suggestions: 100 input · 20 output · 3 cache-read tokens · Visuals: 200 input · 40 output · 6 cache-read tokens · 1 call not reported · Videos: 100 input · 20 output · 3 cache-read tokens',
    );
    assert.equal(
        replyUsageLine(null, undefined, [
            { task: 'video', input: null, output: null, cacheRead: null },
        ]),
        'Chat: not reported · Videos: not reported',
    );
    assert.match(
        replyUsageLine(counts, undefined, [{ task: 'video', input: 0, output: 0, cacheRead: 0 }]),
        /Videos: 0 input · 0 output · 0 cache-read tokens$/,
        'a reported zero is distinct from an unreported measurement',
    );
});

test('conversation totals include failed and running media, exclude other conversations and preserve the context measurement', () => {
    const messages = [
        { id: 'a', role: 'assistant', status: 'completed', usage: counts, mediaUsage: media },
        { id: 'b', role: 'assistant', status: 'streaming', mediaUsage: [media[3]] },
        { id: 'c', role: 'assistant', status: 'failed', mediaUsage: [media[0]] },
        { id: 'q', role: 'user', usage: counts },
    ];
    const line = conversationUsageLine(messages, [
        { message: 'a', usage: counts },
        { message: 'other', usage: counts },
    ]);
    assert.match(line, /^Chat: 100 input · 20 output · 3 cache-read tokens · 2 calls not reported/);
    assert.match(line, /Suggestions: 100 input/);
    assert.match(
        line,
        /Visuals: 300 input · 60 output · 9 cache-read tokens · 1 call not reported/,
    );
    assert.match(line, /Videos: 200 input · 40 output · 6 cache-read tokens$/);
    const current = withTurn({ messages }, { reply: { id: 'b', text: 'Live text' } });
    assert.deepEqual(current.messages[1].mediaUsage, [media[3]]);
    assert.equal(current.messages[1].text, 'Live text');
    assert.equal(current.messages[0].usage, counts, 'media never changes chat context usage');
});
