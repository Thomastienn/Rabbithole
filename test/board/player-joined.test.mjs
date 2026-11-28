import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeClock, fakeVoice } from '../support/player-kit.mjs';
const { boardPlayer } = await import('../../src/board/player.ts');

test('board player: a joined clip starts each sentence at its offset, its ops timed to the next offset or the clip end', () => {
    const clock = fakeClock();
    const voice = fakeVoice();
    const reports = [],
        drawn = [];
    let at = 0;
    const advance = (ms) => ((at += ms), clock.advance(ms));
    const player = boardPlayer(
        () => {},
        (op, ms) => drawn.push([op.id, at, Math.round(ms)]),
        (s, phase) => reports.push(`${s.id} ${phase}`),
        voice,
        clock,
    );
    player.add({ id: '1', text: 'First.', voiced: true });
    player.add({ id: '2', text: 'Second one.', voiced: true, ops: [{ id: 'a', kind: 'line' }] });
    player.add({ id: '3', text: 'Third.', voiced: true, ops: [{ id: 'b', kind: 'dot' }] });
    player.chunk('1', new Uint8Array(3));
    // Offsets in ms of audio: 0, 1000 and 1300 ms of board time at 1.5×.
    player.offsets({ id: '1', ids: ['1', '2', '3'], at: [0, 1500, 1950] });
    player.audioEnd('1');
    advance(999);
    assert.deepEqual(reports, ['1 start']);
    advance(1);
    assert.deepEqual(reports, ['1 start', '1 end', '2 start'], 'the next starts at its offset');
    assert.deepEqual(
        drawn,
        [['a', 1000, 100]],
        'its ops end in the first third of the 300 ms to the next offset',
    );
    advance(300);
    assert.deepEqual(reports.slice(-2), ['2 end', '3 start']);
    assert.equal(voice.playing.length, 1, 'the clip plays once');
    // The clip is 1600 ms: the last sentence has 300 ms to its end.
    voice.playing[0].duration(1600, 1300);
    assert.deepEqual(drawn.at(-1), ['b', 1300, 100]);
    voice.playing[0].ended();
    assert.deepEqual(reports.at(-1), '3 end');

    // Without word boundaries each starts at its share of the clip, once its length is known.
    player.add({ id: '4', text: 'Fourth.', voiced: true });
    player.add({ id: '5', text: 'Fifth.', voiced: true });
    player.chunk('4', new Uint8Array(3));
    player.offsets({ id: '4', ids: ['4', '5'], share: [0, 0.5] });
    advance(3000);
    assert.deepEqual(reports.at(-1), '4 start', 'it waits for the clip length');
    voice.playing[1].duration(2000, 500);
    advance(499);
    assert.deepEqual(reports.at(-1), '4 start');
    advance(1);
    assert.deepEqual(reports.slice(-2), ['4 end', '5 start']);
    // Cutting in stops the clip and drops its remaining sentences.
    player.add({ id: '6', text: 'Sixth.', voiced: true });
    player.stop();
    advance(5000);
    assert.deepEqual(reports.at(-1), '5 start');
    assert.equal(voice.stopped, 1);

    // A clip that ends before a sentence's offset leaves it to its estimate.
    player.add({ id: '7', text: 'Seventh.', voiced: true });
    player.add({ id: '8', text: 'Eighth!', voiced: true });
    player.chunk('7', new Uint8Array(3));
    player.offsets({ id: '7', ids: ['7', '8'], at: [0, 9000] });
    voice.playing[2].ended();
    assert.deepEqual(reports.slice(-2), ['7 end', '8 start']);
    advance(467);
    assert.deepEqual(reports.at(-1), '8 end');
});
