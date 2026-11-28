import test from 'node:test';
import assert from 'node:assert/strict';
import { boardToolCalls } from '../../server/board/toolCalls.mjs';
import { fakeClock } from '../support/player-kit.mjs';

// A board turn whose tutor said two sentences, then announced a tool; fake fillers record what is written and played.
function setup() {
    const clock = fakeClock();
    let chunks = 0;
    const written = [],
        played = [],
        sent = [];
    const fillers = {
        later(current, moment, detail) {
            const n = written.push({ moment, ...detail });
            return async (still) => !!(still() && played.push(n));
        },
        say: (current, moment) => written.push({ moment }),
    };
    const calls = boardToolCalls({
        store: { live: () => false },
        id: 'c1',
        send: (e) => sent.push(e),
        speak() {},
        fillers,
        clock,
        voiced: () => chunks,
    });
    const current = {
        sentences: [{ text: 'One.' }, { text: 'Two.' }, { text: 'Let me check the docs.' }],
        over: 0,
        tools: new Set(),
        toolSaid: 0,
        done: false,
    };
    const tool = (status) => ({ id: 't1', name: 'web_search', input: { q: 'x' }, status });
    calls.event(current, tool('running'), { cut() {} });
    const flush = () => new Promise(setImmediate);
    return {
        clock,
        calls,
        current,
        written,
        played,
        sent,
        flush,
        tool,
        speech: () => chunks++,
    };
}

test('board tool wait: a wait filler is written as the announced tool starts and plays 1.5 s after its intent ends, then a second, at most two', async () => {
    const { clock, calls, current, written, played, sent, flush } = setup();
    assert.deepEqual(
        written.map(({ moment, from, tool }) => [moment, from, tool.name]),
        [['wait', 1, 'web_search']],
        'written at once, its intent the last two sentences',
    );
    assert.equal(sent[0].tool.status, 'running');
    clock.advance(5000);
    assert.deepEqual(played, [], 'nothing before the intent has played');
    calls.ended(current, 1);
    clock.advance(5000);
    assert.deepEqual(played, [], 'an earlier sentence ending starts nothing');
    calls.ended(current, 2);
    clock.advance(1499);
    assert.deepEqual(played, []);
    clock.advance(1);
    await flush();
    assert.deepEqual(played, [1], 'the first plays 1.5 s after the intent ends');
    assert.equal(written.length, 2, 'the second is written as the first plays');
    clock.advance(5000);
    assert.deepEqual(played, [1], 'the second waits for the first to end');
    calls.fillerEnded(current);
    calls.fillerEnded(current);
    clock.advance(1499);
    assert.deepEqual(played, [1]);
    clock.advance(1);
    await flush();
    assert.deepEqual(played, [1, 2], 'the second plays 1.5 s after the first ends');
    calls.fillerEnded(current);
    clock.advance(10000);
    await flush();
    assert.deepEqual(played, [1, 2], 'two per tool wait at most');
    assert.equal(written.length, 2);
});

test('board tool wait: no filler plays once the tutor speaks again, the tool ends, or the turn ends', async () => {
    for (const [case_, cut] of [
        ['new speech', (s) => s.speech()],
        ['the tool ending before 1.5 s', (s) => s.calls.event(s.current, s.tool('done'), {})],
        ['the turn ending or stopping', (s) => (s.current.done = true)],
    ]) {
        const s = setup();
        s.calls.ended(s.current, 2);
        s.clock.advance(1000);
        cut(s);
        s.clock.advance(1000);
        await s.flush();
        assert.deepEqual(s.played, [], case_);
    }
    for (const [case_, cut] of [
        ['new speech', (s) => s.speech()],
        ['the tool ending', (s) => s.calls.event(s.current, s.tool('done'), {})],
        ['the turn ending or stopping', (s) => (s.current.done = true)],
    ]) {
        const s = setup();
        s.calls.ended(s.current, 2);
        s.clock.advance(1500);
        await s.flush();
        s.calls.fillerEnded(s.current);
        cut(s);
        s.clock.advance(1500);
        await s.flush();
        assert.deepEqual(s.played, [1], `the second line is dropped on ${case_}`);
    }
});

test('board tool wait: an intent already played when the tool starts starts the wait at once; a call with no intent gets the tool filler', async () => {
    const s = setup();
    s.current.sentences.push({ text: 'Now the second source.' });
    s.current.over = 4;
    s.calls.event(s.current, { ...s.tool('running'), id: 't2' }, { cut() {} });
    assert.equal(s.written.at(-1).from, 3, 'its intent is the sentence since the last call');
    s.clock.advance(1500);
    await s.flush();
    assert.deepEqual(s.played, [2]);
    s.calls.event(s.current, { ...s.tool('running'), id: 't3' }, { cut() {} });
    assert.equal(s.written.at(-1).moment, 'tool');
});
