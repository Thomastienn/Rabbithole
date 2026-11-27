import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { drawSketch } from '../../src/sketch/sketch.ts';
import { renderMarkdown } from '../../src/markdown/markdown.ts';
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

const structures = {
    cycle: 'title: The basic loop\n*Evaporation*\nCondensation\nPrecipitation\nCollection and flow',
    stack: 'title: Languages in Norman England\nLatin: Church, records\n*French*: royal court\nEnglish: most people',
    tree: 'title: Where water goes\nPrecipitation\n  Runs off\n  Soaks in\n    Taken up by plants\n    Becomes *groundwater*\n  Evaporates again\nSnow',
    timeline:
        'title: The long unravelling\n395: East and West split\n376–378: Goths cross the Danube\n10:30: *Rome sacked*',
    parts: 'title: The targeted team\nwhole: Adaptive immunity\nHelper T cells: coordinate\nB cells: make *antibodies*',
};

test('each structure kind draws one item per element with its title and focus', () => {
    const drawn = Object.fromEntries(
        Object.entries(structures).map(([kind, body]) => [kind, drawSketch(kind, body, dark)]),
    );
    assert.deepEqual(
        Object.values(drawn).map((s) => s.title),
        [
            'The basic loop',
            'Languages in Norman England',
            'Where water goes',
            'The long unravelling',
            'The targeted team',
        ],
    );
    assert.deepEqual(
        drawn.cycle.items.map((i) => [i.text, i.focus]),
        [
            ['Evaporation, leads to Condensation, focus', true],
            ['Condensation, leads to Precipitation', false],
            ['Precipitation, leads to Collection and flow', false],
            ['Collection and flow, leads back to Evaporation', false],
        ],
    );
    assert.deepEqual(
        drawn.stack.items.map((i) => i.text),
        [
            'Latin, top layer: Church, records',
            'French: royal court, focus',
            'English, bottom layer: most people',
        ],
    );
    const layers = new JSDOM(drawn.stack.markup).window.document.querySelectorAll('li');
    assert.deepEqual(
        [...layers].map((l) => l.textContent),
        ['LatinChurch, records', 'Frenchroyal court', 'Englishmost people'],
    );
    assert.deepEqual(
        drawn.tree.items.map((i) => [i.label, i.level]),
        [
            ['Precipitation', 0],
            ['Runs off', 1],
            ['Soaks in', 1],
            ['Taken up by plants', 2],
            ['Becomes groundwater', 2],
            ['Evaporates again', 1],
            ['Snow', 0],
        ],
    );
    assert.deepEqual(
        drawn.timeline.items.map((i) => i.text),
        [
            '395: East and West split',
            '376–378: Goths cross the Danube',
            '10:30: Rome sacked, focus',
        ],
    );
    assert.deepEqual(
        drawn.parts.items.map((i) => i.text),
        [
            'Adaptive immunity, made of 2 parts',
            'Helper T cells: coordinate',
            'B cells: make antibodies, focus',
        ],
    );
    // Only the starred words take the focus colour; the rest of the label keeps its ink.
    assert.match(drawn.parts.markup, /make <tspan style="fill:#ffffff[^"]*">antibodies<\/tspan>/);
});

test('a tree odd or skipped indent nests one level below the line above it', () => {
    const tree = drawSketch('tree', 'A\n     B\n   C\n      D', dark);
    assert.deepEqual(
        tree.items.map((i) => i.level),
        [0, 1, 1, 2],
    );
});

test('a reply reads a tree sketch to a screen reader as nested lists', () => {
    const doc = page(`\`\`\`sketch tree\n${structures.tree}\n\`\`\``),
        top = doc.querySelector('.sr-only');
    assert.deepEqual(
        [...top.children].map((li) => li.firstChild.textContent),
        ['Precipitation', 'Snow'],
    );
    assert.deepEqual(
        [...top.querySelectorAll(':scope > li > ul > li > ul > li')].map((li) => li.textContent),
        ['Taken up by plants', 'Becomes groundwater, focus'],
    );
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
        ['cycle', 'title: Loop\n*Bigger balance*', /1 stage; a cycle needs at least 2/],
        ['stack', 'Application\nTransport: delivery', /line 1 "Application" has no ": note"/],
        ['tree', 'title: Where water goes\n', /empty body/],
        ['timeline', '1066: Conquest\nNormandy lost in 1204', /line 2 "Normandy lost in 1204"/],
        ['timeline', '1066: ', /line 1 "1066:"/],
        ['parts', 'Helper T cells: coordinate', /line 1 is not "whole: name"/],
        ['parts', 'whole: Immunity', /no parts/],
        ['parts', 'whole: Immunity\nB cells', /line 2 "B cells"/],
    ])
        assert.match(drawSketch(kind, body, dark).error, reason);
});

test('a sketch takes the palette it is given, light or dark', () => {
    for (const kind of ['flow', 'bars', ...Object.keys(structures)]) {
        const body = { flow: freezing, bars: speeds, ...structures }[kind],
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
        ui(window);
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
    await act(async () => update({ text: closed, status: 'completed' }));
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
