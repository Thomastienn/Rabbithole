import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { drawSketch } from '../../src/sketch/sketch.ts';
import { renderMarkdown } from '../../src/markdown/markdown.ts';
import Sketch from '../../src/markdown/Sketch.tsx';
import { render } from '../support/render.mjs';
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
const page = (raw) =>
    new JSDOM(`<main>${renderToStaticMarkup(h('div', null, renderMarkdown(raw)))}</main>`).window
        .document;

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

test('a long part wraps inside the sketch and pushes the next part down', () => {
    const long = drawSketch(
        'parts',
        'whole: Adaptive immunity\nHelper T cells of the adaptive kind: coordinate every other cell *nearby* all day\nB cells: make antibodies',
        dark,
    );
    const texts = [
        ...new JSDOM(long.markup).window.document.querySelectorAll('g:nth-of-type(2) text'),
    ];
    // More lines than the name and the note alone: the row wrapped.
    assert.ok(texts.length > 2);
    assert.ok(texts.some((t) => t.querySelector('tspan')?.textContent === 'nearby'));
    const ys = (g) =>
        [
            ...new JSDOM(long.markup).window.document.querySelectorAll(
                `g:nth-of-type(${g}) circle`,
            ),
        ].map((c) => +c.getAttribute('cy'));
    assert.ok(ys(3)[0] - ys(2)[0] > 28);
});

test('a structure sketch it cannot draw names the reason', () => {
    for (const [kind, body, reason] of [
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

test('a structure sketch takes the palette it is given, light or dark', () => {
    for (const [kind, body] of Object.entries(structures)) {
        const [a, b] = [drawSketch(kind, body, dark).markup, drawSketch(kind, body, light).markup];
        assert.ok(a.includes(dark.seam) && a.includes(dark.focus) && !a.includes(light.seam));
        assert.ok(b.includes(light.seam) && b.includes(light.focus) && !b.includes(dark.seam));
    }
});

test('streamed structure sketches schedule their items over half a second', async () => {
    for (const [kind, items, expectedOrder] of [
        ['cycle', 'svg > g', [0, 1, 2, 3]],
        ['stack', '.sketch-stack > *', [0, 1, 2]],
        ['tree', 'svg > g', [0, 1, 2, 3, 4, 5, 6]],
        ['timeline', 'svg > g', [0, 1, 2]],
        ['parts', 'svg > g', [0, 1, 2]],
    ]) {
        const { container, cleanup } = await render(
            h(Sketch, { kind, body: structures[kind], fence: 'closed', live: true }),
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
});
