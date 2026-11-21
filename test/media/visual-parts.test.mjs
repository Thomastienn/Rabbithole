import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { visualMessage } from '../../src/media/artifacts.ts';
import { renderVisual } from '../../src/media/visualMarkup.ts';
import { trackPointerHandlers, watchParts } from '../../src/media/visualParts.ts';
import { stepThrough } from '../../src/media/stepThrough.ts';

const part = (label, explanation) =>
    `data-visual-label="${label}" data-visual-explanation="${explanation}"`;

test('stored tagged visuals render unchanged and their tags do not activate', () => {
    const { window: w } = new JSDOM('<div id="visual"></div>');
    const root = w.document.getElementById('visual');
    const html = `<svg><rect id="semi" ${part('Semifinal', 'One winner.')}></rect></svg><div id="final" ${part('Final', 'Winners meet.')}>Final</div>`;
    renderVisual(root, html, true);
    for (const id of ['semi', 'final']) {
        const e = w.document.getElementById(id);
        assert.equal(e.getAttribute('data-visual-label') !== null, true, 'markup kept');
        for (const attr of ['tabindex', 'role', 'aria-label'])
            assert.equal(e.hasAttribute(attr), false);
    }
});

test('host accepts only exact, bounded height messages and visual branch parts', () => {
    assert.deepEqual(visualMessage({ type: 'height', height: 5000.2 }), {
        type: 'height',
        height: 4000,
    });
    assert.deepEqual(visualMessage({ type: 'branch', label: ' A ', explanation: ' B ' }), {
        type: 'branch',
        label: 'A',
        explanation: 'B',
    });
    for (const bad of [
        { type: 'branch', label: '', explanation: 'Empty label' },
        { type: 'branch', label: 'x'.repeat(121), explanation: 'Long label' },
        { type: 'branch', label: 'Valid', explanation: 'x'.repeat(281) },
        { type: 'branch', label: 'Two\nlines', explanation: 'Newline' },
        { type: 'branch', label: 'Extra', explanation: 'Key', href: '/' },
        { type: 'height', height: Infinity },
        'branch',
        null,
    ])
        assert.equal(visualMessage(bad), undefined, JSON.stringify(bad));
});

// A nuclear plant visual: nested parts, a slider, a d3-style handler and step controls.
function plant() {
    const { window: w } = new JSDOM(
        `<div id="visual"><svg id="art"><g data-part="Nuclear plant"><rect id="plant-wall"></rect><g data-part=" Reactor "><circle id="core"></circle><g data-part="Control rods"><rect id="rod"></rect><g data-part="Rod tip"><rect id="tip"></rect></g></g></g><g id="turbine" data-part="Turbine"><rect id="blade"></rect></g><g data-part="Pump"><rect id="dragged"></rect></g></g><rect id="sky"></rect></svg><input id="slider" type="range"><button id="reset">Reset</button></div>`,
        { pretendToBeVisual: true },
    );
    trackPointerHandlers(w);
    const root = w.document.getElementById('visual'),
        posted = [];
    w.document.getElementById('dragged').addEventListener('pointerdown', () => {});
    // jsdom has no layout: each part reports a box from its own data, the turbine off the frame's right edge;
    // a hidden part draws nothing.
    w.Element.prototype.getBoundingClientRect = function () {
        if (this.closest('[hidden]'))
            return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
        const left = this.id === 'turbine' ? 1000 : 10;
        return { left, top: 20, right: left + 100, bottom: 60, width: 100, height: 40 };
    };
    const parts = watchParts(w, root, (m) => posted.push(m));
    const at = (id, type = 'pointermove') =>
        w.document
            .getElementById(id)
            .dispatchEvent(new w.MouseEvent(type, { bubbles: true, cancelable: true }));
    return { w, root, posted, at, parts };
}
const frame = (w) => new Promise((resolve) => w.requestAnimationFrame(() => resolve()));

test('hovering names the smallest part under the pointer with its trail, at most three deep, and its bounds inside the frame', () => {
    const { w, posted, at } = plant();
    at('rod');
    const box = { x: 10, y: 20, width: 100, height: 40 };
    assert.deepEqual(posted.pop(), {
        type: 'part',
        parts: [
            { name: 'Nuclear plant', ...box },
            { name: 'Reactor', ...box },
            { name: 'Control rods', ...box },
        ],
    });
    at('rod');
    assert.equal(posted.length, 0, 'the same part posts once');
    at('plant-wall');
    assert.deepEqual(posted.pop(), { type: 'part', parts: [{ name: 'Nuclear plant', ...box }] });
    at('tip');
    assert.deepEqual(
        posted.pop().parts.map((p) => p.name),
        ['Reactor', 'Control rods', 'Rod tip'],
        'a fourth level keeps the three innermost names',
    );
    at('blade');
    assert.deepEqual(
        posted.pop().parts[1],
        { name: 'Turbine', x: 1000, y: 20, width: w.innerWidth - 1000, height: 40 },
        'bounds are clipped to the frame',
    );
    at('sky');
    assert.deepEqual(posted.pop(), { type: 'leave' }, 'an unnamed area picks nothing');
});

test('controls and elements with their own pointer handlers never pick, and a click picks the part with its step', () => {
    const { w, root, posted, at } = plant();
    for (const id of ['slider', 'reset', 'dragged']) {
        at('rod');
        posted.length = 0;
        at(id);
        assert.deepEqual(posted, [{ type: 'leave' }], id);
        at(id, 'click');
        assert.deepEqual(posted, [{ type: 'leave' }], `${id} click`);
    }
    at('core', 'click');
    assert.deepEqual(posted.at(-1).type, 'pick');
    assert.equal(posted.at(-1).step, null, 'no step-through, no step');
    const art = w.document.getElementById('art');
    const control = stepThrough(art, [() => {}, () => {}, () => {}]);
    control.show(2);
    at('core', 'click');
    assert.equal(posted.at(-1).step, 2);
    for (const button of root.querySelectorAll('.tt-steps > button')) {
        posted.length = 0;
        button.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
        assert.deepEqual(posted, [], `${button.getAttribute('aria-label')} never picks`);
    }
});

test('a visual without parts never posts a part', () => {
    const { window: w } = new JSDOM(
        '<div id="visual"><svg><rect id="r"></rect></svg><canvas id="c"></canvas></div>',
    );
    const posted = [];
    watchParts(w, w.document.getElementById('visual'), (m) => posted.push(m));
    for (const id of ['r', 'c'])
        for (const type of ['pointermove', 'click'])
            w.document.getElementById(id).dispatchEvent(new w.MouseEvent(type, { bubbles: true }));
    assert.deepEqual(posted, []);
});

test('host accepts only bounded part messages inside the frame and ignores malformed or oversized ones', () => {
    const frame = { width: 600, height: 400 },
        rod = { name: ' Control rods ', x: 10, y: 20, width: 100, height: 40 },
        plant = { ...rod, name: 'Nuclear plant', x: 0, y: 0, width: 600, height: 400 };
    assert.deepEqual(visualMessage({ type: 'part', parts: [plant, rod] }, frame), {
        type: 'part',
        parts: [plant, { ...rod, name: 'Control rods' }],
    });
    assert.deepEqual(visualMessage({ type: 'pick', parts: [rod], step: 2 }, frame), {
        type: 'pick',
        parts: [{ ...rod, name: 'Control rods' }],
        step: 2,
    });
    assert.deepEqual(visualMessage({ type: 'pick', parts: [rod], step: null }, frame).step, null);
    assert.deepEqual(visualMessage({ type: 'leave' }, frame), { type: 'leave' });
    for (const bad of [
        { type: 'part', parts: [] },
        { type: 'part', parts: [plant, plant, plant, rod] },
        { type: 'part', parts: [{ ...rod, name: '' }] },
        { type: 'part', parts: [{ ...rod, name: 'x'.repeat(61) }] },
        { type: 'part', parts: [{ ...rod, name: 'Two\nlines' }] },
        { type: 'part', parts: [{ ...rod, name: 'Bell' + String.fromCharCode(7) }] },
        { type: 'part', parts: [{ ...rod, name: 7 }] },
        { type: 'part', parts: [{ ...rod, x: -1 }] },
        { type: 'part', parts: [{ ...rod, x: 550 }] },
        { type: 'part', parts: [{ ...rod, height: 382 }] },
        { type: 'part', parts: [{ ...rod, width: NaN }] },
        { type: 'part', parts: [{ ...rod, href: '/' }] },
        { type: 'part', parts: 'Reactor' },
        { type: 'part', parts: [rod], step: 1 },
        { type: 'pick', parts: [rod] },
        { type: 'pick', parts: [rod], step: -1 },
        { type: 'pick', parts: [rod], step: 1.5 },
        { type: 'leave', parts: [] },
    ])
        assert.equal(visualMessage(bad, frame), undefined, JSON.stringify(bad));
    assert.equal(visualMessage({ type: 'leave' }), undefined, 'part messages need the frame');
});

test('branched parts report their bounds on every step that draws them, matched by trail, and the stored step opens', async () => {
    const { w, posted, parts } = plant();
    const rods = ['Nuclear plant', 'Reactor', 'Control rods'],
        box = { x: 10, y: 20, width: 100, height: 40 };
    parts.mark([
        rods,
        ['Nuclear plant', 'Turbine'],
        ['Reactor', 'Control rods', 'Rod tip'],
        ['Boiler'],
    ]);
    await frame(w);
    assert.deepEqual(posted.pop(), {
        type: 'marks',
        marks: [
            { trail: rods, ...box },
            {
                trail: ['Nuclear plant', 'Turbine'],
                x: 1000,
                y: 20,
                width: w.innerWidth - 1000,
                height: 40,
            },
            { trail: ['Reactor', 'Control rods', 'Rod tip'], ...box },
        ],
    });
    // The next step hides the rods; the part tip inside them goes too.
    const art = w.document.getElementById('art'),
        group = w.document.getElementById('rod').parentElement,
        control = stepThrough(art, [
            () => group.removeAttribute('hidden'),
            () => group.setAttribute('hidden', ''),
        ]);
    control.show(1);
    await frame(w);
    assert.deepEqual(
        posted.pop().marks.map((m) => m.trail),
        [['Nuclear plant', 'Turbine']],
        'a step that does not draw a part leaves it unmarked',
    );
    control.show(0);
    await frame(w);
    assert.equal(posted.pop().marks.length, 3, 'a later step that draws it again marks it again');
    await frame(w);
    assert.equal(posted.length, 0, 'unchanged marks post once');
    parts.step(1);
    await frame(w);
    assert.equal(w.document.querySelector('.tt-steps').dataset.step, '1', 'the stored step opens');
    assert.equal(posted.pop().marks.length, 1);
});

test('host accepts only bounded mark messages with valid trails inside the frame', () => {
    const frame = { width: 600, height: 400 },
        rods = { trail: ['Reactor', ' Control rods '], x: 10, y: 20, width: 100, height: 40 };
    assert.deepEqual(visualMessage({ type: 'marks', marks: [rods] }, frame), {
        type: 'marks',
        marks: [{ ...rods, trail: ['Reactor', 'Control rods'] }],
    });
    assert.deepEqual(visualMessage({ type: 'marks', marks: [] }, frame), {
        type: 'marks',
        marks: [],
    });
    for (const bad of [
        { type: 'marks', marks: [{ ...rods, trail: [] }] },
        { type: 'marks', marks: [{ ...rods, trail: ['A', 'B', 'C', 'D'] }] },
        { type: 'marks', marks: [{ ...rods, trail: ['Tab\there'] }] },
        { type: 'marks', marks: [{ ...rods, trail: 'Reactor' }] },
        { type: 'marks', marks: [{ ...rods, x: 590 }] },
        { type: 'marks', marks: [{ ...rods, name: 'Reactor' }] },
        { type: 'marks', marks: [null] },
        { type: 'marks', marks: Array(51).fill(rods) },
        { type: 'marks', marks: 'Reactor' },
        { type: 'marks', marks: [rods], step: 1 },
    ])
        assert.equal(visualMessage(bad, frame), undefined, JSON.stringify(bad));
    assert.equal(visualMessage({ type: 'marks', marks: [] }), undefined, 'marks need the frame');
});

test('while the host picks from the keyboard, the part tree posts with names, nesting and bounds, three levels deep, and follows each step', async () => {
    const { w, posted, parts } = plant();
    await frame(w);
    assert.deepEqual(posted, [], 'no tree until the host asks');
    parts.watch(true);
    await frame(w);
    const box = { x: 10, y: 20, width: 100, height: 40 },
        leaf = (name, b = box) => ({ name, ...b, parts: [] }),
        turbine = { x: 1000, y: 20, width: w.innerWidth - 1000, height: 40 };
    assert.deepEqual(posted.pop(), {
        type: 'tree',
        step: null,
        parts: [
            {
                name: 'Nuclear plant',
                ...box,
                parts: [
                    { name: 'Reactor', ...box, parts: [leaf('Control rods')] },
                    leaf('Turbine', turbine),
                    leaf('Pump'),
                ],
            },
        ],
    });
    const art = w.document.getElementById('art'),
        group = w.document.getElementById('rod').parentElement,
        control = stepThrough(art, [
            () => group.removeAttribute('hidden'),
            () => group.setAttribute('hidden', ''),
        ]);
    control.show(1);
    await frame(w);
    const tree = posted.pop();
    assert.equal(tree.step, 1);
    assert.deepEqual(tree.parts[0].parts[0].parts, [], 'a part the step hides leaves the tree');
    await frame(w);
    assert.deepEqual(posted, [], 'an unchanged tree posts once');
    parts.watch(false);
    control.show(0);
    await frame(w);
    assert.deepEqual(posted, [], 'picking over, no tree');
});

test('host accepts only a bounded part tree inside the frame, three levels deep', () => {
    const frame = { width: 600, height: 400 },
        box = { x: 10, y: 20, width: 100, height: 40 },
        node = (name, parts = []) => ({ name, ...box, parts });
    const deep = [node('Plant', [node('Reactor', [node(' Control rods ')])])];
    assert.deepEqual(visualMessage({ type: 'tree', parts: deep, step: 1 }, frame), {
        type: 'tree',
        step: 1,
        parts: [node('Plant', [node('Reactor', [node('Control rods')])])],
    });
    for (const bad of [
        { type: 'tree', parts: [node('Plant', [node('A', [node('B', [node('C')])])])], step: null },
        { type: 'tree', parts: [{ ...node('Plant'), x: 590 }], step: null },
        { type: 'tree', parts: [node('Tab\there')], step: null },
        { type: 'tree', parts: [{ ...node('Plant'), parts: 'Reactor' }], step: null },
        { type: 'tree', parts: [{ name: 'Plant', ...box }], step: null },
        { type: 'tree', parts: Array(201).fill(node('Plant')), step: null },
        { type: 'tree', parts: [node('Plant')], step: -1 },
        { type: 'tree', parts: [node('Plant')] },
    ])
        assert.equal(visualMessage(bad, frame), undefined, JSON.stringify(bad).slice(0, 80));
    assert.equal(
        visualMessage({ type: 'tree', parts: [], step: null }),
        undefined,
        'needs the frame',
    );
});

test('the visual writer prompt groups parts by named object and regroups them at each step', async () => {
    const { readFile } = await import('node:fs/promises');
    const prompt = (
        await readFile(new URL('../../server/media/prompts/visual.md', import.meta.url), 'utf8')
    ).replace(/\s+/g, ' ');
    for (const rule of [
        'A part is one object the learner would name, never a collection of like things',
        'not one part for all nucleons or one for all labels',
        'A label sits inside the part it names.',
        'When objects merge, split or change identity between steps, the script renames and regroups the parts at each step to match what that step shows',
        'Step captions and legends are not parts.',
    ])
        assert.ok(prompt.includes(rule), rule);
});
