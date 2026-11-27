import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { until } from '../support/diagram-kit.mjs';
import { boardProvider, messages, opened, setup } from '../support/board-kit.mjs';
import { FRAME, speechFiles } from '../../server/board/hearing.mjs';

// Fake ears: a frame is speech when its samples are 1; the first load downloads with progress, later ones don't.
function fakeHearing({ fail = 0, held } = {}) {
    const hearing = (progress) => {
        hearing.loads++;
        if (hearing.loads <= fail) return Promise.reject(new Error('HTTP 503'));
        if (!hearing.ready) [26e6, 64e6].forEach((n) => progress(n, 64e6));
        hearing.ready = true;
        return Promise.resolve({
            detector: () => async (frame) => frame[0],
            recognize: async (audio) => {
                hearing.heard.push(audio.length);
                await held;
                return 'Why is there no eclipse every month?';
            },
        });
    };
    return Object.assign(hearing, { loads: 0, ready: false, heard: [] });
}

// Mic audio as the browser sends it: float32 samples, here in odd-sized chunks the server must reframe.
function speak(board, speech, silence) {
    const samples = new Float32Array((speech + silence) * FRAME);
    samples.fill(1, 0, speech * FRAME);
    for (let at = 0; at < samples.length; at += 700)
        board.ws.send(Buffer.from(samples.slice(at, at + 700).buffer));
}

test('board: the mic is off until pressed, the first press downloads, a pause after speech asks the question, and speech cuts in on the tutor', async (t) => {
    const provider = boardProvider([
        ['> The orbit is tilted.\n', '> So the shadow misses.\n'],
        ['> It is tilted by five degrees.\n'],
    ]);
    const hearing = fakeHearing();
    const { env, id, connect } = await setup(t, provider, { app: { hearing } });
    const board = connect();
    await opened(board.ws);
    await until(() => provider.boards[0]?.opened);

    // Off as the board opens: speech is not heard.
    speak(board, 8, 12);
    board.send({ type: 'mic', on: true });
    assert.deepEqual(
        [await board.next('mic'), await board.next('mic'), await board.next('mic')].map((m) => [
            m.status,
            m.loaded,
        ]),
        [
            ['loading', 26e6],
            ['loading', 64e6],
            ['on', undefined],
        ],
    );
    assert.ok(!board.events.some((e) => e.type === 'hearing'), 'nothing listened while off');

    // A click is not a question.
    speak(board, 2, 14);
    assert.equal((await board.next('hearing')).on, true);
    assert.equal((await board.next('hearing')).on, false);

    speak(board, 8, 12);
    assert.equal((await board.next('hearing')).on, true);
    assert.equal((await board.next('hearing')).on, false);
    assert.equal((await board.next('heard')).text, 'Why is there no eclipse every month?');
    assert.equal((await board.next('state')).state, 'thinking');
    // The utterance with three frames of lead-in; only its words go to the tutor.
    assert.deepEqual(hearing.heard, [(3 + 8 + 10) * FRAME]);
    await until(() => provider.boards[0].asked.length);
    assert.deepEqual(provider.boards[0].asked, ['Why is there no eclipse every month?']);

    // While the tutor speaks, a short sound does not stop it; about 150 ms of speech does at once,
    // and the pause after it asks the question.
    const sentence = await board.next('sentence');
    board.send({ type: 'progress', sentence: sentence.id, phase: 'start' });
    speak(board, 4, 14);
    await board.next('hearing', (m) => !m.on);
    assert.ok(!board.events.some((e) => e.state === 'idle'), 'a click does not cut in');
    speak(board, 5, 0);
    assert.equal((await board.next('state')).state, 'idle');
    assert.ok(!board.events.some((e) => e.type === 'heard'), 'stopped before the pause ends');
    speak(board, 0, 10);
    assert.equal((await board.next('heard')).text, 'Why is there no eclipse every month?');
    assert.equal((await board.next('state')).state, 'thinking');
    const next = await board.next('sentence');
    board.send({ type: 'progress', sentence: next.id, phase: 'start' });
    board.send({ type: 'progress', sentence: next.id, phase: 'end' });
    await board.next('state', (m) => m.state === 'idle');
    assert.deepEqual(
        messages(env, id).map((m) => [m.role, m.text, m.status]),
        [
            ['user', 'Why is there no eclipse every month?', 'completed'],
            ['assistant', 'The orbit is tilted.', 'interrupted'],
            ['user', 'Why is there no eclipse every month?', 'completed'],
            ['assistant', 'It is tilted by five degrees.', 'completed'],
        ],
    );

    // Off and on again: no second download.
    board.send({ type: 'mic', on: false });
    assert.equal((await board.next('mic')).status, 'off');
    board.send({ type: 'mic', on: true });
    assert.equal((await board.next('mic')).status, 'on');
    assert.ok(!board.events.some((e) => e.status === 'loading'));
});

test('board: a question typed while speech is recognized is not cut off by the spoken one', async (t) => {
    const provider = boardProvider([['> Because it is lit.\n']]);
    const recognized = Promise.withResolvers();
    const hearing = fakeHearing({ held: recognized.promise });
    const { env, id, connect } = await setup(t, provider, { app: { hearing } });
    const board = connect();
    await opened(board.ws);
    board.send({ type: 'mic', on: true });
    await board.next('mic', (m) => m.status === 'on');
    speak(board, 8, 12);
    await until(() => hearing.heard.length);
    board.send({ type: 'ask', text: 'Why is the Moon lit?' });
    assert.equal((await board.next('state')).state, 'thinking');
    recognized.resolve();
    const reply = await board.next('sentence');
    board.send({ type: 'progress', sentence: reply.id, phase: 'start' });
    board.send({ type: 'progress', sentence: reply.id, phase: 'end' });
    await board.next('state', (m) => m.state === 'idle');
    assert.deepEqual(
        messages(env, id).map((m) => [m.role, m.text, m.status]),
        [
            ['user', 'Why is the Moon lit?', 'completed'],
            ['assistant', 'Because it is lit.', 'completed'],
        ],
    );
});

test('board: a failed speech model download turns the mic off with a notice, and the next press tries again', async (t) => {
    const hearing = fakeHearing({ fail: 1 });
    const { connect } = await setup(t, boardProvider([]), { app: { hearing } });
    const board = connect();
    await opened(board.ws);
    board.send({ type: 'mic', on: true });
    assert.ok((await board.next('notice')).notice);
    assert.equal((await board.next('mic')).status, 'off');
    board.send({ type: 'mic', on: true });
    assert.equal((await board.next('mic', (m) => m.status === 'on')).status, 'on');
    assert.equal(hearing.loads, 2);
});

test('board: speech model files download once from their pinned commit, with progress, and are checked by hash', async () => {
    const root = await mkdtemp(join(tmpdir(), 'hearing-'));
    const bytes = Buffer.from('model bytes');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const models = {
        'org/vad': { revision: 'abc', files: { 'onnx/m.onnx': [hash, bytes.length] } },
    };
    const urls = [];
    const progress = [];
    const download = async (url, chunk) => {
        urls.push(url);
        chunk(bytes.length);
        return bytes;
    };
    await speechFiles(root, (loaded, total) => progress.push([loaded, total]), download, models);
    assert.deepEqual(urls, ['https://huggingface.co/org/vad/resolve/abc/onnx/m.onnx']);
    assert.deepEqual(progress, [[11, 11]]);
    assert.deepEqual(await readFile(join(root, 'org/vad/onnx/m.onnx')), bytes);
    await speechFiles(root, () => assert.fail('no progress without a download'), download, models);
    assert.equal(urls.length, 1, 'cached files are not downloaded again');
    await assert.rejects(
        speechFiles(
            join(root, 'other'),
            () => {},
            async () => Buffer.from('tampered'),
            models,
        ),
        /does not match its recorded hash/,
    );
});
