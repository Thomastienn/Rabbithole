import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { boardPlayer, labelRows } = await import('../../src/board/player.ts');

function fakeClock() {
    let now = 0;
    const timers = [];
    return {
        now: () => now,
        setTimeout: (run, ms) => {
            const timer = { at: now + ms, run };
            timers.push(timer);
            return timer;
        },
        clearTimeout: (timer) => timers.splice(timers.indexOf(timer) >>> 0, 1),
        advance(ms) {
            now += ms;
            for (let t; (t = timers.find((t) => t.at <= now));) {
                timers.splice(timers.indexOf(t), 1);
                t.run();
            }
        },
    };
}

test('board player: each sentence holds the caption for 15 characters per second at 1.5×, in order, a beat apart', () => {
    const clock = fakeClock();
    const shown = [],
        reports = [];
    const player = boardPlayer(
        (s) => shown.push(s.text),
        () => {},
        (s, phase) => reports.push(`${s.id} ${phase}`),
        undefined,
        clock,
    );
    const long = 'Tiny sacs called vesicles carry new wall material forward.'; // 58 characters
    player.add({ id: '1', text: long });
    player.add({ id: '2', text: 'Then it hardens.' });
    assert.deepEqual(shown, [long], 'the next sentence waits its turn');
    clock.advance(3866);
    assert.deepEqual(reports, ['1 start']);
    clock.advance(1);
    assert.deepEqual(
        reports,
        ['1 start', '1 end'],
        'the reply’s last sentence so far ends without a trailing pause',
    );
    clock.advance(299);
    assert.deepEqual(shown, [long], 'a 300 ms beat after each sentence');
    clock.advance(1);
    assert.deepEqual(shown, [long, 'Then it hardens.']);
    assert.deepEqual(reports, ['1 start', '1 end', '2 start']);
    clock.advance(1100);
    assert.deepEqual(reports.at(-1), '2 end');
    clock.advance(300);
    player.add({ id: '3', text: 'Late sentence.' });
    assert.equal(shown.at(-1), 'Late sentence.', 'a sentence after a quiet gap shows at once');
});

test('board player: stopping drops the sentences and ops not yet shown and finishes the item entering within 150 ms', () => {
    const clock = fakeClock();
    const reports = [],
        drawn = [];
    const player = boardPlayer(
        () => {},
        (op, ms) => drawn.push(`${op.id} ${Math.round(ms)}`),
        (s, phase) => reports.push(`${s.id} ${phase}`),
        undefined,
        clock,
    );
    player.add({
        id: '1',
        text: 'One sentence that runs a while.',
        ops: [
            { id: 'a', kind: 'line' },
            { id: 'b', kind: 'line' },
        ],
    });
    player.add({ id: '2', text: 'Two.', ops: [{ id: 'c', kind: 'dot' }] });
    clock.advance(50);
    player.stop();
    clock.advance(10000);
    assert.deepEqual(reports, ['1 start']);
    assert.deepEqual(
        drawn,
        ['a 300', 'a 200'],
        'a, 50 ms into its entry, ends 150 ms after the stop; the rest is dropped',
    );
});

test('board player: a sentence’s ops start with it, one after another at their own lengths, within its first third', () => {
    const clock = fakeClock();
    const drawn = [];
    let at = 0;
    const advance = (ms) => ((at += ms), clock.advance(ms));
    const player = boardPlayer(
        () => {},
        (op, ms) => drawn.push([op.id, at, Math.round(ms)]),
        () => {},
        undefined,
        clock,
    );
    const op = (id, kind = 'line') => ({ id, kind });
    // 57 characters last 3.8 s; a line draws in 450 ms at 1×, 300 ms at 1.5×, a dot in 167 ms.
    player.add({
        id: '1',
        text: 'A torch is just a loop, so let me draw its battery first.',
        ops: [op('bat'), op('+', 'dot')],
    });
    // 27 characters last 1.8 s: four lines want 1.2 s, squeezed to its first 600 ms.
    player.add({
        id: '2',
        text: 'Wire runs round to the bulb',
        ops: [op('w1'), op('w2'), op('w3'), op('w4')],
    });
    assert.deepEqual(drawn, [['bat', 0, 300]], 'the first op enters with its sentence');
    advance(300);
    advance(3500);
    advance(300);
    for (let i = 0; i < 3; i++) advance(150);
    assert.deepEqual(
        drawn,
        [
            ['bat', 0, 300],
            ['+', 300, 167],
            ['w1', 4100, 150],
            ['w2', 4250, 150],
            ['w3', 4400, 150],
            ['w4', 4550, 150],
        ],
        'never stretched to fill the sentence; squeezed to end at its first third',
    );
    player.stop();
});

test('board player: a drawing sets its box at once and each path draws in about a box’s length', () => {
    const clock = fakeClock();
    const drawn = [];
    let at = 0;
    const player = boardPlayer(
        () => {},
        (op, ms) => drawn.push([op.id, at, Math.round(ms)]),
        () => {},
        undefined,
        clock,
    );
    // 57 characters last 3.8 s; a path draws in 450 ms at 1×, 300 ms at 1.5×.
    player.add({ id: '2', text: 'A pot.', ops: [{ id: 'dr', kind: 'drawing' }] });
    player.add({
        id: '3',
        text: 'A torch is just a loop, so let me draw its battery first.',
        ops: [
            { id: 'p1', kind: 'path', on: 'dr' },
            { id: 'p2', kind: 'path', on: 'dr' },
        ],
    });
    for (let i = 0; i < 60; i++) ((at += 100), clock.advance(100));
    const [dr, p1, p2] = drawn;
    assert.equal(dr[2], 0, 'the drawing only sets the box');
    assert.deepEqual([p1[2], p2[2], p2[1] - p1[1]], [300, 300, 300]);
    player.stop();
});

// A voice driven by the test: it records what the player plays and lets the test end or fail the audio.
function fakeVoice() {
    const voice = { chunks: [], ends: [], playing: [], stopped: 0, controls: [] };
    return Object.assign(voice, {
        speed: (rate) => voice.controls.push(['speed', rate]),
        pause: (on) => voice.controls.push(['pause', on]),
        chunk: (id, bytes) => voice.chunks.push([id, bytes.length]),
        end: (id) => voice.ends.push(id),
        play: (id, on) => voice.playing.push({ id, ...on }),
        stop: () => voice.stopped++,
    });
}

test('board player: a voiced sentence starts on its first audio chunk and lasts as long as its audio', () => {
    const clock = fakeClock();
    const voice = fakeVoice();
    const shown = [],
        reports = [],
        drawn = [];
    let at = 0;
    const advance = (ms) => ((at += ms), clock.advance(ms));
    const player = boardPlayer(
        (s) => shown.push(s.text),
        (op, ms) => drawn.push([op.id, at, Math.round(ms)]),
        (s, phase) => reports.push(`${s.id} ${phase}`),
        voice,
        clock,
    );
    const op = (id) => ({ id, kind: 'line' });
    // 30 characters: an estimated 2 s, so three 300 ms lines squeeze into its first 667 ms.
    player.add({
        id: '1',
        text: 'A hypha grows only at its tip.',
        ops: [op('a'), op('b'), op('c')],
        voiced: true,
    });
    player.add({ id: '2', text: 'No chunk ever came.', voiced: true });
    advance(500);
    assert.deepEqual(shown, [], 'a voiced sentence waits for its speech');
    player.chunk('1', new Uint8Array(3));
    assert.deepEqual(shown, ['A hypha grows only at its tip.']);
    assert.deepEqual(
        voice.playing.map((p) => p.id),
        ['1'],
        'speech plays from the first chunk',
    );
    assert.deepEqual(voice.chunks, [['1', 3]]);
    assert.deepEqual(
        drawn,
        [['a', 500, 222]],
        'the estimate times ops until the audio length is known',
    );
    advance(100);
    player.chunk('1', new Uint8Array(2));
    player.audioEnd('1');
    // The whole clip is in: 1.8 s at 1.5×, its first third ending at 1100. Left to draw: 165 ms of a, then b and c.
    voice.playing[0].duration(1800, 100);
    assert.deepEqual(drawn.at(-1), ['a', 600, 208], 'the op entering is re-squeezed to the audio');
    advance(108);
    assert.deepEqual(drawn.at(-1), ['b', 708, 196], 'so are the ops not yet drawn');
    advance(196);
    assert.deepEqual(drawn.at(-1), ['c', 904, 196], 'ending at the first third');
    advance(1396);
    assert.deepEqual(
        reports,
        ['1 start'],
        'the sentence outlasts its estimate while its audio plays',
    );
    voice.playing[0].ended();
    assert.deepEqual([...new Set(drawn.map(([id]) => id))], ['a', 'b', 'c']);
    assert.deepEqual(reports, ['1 start', '1 end'], 'the next waits for its own speech');
    player.audioEnd('2');
    advance(300);
    assert.deepEqual(
        reports,
        ['1 start', '1 end', '2 start'],
        'a caption-only sentence keeps the beat',
    );
    assert.equal(voice.playing.length, 1, 'speech that ended without audio plays by its estimate');
    assert.deepEqual(voice.ends, ['1'], 'a silent sentence has no clip to finish');
    advance(1267);
    assert.deepEqual(reports.at(-1), '2 end');
    player.add({ id: '3', text: 'The audio fails.', voiced: true });
    player.chunk('3', new Uint8Array(1));
    advance(300);
    voice.playing[1].failed();
    player.chunk('3', new Uint8Array(10));
    player.audioEnd('3');
    assert.deepEqual(
        voice.chunks,
        [
            ['1', 3],
            ['1', 2],
            ['3', 1],
        ],
        'failed speech is discarded',
    );
    assert.deepEqual(voice.ends, ['1']);
    advance(1067);
    assert.deepEqual(reports.at(-1), '3 end', 'audio that cannot play falls back to the estimate');
    player.stop();
    assert.equal(voice.stopped, 1, 'stopping silences the voice');
});

test('board player: a filler plays while the tutor is silent and never over a sentence', () => {
    const clock = fakeClock();
    const voice = fakeVoice();
    const shown = [];
    const player = boardPlayer(
        (s) => shown.push(s.text),
        () => {},
        () => {},
        voice,
        clock,
    );
    player.chunk('filler', new Uint8Array(4));
    player.audioEnd('filler');
    assert.deepEqual(
        voice.playing.map((p) => p.id),
        ['filler'],
    );
    assert.deepEqual(voice.ends, ['filler']);
    assert.deepEqual(shown, [], 'a filler is not a caption');
    player.add({ id: '1', text: 'Spoken.', voiced: true });
    player.chunk('1', new Uint8Array(3));
    assert.deepEqual(
        voice.playing.map((p) => p.id),
        ['filler', '1'],
        'the sentence takes over',
    );
    player.chunk('filler', new Uint8Array(4));
    assert.equal(voice.playing.length, 2, 'no filler over a sentence');
    player.stop();
});

test('board player: an early audio end still draws every item before advancing', () => {
    const clock = fakeClock();
    const voice = fakeVoice();
    const drawn = [];
    const player = boardPlayer(
        () => {},
        (op, ms) => drawn.push([op.id, Math.round(ms)]),
        () => {},
        voice,
        clock,
    );
    player.add({
        id: '1',
        text: 'These three drawings take time.',
        voiced: true,
        ops: [
            { id: 'a', kind: 'dot' },
            { id: 'b', kind: 'dot' },
            { id: 'c', kind: 'dot' },
        ],
    });
    player.chunk('1', new Uint8Array(1));
    clock.advance(100);
    voice.playing[0].ended();
    assert.deepEqual(
        drawn.slice(-3),
        [
            ['a', 100],
            ['b', 0],
            ['c', 0],
        ],
        'the op mid-entry finishes now and the rest appear at once',
    );
});

test('board player: a later point reflows crowded labels to alternate rows in value order', () => {
    const point = (id, x, text, on = 'n1') => ({ id, kind: 'point', on, at: [x, 520], text });
    const rows = (...ops) => Object.fromEntries(labelRows(ops));
    const seven = point('q1', 1040, '0.7');
    assert.deepEqual(rows(seven), { q1: 0 });
    const third = point('q2', 1000, '2/3');
    assert.deepEqual(rows(seven, third), { q2: 0, q1: 1 }, "0.7's label moves up for 2/3");
    assert.deepEqual(rows(seven, third, point('q3', 1100, '3/4')), { q2: 0, q1: 1, q3: 0 });
    assert.deepEqual(rows(seven, point('o1', 1000, '2/3', 'n2')), { q1: 0, o1: 0 }, 'per line');
    assert.deepEqual(rows(seven, point('q4', 1400, '1')), { q1: 0, q4: 0 }, 'far apart');
});

test('board player: a speed change retimes the sentence mid-way, and pause holds it while later ones queue', () => {
    const clock = fakeClock();
    const voice = fakeVoice();
    const shown = [],
        reports = [],
        drawn = [];
    let at = 0;
    const advance = (ms) => ((at += ms), clock.advance(ms));
    const player = boardPlayer(
        (s) => shown.push(s.text),
        (op) => drawn.push([op.id, at]),
        (s, phase) => reports.push(`${s.id} ${phase}`),
        voice,
        clock,
    );
    // 30 characters: 2 s of board time at 1.5×; each line takes 300 ms of it.
    player.add({
        id: '1',
        text: 'A hypha grows only at its tip.',
        ops: [{ id: 'a' }, { id: 'b' }],
    });
    advance(100);
    player.speed(0.75); // half the default: the remaining 1.9 s of board time now takes 3.8 s
    assert.deepEqual(voice.controls, [['speed', 0.75]], 'speech changes speed at once');
    advance(399);
    assert.deepEqual(drawn, [['a', 0]], 'the sentence carries on, not restarted');
    advance(1);
    assert.deepEqual(drawn.at(-1), ['b', 500], 'the rest of the op takes twice as long');
    player.pause(true);
    player.add({ id: '2', text: 'Then it hardens.', voiced: true });
    player.chunk('2', new Uint8Array(4));
    player.audioEnd('2');
    advance(60000);
    assert.deepEqual(reports, ['1 start'], 'paused, nothing ends and nothing new starts');
    assert.deepEqual(voice.chunks, [['2', 4]], 'speech arriving while paused still buffers');
    assert.deepEqual(voice.controls.at(-1), ['pause', true]);
    player.pause(false);
    assert.deepEqual(voice.controls.at(-1), ['pause', false]);
    advance(3399);
    assert.deepEqual(reports, ['1 start'], 'resume continues the same sentence where it stopped');
    advance(1);
    assert.deepEqual(reports, ['1 start', '1 end']);
    advance(600); // the 300 ms beat at half speed
    assert.deepEqual(reports, ['1 start', '1 end', '2 start'], 'the queued sentence plays next');
    assert.deepEqual(shown.at(-1), 'Then it hardens.');
});

test('board player: a sentence opening a page or a component waits 900 ms, scaled by speed and held by pause', () => {
    const clock = fakeClock();
    const reports = [];
    const player = boardPlayer(
        () => {},
        () => {},
        (s, phase) => reports.push(`${s.id} ${phase}`),
        undefined,
        clock,
    );
    const last = () => reports.at(-1);
    // Four characters each: 267 ms.
    player.add({ id: '1', text: 'One.' });
    player.add({ id: '2', text: 'Two.', ops: [{ id: 'p', kind: 'page' }] });
    player.add({
        id: '3',
        text: 'Six.',
        ops: [
            { id: 'o', kind: 'open', page: 'p' },
            { id: 'f', kind: 'flow' },
        ],
    });
    player.add({ id: '4', text: 'Ten.', ops: [{ id: 's', kind: 'step', on: 'f' }] });
    clock.advance(267);
    clock.advance(899);
    assert.equal(last(), '1 end');
    clock.advance(1);
    assert.equal(last(), '2 start', 'a new page waits 900 ms');
    clock.advance(267);
    player.speed(3); // twice the default: the 900 ms pause takes 450 ms
    clock.advance(200);
    player.pause(true);
    clock.advance(10000);
    player.pause(false);
    clock.advance(249);
    assert.equal(last(), '2 end', 'resume keeps the remaining pause');
    clock.advance(1);
    assert.equal(last(), '3 start', 'a page and a component together wait 900 ms, not the sum');
    player.speed(1.5);
    clock.advance(267);
    clock.advance(299);
    assert.equal(last(), '3 end');
    clock.advance(1);
    assert.equal(last(), '4 start', 'a component’s child is only a beat');
    clock.advance(267);
    player.add({ id: '5', text: 'Cut.' });
    player.stop();
    clock.advance(10000);
    assert.equal(last(), '4 end', 'cutting in drops the pending pause with its sentence');
    player.add({ id: '6', text: 'Answer.', ops: [{ id: 't', kind: 'table' }] });
    assert.equal(last(), '6 start', 'the answer starts at once');
});

test('board player: a key sentence is followed by 900 ms, and a slower rate holds the caption longer, scaled by speed', () => {
    const clock = fakeClock();
    const reports = [];
    const player = boardPlayer(
        () => {},
        () => {},
        (s, phase) => reports.push(`${s.id} ${phase}`),
        undefined,
        clock,
    );
    const last = () => reports.at(-1);
    // Four characters: 267 ms at +0%, 314 ms at -15% and 296 ms at -10%.
    player.add({ id: '1', text: 'Key.', key: true, rate: -15 });
    player.add({ id: '2', text: 'Two.', key: true, rate: -10, ops: [{ id: 'p', kind: 'page' }] });
    player.add({ id: '3', text: 'Six.' });
    clock.advance(313);
    assert.equal(last(), '1 start', 'a key sentence is said slower');
    clock.advance(1);
    assert.equal(last(), '1 end');
    clock.advance(899);
    assert.equal(last(), '1 end', 'a key sentence is followed by the longer pause');
    clock.advance(1);
    assert.equal(last(), '2 start', 'a key sentence before a page waits 900 ms, not the sum');
    player.speed(3); // twice the default: 296 ms of board time takes about 148 ms
    clock.advance(149);
    assert.equal(last(), '2 end', 'the learner’s speed still scales a slower sentence');
    clock.advance(449);
    assert.equal(last(), '2 end');
    clock.advance(1);
    assert.equal(last(), '3 start');
});

test('board player: its component kinds are the board’s', async () => {
    const { COMPONENT_KINDS } = await import('../../src/board/player.ts');
    const { COMPONENTS } = await import('../../server/board/components.mjs');
    assert.deepEqual([...COMPONENT_KINDS].sort(), [...COMPONENTS].sort());
});
