import { test } from 'node:test';
import assert from 'node:assert/strict';
import { complete, until } from '../support/diagram-kit.mjs';
import { boardProvider, messages, opened, setup } from '../support/board-kit.mjs';
import { NO_ANSWER, WAIT_MS } from '../../server/board/session.mjs';

// A fake clock: the test says when a wait has passed.
const fakeClock = () => {
    const timers = [];
    return {
        timers,
        setTimeout: (run, ms) => (timers.push({ run, ms }), run),
        clearTimeout: (run) => {
            const i = timers.findIndex((t) => t.run === run);
            if (i >= 0) timers.splice(i, 1);
        },
        // Runs the one wait timer, checking it is about 4 s.
        pass() {
            assert.equal(timers.length, 1, 'one wait is running');
            const [{ run, ms }] = timers.splice(0);
            assert.equal(ms, WAIT_MS);
            run();
        },
    };
};

// Plays a board turn of n sentences to its end: each shows in full, then the board goes idle.
const played = async (board, n) => {
    const sentences = [];
    for (let i = 0; i < n; i++) {
        const sentence = await board.next('sentence');
        sentences.push(sentence);
        for (const phase of ['start', 'end'])
            board.send({ type: 'progress', sentence: sentence.id, phase });
    }
    return { sentences, idle: await board.next('state', (e) => e.state === 'idle') };
};

test('board: the board prompt says learner-led by default and tutor-guided when chosen', async (t) => {
    const provider = boardProvider([]);
    const { env, connect } = await setup(t, provider);
    const { csrf } = await (await env.get('/api/state')).json();
    await opened(connect().ws);
    await until(() => provider.boards[0]?.opened);
    assert.match(provider.boards[0].options.system, /This board is learner-led/);
    await opened(connect(`?csrf=${csrf}&mode=guided`).ws);
    await until(() => provider.boards[1]?.opened);
    assert.match(provider.boards[1].options.system, /This board is tutor-guided/);
});

test('board: silence after a question brings one hint, then the explanation carries on, as system turns', async (t) => {
    const provider = boardProvider([
        ['> The hill climbs.\nt1 dot at 400,600\n?> What is the slope at the top?\n'],
        ['> Look at the very top.\nt2 dot at 800,260 look=focus\n'],
        ['> It lies flat, so the slope is zero.\n'],
    ]);
    const quick = [];
    provider.generate = async (tree, text, emit) => {
        quick.push(tree.role);
        return complete(emit, '[]');
    };
    const clock = fakeClock();
    const { env, id, connect } = await setup(t, provider, {
        app: { boardClock: clock, verdicts: true },
    });
    const board = connect();
    await opened(board.ws);
    board.send({ type: 'ask', text: 'What does a derivative measure?' });
    const asked = await played(board, 2);
    assert.equal(asked.sentences.at(-1).text, 'What is the slope at the top?');
    assert.equal(asked.idle.waiting, true, 'the question stays up while the board waits');
    await until(() => quick.length === 1);

    clock.pass();
    const thinking = await board.next('state', (e) => e.state === 'thinking');
    assert.equal(thinking.user, null, 'no learner message');
    const hint = await played(board, 1);
    assert.equal(hint.sentences[0].text, 'Look at the very top.');
    assert.equal(hint.idle.waiting, true, 'the board waits once more after the hint');

    clock.pass();
    const carried = await played(board, 1);
    assert.equal(carried.sentences[0].text, 'It lies flat, so the slope is zero.');
    assert.equal(carried.idle.waiting, undefined, 'no question, no wait');
    assert.equal(clock.timers.length, 0);

    assert.deepEqual(provider.boards[0].asked, [
        'What does a derivative measure?',
        NO_ANSWER[0],
        NO_ANSWER[1],
    ]);
    await env.app.settled();
    assert.deepEqual(
        messages(env, id).map((m) => [m.role, m.text]),
        [
            ['user', 'What does a derivative measure?'],
            ['assistant', 'The hill climbs.\nWhat is the slope at the top?'],
            ['assistant', 'Look at the very top.'],
            ['assistant', 'It lies flat, so the slope is zero.'],
        ],
        'the no-answer turns are not saved as learner messages',
    );
    assert.deepEqual(quick, ['verdict'], 'only the learner’s question is familiarity evidence');
});

test('board: an answer within the wait cancels the hint, and typing holds the wait open', async (t) => {
    const provider = boardProvider([
        ['> Here it climbs.\n?> What is the slope at the top?\n'],
        ['> Yes, zero.\n'],
        ['?> And on the far side?\n'],
    ]);
    const clock = fakeClock();
    const { connect } = await setup(t, provider, { app: { boardClock: clock } });
    const board = connect();
    await opened(board.ws);
    board.send({ type: 'ask', text: 'Why?' });
    await played(board, 2);
    assert.equal(clock.timers.length, 1);
    board.send({ type: 'ask', text: 'Zero?' });
    await played(board, 1);
    assert.equal(clock.timers.length, 0, 'the answer cancelled the hint');
    board.send({ type: 'ask', text: 'Go on.' });
    await played(board, 1);
    assert.equal(clock.timers.length, 1);
    board.send({ type: 'typing' });
    // Messages are read in order, so the mic's answer comes after the typing was handled.
    board.send({ type: 'mic', on: false });
    await board.next('mic');
    assert.equal(clock.timers.length, 0, 'typing holds the wait open');
    assert.deepEqual(provider.boards[0].asked, ['Why?', 'Zero?', 'Go on.']);
});

test('board: answering by voice while the question is still spoken brings no hint', async (t) => {
    const provider = boardProvider([['> Here it climbs.\n?> What is the slope at the top?\n']]);
    const clock = fakeClock();
    const hearing = () =>
        Promise.resolve({ detector: () => async () => 0, recognize: async () => '' });
    const { env, id, connect } = await setup(t, provider, { app: { boardClock: clock, hearing } });
    const board = connect();
    await opened(board.ws);
    board.send({ type: 'mic', on: true });
    await board.next('mic', (m) => m.status === 'on');
    board.send({ type: 'ask', text: 'Why?' });
    const first = await board.next('sentence');
    for (const phase of ['start', 'end'])
        board.send({ type: 'progress', sentence: first.id, phase });
    board.send({ type: 'progress', sentence: (await board.next('sentence')).id, phase: 'start' });
    await until(() => messages(env, id).at(-1).text.includes('slope'));
    board.send({ type: 'hold', on: true });
    const idle = await board.next('state', (e) => e.state === 'idle');
    assert.equal(messages(env, id).at(-1).status, 'completed', 'the question was heard in full');
    assert.equal(idle.waiting, undefined);
    assert.equal(clock.timers.length, 0, 'the answer being spoken holds the wait open');
});

test('board: typing that starts while the question is spoken holds the wait open', async (t) => {
    const provider = boardProvider([['?> What is the slope at the top?\n']]);
    const clock = fakeClock();
    const { connect } = await setup(t, provider, { app: { boardClock: clock } });
    const board = connect();
    await opened(board.ws);
    board.send({ type: 'ask', text: 'Why?' });
    const question = await board.next('sentence');
    board.send({ type: 'progress', sentence: question.id, phase: 'start' });
    board.send({ type: 'typing' });
    board.send({ type: 'progress', sentence: question.id, phase: 'end' });
    const idle = await board.next('state', (e) => e.state === 'idle');
    assert.equal(idle.waiting, undefined);
    assert.equal(clock.timers.length, 0, 'no hint while the answer is typed');
});
