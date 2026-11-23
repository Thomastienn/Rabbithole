import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
const { InkLegend } = await import('../../src/map/MapControls.tsx');
const { familyLegend } = await import('../../src/map/mapState.ts');

test('the line key lists the trunk and its direct children in their inks under "First branches"', async (t) => {
    const tree = (id, parent = null, created = 0) => ({ id, parent, title: id, created });
    const trees = [tree('root'), tree('a', 'root', 1), tree('b', 'root', 2), tree('a1', 'a', 3)];
    const { container, cleanup } = await render(
        h(InkLegend, { legend: familyLegend('root', trees), root: 'root' }),
    );
    t.after(cleanup);
    assert.equal(container.querySelector('aside').getAttribute('aria-label'), 'First branches');
    assert.deepEqual(
        [...container.querySelectorAll('li')].map((li) => [
            li.textContent,
            li.style.getPropertyValue('--ink'),
        ]),
        [
            ['1 root · trunk', 'var(--rabbithole-paper)'],
            ['1.1 a', 'var(--rabbithole-ink-1)'],
            ['1.2 b', 'var(--rabbithole-ink-2)'],
        ],
    );
});
