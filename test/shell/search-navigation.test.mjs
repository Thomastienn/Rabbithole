import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { inputValue } from '../support/ui.mjs';
import { mount, summary, tree } from '../support/chat-page-kit.mjs';

test('search opens a reply in a different learning tree and opens title and passage matches at the top', async (t) => {
    const child = {
        ...tree,
        id: 'child',
        title: 'Thin channels',
        branch: { parent: 'other', messageId: 'source', start: 0, end: 9, text: 'Thin wall' },
    };
    const other = { id: 'other', title: 'Soil', parent: null, created: 2 };
    const hit = (field, snippet, message) => ({
        conversation: child.id,
        root: other.id,
        tree: other.title,
        address: '1.1',
        title: child.title,
        field,
        snippet,
        ranges: [[0, 4]],
        message,
    });
    let found;
    const { act, calls, settle, scrolls } = await mount(
        t,
        [{ ...summary, created: 1 }, other, { id: child.id, parent: other.id, created: 3 }],
        {
            respond: (path) => {
                if (path === '/api/trees/child') return { ok: true, json: async () => child };
                if (path.startsWith('/api/search?')) return { ok: true, json: async () => [found] };
            },
        },
    );
    t.mock.timers.enable({ apis: ['setTimeout'] });
    globalThis.NodeFilter = window.NodeFilter;
    globalThis.Highlight = Set;
    CSS.highlights = new Map();
    t.after(() => {
        delete globalThis.NodeFilter;
        delete globalThis.Highlight;
    });
    const search = async (result) => {
        found = result;
        await act(async () =>
            document.body.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
            ),
        );
        const input = document.querySelector('dialog[open] input');
        await act(async () => {
            inputValue(input, 'thin');
            t.mock.timers.tick(120);
        });
        for (const key of ['ArrowDown', 'Enter'])
            await act(async () =>
                input.dispatchEvent(
                    new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
                ),
            );
        scrolls.length = 0;
        for (let i = 0; i < 12; i++) await settle();
        return scrolls.at(-1);
    };
    const highlightedIn = () => {
        const ranges = CSS.highlights.get('search-match');
        return [...ranges].map((r) => r.startContainer.parentElement);
    };

    const reply = await search(hit('reply', 'Thin threads.', 'a1'));
    assert.ok(calls.includes('/api/search?q=thin&tree=t1'));
    assert.ok(calls.includes('/api/trees/child'));
    assert.equal(reply.element.dataset.chatMessage, 'a1');
    assert.deepEqual(reply.options, { block: 'start' });
    assert.ok(document.activeElement === reply.element);
    assert.deepEqual(
        highlightedIn().map((e) => e.closest('[data-chat-message]')?.dataset.chatMessage),
        ['a1'],
    );

    const title = await search(hit('title', child.title));
    assert.ok(title.element.classList.contains('chat-title'));
    assert.deepEqual(
        highlightedIn().map((e) => e.tagName),
        ['H2'],
    );

    const passage = await search(hit('passage', child.branch.text));
    assert.ok(passage.element.classList.contains('chat-title'));
    assert.deepEqual(
        highlightedIn().map((e) => e.id),
        ['origin-source'],
    );
});
