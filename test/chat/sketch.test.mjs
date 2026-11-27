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
    hairline: '#333333',
    focus: '#ffffff',
};
const light = {
    ground: '#fafafa',
    ink: '#111111',
    muted: '#555555',
    seam: '#888888',
    hairline: '#cccccc',
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
const microbes = [
    'title: Bacterium or virus',
    'vs: Bacterium | Virus',
    'Structure: A living cell | Genes in a protein shell',
    'Own ribosomes | Yes | No',
    "Antibiotics: Often work | *Don't work*",
].join('\n');
const cells = [
    'title: Plant and animal cells',
    'Plant cell: Cell wall, Chloroplasts',
    'Animal cell: Lysosomes',
    'both: Nucleus, *Mitochondria*',
].join('\n');
const day = [
    'title: A 2,000 kcal day',
    'Carbohydrates: 1,000 kcal',
    '*Fat*: 700 kcal',
    'Protein: 300 kcal',
].join('\n');
const voltage = [
    'title: Membrane voltage (mV)',
    'range: -90..50',
    '-70: Resting',
    '-55: *Threshold*',
    '30: Typical peak',
].join('\n');
const week = [
    'title: Urgent or important?',
    'x: Not urgent .. Urgent',
    'y: Not important .. Important',
    'Exam tomorrow: 9, 9',
    '*Weekly revision*: 2, 9',
    'Booking the dentist: 4, 6',
    'Most notifications: 8, 2',
    'Onshore wind: 2, 0',
    'Solar farms: 2, 0',
].join('\n');
const cooling = [
    'title: Cooling speed and crystal size',
    'ends: Slow cooling .. Very fast cooling',
    'Granite: crystals easy to see',
    'Basalt: crystals mostly tiny',
    '*Obsidian*: glass, no real crystals',
].join('\n');
const svg = (markup) => new JSDOM(markup).window.document;
const circles = (markup) =>
    [...svg(markup).querySelectorAll('circle')].map((c) => [
        +c.getAttribute('cx'),
        +c.getAttribute('cy'),
    ]);

test('a line sketch places each value along its range, label above and value below', () => {
    const sketch = drawSketch('line', voltage, dark);
    assert.equal(sketch.about, 'from −90 to 50');
    assert.deepEqual(
        sketch.items.map((i) => i.text),
        ['Resting, −70', 'Threshold, −55, focus', 'Typical peak, 30'],
    );
    assert.deepEqual(circles(sketch.markup), [
        [108.6, 56],
        [172, 56],
        [531.4, 56],
    ]);
    // Threshold crowds Resting, so it rises a row on a leader.
    assert.equal(svg(sketch.markup).querySelectorAll('.sketch-leader').length, 1);
    const food = drawSketch(
        'line',
        'range: -25..25\n-18 °C: Freezer\n4 °C: *Fridge*\n21 °C: Typical room',
        dark,
    );
    const words = [...svg(food.markup).querySelectorAll('text')].map((t) => t.textContent);
    assert.ok(words.includes('−25 °C') && !words.includes('25 °C'), 'the crowded end is left out');
});

test('a quadrant sketch places items by x and y from 0 to 10 under its axis labels', () => {
    const sketch = drawSketch('quadrant', week, dark);
    assert.equal(sketch.about, 'across Not urgent to Urgent, up Not important to Important');
    assert.deepEqual(
        sketch.items.map((i) => i.text),
        [
            'Exam tomorrow, x 9, y 9',
            'Weekly revision, x 2, y 9, focus',
            'Booking the dentist, x 4, y 6',
            'Most notifications, x 8, y 2',
            'Onshore wind, x 2, y 0',
            'Solar farms, x 2, y 0',
        ],
    );
    // Two items at one spot share a station.
    assert.deepEqual(circles(sketch.markup), [
        [480, 60],
        [200, 60],
        [280, 132],
        [440, 228],
        [200, 276],
    ]);
    const words = [...svg(sketch.markup).querySelectorAll('text')].map((t) => t.textContent);
    for (const axis of ['Not urgent', 'Urgent', 'Not important', 'Important'])
        assert.ok(words.includes(axis), axis);
});

test('a spectrum sketch spaces its items in order between its ends', () => {
    const sketch = drawSketch('spectrum', cooling, dark);
    assert.equal(sketch.about, 'from Slow cooling to Very fast cooling');
    assert.deepEqual(
        sketch.items.map((i) => i.text),
        [
            'Granite, crystals easy to see',
            'Basalt, crystals mostly tiny',
            'Obsidian, glass, no real crystals, focus',
        ],
    );
    assert.deepEqual(circles(sketch.markup), [
        [122.7, 30],
        [320, 30],
        [517.3, 30],
    ]);
    const seven = drawSketch(
        'spectrum',
        'ends: Long .. Short\nRadio\nMicrowave: ovens\nInfrared\nVisible\nUltraviolet\nX-ray\nGamma',
        dark,
    );
    assert.equal(seven.items[0].text, 'Radio');
    assert.equal(svg(seven.markup).querySelectorAll('.sketch-leader').length, 3);
});

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

test('a compare sketch draws one row per aspect under its two names, in either line form', () => {
    const sketch = drawSketch('compare', microbes, dark);
    assert.equal(sketch.about, 'comparing Bacterium and Virus');
    assert.deepEqual(
        sketch.items.map((i) => [i.label, i.focus, i.text]),
        [
            [
                'Structure',
                false,
                'Structure: Bacterium, A living cell; Virus, Genes in a protein shell',
            ],
            ['Own ribosomes', false, 'Own ribosomes: Bacterium, Yes; Virus, No'],
            ['Antibiotics', true, "Antibiotics: Bacterium, Often work; Virus, Don't work, focus"],
        ],
    );
    const grid = new JSDOM(sketch.markup).window.document.querySelector('.sketch-compare');
    assert.deepEqual(
        [...grid.children].map((cell) => cell.textContent),
        ['', 'Bacterium', 'Virus', 'Structure', 'A living cell', 'Genes in a protein shell'].concat(
            ['Own ribosomes', 'Yes', 'No', 'Antibiotics', 'Often work', "Don't work"],
        ),
    );
});

test('a venn sketch puts each set in its own part and the both items in the overlap', () => {
    const sketch = drawSketch('venn', cells, dark);
    assert.equal(sketch.about, 'sets Plant cell and Animal cell');
    assert.deepEqual(
        sketch.items.map((i) => i.text),
        [
            'Cell wall, Plant cell only',
            'Chloroplasts, Plant cell only',
            'Nucleus, both',
            'Mitochondria, both, focus',
            'Lysosomes, Animal cell only',
        ],
    );
    const doc = new JSDOM(sketch.markup).window.document,
        [left, right] = [...doc.querySelectorAll('ellipse')].map((e) => +e.getAttribute('cx')),
        x = (label) =>
            +[...doc.querySelectorAll('text')]
                .find((t) => t.textContent === label)
                .getAttribute('x');
    assert.ok(x('Cell wall') < left && x('Lysosomes') > right);
    assert.ok(left < x('Nucleus') && x('Nucleus') < right);
    const empty = drawSketch(
        'venn',
        '*Squares*:\nRectangles: Unequal sides\nboth: Four right angles',
        dark,
    );
    assert.deepEqual(
        empty.items.map((i) => i.text),
        ['Four right angles, both', 'Unequal sides, Rectangles only'],
    );
});

test('a pie sketch shows each share as a percentage of the whole', () => {
    const share = (body) => drawSketch('pie', body, dark).items.map((i) => i.text);
    assert.equal(drawSketch('pie', day, dark).about, 'shares of a whole');
    assert.deepEqual(share(day), [
        'Carbohydrates, 1,000 kcal, 50%',
        'Fat, 700 kcal, 35%, focus',
        'Protein, 300 kcal, 15%',
    ]);
    assert.deepEqual(
        share(
            'Students: 412 people\nTeachers: 61 people\nParents: 127 people\nGovernors: 3 people\nNobody: 0 people',
        ),
        [
            'Students, 412 people, 68%',
            'Teachers, 61 people, 10%',
            'Parents, 127 people, 21%',
            'Governors, 3 people, <1%',
            'Nobody, 0 people, 0%',
        ],
    );
    // Unitless values that sum to 100 are the shares, as written.
    assert.deepEqual(share('Nitrogen: 78.08\nOxygen: 20.95\nArgon: 0.93\nCarbon dioxide: 0.04'), [
        'Nitrogen, 78.08%',
        'Oxygen, 20.95%',
        'Argon, 0.93%',
        'Carbon dioxide, 0.04%',
    ]);
    const slices = new JSDOM(
        drawSketch('pie', 'Rest: 3\nWork: 0', dark).markup,
    ).window.document.querySelectorAll('path');
    assert.equal(slices.length, 1);
    // A lone share is still a ring: its inner arc has two different ends.
    const [, start, end] = /L([\d. ]+)A48 48 0 1 0 ([\d. ]+)Z/.exec(slices[0].getAttribute('d'));
    assert.notEqual(start, end);
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
        ['compare', 'Cost: Cheap | Expensive\nSpeed: Slow | Fast', /no "vs: A \| B" line/],
        ['compare', 'vs: Only one\nCost: Cheap | Dear', /line 1 "vs: Only one" is not vs: A \| B/],
        ['compare', 'vs: A | B\nCost: Cheap', /line 2 "Cost: Cheap" is not aspect/],
        ['compare', 'vs: A | B', /no items/],
        ['venn', 'Metals: Iron, Copper\nboth: Conduct heat', /needs two sets, found 1/],
        ['venn', 'A: x\nB: y\nC: z', /needs two sets, found 3/],
        ['venn', 'Just words\nB: y', /line 1 "Just words" is not set/],
        ['venn', 'A:\nB:', /no items/],
        ['venn', 'A: a, b, c, d, e\nB: f, g\nboth: h, i', /more than eight items/],
        [
            'pie',
            'title: Monthly budget\nRent: 900\nFood: 400\nSavings: -150',
            /line 4 "Savings: -150" is negative/,
        ],
        ['pie', 'Rent: lots', /has no number/],
        ['pie', 'Rent: 0\nFood: 0', /no share above zero/],
        [
            'line',
            'title: Water at sea level (°C)\nrange: 0..100\n0: Freezes\n100: Boils\n120: Steam',
            /line 5 "120: Steam" is outside 0..100/,
        ],
        ['line', '0: Freezes', /no "range: min..max" line/],
        ['line', 'range: 0..100\nBoils: 100', /line 2 "Boils: 100" is not value: label/],
        [
            'quadrant',
            'x: Easy .. Hard\ny: Low payoff .. High payoff\nFlashcards: 3, 8\nRewriting notes: 6, 12',
            /line 4 "Rewriting notes: 6, 12" has y 12, above 10/,
        ],
        ['quadrant', 'x: Easy .. Hard\ny: Low .. High\nCards: -1, 8', /has x -1, below 0/],
        ['quadrant', 'x: Easy .. Hard\ny: Low .. High\nCards: often', /is not item: x, y/],
        ['spectrum', 'Granite: crystals\nBasalt: tiny', /no "ends: low .. high" line/],
        ['spectrum', 'ends: Slow\nGranite', /line 1 "ends: Slow" is not ends: low .. high/],
        ['spectrum', `ends: a .. b\n${'Rock\n'.repeat(9)}`, /more than eight items/],
    ])
        assert.match(drawSketch(kind, body, dark).error, reason, kind);
});

test('a sketch takes the palette it is given, light or dark', () => {
    const bodies = {
        flow: freezing,
        bars: speeds,
        compare: microbes,
        venn: cells,
        pie: day,
        line: voltage,
        quadrant: week,
        spectrum: cooling,
    };
    for (const [kind, body] of Object.entries(bodies)) {
        const [a, b] = [drawSketch(kind, body, dark).markup, drawSketch(kind, body, light).markup];
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
    assert.equal(
        page(`\`\`\`sketch line\n${voltage}\n\`\`\``)
            .querySelector('figure')
            .getAttribute('aria-label'),
        'Sketch: Membrane voltage (mV), from −90 to 50',
    );
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

test('streamed sketches schedule their items over half a second', async () => {
    for (const [kind, body, items, expectedOrder] of [
        ['bars', speeds, '.sketch-bars > *', [0, 0, 1, 1, 2, 2]],
        ['flow', freezing, 'svg > g', [0, 1, 2, 3, 4]],
        ['compare', microbes, '.sketch-compare > :not(:empty)', [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2]],
        ['venn', cells, 'svg > g', [0, 1, 2, 3, 4]],
        ['pie', day, 'svg > path, dl > *', [0, 1, 2, 0, 0, 0, 1, 1, 1, 2, 2, 2]],
        ['line', voltage, 'svg > g', [0, 1, 2]],
        ['quadrant', week, 'svg > g', [0, 1, 2, 3, 4, 5]],
        ['spectrum', cooling, 'svg > g', [0, 1, 2]],
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
