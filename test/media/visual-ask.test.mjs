import '../support/tsx.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { render } from '../support/render.mjs';
import { ui, button, inputValue } from '../support/ui.mjs';
import { conversation, json, mount, summary } from '../support/chat-hooks-kit.mjs';
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
                    artifact: { ...visual(status), hasPrevious: true },
                    onPart,
                    onRetry: async () => {},
                    onRegenerate: async (instruction) =>
                        void calls.push(['regenerate', instruction]),
                    onPrevious: async () => void calls.push(['previous']),
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
    // assert.ok: a failure reporting two elements would print all of jsdom.
    const asked = () => {
        const [kind, id, part, origin] = calls.shift();
        assert.deepEqual([kind, id, part], ['ask', 'v-ready', source]);
        assert.ok(origin === ask, 'Esc returns focus to the Ask button');
    };
    asked();

    const menuItem = async (label) => {
        await act(async () => trigger.click());
        await act(async () => dom.frames());
        const items = [...document.querySelectorAll('[role=menuitem]')];
        assert.deepEqual(
            items.map((e) => e.textContent.trim()),
            ['Try a new version…', 'Previous version', 'Enlarge'],
        );
        await act(async () => items.find((e) => e.textContent.trim() === label).click());
    };
    const key = (target, key) =>
        target.dispatchEvent(
            new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
        );
    // The box takes focus; Escape closes it without a call, Enter sends the trimmed instruction.
    await menuItem('Try a new version…');
    let input = figure.querySelector('.new-version input');
    assert.ok(document.activeElement === input, 'the instruction field takes focus');
    await act(async () => key(input, 'Escape'));
    assert.equal(figure.querySelector('.new-version'), null);
    await menuItem('Try a new version…');
    input = figure.querySelector('.new-version input');
    await act(async () => inputValue(input, 'x'.repeat(501)));
    await act(async () => key(input, 'Enter'));
    assert.equal(calls.length, 0, 'over 500 characters is not sent');
    await act(async () => inputValue(input, '  Label the rounds  '));
    await act(async () => key(input, 'Enter'));
    assert.deepEqual(calls.shift(), ['regenerate', 'Label the rounds']);
    assert.equal(figure.querySelector('.new-version'), null, 'the box closes once sent');
    await menuItem('Try a new version…');
    await act(async () => button(figure, 'Make new version').click());
    assert.deepEqual(calls.shift(), ['regenerate', ''], 'empty asks for a different approach');
    await menuItem('Previous version');
    assert.deepEqual(calls.shift(), ['previous']);
    await menuItem('Enlarge');
    const viewer = document.querySelector('dialog.visual-viewer, .visual-viewer');
    assert.ok(viewer, 'enlarged view opens');
    await act(async () => button(viewer, ASK).click());
    asked();
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

const sized = (frame) => {
    for (const [key, value] of Object.entries({ clientWidth: 600, clientHeight: 400 }))
        Object.defineProperty(frame, key, { value });
};
const sender =
    (act, frame) =>
    (data, source = frame.contentWindow) =>
        act(async () => window.dispatchEvent(new window.MessageEvent('message', { source, data })));

test('hovering a visual part draws its rectangle and name, and one click asks about it with its trail and step', async (t) => {
    const calls = [];
    const { container, act, cleanup } = await render(
        h(VisualFrame, {
            artifact: visual('ready'),
            onPart: (artifact, part, origin, box, picker) =>
                calls.push([artifact.id, part, origin.current, box, picker]),
        }),
        ui,
    );
    t.after(cleanup);
    const figure = container.querySelector('figure'),
        frame = figure.querySelector('iframe'),
        receive = sender(act, frame);
    sized(frame);
    const plant = { name: 'Nuclear plant', x: 0, y: 0, width: 600, height: 400 },
        rods = { name: 'Control rods', x: 10, y: 20, width: 100, height: 40 };
    await receive({ type: 'height', height: 400 });
    await receive({ type: 'part', parts: [plant, rods] });
    const box = () => figure.querySelector('.visual-part');
    assert.equal(box().textContent, 'Control rods');
    assert.equal(box().getAttribute('aria-hidden'), 'true');
    assert.deepEqual(
        ['left', 'top', 'width', 'height'].map((k) => box().style[k]),
        ['10px', '20px', '100px', '40px'],
    );
    await receive({ type: 'part', parts: [plant] });
    assert.equal(box().textContent, 'Nuclear plant', 'the component area outlines the component');
    await receive({ type: 'leave' });
    assert.equal(box(), null);
    await receive({ type: 'part', parts: [{ ...rods, x: 590 }] });
    await receive({ type: 'part', parts: [rods] }, window);
    assert.equal(box(), null, 'out-of-frame or foreign part messages are ignored');
    await receive({ type: 'pick', parts: [plant, rods], step: 2 });
    assert.deepEqual(calls, [
        [
            'v-ready',
            {
                label: 'Control rods',
                explanation: 'Two winners advance to the final.',
                trail: ['Nuclear plant', 'Control rods'],
                step: 2,
            },
            figure,
            { x: 10, y: 20, width: 100, height: 40 },
            calls[0][4],
        ],
    ]);
    // The picked part's box picks from the keyboard too: focusing a part outlines it.
    const picker = calls[0][4];
    picker.listen(() => {});
    await act(async () => picker.show([]));
    await receive({
        type: 'tree',
        parts: [{ ...plant, parts: [{ ...rods, parts: [] }] }],
        step: 2,
    });
    await act(async () => picker.show([0, 0]));
    assert.equal(box().textContent, 'Control rods');
});

test('a branched part keeps a thin rectangle in its family ink, and returning to it opens the stored step and brings it into view', async (t) => {
    const rods = ['Nuclear plant', 'Reactor', 'Control rods'],
        part = { label: 'Control rods', explanation: 'How a plant makes electricity.' };
    const explored = [
        { child: 'c1', address: '1.1', ink: 2, ...part, trail: rods, step: 2 },
        { child: 'c2', address: '1.2', ink: 3, label: 'Tournament rounds', explanation: 'x' },
        { child: 'c3', address: '1.3', ink: 3, ...part, trail: ['Turbine'], step: null },
    ];
    const reveal = { messageId: 'reply', artifactId: 'v-ready', text: 'x', ...part, trail: rods };
    const { container, act, cleanup } = await render(
        h(VisualFrame, {
            artifact: visual('ready'),
            explored,
            reveal: { ...reveal, step: 2 },
            onOpenChild: () => {},
        }),
        ui,
    );
    t.after(cleanup);
    const figure = container.querySelector('figure'),
        frame = figure.querySelector('iframe'),
        receive = sender(act, frame),
        posted = [],
        scrolled = [];
    sized(frame);
    frame.contentWindow.postMessage = (data) => posted.push(data);
    window.Element.prototype.scrollIntoView = function () {
        scrolled.push(this.className);
    };
    await act(async () => frame.dispatchEvent(new Event('load')));
    assert.deepEqual(
        posted.find((m) => m.type === 'marks'),
        {
            type: 'marks',
            trails: [rods, ['Turbine']],
        },
    );
    assert.deepEqual(
        posted.find((m) => m.type === 'step'),
        { type: 'step', step: 2 },
    );
    const box = { x: 10, y: 20, width: 100, height: 40 };
    await receive({ type: 'marks', marks: [{ trail: rods, ...box }] });
    const marks = () => [...figure.querySelectorAll('.visual-mark')];
    assert.equal(marks().length, 1);
    const [mark] = marks();
    assert.equal(mark.getAttribute('aria-hidden'), 'true');
    assert.equal(mark.textContent, '', 'never filled, no label');
    assert.equal(mark.style.getPropertyValue('--ink'), 'var(--rabbithole-ink-2)');
    assert.deepEqual(
        ['left', 'top', 'width', 'height'].map((k) => mark.style[k]),
        ['7px', '17px', '106px', '46px'],
        'drawn just outside the part, never over it',
    );
    assert.ok(scrolled.includes('visual-mark'), 'the returned-to part comes into view');
    scrolled.length = 0;
    await receive({ type: 'marks', marks: [{ trail: rods, ...box, y: 60 }] });
    assert.equal(marks()[0].style.top, '57px', 'a later step moves the rectangle with its part');
    assert.ok(!scrolled.includes('visual-mark'), 'it comes into view once per return');
    await receive({ type: 'marks', marks: [{ trail: ['Boiler'], ...box }] });
    assert.equal(marks().length, 0, 'a trail no branch asked about is never marked');
    await receive({ type: 'marks', marks: [{ trail: rods, ...box, x: 590 }] });
    assert.equal(marks().length, 0, 'out-of-frame marks are ignored');
});

test("the Ask button's box picks parts from the keyboard: the frame sends its part tree, and the focused part shows its rectangle and name", async (t) => {
    let picker;
    const { container, act, cleanup } = await render(
        h(VisualFrame, {
            artifact: visual('ready'),
            onPart: (...args) => (picker = args[4]),
        }),
        ui,
    );
    t.after(cleanup);
    const figure = container.querySelector('figure'),
        frame = figure.querySelector('iframe'),
        receive = sender(act, frame),
        posted = [];
    sized(frame);
    frame.contentWindow.postMessage = (data) => posted.push(data);
    await act(async () => frame.dispatchEvent(new Event('load')));
    await receive({ type: 'height', height: 400 });
    await act(async () => button(figure, ASK).click());
    const trees = [];
    picker.listen((parts, step) => trees.push([parts.map((p) => p.name), step]));
    await act(async () => picker.show([]));
    assert.deepEqual(posted.at(-1), { type: 'tree', watch: true });
    const box = { x: 10, y: 20, width: 100, height: 40 },
        node = (name, parts = [], b = box) => ({ name, ...b, parts });
    const tree = [node('Plant', [node('Reactor'), node('Turbine', [], { ...box, y: 200 })])];
    await receive({ type: 'tree', parts: tree, step: 1 });
    await receive({ type: 'tree', parts: [node('Bad', [], { ...box, x: 590 })], step: 1 });
    assert.deepEqual(trees, [[['Plant'], 1]], 'only valid trees reach the ask box');
    const rect = () => figure.querySelector('.visual-part');
    assert.equal(rect(), null, 'nothing focused yet');
    await act(async () => picker.show([0, 1]));
    assert.equal(rect().textContent, 'Turbine');
    assert.equal(rect().style.top, '200px');
    await receive({
        type: 'tree',
        parts: [node('Plant', [node('Reactor'), node('Turbine')])],
        step: 1,
    });
    assert.equal(rect().style.top, '20px', 'the rectangle follows the part');
    await act(async () => picker.show(undefined));
    assert.equal(rect(), null);
    assert.deepEqual(posted.at(-1), { type: 'tree', watch: false });
});

test('parts of a still-drawing visual neither outline nor pick', async (t) => {
    const calls = [];
    const { container, act, cleanup } = await render(
        h(VisualFrame, {
            artifact: { ...visual('pending'), source: '<svg></svg>' },
            onPart: (...args) => calls.push(args),
        }),
        ui,
    );
    t.after(cleanup);
    const frame = container.querySelector('iframe'),
        receive = sender(act, frame);
    sized(frame);
    const parts = [{ name: 'Reactor', x: 0, y: 0, width: 10, height: 10 }];
    await receive({ type: 'part', parts });
    await receive({ type: 'pick', parts, step: null });
    assert.equal(container.querySelector('.visual-part'), null);
    assert.deepEqual(calls, []);
});

test('a picked part opens the ask box floating over it, and choosing an earlier trail entry widens the source', async (t) => {
    const plant = {
        ...visual('ready'),
        id: 'plant',
        conversation: 'a',
        title: 'Nuclear plant',
        description: 'How a plant makes electricity.',
    };
    const page = await mount(t, ({ path }) =>
        path === '/api/trees/a'
            ? json({
                  ...conversation('a'),
                  messages: [
                      { id: 'reply', role: 'assistant', text: 'Heat.', status: 'completed' },
                  ],
                  artifacts: [plant],
              })
            : undefined,
    );
    await page.act(async () => page.current.trees.openConversation('a'));
    const reply = document.body.appendChild(document.createElement('div'));
    reply.dataset.chatMessage = 'reply';
    const passage = reply.appendChild(document.createElement('div'));
    passage.className = 'passage';
    passage.getBoundingClientRect = () => ({ top: 100, left: 0, bottom: 200, right: 600 });
    const part = {
        label: 'Control rods',
        explanation: plant.description,
        trail: ['Nuclear plant', 'Reactor', 'Control rods'],
        step: 2,
    };
    await page.act(async () =>
        page.current.branch.openVisualPart(
            plant,
            part,
            { current: passage },
            {
                x: 10,
                y: 150,
                width: 100,
                height: 40,
            },
        ),
    );
    const source = {
        messageId: 'reply',
        artifactId: 'plant',
        ...part,
        text: 'Visual: Nuclear plant\nHow a plant makes electricity.\nPart: Nuclear plant › Reactor › Control rods',
    };
    assert.deepEqual(page.current.branch.branch.anchor, {
        ...source,
        at: { x: 0, y: 50, below: 90 },
    });
    await page.act(async () => page.current.branch.widenPart(2));
    assert.deepEqual(page.current.branch.branch.anchor, {
        ...source,
        label: 'Reactor',
        trail: ['Nuclear plant', 'Reactor'],
        text: 'Visual: Nuclear plant\nHow a plant makes electricity.\nPart: Nuclear plant › Reactor',
        at: { x: 0, y: 50, below: 90 },
    });
    assert.deepEqual(
        page.calls.filter((c) => c.path.endsWith('/prepare')).at(-1).body.trail,
        ['Nuclear plant', 'Reactor'],
        'branch preparation follows the widened part',
    );
});

test("a part picked from the keyboard in the Ask button's box becomes the source with its trail and step", async (t) => {
    const plant = {
        ...visual('ready'),
        id: 'plant',
        conversation: 'a',
        title: 'Nuclear plant',
        description: 'How a plant makes electricity.',
    };
    const page = await mount(t, ({ path }) =>
        path === '/api/trees/a'
            ? json({
                  ...conversation('a'),
                  messages: [
                      { id: 'reply', role: 'assistant', text: 'Heat.', status: 'completed' },
                  ],
                  artifacts: [plant],
              })
            : undefined,
    );
    await page.act(async () => page.current.trees.openConversation('a'));
    const picker = { show: () => {}, listen: () => {} },
        whole = { label: plant.title, explanation: plant.description };
    await page.act(async () =>
        page.current.branch.openVisualPart(plant, whole, { current: null }, undefined, picker),
    );
    assert.equal(page.current.branch.branch.picker, picker, 'the ask box gets the picker');
    await page.act(async () => page.current.branch.pickPart(['Nuclear plant', 'Reactor'], 1));
    assert.deepEqual(page.current.branch.branch.anchor, {
        messageId: 'reply',
        artifactId: 'plant',
        label: 'Reactor',
        explanation: plant.description,
        trail: ['Nuclear plant', 'Reactor'],
        step: 1,
        text: 'Visual: Nuclear plant\nHow a plant makes electricity.\nPart: Nuclear plant › Reactor',
    });
    assert.deepEqual(
        page.calls.filter((c) => c.path.endsWith('/prepare')).at(-1).body.trail,
        ['Nuclear plant', 'Reactor'],
        'branch preparation follows the pick',
    );
});

test("a visual's branches carry their part's trail and step to the visual", async (t) => {
    const trail = ['Nuclear plant', 'Reactor'];
    const page = await mount(t, ({ path }, { state }) => {
        if (path !== '/api/state') return;
        state.trees = [
            summary('a'),
            {
                ...summary('c', 'a'),
                messageId: 'reply',
                artifactId: 'plant',
                label: 'Reactor',
                explanation: 'How a plant makes electricity.',
                trail,
                step: 1,
            },
        ];
    });
    await page.act(async () => page.current.trees.openConversation('a'));
    assert.deepEqual(
        page.current.branch.visualBranches.plant.map((b) => [b.child, b.trail, b.step]),
        [['c', trail, 1]],
    );
});
