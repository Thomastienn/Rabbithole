import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui } from '../support/ui.mjs';
const { useChatTargets, REVEAL_MS } = await import('../../src/chat/useChatTargets.ts');

// The parent reply, with the branched passage marked when it is still there.
async function goBack(t, marked) {
    let dom, targets;
    function Fixture() {
        targets = useChatTargets({ overview: false }, { id: 'p' });
        return h(
            'div',
            { className: 'focused-chat' },
            h('div', { 'data-chat-message': 'm0' }, 'Earlier reply'),
            h(
                'div',
                { 'data-chat-message': 'm1' },
                'Light bends by ',
                marked ? h('mark', { tabIndex: -1 }, 'refraction') : 'reflection',
            ),
        );
    }
    const r = await render(h(Fixture), (w) => {
        dom = ui(w);
        w.HTMLElement.prototype.scrollIntoView = function (options) {
            (this.scrolled ??= []).push(options.block);
        };
    });
    t.after(r.cleanup);
    const source = { messageId: 'm1', start: 15, end: 25, text: 'refraction' };
    await r.act(async () => targets.goTo('p', source, undefined, 'm1'));
    // Run the whole hold, which re-centres the target each frame.
    for (let i = 0; i < 12; i++) await r.act(async () => dom.frames());
    r.targets = () => targets;
    return r;
}

test('going back holds the branched passage in view for every frame and focuses it', async (t) => {
    const { container } = await goBack(t, true);
    const mark = container.querySelector('mark');
    assert.ok(document.activeElement === mark);
    assert.deepEqual(mark.scrolled, Array(12).fill('center'));
});

test('a passage gone from the reply lands on its reply', async (t) => {
    const { container } = await goBack(t, false);
    const reply = container.querySelector('[data-chat-message="m1"]');
    assert.ok(document.activeElement === reply);
    assert.equal(reply.scrolled.at(-1), 'start');
});

test('the returned-to passage is marked only until its fade ends', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const r = await goBack(t, true);
    await r.act(async () => t.mock.timers.tick(REVEAL_MS - 1));
    assert.ok(r.targets().reveal);
    await r.act(async () => t.mock.timers.tick(1));
    assert.equal(r.targets().reveal, undefined);
});
