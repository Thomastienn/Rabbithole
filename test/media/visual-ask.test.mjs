import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button } from '../support/ui.mjs';
const { default: VisualFrame } = await import('../../src/media/VisualFrame.tsx');

const visual = (status) => ({
    id: `v-${status}`,
    kind: 'visual',
    conversation: 'root',
    message: 'reply',
    title: 'Tournament rounds',
    description: 'Two winners advance to the final.',
    status,
    error: null,
    source: status === 'pending' ? null : '<p>rounds</p>',
    created: 0,
});
const ASK = 'Ask about visual: Tournament rounds';

test('Ask appears only on ready visuals, opens the branch form with the whole visual as source, and the … menu holds the other actions', async (t) => {
    const calls = [];
    let dom;
    const onPart = (artifact, part, origin) =>
        calls.push(['ask', artifact.id, part, origin.current]);
    const { container, act, cleanup } = await render(
        h(
            'div',
            null,
            ...['pending', 'failed', 'ready'].map((status) =>
                h(VisualFrame, {
                    key: status,
                    artifact: visual(status),
                    onPart,
                    onRetry: async () => {},
                    onRegenerate: async () => void calls.push(['regenerate']),
                }),
            ),
        ),
        (w) => (dom = ui(w)),
    );
    t.after(cleanup);
    for (const status of ['pending', 'failed'])
        assert.equal(
            button(container.querySelector(`[data-artifact=v-${status}]`), ASK),
            undefined,
        );
    const figure = container.querySelector('[data-artifact=v-ready]');
    const ask = button(figure, ASK);
    const trigger = button(figure, 'Visual actions: Tournament rounds');
    // Keyboard reachable: native buttons in tab order.
    for (const b of [ask, trigger]) assert.notEqual(b.getAttribute('tabindex'), '-1');
    assert.equal(
        [...figure.querySelectorAll('.visual-actions button')].length,
        2,
        'only Ask and the … trigger',
    );
    await act(async () => ask.click());
    const source = { label: 'Tournament rounds', explanation: 'Two winners advance to the final.' };
    assert.deepEqual(calls.shift(), ['ask', 'v-ready', source, figure]);

    const menuItem = async (label) => {
        await act(async () => trigger.click());
        await act(async () => dom.frames());
        const items = [...document.querySelectorAll('[role=menuitem]')];
        assert.deepEqual(
            items.map((e) => e.textContent.trim()),
            ['Try a different version', 'Enlarge'],
        );
        await act(async () => items.find((e) => e.textContent.trim() === label).click());
    };
    await menuItem('Try a different version');
    assert.deepEqual(calls.shift(), ['regenerate']);
    await menuItem('Enlarge');
    const viewer = document.querySelector('dialog.visual-viewer, .visual-viewer');
    assert.ok(viewer, 'enlarged view opens');
    await act(async () => button(viewer, ASK).click());
    assert.deepEqual(calls.shift(), ['ask', 'v-ready', source, figure]);
    assert.equal(document.querySelector('.visual-viewer'), null, 'asking closes the enlarged view');
});

test('child chips sit under the visual in address order and family ink, and a chip opens its child', async (t) => {
    const opened = [];
    const explored = [
        { child: 'c10', address: '1.10', ink: 2, label: 'Tournament rounds', explanation: 'x' },
        // An older visual-part branch: label from a tagged part, not the visual title.
        { child: 'c2', address: '1.2', ink: 2, label: 'Final', explanation: 'The last match.' },
        { child: 'c3', address: '1.3', ink: 3, label: 'Tournament rounds', explanation: 'x' },
    ];
    const { container, act, cleanup } = await render(
        h(
            'div',
            null,
            h(VisualFrame, {
                artifact: visual('ready'),
                explored,
                onOpenChild: (id) => opened.push(id),
            }),
            h(VisualFrame, {
                artifact: { ...visual('ready'), id: 'lonely' },
                onOpenChild: () => {},
            }),
        ),
    );
    t.after(cleanup);
    const chips = [...container.querySelectorAll('[data-artifact=v-ready] .visual-chips button')];
    assert.deepEqual(
        chips.map((c) => c.textContent),
        ['1.2', '1.3', '1.10'],
    );
    assert.ok(
        chips.every((c) => c.classList.contains('passage-address')),
        'reuses the passage chip',
    );
    assert.deepEqual(
        chips.map((c) => c.style.getPropertyValue('--ink')),
        ['var(--rabbithole-ink-2)', 'var(--rabbithole-ink-3)', 'var(--rabbithole-ink-2)'],
    );
    assert.equal(chips[0].getAttribute('aria-label'), 'Open branch 1.2: Final');
    await act(async () => chips[0].click());
    assert.deepEqual(opened, ['c2']);
    assert.equal(container.querySelector('[data-artifact=lonely] .visual-chips'), null);
});
