import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { boardPlayer } = await import('../../src/board/player.ts');

function fakeClock() {
    let now = 0;
    const timers = [];
    return {
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
        (s, phase) => reports.push(`${s.id} ${phase}`),
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

test('board player: stopping drops the sentences not yet shown', () => {
    const clock = fakeClock();
    const reports = [];
    const player = boardPlayer(
        () => {},
        (s, phase) => reports.push(`${s.id} ${phase}`),
        clock,
    );
    player.add({ id: '1', text: 'One.' });
    player.add({ id: '2', text: 'Two.' });
    player.stop();
    clock.advance(10000);
    assert.deepEqual(reports, ['1 start']);
});
