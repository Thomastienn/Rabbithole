import test from 'node:test';
import assert from 'node:assert/strict';
import { diagramReply, tutorSystem, VERDICT_RULE } from '../../server/media/diagrams.mjs';

const verdicts = [{ concept: 'Mutex', level: 3, confidence: 'high' }];
const json = JSON.stringify(verdicts);

test('verdicts stay hidden at every streamed character boundary, with ordinary text before and after', () => {
    for (const block of [
        '\n```rabbithole-verdict\n' + json + '\n```',
        '\n~~~~rabbithole-verdict\r\n' + json + '\r\n~~~~',
        '<rabbithole-verdict>' + json + '</rabbithole-verdict>',
    ]) {
        for (let i = 0; i <= block.length; i++) {
            const parsed = diagramReply('Before.' + block.slice(0, i));
            assert.equal(parsed.text.trim(), 'Before.', `chunk ends at ${block.slice(0, i)}`);
            assert.equal(parsed.requested, false, 'a verdict never starts media');
        }
        const parsed = diagramReply('Before.' + block + '\nAfter.', true);
        assert.equal(parsed.text, 'Before.\nAfter.');
        assert.deepEqual(parsed.verdicts, verdicts);
    }
});

test('cut-off and malformed verdict blocks stay hidden, including an unfinished reserved opening', () => {
    for (const block of [
        '\n```rabbithole-verdict\n' + json,
        '\n```rabbithole-verd',
        '<rabbithole-verdict',
        '\n```rabbithole-verdict\nnot JSON\n```',
    ]) {
        const parsed = diagramReply('Before.' + block, true);
        assert.equal(parsed.text.trimEnd(), 'Before.');
        assert.equal(parsed.verdicts, null);
    }
    assert.equal(diagramReply('A normal final backtick `', true).text, 'A normal final backtick `');
    assert.equal(diagramReply('Code:\n```', true).text, 'Code:\n```');
});

test('verdict parsing validates levels and confidence, and deduplicates concept names case-insensitively', () => {
    const entries = [
        ...verdicts,
        { concept: ' MUTEX ', level: 0, confidence: 'low' },
        { concept: 'New idea', level: 5, confidence: 'high' },
        null,
        { concept: '', level: 1, confidence: 'low' },
        { concept: 'Wrong level', level: 6, confidence: 'high' },
        { concept: 'Fraction', level: 1.5, confidence: 'high' },
        { concept: 'String', level: '3', confidence: 'low' },
        { concept: 'No confidence', level: 2 },
        { concept: 'Wrong confidence', level: 2, confidence: 'sure' },
    ];
    const parse = (value) => diagramReply('```rabbithole-verdict\n' + value + '\n```', true);
    assert.deepEqual(parse(JSON.stringify(entries)).verdicts, [
        { concept: 'MUTEX', level: 0, confidence: 'low' },
        { concept: 'New idea', level: 5, confidence: 'high' },
    ]);
    assert.deepEqual(parse('[]').verdicts, []);
    assert.equal(parse('[{}]').verdicts, null);
    assert.equal(diagramReply('Thanks!', true).verdicts, null);
});

test('verdicts and media share the reply parser without turning verdicts into media requests', () => {
    const video = { title: 'Title', description: 'Description', intent: 'Intent', excerpt: 'Text' };
    const parsed = diagramReply(
        'Before.\n```rabbithole-verdict\n' +
            json +
            '\n```' +
            '\n```rabbithole-video\n' +
            JSON.stringify(video) +
            '\n```\nAfter.',
        true,
    );
    assert.equal(parsed.text, 'Before.\nAfter.');
    assert.deepEqual(parsed.verdicts, verdicts);
    assert.equal(parsed.requests.length, 1);
    assert.deepEqual(parsed.requests[0].task, video);
    assert.equal(parsed.requests[0].kind, 'video');
});

test('the fixed tutor rule reaches the tutor prompt', () => {
    assert.ok(tutorSystem({ tutorStyle: 'My style.' }).includes(VERDICT_RULE));
});
