import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { button } from '../support/ui.mjs';
const { passage } = await import('../support/passage.mjs');
const key = (node, key) =>
    node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

test('keyboard passage selection keeps exact offsets and returns focus on Escape', async (t) => {
    const { container, act, dom, text, branched, section } = await passage(t);
    assert.equal(button(container, 'Ask about selection'), undefined);
    await act(async () => button(container, 'Select passage in tutor reply 1').click());
    const input = container.querySelector('textarea');
    await act(async () => dom.frames());
    assert.equal(document.activeElement, input);
    assert.equal(input.readOnly, true);
    assert.equal(input.value, text);
    await act(async () => {
        input.setSelectionRange(10, 19);
        input.dispatchEvent(
            new KeyboardEvent('keyup', { key: 'ArrowRight', shiftKey: true, bubbles: true }),
        );
    });
    const ask = button(container, 'Ask about selection');
    await act(async () => ask.click());
    assert.deepEqual(branched.at(-1)[0], {
        messageId: 'reply',
        start: 10,
        end: 19,
        text: 'repeat 😀',
        at: undefined,
    });
    assert.ok(branched.at(-1)[1] === ask, 'focus returns to Ask');
    await act(async () => key(input, 'Escape'));
    assert.equal(container.querySelector('textarea'), null);
    assert.equal(document.activeElement, section());
    assert.equal(button(container, 'Ask about selection'), undefined);
});

test('a drag inside a formula shows and asks about the widened term, which returns underlined', async (t) => {
    const { container, act, update, branched, opened, section } = await passage(t);
    const text = 'So $E = mc^2$ holds.';
    await act(async () => update((v) => ({ ...v, message: { ...v.message, text } })));
    const symbol = (s) =>
        [...section().querySelectorAll('math *')].find(
            (e) => !e.children.length && e.textContent === s,
        ).firstChild;
    const range = document.createRange();
    range.setStart(symbol('m'), 0);
    range.setEnd(symbol('c'), 1);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    await act(async () => section().dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
    assert.equal(window.getSelection().toString(), 'mc2', 'the highlight snaps to the whole term');
    await act(async () => button(container, 'Ask about selection').click());
    assert.deepEqual(branched.at(-1)[0], {
        messageId: 'reply',
        start: 8,
        end: 12,
        text: 'mc^2',
        at: { x: 0, y: 10, below: 25 },
    });
    await act(async () =>
        update((v) => ({ ...v, branched: [{ start: 8, end: 12, text: 'mc^2', child: 'child' }] })),
    );
    const pieces = [...section().querySelectorAll('math .suggestion.explored')];
    assert.deepEqual(
        pieces.map((p) => p.textContent),
        ['m', 'c2'],
    );
    window.getSelection().removeAllRanges();
    await act(async () => {
        section().dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        pieces[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    assert.deepEqual(opened, ['child']);
});
