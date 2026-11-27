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

test('board player: each sentence holds the caption for 15 characters per second at 1.5×, in order', () => {
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
    assert.deepEqual(shown, [long, 'Then it hardens.']);
    assert.deepEqual(reports, ['1 start', '1 end', '2 start']);
    clock.advance(1100);
    assert.deepEqual(reports.at(-1), '2 end');
    player.add({ id: '3', text: 'Late sentence.' });
    assert.equal(shown.at(-1), 'Late sentence.', 'a sentence after a quiet gap shows at once');
});

test('board player: stopping drops the sentences and ops not yet shown', () => {
    const clock = fakeClock();
    const reports = [],
        drawn = [];
    const player = boardPlayer(
        () => {},
        (op) => drawn.push(op.id),
        (s, phase) => reports.push(`${s.id} ${phase}`),
        undefined,
        clock,
    );
    player.add({
        id: '1',
        text: 'One.',
        ops: [
            { id: 'a', kind: 'dot' },
            { id: 'b', kind: 'dot' },
        ],
    });
    player.add({ id: '2', text: 'Two.', ops: [{ id: 'c', kind: 'dot' }] });
    player.stop();
    clock.advance(10000);
    assert.deepEqual(reports, ['1 start']);
    assert.deepEqual(drawn, ['a'], 'drawn items stay; the rest is dropped');
});

test('board player: a sentence’s ops share its time equally, in order', () => {
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
    const op = (id) => ({ id, kind: 'line' });
    // 57 characters last 3.8 s, 42 characters 2.8 s.
    player.add({
        id: '1',
        text: 'A torch is just a loop, so let me draw its battery first.',
        ops: [op('bat'), op('bt')],
    });
    player.add({
        id: '2',
        text: 'Wire runs from the top, round to the bulb.',
        ops: [op('w1'), op('w2'), op('w3')],
    });
    assert.deepEqual(drawn, [['bat', 0, 1900]], 'the first op enters with its sentence');
    advance(1900);
    advance(1900);
    advance(934);
    advance(933);
    assert.deepEqual(drawn, [
        ['bat', 0, 1900],
        ['bt', 1900, 1900],
        ['w1', 3800, 933],
        ['w2', 4734, 933],
        ['w3', 5667, 933],
    ]);
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
    const op = (id) => ({ id, kind: 'dot' });
    // 30 characters: an estimated 2 s, so each of three ops would get 667 ms.
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
        [['a', 500, 667]],
        'the estimate times ops until the audio length is known',
    );
    advance(300);
    player.chunk('1', new Uint8Array(2));
    player.audioEnd('1');
    voice.playing[0].duration(3000, 300); // the whole clip is in: 3 s at 1.5×
    assert.deepEqual(drawn.at(-1), ['a', 800, 1000], 'the first drawing uses the audio too');
    advance(700);
    assert.deepEqual(drawn.at(-1), ['b', 1500, 1000], 'the rest share the audio’s time');
    advance(2000);
    assert.deepEqual(
        reports,
        ['1 start'],
        'the sentence outlasts its estimate while its audio plays',
    );
    voice.playing[0].ended();
    assert.deepEqual([...new Set(drawn.map(([id]) => id))], ['a', 'b', 'c']);
    assert.deepEqual(reports, ['1 start', '1 end'], 'the next waits for its own speech');
    player.audioEnd('2');
    assert.deepEqual(reports, ['1 start', '1 end', '2 start']);
    assert.equal(voice.playing.length, 1, 'speech that ended without audio plays by its estimate');
    assert.deepEqual(voice.ends, ['1'], 'a silent sentence has no clip to finish');
    advance(1267);
    assert.deepEqual(reports.at(-1), '2 end');
    player.add({ id: '3', text: 'The audio fails.', voiced: true });
    player.chunk('3', new Uint8Array(1));
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

test('board player: an early audio end still draws every item before advancing', () => {
    const voice = fakeVoice();
    const drawn = [];
    const player = boardPlayer(
        () => {},
        (op, ms) => drawn.push([op.id, ms]),
        () => {},
        voice,
        fakeClock(),
    );
    player.add({
        id: '1',
        text: 'These two drawings take time.',
        voiced: true,
        ops: [
            { id: 'a', kind: 'dot' },
            { id: 'b', kind: 'dot' },
        ],
    });
    player.chunk('1', new Uint8Array(1));
    voice.playing[0].ended();
    assert.deepEqual(drawn.slice(-2), [
        ['a', 0],
        ['b', 0],
    ]);
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
    // 30 characters: 2 s of board time at 1.5×, 1 s for each op.
    player.add({
        id: '1',
        text: 'A hypha grows only at its tip.',
        ops: [{ id: 'a' }, { id: 'b' }],
    });
    advance(500);
    player.speed(0.75); // half the default: the remaining 1.5 s of board time now takes 3 s
    assert.deepEqual(voice.controls, [['speed', 0.75]], 'speech changes speed at once');
    advance(999);
    assert.deepEqual(drawn, [['a', 0]], 'the sentence carries on, not restarted');
    advance(1);
    assert.deepEqual(drawn.at(-1), ['b', 1500]);
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
    advance(1999);
    assert.deepEqual(reports, ['1 start'], 'resume continues the same sentence where it stopped');
    advance(1);
    assert.deepEqual(reports, ['1 start', '1 end', '2 start'], 'the queued sentence plays next');
    assert.deepEqual(shown.at(-1), 'Then it hardens.');
});
