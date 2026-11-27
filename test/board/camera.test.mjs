import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { follow, openTop } = await import('../../src/board/camera.ts');

// A board scroller two pages tall, showing the first, with frames run by hand.
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
const item = (kind, ms, top) => ({ op: { id: 'i', kind, top }, ms });

test('board camera: a replayed board shows its open page at once', (t) => {
    const { el } = setup(t);
    follow(el, item('circle', 0), 900);
    assert.equal(el.scrollTop, 630);
    follow(el, item('open', 0, 0), 0);
    assert.equal(el.scrollTop, 0, 'an open of the first page shows it again');
});

test('board camera: a live page slides to its page over its share', (t) => {
    const { el, tick, frames } = setup(t);
    follow(el, item('page', 1000, 900), 900);
    tick(250);
    assert.ok(el.scrollTop > 0 && el.scrollTop < 315, 'it eases in');
    tick(750);
    assert.equal(el.scrollTop, 630);
    assert.equal(frames.length, 0, 'it stops at the page');
});

test('board camera: with reduced motion an open jumps at the cross-fade’s midpoint', (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { el } = setup(t, { reduced: true });
    follow(el, item('open', 1000, 900), 900);
    t.mock.timers.tick(499);
    assert.equal(el.scrollTop, 0);
    t.mock.timers.tick(1);
    assert.equal(el.scrollTop, 630);
});

test('board camera: a live item brings a learner who looked away back to the open page', (t) => {
    const { el } = setup(t);
    follow(el, item('circle', 800), 900);
    assert.deepEqual(el.scrolledTo, [630]);
    el.scrollTop = 630;
    follow(el, item('circle', 800), 900);
    assert.deepEqual(el.scrolledTo, [630], 'no scroll when already there');
});

test('board camera: the open page is the last one a page, open or clear opened', () => {
    assert.equal(openTop([{ id: 'c', kind: 'circle' }]), 0, 'a board that never opened a page');
    const side = { id: 's1', kind: 'page', top: 900 };
    assert.equal(openTop([side, { id: 'd', kind: 'dot' }]), 900);
    assert.equal(openTop([side, { id: 'o1', kind: 'open', page: 'first', top: 0 }]), 0);
});
