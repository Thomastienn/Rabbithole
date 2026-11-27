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

const maths = {
    plot: ['title: x² and its tangent at x = 1', 'y = x^2', '*y = 2*x - 1*', 'x: -0.5..2.5'].join(
        '\n',
    ),
    sequence: [
        'title: What crosses the public channel',
        'actors: Alice | Eve | Bob',
        'Alice: keeps a = 6 private',
        'Alice -> Bob: A = 8',
        'Bob -> Alice: B = 19',
        'Bob: 8^15 mod 23 = *2*',
    ].join('\n'),
    equation: [
        'title: With our numbers',
        'eq: K = g^ab mod p',
        'K: the shared key, 2',
        'g: public base, 5',
        'ab: 6 × 15 = 90, *never sent*',
        'p: public prime, 23',
    ].join('\n'),
    grid: [
        'title: Slide a 3×3 filter',
        'image:',
        '10 10 0',
        '10 10 0',
        '×',
        'filter:',
        '1 -1',
        '=',
        'output:',
        '0 *30*',
        'rocks:',
        'Parent rock | Becomes',
        'Shale | Slate',
    ].join('\n'),
};

test('maths and exchange sketches draw one item per element, with title and focus', () => {
    const items = (kind) => {
        const sketch = drawSketch(kind, maths[kind], dark);
        assert.ok(sketch.title);
        return sketch.items.map((i) => [i.label, i.focus, i.text]);
    };
    assert.deepEqual(items('plot'), [
        ['y = x^2', false, 'Curve y = x², x from −0.5 to 2.5'],
        ['y = 2*x - 1', true, 'Curve y = 2x − 1, x from −0.5 to 2.5, focus'],
    ]);
    assert.deepEqual(items('sequence'), [
        ['Alice, Eve, Bob', false, 'Actors: Alice, Eve, Bob'],
        ['keeps a = 6 private', false, 'Alice, note: keeps a = 6 private'],
        ['A = 8', false, 'Alice to Bob: A = 8'],
        ['B = 19', false, 'Bob to Alice: B = 19'],
        ['8^15 mod 23 = 2', true, 'Bob, note: 8^15 mod 23 = 2, focus'],
    ]);
    assert.deepEqual(items('equation'), [
        ['K = g^ab mod p', false, 'Equation: K = g superscript ab mod p'],
        ['K', false, 'K: the shared key, 2'],
        ['g', false, 'g: public base, 5'],
        ['ab', true, 'ab: 6 × 15 = 90, never sent, focus'],
        ['p', false, 'p: public prime, 23'],
    ]);
    assert.deepEqual(items('grid'), [
        ['image', false, 'image, table, 2 rows, 3 columns: 10, 10, 0; 10, 10, 0'],
        ['filter', false, 'times filter, table, 1 row, 2 columns: 1; −1'],
        ['output', true, 'equals output, table, 1 row, 2 columns: 0; 30, focus'],
        ['rocks', false, 'rocks, table, 2 rows, 2 columns: Parent rock, Becomes; Shale, Slate'],
    ]);
});

test('a plot draws each curve over its range and parses its formula, never running it', () => {
    const svg = new JSDOM(drawSketch('plot', maths.plot, dark).markup).window.document;
    const curves = [...svg.querySelectorAll('path.sketch-line')];
    assert.equal(curves.length, 2);
    // 201 samples across x, so every curve spans the whole range.
    for (const c of curves) assert.equal(c.getAttribute('d').match(/[ML]/g).length, 201);
    assert.ok(curves[1].getAttribute('style').includes(dark.focus));
    assert.deepEqual(
        [...svg.querySelectorAll('.sketch-math math')].map((m) => m.textContent.includes('y')),
        [true, true],
    );
    // A value that is not a number breaks the curve instead of drawing to it.
    const broken = drawSketch('plot', 'y = sqrt(x)\nx: -1..1', dark).markup;
    assert.equal(broken.match(/class="sketch-line"[^>]*d="([^"]*)"/)[1].match(/M/g).length, 1);
    globalThis.reached = false;
    for (const formula of ['reached', 'constructor(x)', 'x; reached = true', 'x)(', 'sin x', '2 +'])
        assert.match(drawSketch('plot', `y = ${formula}\nx: 0..1`, dark).error, /line 1/);
    assert.equal(globalThis.reached, false);
    delete globalThis.reached;
});

test('a sequence draws each actor once and each message in order, and an equation links each symbol', () => {
    const seq = new JSDOM(drawSketch('sequence', maths.sequence, dark).markup).window.document;
    const words = [...seq.querySelectorAll('text')].map((t) => t.textContent);
    assert.deepEqual(words.slice(0, 3), ['Alice', 'Eve', 'Bob']);
    assert.ok(words.indexOf('A = 8') < words.indexOf('B = 19'));
    // The message from Alice to Bob passes over Eve's lifeline, which breaks under it.
    assert.ok(seq.querySelector('path.sketch-gap'));
    const eq = new JSDOM(drawSketch('equation', maths.equation, dark).markup).window.document;
    assert.deepEqual(
        [...eq.querySelectorAll('.an')].map((a) => a.querySelector('.ld span').textContent),
        ['the shared key, 2', 'public base, 5', '6 × 15 = 90, never sent', 'public prime, 23'],
    );
    assert.equal(eq.querySelectorAll('.tk').length, 5);
    const twice = drawSketch('equation', 'eq: sin^2 x + cos^2 x = 1\nx: the angle', dark);
    assert.equal(new JSDOM(twice.markup).window.document.querySelectorAll('.ld').length, 1);
});

test('a grid draws joined grids with their join signs, captions and focus cells', () => {
    const doc = new JSDOM(drawSketch('grid', maths.grid, dark).markup).window.document;
    assert.deepEqual(
        [...doc.querySelectorAll('.op')].map((o) => o.textContent),
        ['×', '='],
    );
    assert.deepEqual(
        [...doc.querySelectorAll('.gc')].map((c) => c.textContent),
        ['image', 'filter', 'output', 'rocks'],
    );
    assert.deepEqual(
        [...doc.querySelectorAll('i.f')].map((c) => c.textContent),
        ['30'],
    );
    assert.deepEqual(
        [...doc.querySelectorAll('i.h')].map((c) => c.textContent),
        ['Parent rock', 'Becomes'],
    );
    const stacked = drawSketch('grid', 'a:\n1 2\nb:\n3 4', dark).markup;
    assert.match(stacked, /sketch-grids stack/);
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
        ['plot', 'y = (x + abs(x)) / 2\nx: -30..30', /line 1 .* uses abs, which is not one of/],
        ['plot', 'y = x', /no x: min..max/],
        ['plot', 'y = x\nx: 3..1', /line 2 "x: 3..1" is out of range/],
        ['plot', 'y = x\ny = 2\ny = 3\nx: 0..1', /more than two curves/],
        ['plot', 'y = sqrt(x - 9)\nx: 0..1', /has no value/],
        ['plot', 'y = exp(x)\nx: 0..709.7', /out of range/],
        ['plot', 'y = x\nx: 9007199254740992..9007199254740996', /out of range/],
        ['sequence', 'actors: Alice | Bob | Alice\nAlice -> Bob: hi', /names an actor twice/],
        ['sequence', 'Alice -> Bob: hi', /line 1 .* is not actors/],
        [
            'sequence',
            'actors: Alice | Bob\nAlice -> Bob: A = 8\nEve: sees 8',
            /line 3 "Eve: sees 8" names Eve, who is not in actors/,
        ],
        ['sequence', 'actors: Alice | Bob\nJust words', /line 2/],
        ['equation', 'S = k ln W', /line 1 .* is not eq:/],
        [
            'equation',
            'eq: S = k_B ln W\nS: entropy\nΩ: count',
            /line 3 "Ω: count" annotates Ω, which is not a symbol/,
        ],
        ['grid', 'image:\n0 0 9\n×', /line 3 "×" joins nothing after it/],
        ['grid', '×\n1 2', /line 1 "×" joins nothing before it/],
        ['grid', '1 2\n3', /line 2 "3" has 1 cells where its grid has 2/],
        ['grid', '1\n'.repeat(9), /ninth row/],
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
        assert.match(drawSketch(kind, body, dark).error, reason);
});

test('a sketch takes the palette it is given, light or dark', () => {
    const bodies = {
        flow: freezing,
        bars: speeds,
        line: voltage,
        quadrant: week,
        spectrum: cooling,
        ...maths,
    };
    for (const [kind, body] of Object.entries(bodies)) {
        const [a, b] = [drawSketch(kind, body, dark).markup, drawSketch(kind, body, light).markup];
        assert.ok(a.includes(dark.seam) && a.includes(dark.focus) && !a.includes(light.seam));
        assert.ok(b.includes(light.seam) && b.includes(light.focus) && !b.includes(dark.seam));
    }
});

test('labels the tutor writes are escaped, never markup', () => {
    const img = '<img src=x onerror=alert(1)>';
    for (const [kind, body] of [
        ['flow', `${img} -> B`],
        ['sequence', `actors: ${img} | B\n${img} -> B: ${img}\nB: *${img}*`],
        ['equation', `eq: ${img} = x\nx: *${img}*`],
        ['grid', `${img}:\n${img} | *${img}*`],
    ])
        assert.ok(!drawSketch(kind, body, dark).markup.includes('<img'), kind);
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
