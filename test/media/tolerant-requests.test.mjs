import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diagramReply } from '../../server/media/diagrams.mjs';

const request = { title: 'T', description: 'D', intent: 'I', excerpt: 'E', shows: 'S' };
const json = JSON.stringify(request);
const args = { title: 'Halves', shows: 'A list cut in two', alt: 'The list splits at 8.' };
const visible = (output) => assert.doesNotMatch(output.text, /[{}]|rabbithole|tool_call/);

test('a <tool_call> becomes a call at its position and is hidden while it streams', () => {
    const raw = `Intro.\n<tool_call>${JSON.stringify({ name: 'show_visual', arguments: args })}</tool_call>\nAfter.`;
    const done = diagramReply(raw);
    assert.equal(done.text, 'Intro.\n\nAfter.');
    assert.deepEqual(done.calls, [{ name: 'show_visual', input: args, position: 7 }]);
    // Arguments sent as a JSON string read the same.
    const stringy = diagramReply(
        `<tool_call>{"name":"show_visual","arguments":${JSON.stringify(JSON.stringify(args))}}</tool_call>`,
    );
    assert.deepEqual(stringy.calls[0].input, args);
    for (let i = 1; i < raw.indexOf('</tool_call>') + 12; i++) {
        const partial = diagramReply(raw.slice(0, i));
        visible(partial);
        assert.equal(partial.calls.length, 0);
    }
    assert.match(diagramReply('<tool_call>nope</tool_call>').calls[0].error, /not valid JSON/);
});

test('broken colon and layout forms become the request they meant', () => {
    const colon = diagramReply(`Intro.\n:::rabbithole-visual ${json}\n:::\nAfter.`);
    assert.equal(colon.text, 'Intro.\nAfter.');
    assert.deepEqual(colon.requests, [
        { kind: 'visual', task: request, position: 6, closed: true },
    ]);
    const video = diagramReply(`Intro.\n:::rabbithole-video\n${json}\nAfter.`);
    assert.equal(video.text, 'Intro.\nAfter.');
    assert.equal(video.requests[0].kind, 'video');
    for (const layout of ['figure', 'wide']) {
        const wrapped = diagramReply(`Intro.\n:::${layout}\n${json}\nWords.\n:::\nAfter.`);
        assert.equal(wrapped.text, `Intro.\n:::${layout}\nWords.\n:::\nAfter.`);
        assert.deepEqual(wrapped.requests[0].task, request);
        assert.equal(wrapped.requests[0].position, `Intro.\n:::${layout}`.length);
    }
    // A colon block inside a figure leaves the figure's own closing line.
    const inside = diagramReply(`:::figure\nWords.\n:::rabbithole-visual ${json}\n:::\nAfter.`);
    assert.equal(inside.text, ':::figure\nWords.\n:::\nAfter.');
    // Old show_visual arguments in a broken block are hidden and run no call.
    const call = diagramReply(`:::wide\n${JSON.stringify(args)}\n:::`, true);
    assert.deepEqual(call.calls, []);
    assert.equal(call.text, ':::wide\n:::');
});

test('broken forms stay hidden while streaming and plain JSON elsewhere stays text', () => {
    for (const raw of [
        `Intro.\n:::rabbithole-visual ${json}\n:::\nAfter.`,
        `Intro.\n:::figure\n${json}\nWords.\n:::`,
    ])
        for (let i = 1; i < raw.length; i++) visible(diagramReply(raw.slice(0, i)));
    const cut = diagramReply(`:::figure\n{"title": "T", "desc`, true);
    assert.match(cut.requests[0].error, /cut off/);
    assert.equal(diagramReply('Data:\n{"title": "x"}').text, 'Data:\n{"title": "x"}');
    assert.equal(
        diagramReply(':::figure\n{"a": 1}\nWords.\n:::', true).text,
        ':::figure\n{"a": 1}\nWords.\n:::',
    );
});
