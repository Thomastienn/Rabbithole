import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { button } from '../support/ui.mjs';
const { passage } = await import('../support/passage.mjs');
const key = (node, key) =>
    node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

test('underlines, manual highlights, late suggestions and streaming preserve passage behavior', async (t) => {
    const { container, act, update, message, branched, opened, section, underline, highlights } =
        await passage(t);
    const suggestion = {
        message: 'reply',
        status: 'pending',
        passages: [{ start: 10, end: 19, text: 'repeat 😀', concept: 'Repeat' }],
    };
    // A quick thinking row is pending without passages.
    await act(async () => update((v) => ({ ...v, suggestions: { ...suggestion, passages: [] } })));
    assert.equal(underline(), null);
    section().focus();
    const focus = document.activeElement;
    await act(async () =>
        update((v) => ({ ...v, suggestions: { ...suggestion, status: 'ready' } })),
    );
    assert.equal(document.activeElement, focus, 'arrival does not take focus');
    assert.equal(
        container.querySelector('.passage [role=status]').textContent,
        '1 suggested passage in tutor reply 1',
    );
    assert.match(underline().getAttribute('aria-label'), /Suggested passage: repeat 😀/);
    await act(async () => key(underline(), 'Enter'));
    assert.deepEqual(branched.at(-1)[0], {
        messageId: 'reply',
        start: 10,
        end: 19,
        text: 'repeat 😀',
        suggestion: true,
        at: { x: 0, y: 0, below: 0 },
    });
    assert.equal(branched.at(-1)[1], underline());
    await act(async () =>
        update((v) => ({
            ...v,
            suggestions: {
                ...suggestion,
                status: 'ready',
                passages: [{ ...suggestion.passages[0], child: 'child' }],
            },
        })),
    );
    await act(async () => key(underline(), ' '));
    assert.deepEqual(opened, ['child']);

    // A synthetic DOM Range checks handler wiring; native drag geometry remains a browser gap.
    const range = document.createRange(),
        node = underline().firstChild;
    range.setStart(node, 1);
    range.setEnd(node, 4);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    await act(async () => {
        section().dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        underline().click();
    });
    assert.deepEqual(opened, ['child'], 'highlight takes priority over explored underline');
    assert.equal(window.getSelection().toString(), 'epe');
    await act(async () => button(container, 'Ask about selection').click());
    assert.deepEqual(branched.at(-1)[0], {
        messageId: 'reply',
        start: 11,
        end: 14,
        text: 'epe',
        at: { x: 0, y: 10, below: 25 },
    });
    assert.equal(branched.at(-1)[1], section());
    await act(async () =>
        update((v) => ({
            ...v,
            suggestions: { ...suggestion, status: 'pending' },
            form: { node: h('input', { defaultValue: 'Keep my question' }), start: 11, end: 14 },
        })),
    );
    assert.deepEqual(
        [...highlights.get('passage')].map((r) => r.toString()),
        ['epe'],
    );
    const question = container.querySelector('input');
    question.focus();
    await act(async () =>
        update((v) => ({ ...v, suggestions: { ...suggestion, status: 'ready' } })),
    );
    assert.equal(document.activeElement, question);
    assert.equal(question.value, 'Keep my question');
    assert.deepEqual(
        [...highlights.get('passage')].map((r) => r.toString()),
        ['epe'],
    );
    await act(async () =>
        update((v) => ({
            ...v,
            form: undefined,
            message: {
                ...message,
                status: 'streaming',
                text: '# Stable\n\n```js\nconst first = 1;\n',
            },
        })),
    );
    assert.equal(highlights.has('passage'), false);
    assert.equal(button(container, 'Select passage in tutor reply 1'), undefined);
    assert.equal(underline(), null);
    const heading = container.querySelector('h3'),
        code = container.querySelector('pre');
    await act(async () =>
        update((v) => ({
            ...v,
            message: { ...v.message, text: v.message.text + 'let second = 2;\n```' },
        })),
    );
    assert.equal(container.querySelector('h3'), heading);
    assert.equal(container.querySelector('pre'), code);
    assert.match(code.textContent, /let second/);
    // The tutor's mark underlines its term while the reply still streams.
    const stable = { start: 2, end: 8, text: 'Stable' };
    await act(async () =>
        update((v) => ({ ...v, suggestions: { ...suggestion, passages: [stable] } })),
    );
    assert.match(underline().getAttribute('aria-label'), /Suggested passage: Stable/);
    // Opening it before the reply finishes asks about it, as on a finished reply.
    await act(async () => {
        underline().dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
        underline().click();
    });
    assert.deepEqual(branched.at(-1)[0], {
        messageId: 'reply',
        start: 2,
        end: 8,
        text: 'Stable',
        suggestion: true,
        at: { x: 0, y: 0, below: 0 },
    });
    await act(async () =>
        update((v) => ({ ...v, message: { ...v.message, status: 'completed' } })),
    );
    assert.equal(container.querySelector('pre'), code);
});

test('overlapping explored passages: each part opens its own chat, an overlap asks which', async (t) => {
    const { container, act, update, opened } = await passage(t);
    const outer = {
            start: 0,
            end: 19,
            text: 'repeat 😀 repeat 😀',
            child: 'outer',
            title: 'Outer chat',
        },
        inner = { start: 10, end: 16, text: 'repeat', child: 'inner', title: 'Inner chat' };
    await act(async () => update((v) => ({ ...v, branched: [inner, outer] })));
    const pieces = (u) => [...container.querySelectorAll(`[data-u="${u}"]`)];
    // Outer is index 0 (wider first): it covers three pieces and wraps the one inner piece.
    assert.equal(pieces(0).length, 3);
    assert.equal(pieces(1).length, 1);
    assert.equal(pieces(1)[0].parentElement, pieces(0)[1]);
    // Hovering the overlap lights both passages whole; leaving clears them.
    await act(async () =>
        pieces(1)[0].dispatchEvent(new MouseEvent('pointerover', { bubbles: true })),
    );
    const lit = () =>
        [...container.querySelectorAll('.lit')].map((u) => u.getAttribute('data-u')).join(' ');
    assert.equal(lit(), '0 0 1 0');
    await act(async () =>
        container
            .querySelector('.passage > section')
            .dispatchEvent(new MouseEvent('pointerout', { bubbles: true })),
    );
    assert.equal(lit(), '');
    // A part only the outer passage covers opens it directly.
    await act(async () => pieces(0)[0].click());
    assert.deepEqual(opened, ['outer']);
    // The overlap asks which chat, innermost first; choosing one opens it and closes the picker.
    await act(async () => pieces(1)[0].click());
    const picker = container.querySelector('.branch-picker');
    assert.deepEqual(
        [...picker.querySelectorAll('button')].map((b) => b.textContent),
        ['Inner chat', 'Outer chat'],
    );
    assert.equal(document.activeElement, picker.querySelector('button'));
    await act(async () => picker.querySelectorAll('button')[1].click());
    assert.deepEqual(opened, ['outer', 'outer']);
    assert.equal(container.querySelector('.branch-picker'), null);
    // Escape closes the picker without opening anything.
    await act(async () => pieces(1)[0].click());
    await act(async () => key(container.querySelector('.branch-picker button'), 'Escape'));
    assert.equal(container.querySelector('.branch-picker'), null);
    // Each passage has its own Tab stop, and Enter opens that passage's chat.
    const stops = [...container.querySelectorAll('u[tabindex]')];
    assert.deepEqual(
        stops.map((u) => u.getAttribute('data-u')),
        ['0', '1'],
    );
    await act(async () => key(stops[1], 'Enter'));
    await act(async () => key(stops[0], 'Enter'));
    assert.deepEqual(opened, ['outer', 'outer', 'inner', 'outer']);
});
