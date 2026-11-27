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
