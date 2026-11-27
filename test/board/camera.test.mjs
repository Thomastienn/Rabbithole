import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { follow } = await import('../../src/board/camera.ts');

// A board scroller two areas tall, showing the first, with frames run by hand.
function setup(t, { reduced = false } = {}) {
    const frames = [];
    let now = 0;
    t.mock.method(performance, 'now', () => now);
    globalThis.matchMedia = () => ({ matches: reduced });
    globalThis.requestAnimationFrame = (run) => frames.push(run);
    globalThis.cancelAnimationFrame = () => (frames.length = 0);
    t.after(() => {
        delete globalThis.matchMedia;
        delete globalThis.requestAnimationFrame;
        delete globalThis.cancelAnimationFrame;
    });
    const el = {
        scrollHeight: 1260,
        clientHeight: 630,
        scrollTop: 0,
        scrolledTo: [],
        scrollTo(o) {
            this.scrolledTo.push(o.top);
        },
    };
    const tick = (ms) => {
        now += ms;
        frames.splice(0).forEach((run) => run(now));
    };
    return { el, tick, frames };
}
const item = (kind, ms) => ({ op: { id: 'i', kind }, ms });

test('board camera: a replayed board shows its last area at once', (t) => {
    const { el } = setup(t);
    follow(el, item('circle', 0));
    assert.equal(el.scrollTop, 630);
});

test('board camera: a live clear eases down to the fresh area over its share', (t) => {
    const { el, tick, frames } = setup(t);
    follow(el, item('clear', 1000));
    tick(250);
    assert.ok(el.scrollTop > 0 && el.scrollTop < 315, 'it eases in');
    tick(750);
    assert.equal(el.scrollTop, 630);
    assert.equal(frames.length, 0, 'it stops at the area');
});

test('board camera: with reduced motion a clear jumps at the cross-fade’s midpoint', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { el } = setup(t, { reduced: true });
    follow(el, item('clear', 1000));
    t.mock.timers.tick(499);
    assert.equal(el.scrollTop, 0);
    t.mock.timers.tick(1);
    assert.equal(el.scrollTop, 630);
});

test('board camera: a live item brings a learner who scrolled back to the latest area', (t) => {
    const { el } = setup(t);
    follow(el, item('circle', 800));
    assert.deepEqual(el.scrolledTo, [630]);
    el.scrollTop = 630;
    follow(el, item('circle', 800));
    assert.deepEqual(el.scrolledTo, [630], 'no scroll when already there');
});
