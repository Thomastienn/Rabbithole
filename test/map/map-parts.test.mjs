import '../support/tsx.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { ReactFlowProvider, useStoreApi } from '@xyflow/react';
import { render } from '../support/render.mjs';

const { Conversation, ConversationTransition } = await import('../../src/map/Conversation.tsx');

const summary = (id, parent = null, extra = {}) => ({
    id,
    parent,
    title: id,
    created: 0,
    messageId: 'answer',
    start: 2,
    end: 7,
    passage: 'Roots',
    x: null,
    y: null,
    ...extra,
});
const message = (id, role, text, status = 'completed') => ({ id, role, text, status });

test('conversation previews keep every row, accessible message jumps, source-row handles and current/activity state', async (t) => {
    const opens = [];
    const child = summary('child', 'root'),
        sibling = summary('sibling', 'root');
    const missing = summary('missing', 'root', { messageId: 'stale' });
    const groundwork = summary('groundwork', 'root', { start: null, end: null, passage: 'Soil' });
    const preview = [
        message('question', 'user', 'Why roots?'),
        message('answer', 'assistant', 'A long reply. '.repeat(60)),
        message('last-question', 'user', 'And fungi?'),
        message('stream', 'assistant', '', 'streaming'),
    ];
    const data = {
        conversation: summary('root'),
        sources: [child, sibling, groundwork, missing],
        preview,
        open: (...args) => opens.push(args),
        retry: () => {},
        toggle: () => {},
        active: true,
        focused: true,
        focus: false,
        childCount: 3,
        address: '1',
        ink: 0,
        stubs: [],
        folded: false,
    };
    let update;
    function Fixture() {
        const [value, set] = useState(data);
        update = set;
        return h(
            ReactFlowProvider,
            null,
            h(
                ConversationTransition.Provider,
                { value: 'root' },
                h(Conversation, { id: 'root', data: value }),
            ),
        );
    }
    const { container, act, cleanup } = await render(h(Fixture));
    t.after(cleanup);
    const box = container.querySelector('.conversation-box');
    assert.equal(box.dataset.focused, 'true');
    // The current conversation is named without colour, not only by its ring.
    assert.equal(container.querySelector('#open-root').getAttribute('aria-current'), 'true');
    assert.equal(box.querySelector('.node-band .node-address').textContent, '1');
    assert.ok(box.querySelector('.node-arriving'), 'an arriving reply shows its caret');
    assert.equal(box.dataset.active, 'true');
    assert.equal(box.style.getPropertyValue('--ink'), 'var(--rabbithole-paper)');
    assert.equal(container.querySelector('h2').style.viewTransitionName, 'conversation');
    assert.equal(container.querySelector('.activity-dot[role=status]').textContent, 'Responding');
    const rows = [...box.querySelectorAll('.node-message')];
    assert.deepEqual(
        rows.map((r) => [r.dataset.message, r.dataset.role]),
        preview.map((m) => [m.id, m.role]),
    );
    const bubbles = [...box.querySelectorAll('.node-bubble')];
    assert.ok(
        bubbles.every(
            (b) =>
                b.tagName === 'BUTTON' &&
                b.classList.contains('nodrag') &&
                b.classList.contains('nopan'),
        ),
    );
    assert.equal(bubbles[0].getAttribute('aria-label'), 'Jump to question: Why roots?');
    assert.equal(
        bubbles[1].getAttribute('aria-label'),
        'Jump to reply: ' + 'A long reply. '.repeat(60).slice(0, 79) + '…',
    );
    assert.equal(bubbles[3].getAttribute('aria-label'), 'Jump to reply: Thinking…');
    assert.ok(bubbles[0].querySelector('.question-bubble'));
    assert.equal(bubbles[1].querySelector('.question-bubble'), null);
    assert.match(rows[3].textContent, /Thinking…Replying…/);
    assert.ok(
        bubbles[1].textContent.includes(preview[1].text),
        'the label truncates, the row keeps the preview text',
    );
    for (const [index, id] of [
        [0, 'question'],
        [1, 'answer'],
        [3, 'stream'],
    ]) {
        await act(async () => bubbles[index].click());
        assert.deepEqual(opens.at(-1), ['root', undefined, id]);
    }
    for (const id of ['child', 'sibling']) {
        assert.equal(
            box.querySelector(`[data-source="${id}"]`).closest('[data-message]').dataset.message,
            'answer',
        );
    }
    assert.equal(box.querySelector('[data-source=child]').style.top, `${100 / 3}%`);
    assert.equal(box.querySelector('[data-source=sibling]').style.top, `${200 / 3}%`);
    // A groundwork branch leaves the top of the reply instead of taking a passage slot.
    assert.equal(box.querySelector('[data-source=groundwork]').style.top, '0px');
    assert.equal(box.querySelector('[data-source=missing]').closest('[data-message]'), null);
    assert.equal(box.querySelectorAll('.passage-anchor').length, 0);
    await act(async () => container.querySelector('#open-root').click());
    assert.deepEqual(opens.at(-1), ['root']);
    await act(async () => update({ ...data, active: false, preview: [preview[0]] }));
    assert.match(box.textContent, /Answer: No reply yet\./);
    assert.equal(box.querySelector('.activity-dot').getAttribute('aria-hidden'), 'true');
    assert.equal(box.querySelector('.activity-dot').hasAttribute('role'), false);
});

test('clamped conversation rows show no hover text and keep their accessible name', async (t) => {
    const opens = [];
    const reply = 'A long reply. '.repeat(60);
    const data = {
        conversation: summary('root'),
        sources: [],
        preview: [message('question', 'user', 'Why roots?'), message('answer', 'assistant', reply)],
        open: (...args) => opens.push(args),
        retry: () => {},
        toggle: () => {},
        active: false,
        focused: false,
        focus: false,
        childCount: 0,
        address: '1',
        ink: 0,
        stubs: [],
        folded: false,
    };
    // Every text measures taller than its box, so a truncation tooltip would attach to each row.
    const { container, act, cleanup } = await render(
        h(ReactFlowProvider, null, h(Conversation, { id: 'root', data })),
        (w) => Object.defineProperty(w.HTMLElement.prototype, 'scrollHeight', { get: () => 500 }),
    );
    t.after(cleanup);
    const bubble = container.querySelectorAll('.node-bubble')[1];
    const text = bubble.querySelector('.astryx-text, span') ?? bubble;
    for (const type of ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'focusin'])
        await act(async () => text.dispatchEvent(new MouseEvent(type, { bubbles: true })));
    await act(async () => {
        bubble.focus();
        await new Promise((r) => setTimeout(r, 50));
    });
    assert.equal(document.querySelector('[role=tooltip]'), null);
    assert.equal(document.body.textContent.split(reply.trim()).length - 1, 1);
    assert.equal(bubble.getAttribute('aria-label'), 'Jump to reply: ' + reply.slice(0, 79) + '…');
    await act(async () => bubble.click());
    assert.deepEqual(opens.at(-1), ['root', undefined, 'answer']);
});

test('fold stubs, source reveal and latest-failed-only Retry use distinct controls and preserve focus', async (t) => {
    const opens = [],
        toggles = [],
        retries = [];
    const child = summary('child', 'root');
    const data = {
        conversation: summary('root', 'parent'),
        sources: [child],
        preview: [
            message('q', 'user', 'Full question'),
            message('answer', 'assistant', 'Partial text', 'failed'),
        ],
        open: (...args) => opens.push(args),
        retry: (id) => retries.push(id),
        toggle: (id) => toggles.push(id),
        active: false,
        focused: false,
        focus: false,
        childCount: 1,
        address: '1.2',
        ink: 2,
        stubs: [{ child, beneath: 1, address: '1.2.1', ink: 2 }],
        folded: true,
    };
    let update;
    function Fixture() {
        const [value, set] = useState(data);
        update = set;
        return h(
            ReactFlowProvider,
            null,
            h(
                'div',
                { className: 'overview', onClick: () => opens.push(['bubbled']) },
                h(Conversation, { id: 'root', data: value }),
            ),
        );
    }
    const { container, act, cleanup } = await render(h(Fixture));
    t.after(cleanup);
    const fold = container.querySelector('#fold-root');
    assert.equal(fold.getAttribute('aria-expanded'), 'false');
    assert.equal(fold.getAttribute('aria-label'), 'Expand descendants of root');
    const stub = container.querySelector('.fold-stub button');
    assert.equal(
        stub.getAttribute('aria-label'),
        'Show hidden branch child, 1 more conversation hidden beneath',
    );
    assert.equal(stub.textContent, '1.2.1 · 2 folded');
    assert.equal(stub.querySelector('.node-address').textContent, '1.2.1');
    assert.equal(container.querySelector('#open-root').hasAttribute('aria-current'), false);
    assert.equal(stub.closest('[data-message]').dataset.message, 'answer');
    await act(async () => {
        stub.focus();
        stub.click();
    });
    assert.equal(document.activeElement, fold);
    assert.deepEqual(toggles, ['root']);
    assert.deepEqual(opens, [], 'fold does not open the conversation or bubble');
    await act(async () => fold.click());
    assert.deepEqual(toggles, ['root', 'root']);
    await act(async () => container.querySelector('#reveal-root').click());
    assert.deepEqual(opens[0], [
        'parent',
        { messageId: 'answer', start: 2, end: 7, text: 'Roots' },
    ]);
    // A free branch has no passage: its reveal opens the parent with no source.
    const free = summary('root', 'parent', { start: null, end: null, passage: '' });
    await act(async () => update({ ...data, conversation: free }));
    await act(async () => container.querySelector('#reveal-root').click());
    assert.deepEqual(opens.at(-2), ['parent', undefined]);
    assert.equal(
        container.querySelector('.conversation-box').style.getPropertyValue('--ink'),
        'var(--rabbithole-ink-2)',
    );
    assert.equal(container.querySelector('.node-status').dataset.status, 'failed');
    assert.equal(container.querySelector('.node-status').textContent, 'Reply failed');
    const retry = container.querySelector('.node-retry');
    assert.ok(retry);
    await act(async () => {
        retry.focus();
        retry.click();
    });
    assert.equal(document.activeElement.id, 'open-root');
    assert.deepEqual(retries, ['root']);
    for (const changes of [
        { active: true },
        {
            preview: [
                message('q', 'user', 'Stop'),
                message('answer', 'assistant', 'Partial', 'interrupted'),
            ],
        },
        {
            preview: [
                ...data.preview,
                message('q2', 'user', 'Continue'),
                message('ok', 'assistant', 'Recovered'),
            ],
        },
        { preview: [message('answer', 'assistant', 'Failed without a question', 'failed')] },
    ]) {
        await act(async () => update({ ...data, ...changes }));
        assert.equal(container.querySelector('.node-retry'), null);
    }
    await act(async () => update({ ...data, folded: false, stubs: [] }));
    assert.equal(fold.getAttribute('aria-expanded'), 'true');
    assert.equal(container.querySelector('.fold-stub'), null);
});

test('returning from chat focuses the originating control; fold remount never steals existing map focus', async (t) => {
    let store, update;
    const frames = new Map();
    let serial = 0;
    const data = {
        conversation: summary('root'),
        sources: [],
        preview: [],
        open: () => {},
        retry: () => {},
        toggle: () => {},
        active: false,
        focused: false,
        focus: false,
        focusControl: 'fold-root',
        childCount: 1,
        address: '1',
        ink: 0,
        stubs: [],
        folded: false,
    };
    function State() {
        store = useStoreApi();
        const [value, set] = useState(data);
        update = set;
        return h(
            'div',
            { className: 'overview' },
            h('button', { id: 'map-control' }, 'Map control'),
            h(Conversation, { data: value }),
        );
    }
    const { container, act, cleanup } = await render(h(ReactFlowProvider, null, h(State)));
    t.after(async () => {
        t.mock.restoreAll();
        await cleanup();
    });
    t.mock.method(globalThis, 'requestAnimationFrame', (fn) => {
        frames.set(++serial, fn);
        return serial;
    });
    t.mock.method(globalThis, 'cancelAnimationFrame', (id) => frames.delete(id));
    // React Flow normally sets this after browser measurements. Only the readiness signal is supplied here.
    await act(async () => {
        store.setState({ nodesInitialized: true });
        update({ ...data, focus: true });
    });
    await act(async () => {
        for (const [id, fn] of frames) {
            frames.delete(id);
            fn();
        }
    });
    assert.equal(document.activeElement.id, 'fold-root');
    container.querySelector('#map-control').focus();
    await act(async () => update({ ...data, focus: true, focusControl: 'open-root' }));
    await act(async () => {
        for (const [id, fn] of frames) {
            frames.delete(id);
            fn();
        }
    });
    assert.equal(document.activeElement.id, 'map-control');
});

test('the + asks on the side only from a node with a completed reply, and Escape returns to it', async (t) => {
    const { button, inputValue } = await import('../support/ui.mjs');
    const asks = [];
    let finish;
    const data = {
        conversation: summary('root'),
        sources: [],
        preview: [message('q', 'user', 'Why roots?'), message('a', 'assistant', '', 'streaming')],
        open: () => {},
        retry: () => {},
        ask: (...args) => (asks.push(args), new Promise((resolve) => (finish = resolve))),
        toggle: () => {},
        active: true,
        focused: false,
        focus: false,
        childCount: 0,
        address: '1.2',
        ink: 2,
        stubs: [],
        folded: false,
    };
    let update;
    function Fixture() {
        const [value, set] = useState(data);
        update = set;
        return h(ReactFlowProvider, null, h(Conversation, { id: 'root', data: value }));
    }
    const { container, act, cleanup } = await render(h(Fixture));
    t.after(cleanup);
    const label = 'Ask on the side from 1.2 · root';
    assert.equal(button(container, label), undefined, 'no + while the first reply arrives');
    await act(async () =>
        update({ ...data, preview: [data.preview[0], message('a', 'assistant', 'x', 'failed')] }),
    );
    assert.equal(button(container, label), undefined, 'no + after a failed first reply');
    await act(async () =>
        update({ ...data, preview: [data.preview[0], message('a', 'assistant', 'Thin.')] }),
    );
    const plus = button(container, label);
    assert.equal(plus.tabIndex, 0, 'reachable by keyboard');
    assert.equal(plus.getAttribute('aria-expanded'), 'false');
    await act(async () => plus.click());
    const box = container.querySelector('[role=dialog]');
    assert.equal(box.getAttribute('aria-label'), 'Ask on the side from 1.2');
    assert.equal(plus.getAttribute('aria-expanded'), 'true');
    assert.equal(box.querySelector('.branch-passage'), null, 'no passage quote');
    assert.equal(button(box, 'Explain briefly'), undefined);
    const input = box.querySelector('input');
    await act(async () =>
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    assert.equal(container.querySelector('[role=dialog]'), null);
    await act(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    assert.equal(document.activeElement, plus, 'Escape returns focus to the +');
    await act(async () => plus.click());
    await act(async () => inputValue(container.querySelector('[role=dialog] input'), 'Lichens?'));
    await act(async () => button(container, 'Create focused chat').click());
    assert.deepEqual(
        asks.map((a) => a.slice(0, 2)),
        [['root', 'Lichens?']],
    );
    // A refused branch keeps the box and its question.
    await act(async () => finish());
    assert.equal(container.querySelector('[role=dialog] input').value, 'Lichens?');
    await act(async () => button(container, 'Create focused chat').click());
    await act(async () => asks[1][2]());
    assert.equal(container.querySelector('[role=dialog]'), null, 'a saved child closes the box');
});
