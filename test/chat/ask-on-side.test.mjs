import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { button } from '../support/ui.mjs';
import { mount, summary, tree } from '../support/chat-page-kit.mjs';

const json = (body) => ({ ok: true, json: async () => body });
const side = (root) => button(root, 'Ask on the side');
const type = async (act, root, text) => {
    const input = root.querySelector('#focused-chat [role=textbox]');
    await act(async () => {
        input.textContent = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
};

test('Ask on the side is absent before the first completed reply', async (t) => {
    const { container } = await mount(t, [summary], {
        respond: (path) =>
            path === '/api/trees/t1' &&
            json({ ...tree, messages: [{ ...tree.messages[0], status: 'completed' }] }),
    });
    assert.ok(container.querySelector('#focused-chat [role=textbox]'));
    assert.equal(side(container), undefined);
});

test('Ask on the side needs a typed question and no files, then opens the free branch', async (t) => {
    const child = {
        ...tree,
        id: 'c1',
        title: 'Do lichens trade the same way?',
        messages: [],
        branch: {
            parent: 't1',
            messageId: 'a1',
            start: null,
            end: null,
            text: '',
            question: 'Do lichens trade the same way?',
            snapshot: '',
        },
    };
    let posted;
    const { container, act } = await mount(t, [summary], {
        respond: (path, options) => {
            if (path === '/api/trees/t1/branches') {
                posted = JSON.parse(options.body);
                return json(child);
            }
            if (path === '/api/trees/c1') return json(child);
            if (path === '/api/trees/c1/messages')
                return new Response(new ReadableStream({ start: (c) => c.close() }));
        },
    });
    assert.equal(side(container).getAttribute('aria-disabled'), 'true', 'empty box');
    await type(act, container, 'Do lichens trade the same way?');
    assert.equal(side(container).getAttribute('aria-disabled'), null);
    assert.equal(side(container).tabIndex, 0, 'reachable by keyboard');
    const editor = container.querySelector('#focused-chat [role=textbox]');
    const file = new File(['a'], 'notes.txt', { type: 'text/plain' });
    await act(async () => {
        const event = new Event('paste', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'clipboardData', {
            value: { files: [file], types: ['Files'], getData: () => '' },
        });
        editor.dispatchEvent(event);
    });
    assert.equal(side(container).getAttribute('aria-disabled'), 'true', 'files attached');
    await act(async () =>
        [...container.querySelectorAll('button')]
            .find((b) => /remove/i.test(b.getAttribute('aria-label') ?? ''))
            .click(),
    );
    await act(async () => side(container).click());
    assert.deepEqual(posted, { free: true, question: 'Do lichens trade the same way?' });
    assert.equal(
        container.querySelector('#rename-conversation h2').textContent,
        'Do lichens trade the same way?',
    );
    assert.match(container.querySelector('.origin-line').textContent, /on the side/);
});
