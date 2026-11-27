import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { drawSketch } from '../../src/sketch/sketch.ts';
import { renderMarkdown } from '../../src/markdown/markdown.ts';
import { render } from '../support/render.mjs';

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
});

test('a sketch it cannot draw names the reason', () => {
    for (const [kind, body, reason] of [
        ['venn-ish', 'A -> B', /unknown kind "venn-ish"/],
        ['flow', 'title: Only a title\n\n', /empty body/],
        ['flow', 'A -> B\nJust words', /line 2 "Just words"/],
        ['bars', 'Pressure push: strong', /line 1 "Pressure push: strong" has no number/],
        ['bars', 'Loss: -3 kg', /below zero/],
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
    assert.equal(figure.querySelectorAll('.sr-only li').length, 5);
    assert.equal(doc.querySelector('pre, button'), null);
    assert.ok(!doc.body.textContent.includes('->'));
});

test('a sketch fence still streaming shows the placeholder, then the sketch once it closes', () => {
    const open = page(`Intro\n\n\`\`\`sketch bars\n${speeds}\n`);
    assert.equal(
        open.querySelector('[role="status"]').getAttribute('aria-label'),
        'Drawing a sketch',
    );
    assert.equal(open.querySelector('figure, pre'), null);
    assert.ok(!open.body.textContent.includes('465'));
    const closed = page(`Intro\n\n\`\`\`sketch bars\n${speeds}\n\`\`\``);
    assert.equal(closed.querySelector('[role="status"]'), null);
    assert.equal(closed.querySelectorAll('figure.sketch .sr-only li').length, 3);
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
            renderMarkdown('Before.\n\n```sketch bars\nPressure push: strong\n```\n\nAfter.'),
        ),
    );
    t.after(cleanup);
    assert.equal(container.textContent, 'Before.After.');
    assert.deepEqual(warned, [
        'Sketch hidden (bars): line 1 "Pressure push: strong" has no number',
    ]);
});
