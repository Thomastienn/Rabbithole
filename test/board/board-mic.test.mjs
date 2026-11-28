import test from 'node:test';
import assert from 'node:assert/strict';
import { boardMic } from '../../server/board/mic.mjs';

// A server board mic whose speech models load when `loaded` resolves (or fail with it).
function mic() {
    const load = Promise.withResolvers();
    const said = { sent: [], heard: [], asked: [], stopped: 0 };
    const models = {
        detector: () => async () => 0,
        recognize: async (audio) => (said.heard.push(Array.from(audio)), 'Why is the Moon lit?'),
    };
    const m = boardMic(() => load.promise, 'en', {
        send: (event) => said.sent.push(event),
        log: () => {},
        ask: (text) => said.asked.push(text),
        stop: () => said.stopped++,
        busy: () => null,
        closed: () => false,
    });
    const audio = (...samples) => m.audio(Buffer.from(new Float32Array(samples).buffer));
    return {
        m,
        said,
        audio,
        ready: () => load.resolve(models),
        fail: () => load.reject(new Error('HTTP 503')),
    };
}

test('board mic: a hold let go while the speech models load is asked once they are ready', async () => {
    const { m, said, audio, ready } = mic();
    const on = m.on();
    m.hold(true);
    audio(0.1, 0.2);
    audio(0.3);
    m.hold(false);
    assert.deepEqual(said.heard, [], 'not recognized before the models are ready');
    ready();
    await on;
    await until(() => said.asked.length);
    assert.deepEqual(said.heard, [[0.1, 0.2, 0.3].map(Math.fround)]);
    assert.deepEqual(said.asked, ['Why is the Moon lit?']);
    assert.deepEqual(
        said.sent.map((e) => [e.type, e.on ?? e.status ?? e.text]),
        [
            ['hearing', true],
            ['hearing', false],
            ['mic', 'on'],
            ['heard', 'Why is the Moon lit?'],
        ],
    );
});

test('board mic: a hold kept while the models load is dropped when they fail or the mic turns off', async () => {
    const failing = mic();
    const on = failing.m.on();
    failing.m.hold(true);
    failing.audio(0.1);
    failing.m.hold(false);
    failing.fail();
    await on;
    assert.deepEqual(failing.said.heard, []);

    const off = mic();
    const again = off.m.on();
    off.m.hold(true);
    off.audio(0.1);
    off.m.hold(false);
    off.m.off();
    off.ready();
    await again;
    assert.deepEqual(off.said.heard, []);
});

// Lets the recognizer's promise chain settle.
async function until(done) {
    for (let i = 0; i < 20 && !done(); i++) await new Promise((r) => setImmediate(r));
}
