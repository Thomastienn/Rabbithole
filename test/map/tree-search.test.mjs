import '../support/tsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
const { default: TreeSearch } = await import('../../src/shell/TreeSearch.tsx');

const result = (conversation, root, tree, address, title, field, snippet, ranges, message) => ({
    id: conversation,
    label: title,
    auxiliaryData: {
        group: tree,
        conversation,
        root,
        tree,
        address,
        title,
        field,
        snippet,
        ranges,
        message,
    },
});

test('search window lists recent trees, groups marked results by tree, moves with arrows, opens with Enter or click and returns focus on Escape', async (t) => {
    const opened = [];
    const pending = new Map();
    const source = {
        bootstrap: () => [
            {
                id: 'fungi',
                label: 'Fungi',
                auxiliaryData: {
                    ...result('fungi', 'fungi', 'Fungi', '1', 'Fungi', 'title', '', [])
                        .auxiliaryData,
                    group: 'Recent learning trees',
                    recent: 'Today · 9 conversations',
                },
            },
        ],
        search: async (q) =>
            q === 'tips' || q === 'Hyphae tips'
                ? new Promise((resolve) => pending.set(q, resolve))
                : q === 'missing'
                  ? []
                  : [
                        result(
                            'hyphae',
                            'fungi',
                            'Fungi · This tree',
                            '1.2',
                            'What are hyphae?',
                            'reply',
                            '…a hypha grows at its tip.',
                            [[3, 8]],
                            'm1',
                        ),
                        result(
                            'hyphae2',
                            'fungi',
                            'Fungi · This tree',
                            '1.3',
                            'Hyphae tips',
                            'title',
                            'Hyphae tips',
                            [[0, 6]],
                        ),
                        result('bread', 'bread', 'Bread', '1', 'Bread', 'passage', 'yeast tips', [
                            [6, 10],
                        ]),
                    ],
    };
    function Fixture() {
        const [open, setOpen] = useState(false);
        return h(
            'div',
            null,
            h('button', { className: 'tree-search', onClick: () => setOpen(true) }, 'Search'),
            h(TreeSearch, {
                isOpen: open,
                onOpenChange: setOpen,
                searchSource: source,
                ink: (id) => (id === 'hyphae' ? 2 : 0),
                onOpen: (r) => opened.push(r),
                inTree: true,
            }),
        );
    }
    const { container, act, cleanup } = await render(h(Fixture), (w) => {
        // jsdom lacks modal/CSS APIs. Focus and selection still run in the real component.
        w.CSS = { escape: (id) => id.replace(/[^\w-]/g, (c) => `\\${c}`) };
        w.HTMLDialogElement.prototype.showModal = function () {
            this.open = true;
        };
        w.HTMLDialogElement.prototype.close = function () {
            this.open = false;
        };
    });
    t.after(cleanup);
    const trigger = container.querySelector('.tree-search');
    const open = async () => {
        await act(async () => {
            trigger.focus();
            trigger.click();
        });
        return document.querySelector('dialog[open]');
    };
    const type = async (text) => {
        const input = document.querySelector('dialog input');
        await act(async () => {
            Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(
                input,
                text,
            );
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
        return input;
    };
    const key = async (input, key) =>
        act(async () =>
            input.dispatchEvent(
                new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
            ),
        );
    let dialog = await open();
    assert.ok(dialog.getAttribute('aria-label'));
    assert.match(
        dialog.querySelector('.search-what').textContent,
        /questions.*replies\. Matches in this tree come first\./,
        'the empty query names every field searched',
    );
    assert.equal(document.activeElement.tagName, 'INPUT');
    assert.match(
        dialog.querySelector('[role=option]').textContent,
        /Fungi.*Today · 9 conversations/,
    );
    let query = document.querySelector('dialog input');
    await key(query, 'ArrowDown');
    await key(query, 'Enter');
    assert.equal(opened.at(-1).recent, 'Today · 9 conversations', 'Enter opens a recent tree');

    dialog = await open();
    await type('missing');
    assert.match(dialog.querySelector('.search-none').textContent, /missing/);
    assert.equal(dialog.querySelectorAll('[role=option]').length, 0);
    query = await type('tip');
    assert.equal(
        dialog.querySelector('[role=status]').textContent,
        '3 results in 2 learning trees',
    );
    assert.deepEqual(
        [...dialog.querySelectorAll('[role=group]')].map((g) => g.getAttribute('aria-label')),
        ['Fungi · This tree', 'Bread'],
        'grouped by learning tree, the current one marked',
    );
    const options = [...dialog.querySelectorAll('[role=option]')];
    assert.match(options[0].textContent, /^1\.2What are hyphae\?Reply…a hypha grows at its tip\.$/);
    assert.equal(
        options[0].querySelector('.address-chip').style.getPropertyValue('--ink'),
        'var(--rabbithole-ink-2)',
    );
    assert.deepEqual(
        options.map((o) => [...o.querySelectorAll('mark')].map((m) => m.textContent)),
        [['hypha'], ['Hyphae'], ['tips']],
        'snippet ranges are marked; a title match marks its title and shows no snippet',
    );
    assert.equal(options[1].querySelector('.search-snippet'), null);
    await key(query, 'ArrowDown');
    const first = query.getAttribute('aria-activedescendant');
    assert.ok(
        document.getElementById(first) === options[0],
        'the selected result is the active option',
    );
    await key(query, 'ArrowDown');
    assert.notEqual(query.getAttribute('aria-activedescendant'), first);
    await key(query, 'ArrowUp');
    assert.equal(query.getAttribute('aria-activedescendant'), first);
    await key(query, 'Enter');
    assert.deepEqual(
        [opened.at(-1).conversation, opened.at(-1).message],
        ['hyphae', 'm1'],
        'Enter opens the result with its matched message',
    );
    assert.equal(document.querySelector('dialog[open]'), null);

    await open();
    assert.equal(document.querySelector('dialog input').value, '');
    query = await type('tip');
    await key(query, 'Escape');
    assert.equal(document.querySelector('dialog[open]'), null);
    assert.equal(document.activeElement, trigger, 'Escape returns focus');
    assert.equal(opened.length, 2, 'dismissal opens nothing');
    await open();
    await type('tip');
    await act(async () => document.querySelectorAll('[role=option]')[2].click());
    assert.equal(opened.at(-1).conversation, 'bread');

    await open();
    await type('tip');
    await type('tips');
    query = await type('Hyphae tips');
    await act(async () => pending.get('tips')([]));
    await key(query, 'ArrowDown');
    await key(query, 'Enter');
    assert.equal(
        opened.at(-1).conversation,
        'hyphae2',
        'a visible option opens during a newer search',
    );
    await act(async () => pending.get('Hyphae tips')([]));
});

test('an opened result highlights original text across inline markup and clears it after two seconds', async (t) => {
    const { markWords } = await import('../../src/chat/useChatTargets.ts');
    const { container, cleanup } = await render(
        h('div', null, h('p', null, 'İ ', h('strong', null, 'Hy'), 'pha tip; another TIP')),
        (w) => {
            w.CSS = { highlights: new Map() };
        },
    );
    // Neither is a global render copies from jsdom.
    globalThis.NodeFilter = window.NodeFilter;
    globalThis.Highlight = Set;
    t.after(() => {
        delete globalThis.NodeFilter;
        delete globalThis.Highlight;
    });
    t.after(cleanup);
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const marked = () => [...(CSS.highlights.get('search-match') ?? [])].map((r) => r.toString());
    markWords(container, ['hyph', 'tip']);
    assert.deepEqual(marked(), ['Hyph', 'tip', 'TIP']);
    markWords(container, ['TIP']);
    assert.deepEqual(marked(), ['tip', 'TIP']);
    t.mock.timers.tick(2000);
    assert.deepEqual(marked(), []);
});
