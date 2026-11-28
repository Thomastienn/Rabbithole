import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeClock, fakeVoice } from '../support/player-kit.mjs';
const { boardPlayer } = await import('../../src/board/player.ts');

// A voiced sentence with the tutor's pause after it, whose 1800 ms clip ends now, then a caption-only sentence.
function paused(pause, spoken) {
    const clock = fakeClock();
    const voice = fakeVoice();
    const reports = [];
    const player = boardPlayer(
        () => {},
        () => {},
        (s, phase) => reports.push(`${s.id} ${phase}`),
        voice,
        clock,
    );
    player.add({ id: '1', text: 'A big idea.', voiced: true, pause });
    player.add({ id: '2', text: 'Next.' });
    player.chunk('1', new Uint8Array(3));
    player.audioEnd('1', spoken);
    voice.playing[0].duration(1800, 0);
    clock.advance(1800);
    voice.playing[0].ended();
    return { clock, last: () => reports.at(-1) };
}

test('board player: the tutor’s pause counts from the clip’s last spoken word, never ending before the clip', () => {
    // The last word ends at 1800 ms of audio, 1200 ms of board time at 1.5×: 600 ms of trailing silence.
    const { clock, last } = paused(1000, 1800);
    clock.advance(399);
    assert.equal(last(), '1 end');
    clock.advance(1);
    assert.equal(last(), '2 start', 'the 1000 ms pause less the 600 ms already silent');
    const short = paused(500, 1800);
    assert.equal(short.last(), '2 start', 'a pause shorter than the silence adds nothing');
});

test('board player: with no word boundaries the tail is 0 and the pause counts from the clip end', () => {
    const { clock, last } = paused(1000);
    clock.advance(999);
    assert.equal(last(), '1 end');
    clock.advance(1);
    assert.equal(last(), '2 start');
});

test('board player: a filler ending is reported, so the session can time the next wait line', () => {
    const voice = fakeVoice();
    const reports = [];
    const player = boardPlayer(
        () => {},
        () => {},
        (s, phase) => reports.push(`${s.id} ${phase}`),
        voice,
        fakeClock(),
    );
    player.chunk('filler', new Uint8Array(4));
    player.audioEnd('filler');
    assert.deepEqual(reports, []);
    voice.playing[0].ended();
    assert.deepEqual(reports, ['filler end']);
});
