import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { drawSketch } from '../../src/sketch/sketch.ts';
import { renderMarkdown } from '../../src/markdown/markdown.ts';
import Sketch from '../../src/markdown/Sketch.tsx';
import { previewText } from '../../src/markdown/markdownText.ts';
import ChatThread from '../../src/chat/ChatThread.tsx';
import { render } from '../support/render.mjs';
import { threadProps } from '../support/thread-props.mjs';
import { ui } from '../support/ui.mjs';

const dark = {
    ground: '#101010',
    ink: '#eeeeee',
    muted: '#999999',
    seam: '#666666',
    focus: '#ffffff',
};
const light = {
    ground: '#fafafa',
    ink: '#111111',
    muted: '#555555',
    seam: '#888888',
    focus: '#000000',
};
const freezing = [
    'title: Freezing below 0 °C',
    "Water freezes -> Water's entropy falls",
    'Water freezes -> Heat flows out',
    "Heat flows out -> Surroundings' entropy rises more",
    "Water's entropy falls -> *Total rises*",
    "Surroundings' entropy rises more -> *Total rises*",
].join('\n');
const speeds = [
    'title: Approximate eastward speed of the ground',
    'Equator: 465 m/s',
    '*60° latitude*: 233 m/s',
    'North Pole: 0 m/s',
].join('\n');

test('a flow sketch draws one item per step, with its title, focus and arrow labels', () => {
    const sketch = drawSketch('flow', freezing, dark);
    assert.equal(sketch.title, 'Freezing below 0 °C');
    assert.deepEqual(
        sketch.items.map((i) => i.text),
        [
            "Water freezes, leads to Water's entropy falls and Heat flows out",
            "Water's entropy falls, leads to Total rises",
            "Heat flows out, leads to Surroundings' entropy rises more",
            "Surroundings' entropy rises more, leads to Total rises",
            'Total rises, focus',
        ],
    );
    const labelled = drawSketch('flow', 'Rock -> Loose sand: breaks and moves', dark);
    assert.equal(labelled.title, '');
    assert.deepEqual(
        labelled.items.map((i) => i.text),
        ['Rock, leads to Loose sand: breaks and moves', 'Loose sand'],
    );
    assert.match(labelled.markup, />breaks and moves</);
});

test('a flow sketch fits its box at scale 1: across while each rank has room, down below that', () => {
    const across = (body, width) => {
        const svg = new JSDOM(
            drawSketch('flow', body, dark, width).markup,
        ).window.document.querySelector('svg');
        if (!svg.classList.contains('sketch-down')) {
            assert.equal(svg.getAttribute('viewBox').split(' ')[2], String(width));
            return true;
        }
        assert.ok(Number(svg.getAttribute('width')) <= width, `${width}px box`);
        return false;
    };
    const straight =
        'Rock -> Loose sand: breaks and moves\nLoose sand -> Buried layers -> *Sandstone*';
    // A fork needs 160px a rank, a straight flow 120px.
    assert.deepEqual(
        [640, 639, 480, 224].map((w) => across(freezing, w)),
        [true, false, false, false],
    );
    assert.deepEqual(
        [640, 480, 479, 300].map((w) => across(straight, w)),
        [true, true, false, false],
    );
    // A label too long for its line wraps, inside a word if it must; none of its text is lost.
    const long = drawSketch('flow', 'Start -> Supercalifragilisticexpialidocious', dark, 120);
    const lines = [...new JSDOM(long.markup).window.document.querySelectorAll('text')].map(
        (t) => t.textContent,
    );
    assert.ok(lines.length > 2);
    assert.equal(lines.join(''), 'StartSupercalifragilisticexpialidocious');
});

test('a sketch draws at the width of the box it sits in', async (t) => {
    const { container, cleanup } = await render(
        h(Sketch, { kind: 'flow', body: freezing, fence: 'closed', live: false }),
        (window) => {
            ui(window);
            Object.defineProperty(window.HTMLElement.prototype, 'clientWidth', {
                get() {
                    return this.matches('figure.sketch') ? 300 : 0;
                },
            });
        },
    );
    t.after(cleanup);
    assert.ok(container.querySelector('figure.sketch svg.sketch-down'));
});

test('a bars sketch keeps each unit, marks the focus and draws a zero', () => {
    const sketch = drawSketch('bars', speeds, dark);
    assert.deepEqual(
        sketch.items.map((i) => [i.label, i.focus, i.text]),
        [
            ['Equator', false, 'Equator, 465 m/s'],
            ['60° latitude', true, '60° latitude, 233 m/s, focus'],
            ['North Pole', false, 'North Pole, 0 m/s'],
        ],
    );
    const bars = page(`\`\`\`sketch bars\n${speeds}\n\`\`\``);
    const zero = [...bars.querySelectorAll('dd')].find((row) => row.textContent === '0 m/s');
    assert.equal(zero.style.getPropertyValue('--v'), '0');
    assert.ok(zero.querySelector('s'));
});

test('a sketch it cannot draw names the reason', () => {
    for (const [kind, body, reason] of [
        ['venn-ish', 'A -> B', /unknown kind "venn-ish"/],
        ['constructor', 'A -> B', /unknown kind/],
        ['flow', 'title: Only a title\n\n', /empty body/],
        ['flow', 'A -> B\nJust words', /line 2 "Just words"/],
        ['bars', 'Pressure push: strong', /line 1 "Pressure push: strong" has no number/],
        ['bars', 'Loss: -3 kg', /below zero/],
        ['bars', 'Mass: 1.2.3 kg', /has no number/],
        ['bars', 'Mass: 1e999 kg', /out of range/],
        ['bars', 'Row: 1\n'.repeat(9), /more than eight items/],
    ])
        assert.match(drawSketch(kind, body, dark).error, reason);
});

test('a sketch takes the palette it is given, light or dark', () => {
    for (const kind of ['flow', 'bars']) {
        const body = kind === 'flow' ? freezing : speeds,
            [a, b] = [drawSketch(kind, body, dark).markup, drawSketch(kind, body, light).markup];
        assert.ok(a.includes(dark.seam) && a.includes(dark.focus) && !a.includes(light.seam));
        assert.ok(b.includes(light.seam) && b.includes(light.focus) && !b.includes(dark.seam));
    }
});

test('labels the tutor writes are escaped, never markup', () => {
    const sketch = drawSketch('flow', '<img src=x onerror=alert(1)> -> B', dark);
    assert.ok(!sketch.markup.includes('<img'));
});

const page = (raw) =>
    new JSDOM(`<main>${renderToStaticMarkup(h('div', null, renderMarkdown(raw)))}</main>`).window
        .document;

test('a reply draws a sketch block as a named figure with no code, copy button or source', () => {
    const doc = page(`Before.\n\n\`\`\`sketch flow\n${freezing}\n\`\`\`\n\nAfter.`),
        figure = doc.querySelector('figure.sketch');
    assert.equal(figure.getAttribute('aria-label'), 'Sketch: Freezing below 0 °C');
    assert.deepEqual(
        [...figure.querySelectorAll('.sr-only li')].map((item) => item.textContent),
        drawSketch('flow', freezing, dark).items.map((item) => item.text),
    );
    assert.equal(doc.querySelector('pre, button'), null);
    assert.ok(!doc.body.textContent.includes('->'));
});

test('only tutor sketches draw, waiting on a real closing fence while the reply streams', async (t) => {
    const intro = 'Intro';
    const open = `${intro}\n\n\`\`\`sketch bars\n${speeds}\n`;
    const closed = `${open}\`\`\``.replaceAll('\n', '\r');
    const learnerCode = '```sketch flow\nA -> B\n```';
    let update;
    function Fixture() {
        const [reply, set] = useState({ text: `${open}> \`\`\``, status: 'streaming' });
        update = set;
        return h(
            ChatThread,
            threadProps({
                tree: {
                    id: 'root',
                    messages: [
                        { id: 'q', role: 'user', status: 'completed', text: learnerCode },
                        { id: 'r', role: 'assistant', ...reply },
                    ],
                },
                active: reply.status === 'streaming',
            }),
        );
    }
    const copied = [];
    const { container, act, cleanup } = await render(h(Fixture), (window) => {
        ui(window).media('(prefers-reduced-motion: reduce)', false);
        Object.defineProperty(window.navigator, 'clipboard', {
            value: { writeText: async (text) => void copied.push(text) },
        });
    });
    t.after(cleanup);
    const reply = () => container.querySelector('[data-chat-message="r"]');
    assert.equal(container.querySelector('[data-chat-message="q"] pre').textContent, 'A -> B');
    assert.ok(reply().querySelector('.sketch-wait[role="status"]').getAttribute('aria-label'));
    assert.equal(reply().querySelector('figure, pre'), null);
    assert.ok(!reply().textContent.includes('465'));
    await act(async () => update({ text: closed, status: 'streaming' }));
    assert.equal(reply().querySelector('.sketch-wait'), null);
    assert.ok(reply().querySelector('figure.sketch').textContent.includes('465 m/s'));
    const building = reply().querySelector('figure.sketch-build');
    assert.ok(building, 'it builds in as the reply reaches it');
    await act(async () => update({ text: closed, status: 'completed' }));
    assert.ok(
        reply().querySelector('figure.sketch-build') === building,
        'finishing keeps the build',
    );
    await act(async () => reply().querySelector('.reply-copy').click());
    assert.equal(copied[0].trimEnd(), intro);
    assert.equal(previewText(closed, 'assistant'), intro);
});

test('a broken sketch shows nothing from its source and is logged with its kind and reason', async (t) => {
    const warned = [],
        warn = console.warn;
    console.warn = (...args) => warned.push(args.join(' '));
    t.after(() => (console.warn = warn));
    const { container, cleanup } = await render(
        h(
            'div',
            null,
            renderMarkdown(
                'Before.\n\n```sketch bars\nPressure push: strong\n```\n\nAfter.\n\n```sketch flow\nA -> B',
            ),
        ),
    );
    t.after(cleanup);
    assert.equal(container.textContent, 'Before.After.');
    assert.equal(container.querySelector('.sketch-wait'), null);
    assert.deepEqual(warned, [
        'Sketch hidden (bars): line 1 "Pressure push: strong" has no number',
        'Sketch hidden (flow): unclosed fence',
    ]);
    assert.equal(
        previewText('Before.\n\n```sketch bars\nPressure push: strong', 'assistant'),
        'Before.',
    );
});

test('streamed bars and flow sketches schedule their items over half a second', async () => {
    for (const [kind, body, items, expectedOrder] of [
        ['bars', speeds, '.sketch-bars > *', [0, 0, 1, 1, 2, 2]],
        ['flow', freezing, 'svg > g', [0, 1, 2, 3, 4]],
    ]) {
        const { container, cleanup } = await render(
            h(Sketch, { kind, body, fence: 'closed', live: true }),
            (window) => ui(window).media('(prefers-reduced-motion: reduce)', false),
        );
        try {
            const figure = container.querySelector('figure.sketch-build');
            const order = [...figure.querySelectorAll(items)].map((item) =>
                Number.parseInt(item.style.getPropertyValue('--i'), 10),
            );
            const step = parseFloat(figure.style.getPropertyValue('--step'));
            const fade = parseFloat(figure.style.getPropertyValue('--fade'));
            assert.deepEqual(order, expectedOrder);
            assert.equal(step * order.at(-1) + fade, 500);
        } finally {
            await cleanup();
        }
    }
    assert.equal(page(`\`\`\`sketch bars\n${speeds}\n\`\`\``).querySelector('.sketch-build'), null);
});

test('a sketch appears at once if Reduce Motion is enabled before its fence closes', async (t) => {
    const preference = '(prefers-reduced-motion: reduce)';
    let close, controls;
    function Fixture() {
        const [fence, setFence] = useState('open');
        close = () => setFence('closed');
        return h(Sketch, { kind: 'bars', body: speeds, live: true, fence });
    }
    const { container, act, cleanup } = await render(h(Fixture), (window) => {
        controls = ui(window);
        controls.media(preference, false);
    });
    t.after(cleanup);
    assert.ok(container.querySelector('.sketch-wait'));
    controls.media(preference, true);
    await act(close);
    assert.ok(container.querySelector('figure.sketch').textContent.includes('465 m/s'));
    assert.ok(!container.querySelector('.sketch-build'), 'the sketch skips the entrance');
});
