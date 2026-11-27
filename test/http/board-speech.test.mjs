import { test } from 'node:test';
import assert from 'node:assert/strict';
import { until } from '../support/diagram-kit.mjs';
import { notify } from '../support/events.mjs';
import { boardProvider, messages, opened, setup } from '../support/board-kit.mjs';

test('board: each sentence is spoken in chunks tagged with its id, one sentence ahead of playback', async (t) => {
    const provider = boardProvider([['> One.\n> Two.\n> Three.\n']]);
    const speech = { warmed: 0, spoken: [], closed: 0 };
    const client = {
        warm: () => speech.warmed++,
        async speak(text, chunk) {
            speech.spoken.push(text);
            notify();
            chunk(Buffer.from(`${text} a`));
            chunk(Buffer.from(`${text} b`));
        },
        close: () => (speech.closed++, notify()),
    };
    const { connect } = await setup(t, provider, { app: { speech: () => client } });
    const board = connect();
    await opened(board.ws);
    board.send({ type: 'ask', text: 'Why?' });
    const of = (type, id) => board.events.filter((e) => e.type === type && (!id || e.id === id));
    await until(() => of('sentence').length === 3);
    const sentences = of('sentence');
    assert.equal(speech.warmed, 1, 'the socket opens as the turn starts');
    assert.ok(sentences.every((s) => s.voiced));
    const [one, two, three] = sentences.map((s) => s.id);
    const heard = async (id) => {
        await until(() => of('audio-end', id).length);
        return of('audio', id);
    };
    assert.deepEqual(await heard(one), [
        { type: 'audio', id: one, audio: 'One. a' },
        { type: 'audio', id: one, audio: 'One. b' },
    ]);
    assert.deepEqual(speech.spoken, ['One.'], 'the next sentence waits for this one to play');
    board.send({ type: 'progress', sentence: one, phase: 'start' });
    assert.deepEqual(
        (await heard(two)).map((e) => e.audio),
        ['Two. a', 'Two. b'],
    );
    assert.deepEqual(speech.spoken, ['One.', 'Two.']);
    board.send({ type: 'progress', sentence: two, phase: 'start' });
    await heard(three);
    for (const id of [one, two, three])
        board.send({ type: 'progress', sentence: id, phase: 'end' });
    board.send({ type: 'progress', sentence: three, phase: 'start' });
    board.send({ type: 'progress', sentence: three, phase: 'end' });
    await board.next('state', (e) => e.state === 'idle');
    board.ws.close();
    await until(() => speech.closed);
});

test('board: a filler plays only when a turn’s first audio is over 1 s late, never the same twice, and is not saved', async (t) => {
    const provider = boardProvider([['> One.\n'], ['> Two.\n'], ['> Three.\n']]);
    let release = Promise.withResolvers();
    const client = {
        warm() {},
        async speak(text, chunk) {
            if (text !== 'Three.') await release.promise;
            chunk(Buffer.from(text));
        },
        close() {},
    };
    // A fake clock: the test says when 1 s has passed.
    const timers = [];
    const boardClock = {
        setTimeout: (run) => (timers.push(run), run),
        clearTimeout: (run) => timers.includes(run) && timers.splice(timers.indexOf(run), 1),
    };
    const fillers = Promise.resolve([Buffer.from('hmm'), Buffer.from('okay'), Buffer.from('ah')]);
    // A fixed pick: without the no-repeat rule both slow turns would play 'hmm'.
    t.mock.method(Math, 'random', () => 0);
    const { env, id, connect } = await setup(t, provider, {
        app: { speech: () => client, fillers: () => fillers, boardClock },
    });
    const board = connect();
    await opened(board.ws);
    // Every filler frame the board receives, which board.next would otherwise splice away.
    const played = [];
    board.ws.on('message', (data, binary) => {
        if (binary && data.subarray(1, 1 + data[0]).toString() === 'filler')
            played.push(data.subarray(1 + data[0]).toString());
    });
    const turn = async (question, slow) => {
        board.send({ type: 'ask', text: question });
        await board.next('state', (e) => e.state === 'thinking');
        const sentence = await board.next('sentence');
        if (!slow) await board.next('audio-end', (e) => e.id === sentence.id);
        timers.splice(0).forEach((run) => run());
        if (slow) {
            await board.next('audio-end', (e) => e.id === 'filler');
            release.resolve();
            release = Promise.withResolvers();
            await board.next('audio-end', (e) => e.id === sentence.id);
        }
        board.send({ type: 'progress', sentence: sentence.id, phase: 'start' });
        board.send({ type: 'progress', sentence: sentence.id, phase: 'end' });
        await board.next('state', (e) => e.state === 'idle');
    };
    await turn('Why?', true);
    await turn('And then?', true);
    await turn('Last?', false);
    assert.deepEqual(
        played,
        ['hmm', 'okay'],
        'one filler per slow turn, never the same twice in a row, none once audio has started',
    );
    assert.deepEqual(
        messages(env, id)
            .filter((m) => m.role === 'assistant')
            .map((m) => m.text),
        ['One.', 'Two.', 'Three.'],
        'fillers are not saved in the reply',
    );
});
