// The kinds that set things side by side: compare, venn and pie (src/sketch/comparisons.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { JSDOM } from 'jsdom';
import { drawSketch } from '../../src/sketch/sketch.ts';
import Sketch from '../../src/markdown/Sketch.tsx';
import { render } from '../support/render.mjs';
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

test('a comparison it cannot draw names the reason', () => {
    for (const [kind, body, reason] of [
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
    ])
        assert.match(drawSketch(kind, body, dark).error, reason, kind);
});

test('a comparison takes the palette it is given, light or dark', () => {
    for (const [kind, body] of Object.entries({ compare: microbes, venn: cells, pie: day })) {
        const [a, b] = [drawSketch(kind, body, dark).markup, drawSketch(kind, body, light).markup];
        assert.ok(a.includes(dark.seam) && a.includes(dark.focus) && !a.includes(light.seam));
        assert.ok(b.includes(light.seam) && b.includes(light.focus) && !b.includes(dark.seam));
    }
});

test('a streamed comparison builds in item by item', async () => {
    for (const [kind, body, items, expectedOrder] of [
        ['compare', microbes, '.sketch-compare > :not(:empty)', [0, 0, 0, 0, 0, 1, 1, 1, 2, 2, 2]],
        ['venn', cells, 'svg > g', [0, 1, 2, 3, 4]],
        ['pie', day, 'svg > path, dl > *', [0, 1, 2, 0, 0, 0, 1, 1, 1, 2, 2, 2]],
    ]) {
        const { container, cleanup } = await render(
            h(Sketch, { kind, body, fence: 'closed', live: true }),
            (window) => ui(window).media('(prefers-reduced-motion: reduce)', false),
        );
        try {
            const order = [...container.querySelectorAll(`figure.sketch-build :is(${items})`)].map(
                (item) => Number.parseInt(item.style.getPropertyValue('--i'), 10),
            );
            assert.deepEqual(order, expectedOrder);
        } finally {
            await cleanup();
        }
    }
});
