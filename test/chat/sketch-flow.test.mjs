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
    focus: '#ffffff',
};
const freezing = [
    'title: Freezing below 0 °C',
    "Water freezes -> Water's entropy falls",
    'Water freezes -> Heat flows out',
    "Heat flows out -> Surroundings' entropy rises more",
    "Water's entropy falls -> *Total rises*",
    "Surroundings' entropy rises more -> *Total rises*",
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

test('a vertical flow keeps the label of an arrow back to an earlier step', () => {
    const texts = (width) =>
        [
            ...new JSDOM(
                drawSketch('flow', 'A -> B\nB -> C\nC -> A: repeats', dark, width).markup,
            ).window.document.querySelectorAll('text'),
        ].map((t) => t.textContent);
    assert.ok(texts(640).includes('repeats'));
    assert.ok(texts(224).includes('repeats'));
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
