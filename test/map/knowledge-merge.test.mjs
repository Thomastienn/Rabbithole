import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { button } from '../support/ui.mjs';
import { initial, setup, KnowledgeFixture as KnowledgePage } from '../support/knowledge-kit.mjs';

test('knowledge merge keeps the selected concept, restores focus and retains the duplicate after a failed write', async (t) => {
    let graph = {
            ...initial(),
            concepts: initial()
                .concepts.slice(0, 2)
                .map((c) => ({ ...c, topics: [] })),
            links: [],
        },
        dom,
        failMerge = true;
    const calls = [];
    const api = async (path, body) => {
        calls.push([path, body]);
        if (path.endsWith('/merge')) {
            if (failMerge) throw new Error('Write failed');
            graph = {
                ...graph,
                concepts: graph.concepts.filter((c) => c.name !== body.from),
                links: [],
            };
        }
        return graph;
    };
    const { container, act, cleanup } = await render(
        h(KnowledgePage, { api, activity: '' }),
        (w) => {
            dom = setup(w);
        },
    );
    t.after(cleanup);
    const click = async (label, root = container) => {
        const b = button(root, label);
        assert.ok(b, label);
        await act(async () => {
            b.focus();
            b.click();
        });
    };
    await click('Merge concepts');
    const [keep, duplicate] = document.querySelectorAll('dialog button[aria-expanded]');
    assert.match(keep.textContent, /Mutex/);
    await act(async () => duplicate.click());
    const listbox = document.getElementById(duplicate.getAttribute('aria-controls'));
    const option = [...listbox.querySelectorAll('[role=option]')].find((e) =>
        e.textContent.includes('Mutual exclusion'),
    );
    assert.ok(option, document.querySelector('dialog').textContent);
    await act(async () => option.click());
    const dialog = document.querySelector('dialog');
    await click('Merge concepts', dialog);
    assert.match(dialog.querySelector('[role=alert]').textContent, /Write failed/);
    assert.match(
        dialog.querySelectorAll('button[aria-expanded]')[1].textContent,
        /Mutual exclusion/,
    );
    failMerge = false;
    await click('Merge concepts', dialog);
    await act(async () => dom.frames());
    assert.deepEqual(calls.at(-1), [
        '/api/graph/merge',
        { from: 'Mutual exclusion', into: 'Mutex' },
    ]);
    assert.equal(document.querySelector('dialog[open]'), null);
    assert.equal(document.activeElement.dataset.concept, 'Mutex');
    assert.ok(
        [...container.querySelectorAll('[role=status]')].some((e) =>
            e.textContent.includes('Merged Mutual exclusion into Mutex'),
        ),
    );
});
