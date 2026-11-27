import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui, button, name } from '../support/ui.mjs';
const { default: ChatHeadingRow } = await import('../../src/chat/ChatHeader.tsx');

test('chat header row: return to parent, path crumbs, stats and map toggles, close and overflow actions', async (t) => {
    const calls = [];
    let dom;
    function Fixture({ parentTitle }) {
        const [statsOpen, setStats] = useState(false),
            [expanded, setExpanded] = useState(false),
            [board, setBoard] = useState(false);
        return h(ChatHeadingRow, {
            parentTitle,
            ancestors: [{ id: 'root', title: 'Mutex basics' }],
            current: { id: 'child', title: 'Why one at a time?' },
            addresses: new Map([
                ['root', { address: '1' }],
                ['child', { address: '1.1', ink: 2 }],
            ]),
            open: (id) => calls.push(['open', id]),
            openParent: () => calls.push(['parent']),
            statsOpen,
            toggleStats: () => setStats((v) => !v),
            expanded,
            toggleExpanded: () => setExpanded((v) => !v),
            returnToTree: () => calls.push(['map']),
            rename: () => calls.push(['rename']),
            board,
            toggleBoard: () => setBoard((v) => !v),
        });
    }
    const { container, act, cleanup } = await render(
        h(Fixture, { parentTitle: 'Mutex basics' }),
        (w) => {
            dom = ui(w);
        },
    );
    t.after(cleanup);
    const nav = container.querySelector('nav');
    assert.ok(nav.getAttribute('aria-label'), 'named for assistive tech');
    assert.deepEqual([...nav.querySelectorAll('button')].map(name), ['1 Mutex basics']);
    assert.equal(
        nav.querySelector('[aria-current=location]').textContent,
        '1.1 Why one at a time?',
    );
    assert.match(
        nav.querySelector('[aria-current=location] .address-chip').style.getPropertyValue('--ink'),
        /ink-2/,
        'the current chip wears its family line',
    );
    await act(async () => button(container, 'Return to parent conversation').click());
    await act(async () => button(container, '1 Mutex basics').click());
    await act(async () => button(container, 'Return to tree').click());
    const toggle = button(container, 'Expand chat');
    assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    assert.equal(toggle.getAttribute('aria-controls'), 'learning-tree-map');
    await act(async () => toggle.click());
    assert.equal(name(toggle), 'Show map beside chat');
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    const menuItem = async (label) => {
        await act(async () => button(container, 'More conversation options').click());
        await act(async () => dom.frames());
        const item = [...document.querySelectorAll('[role=menuitem]')].find(
            (e) => e.textContent.trim() === label,
        );
        assert.ok(item, label);
        await act(async () => item.click());
    };
    await menuItem('Show token stats');
    assert.equal(button(container, 'Token stats').getAttribute('aria-pressed'), 'true');
    await menuItem('Hide token stats');
    assert.equal(button(container, 'Token stats').getAttribute('aria-pressed'), 'false');
    await menuItem('Rename conversation');
    // The Board toggle switches the conversation to its board, which has no map to give way to.
    const boardSwitch = container.querySelector('[role=switch]');
    assert.ok(boardSwitch && !boardSwitch.checked);
    await act(async () => boardSwitch.click());
    assert.ok(container.querySelector('[role=switch]').checked);
    assert.equal(button(container, 'Show map beside chat'), undefined);
    assert.equal(button(container, 'Return to parent conversation'), undefined);
    assert.equal(
        nav.querySelectorAll('button').length,
        0,
        'the board header shows only the current title',
    );
    await act(async () => container.querySelector('[role=switch]').click());
    assert.ok(button(container, 'Show map beside chat'), 'off again, the map toggle returns');
    assert.deepEqual(calls, [['parent'], ['open', 'root'], ['map'], ['rename']]);
});
