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
    await act(async () => update((v) => ({ ...v, suggestions: suggestion })));
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
    await act(async () =>
        update((v) => ({ ...v, message: { ...v.message, status: 'completed' } })),
    );
    assert.equal(container.querySelector('pre'), code);
});
