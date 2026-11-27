import { test } from 'node:test';
import assert from 'node:assert/strict';
import { until } from '../support/diagram-kit.mjs';
import { notify } from '../support/events.mjs';
import { boardProvider, opened, setup } from '../support/board-kit.mjs';

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

test('board: failed speech is retried once, then the turn carries on in captions with a notice', async (t) => {
    const provider = boardProvider([['> One.\n> Two.\n> Three.\n']]);
    const spoken = [];
    // One fails once then speaks; Two fails both tries.
    const failures = { 'One.': 1, 'Two.': 2 };
    const client = {
        warm() {},
        async speak(text, chunk) {
            spoken.push(text);
            notify();
            if (failures[text]-- > 0) throw new Error('edge-tts sent no audio within 2500 ms');
            chunk(Buffer.from(`${text} a`));
        },
        close() {},
    };
    const { connect } = await setup(t, provider, { app: { speech: () => client } });
    const board = connect();
    await opened(board.ws);
    board.send({ type: 'ask', text: 'Why?' });
    const of = (type, id) => board.events.filter((e) => e.type === type && (!id || e.id === id));
    await until(() => of('sentence').length === 3);
    const [one, two, three] = of('sentence').map((s) => s.id);
    await until(() => of('audio-end', one).length);
    assert.deepEqual(
        of('audio', one).map((e) => e.audio),
        ['One. a'],
        'the retry speaks',
    );
    assert.equal(of('notice').length, 0);
    board.send({ type: 'progress', sentence: one, phase: 'start' });
    await until(() => of('audio-end', two).length);
    assert.equal(of('audio', two).length, 0, 'it shows as a caption only');
    assert.deepEqual(
        of('notice').map((e) => e.notice),
        ['The voice is unavailable, so the tutor carries on in captions.'],
    );
    board.send({ type: 'progress', sentence: two, phase: 'start' });
    await until(() => of('audio-end', three).length);
    assert.deepEqual(spoken, ['One.', 'One.', 'Two.', 'Two.'], 'the rest of the turn stays silent');
    for (const id of [one, two, three]) {
        board.send({ type: 'progress', sentence: id, phase: 'start' });
        board.send({ type: 'progress', sentence: id, phase: 'end' });
    }
    await until(() => of('state').at(-1)?.state === 'idle');
    assert.equal(of('notice').length, 1, 'one notice per turn');
});
