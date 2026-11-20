import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { render } from '../support/render.mjs';
import { ui, button, inputValue } from '../support/ui.mjs';
const { default: BranchForm } = await import('../../src/chat/BranchForm.tsx');
const anchor = { messageId: 'reply', start: 2, end: 7, text: 'mutex', suggestion: true };
const key = (node, key) =>
    node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

test('branch form names its passage, controls submit/locking, and distinguishes Escape and outside clicks', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    let update, dom;
    const sent = [],
        closed = [];
    function Fixture() {
        const [value, set] = useState({ question: '', branching: false, active: false });
        update = set;
        return h(BranchForm, {
            ...value,
            branch: { parent: 'root', anchor, question: value.question },
            submit: (e) => {
                e.preventDefault();
                sent.push(value.question);
            },
            close: (refocus) => closed.push(refocus),
            setQuestion: (question) => set((v) => ({ ...v, question })),
        });
    }
    const { container, act, cleanup } = await render(h(Fixture), (w) => {
        dom = ui(w);
    });
    t.after(cleanup);
    await act(async () => dom.frames());
    const input = container.querySelector('input');
    assert.equal(document.activeElement, input);
    assert.ok(input.labels[0], 'the field is labelled');
    assert.equal(
        document.getElementById(input.getAttribute('aria-describedby')).textContent,
        'mutex',
    );
    assert.equal(button(container, 'Create focused chat').disabled, true);
    assert.equal(button(container, 'Cancel branch'), undefined);
    assert.equal(
        container.querySelector('[aria-label^="Corrections"]'),
        null,
        'no correction menu',
    );
    await act(async () => inputValue(input, '  '));
    assert.equal(button(container, 'Create focused chat').disabled, true);
    await act(async () => inputValue(input, 'Why?'));
    await act(async () => button(container, 'Create focused chat').click());
    assert.deepEqual(sent, ['Why?']);
    await act(async () => key(input, 'Escape'));
    assert.deepEqual(closed, [true]);
    await act(async () => input.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    assert.deepEqual(closed, [true]);
    await act(async () => document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })));
    assert.deepEqual(closed, [true, false]);
    await act(async () => update((v) => ({ ...v, branching: true })));
    assert.equal(input.getAttribute('aria-disabled'), 'true');
    assert.equal(button(container, 'Preparing context…').disabled, true);
    await act(async () => {
        key(input, 'Escape');
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    assert.deepEqual(closed, [true, false]);
    await act(async () => update((v) => ({ ...v, branching: false, active: true })));
    assert.equal(button(container, 'Create focused chat').disabled, true);
    assert.equal(input.value, 'Why?');
});

test('an unexplored suggestion shows its brief explanation above the question box, with loading, error and retry', async (t) => {
    const asked = [],
        replies = [];
    const explain = (a) => {
        asked.push(a);
        return new Promise((resolve, reject) => replies.push({ resolve, reject }));
    };
    const form = (props) =>
        h(BranchForm, {
            branch: { parent: 'root', anchor, question: '' },
            branching: false,
            active: false,
            submit: () => {},
            close: () => {},
            setQuestion: () => {},
            explain,
            ...props,
        });
    const { container, act, cleanup } = await render(form(), (w) => ui(w));
    t.after(cleanup);
    const status = () => container.querySelector('[role="status"]')?.textContent;
    assert.equal(status(), 'Writing a brief explanation…', 'loads without pressing anything');
    assert.equal(asked.length, 1);
    assert.equal(asked[0].text, 'mutex');
    await act(async () => replies[0].reject(new Error('Brief explanation failed. Retry.')));
    assert.match(container.querySelector('[role="alert"]').textContent, /failed/);
    await act(async () => button(container, 'Retry').click());
    assert.equal(asked.length, 2);
    assert.equal(status(), 'Writing a brief explanation…');
    await act(async () => replies[1].resolve('A **lock** one thread holds at *a time*.'));
    const brief = container.querySelector('.branch-brief');
    assert.equal(brief.textContent, 'A lock one thread holds at a time.');
    assert.equal(
        brief.querySelector('strong').textContent,
        'lock',
        'markdown renders as in the popup',
    );
    assert.equal(brief.querySelector('em').textContent, 'a time');
    assert.ok(
        brief.compareDocumentPosition(container.querySelector('input')) &
            Node.DOCUMENT_POSITION_FOLLOWING,
        'above the question box',
    );
});

test('a selected passage asks for a brief explanation only on Explain briefly, and shows a saved one at once', async (t) => {
    const asked = [];
    let resolve;
    const props = {
        branch: { parent: 'root', anchor: { ...anchor, suggestion: undefined }, question: '' },
        branching: false,
        active: false,
        submit: () => assert.fail('Explain briefly must not submit'),
        close: () => {},
        setQuestion: () => {},
        explain: (a) => (asked.push(a), new Promise((r) => (resolve = r))),
    };
    const { container, act, cleanup } = await render(h(BranchForm, props), (w) => ui(w));
    t.after(cleanup);
    assert.equal(asked.length, 0, 'selecting makes no call');
    assert.equal(container.querySelector('.branch-brief'), null);
    await act(async () => button(container, 'Explain briefly').click());
    assert.equal(asked.length, 1);
    assert.equal(document.activeElement, container.querySelector('input'));
    assert.equal(
        container.querySelector('[role="status"]').textContent,
        'Writing a brief explanation…',
    );
    await act(async () => resolve('Taken one at a time.'));
    assert.equal(container.querySelector('.branch-brief').textContent, 'Taken one at a time.');
});

test('reopening the textbox for a selected passage shows its saved explanation with no call', async (t) => {
    const asked = [];
    const props = {
        branch: { parent: 'root', anchor: { ...anchor, suggestion: undefined }, question: '' },
        branching: false,
        active: false,
        submit: () => {},
        close: () => {},
        setQuestion: () => {},
        explain: async (a) => (asked.push(a), ''),
    };
    const reopened = await render(h(BranchForm, { ...props, saved: 'Taken one at a time.' }), (w) =>
        ui(w),
    );
    t.after(reopened.cleanup);
    assert.equal(
        reopened.container.querySelector('.branch-brief').textContent,
        'Taken one at a time.',
    );
    assert.equal(button(reopened.container, 'Explain briefly'), undefined);
    assert.equal(asked.length, 0, 'a saved explanation needs no call');
});

test('a picked visual part shows its trail, and choosing an earlier entry widens the question', async (t) => {
    const widened = [];
    const part = {
        messageId: 'reply',
        artifactId: 'plant',
        label: 'Control rods',
        explanation: 'How a plant makes electricity.',
        trail: ['Nuclear plant', 'Reactor', 'Control rods'],
        step: null,
        text: 'Visual: Nuclear plant',
    };
    const { container, act, cleanup } = await render(
        h(BranchForm, {
            branch: { parent: 'root', anchor: part, question: '' },
            branching: false,
            active: false,
            submit: () => {},
            close: () => {},
            setQuestion: () => {},
            explain: async () => '',
            widen: (depth) => widened.push(depth),
        }),
        (w) => ui(w),
    );
    t.after(cleanup);
    const trail = container.querySelector('nav[aria-label="Part of the visual"]');
    assert.deepEqual(
        [...trail.querySelectorAll('button, [aria-current]')].map((e) => e.textContent),
        ['Nuclear plant', 'Reactor', 'Control rods'],
    );
    assert.equal(trail.querySelector('[aria-current]').textContent, 'Control rods');
    assert.equal(button(trail, 'Control rods'), undefined, 'the current part is not a button');
    await act(async () => button(trail, 'Reactor').click());
    assert.deepEqual(widened, [2]);
    assert.equal(container.querySelector('input').placeholder, 'Ask about Control rods');
    assert.equal(
        button(container, 'Explain briefly'),
        undefined,
        'no brief explanation for a part',
    );
});

test("the Ask button's box picks parts from the keyboard: arrows move at a level, Enter narrows, and the trail widens", async (t) => {
    const shown = [];
    let send;
    const picker = { show: (path) => shown.push(path), listen: (set) => (send = set) };
    const whole = {
        messageId: 'reply',
        artifactId: 'plant',
        label: 'Nuclear plant',
        explanation: 'How a plant makes electricity.',
        text: 'Visual: Nuclear plant',
    };
    // Stands in for the chat's branch state: a pick or a widened trail becomes the source.
    function Fixture() {
        const [anchor, setAnchor] = useState(whole);
        const choose = (trail, step) =>
            setAnchor((a) => ({ ...a, label: trail.at(-1), trail, step: step ?? a.step }));
        return h(BranchForm, {
            branch: { parent: 'root', anchor, question: '', picker },
            branching: false,
            active: false,
            submit: () => {},
            close: () => {},
            setQuestion: () => {},
            pick: choose,
            widen: (depth) => choose(anchor.trail.slice(0, depth)),
        });
    }
    const { container, act, cleanup } = await render(h(Fixture), (w) => ui(w));
    const box = { x: 0, y: 0, width: 10, height: 10 },
        node = (name, parts = []) => ({ name, ...box, parts });
    const parts = () => container.querySelector('[role=listbox]');
    const options = () =>
        [...parts().querySelectorAll('[role=option]')].map((o) => [
            o.getAttribute('aria-label') ?? o.textContent,
            o.getAttribute('aria-selected'),
        ]);
    const press = (k) => act(async () => key(parts(), k));
    assert.deepEqual(shown, [[]], 'picking starts with nothing focused');
    assert.equal(parts(), null, 'no list before the part tree');
    await act(async () =>
        send([node('Plant', [node('Reactor', [node('Rods')]), node('Pump'), node('Pump')])], 2),
    );
    assert.equal(parts().getAttribute('aria-label'), 'Parts of the visual');
    assert.equal(parts().tabIndex, 0, 'the list takes focus');
    assert.deepEqual(options(), [['Plant', 'false']]);
    await press('ArrowDown');
    assert.deepEqual(options(), [['Plant', 'true']]);
    assert.equal(parts().getAttribute('aria-activedescendant'), 'branch-part-0');
    assert.equal(container.querySelector('input').placeholder, 'Ask about Plant');
    assert.deepEqual(shown.at(-1), [0], 'the rectangle follows the focused part');
    await press('Enter');
    assert.deepEqual(options(), [
        ['Reactor, in Plant', 'true'],
        ['Pump, in Plant', 'false'],
        ['Pump, in Plant', 'false'],
    ]);
    assert.deepEqual(shown.at(-1), [0, 0]);
    await press('ArrowDown');
    await press('ArrowDown');
    await press('ArrowDown');
    assert.deepEqual(shown.at(-1), [0, 2], 'parts of the same name stay apart, and the end holds');
    await press('ArrowUp');
    assert.deepEqual(shown.at(-1), [0, 1]);
    await press('Enter');
    assert.equal(
        document.activeElement,
        container.querySelector('input'),
        'a leaf goes to the question',
    );
    const trail = container.querySelector('nav[aria-label="Part of the visual"]');
    await act(async () => button(trail, 'Plant').click());
    assert.deepEqual(options(), [['Plant', 'true']], 'the trail widens the level');
    cleanup();
    assert.equal(shown.at(-1), undefined, 'closing the box ends picking');
});
