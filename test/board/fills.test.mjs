import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { boardFills } = await import('../../src/board/fills.ts');
const { streamedVoice } = await import('../../src/board/voice.ts');

// A stand-in AudioContext: it records the gain nodes and sources the fills build, not real sound.
function fakeContext() {
    const c = {
        state: 'running',
        currentTime: 10,
        sampleRate: 100,
        gains: [],
        sources: [],
        filters: [],
    };
    const param = (value = 0) => ({
        value,
        events: [],
        setValueAtTime(v, t) {
            this.events.push([v, t]);
        },
        linearRampToValueAtTime(v, t) {
            this.events.push([v, t]);
        },
        setTargetAtTime(v, t) {
            this.events.push([v, t]);
            this.value = v;
        },
    });
    const node = (extra) => ({ connect: (n) => n, disconnect() {}, ...extra });
    return Object.assign(c, {
        destination: node(),
        resume() {
            c.state = 'running';
            return Promise.resolve();
        },
        suspend() {
            c.state = 'suspended';
            return Promise.resolve();
        },
        createBuffer: (_, length) => ({ getChannelData: () => new Float32Array(length) }),
        createGain: () => {
            const g = node({ gain: param(1) });
            c.gains.push(g);
            return g;
        },
        createBiquadFilter: () => {
            const f = node({ frequency: param(), Q: param() });
            c.filters.push(f);
            return f;
        },
        createBufferSource: () => {
            const s = node({
                start(at) {
                    s.at = at ?? c.currentTime;
                },
                stop(at) {
                    s.until = at;
                },
            });
            c.sources.push(s);
            return s;
        },
    });
}
const db = (g) => 20 * Math.log10(g);

test('board fills: the room tone sits about 40 dB under the voice, starts once and fades when the reply stops', () => {
    const c = fakeContext();
    const fills = boardFills(() => c);
    fills.room();
    fills.room();
    assert.equal(c.sources.length, 1, 'one room tone for the whole reply');
    const [room, bus] = c.gains;
    assert.equal(Math.round(db(room.gain.value)), -62, '40 dB under a voice at about -22 dBFS');
    fills.pause(true);
    assert.equal(c.state, 'suspended', 'pausing the board suspends room and pen together');
    fills.pause(false);
    assert.equal(c.state, 'running');
    fills.stop();
    assert.deepEqual(bus.gain.events, [[0, 10]], 'stopping the reply fades it out');
});

test('board fills: a pen sound for drawn ops, a softer wipe for erase, and none for page, open or pointer', () => {
    const c = fakeContext();
    const fills = boardFills(() => c);
    for (const op of [{ kind: 'page', top: 0 }, { kind: 'open', top: 900 }, { kind: 'pointer' }])
        fills.pen(op, 500);
    assert.equal(c.sources.length, 0, 'page, open and pointer make no sound');
    fills.pen({ kind: 'box' }, 900);
    const strokes = c.sources;
    assert.ok(strokes.length >= 2, 'a long op draws in several strokes');
    assert.ok(
        Math.abs(Math.max(...strokes.map((s) => s.until)) - (10.01 + 0.9 + 0.02)) < 0.05,
        'the strokes last the op’s draw length',
    );
    const peak = (g) => Math.max(...g.gain.events.map(([v]) => v));
    const pen = peak(c.gains.at(-1));
    const before = c.gains.length;
    fills.pen({ kind: 'erase' }, 300);
    assert.equal(c.gains.length, before + 1, 'erase is one wipe');
    assert.equal(c.filters.at(-1).frequency.value, 900, 'the wipe is lower');
    assert.ok(
        Math.abs(db(pen / 0.8) - db(peak(c.gains.at(-1)) / 0.8) - 6) < 3.5,
        'and about 6 dB softer',
    );
});

test('board fills: the learner speed changes pen-stroke lengths with the drawing', () => {
    const c = fakeContext();
    const voice = streamedVoice(boardFills(() => c));
    voice.speed(0.75); // half the default 1.5×: 300 ms of board time takes 600 ms
    voice.pen({ kind: 'erase' }, 300);
    assert.ok(Math.abs(c.sources[0].until - (10.01 + 0.6 + 0.02)) < 1e-9);
});
