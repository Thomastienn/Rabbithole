import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../support/tsx.mjs';
import { createElement as h } from 'react';
import { Thumbnail } from '@remotion/player';
import { render } from '../support/render.mjs';
import { ui } from '../support/ui.mjs';
import { planBuilder } from '../../server/media/plan-calls.mjs';
import { auditFix } from '../../server/media/audit-answers.mjs';
import { patchOf } from '../support/video-kit.mjs';
const { screenAt, targetMarksAt, Marks, Sketch, Cursor } =
    await import('../../server/media/video-kit.tsx');

const cut = (dimension, emphasis) => ({
    purpose: 'Show the rocket.',
    narration: 'The rocket lifts off.',
    engine: 'remotion',
    dimension,
    join: 'scene',
    endState: 'Rocket in flight.',
    emphasis,
});

test("a 3D cut's mark without target is refused with a plain error; with one it is accepted", () => {
    const { run } = planBuilder();
    assert.throws(
        () => run('add_cut', cut('3d', [{ tool: 'cursor', sentence: 0, x: 960, y: 540 }])),
        /3D cut must .* a target naming the set piece/,
    );
    assert.throws(
        () =>
            run(
                'add_cut',
                cut('3d', [{ tool: 'sketch', shape: 'freehand', sentence: 0, target: 'Rocket' }]),
            ),
        /circle, underline or arrow/,
    );
    assert.equal(
        run(
            'add_cut',
            cut('3d', [
                { tool: 'sketch', shape: 'circle', sentence: 0, target: 'Rocket', part: 'nozzle' },
                { tool: 'cursor', sentence: 0, target: 'Rocket', label: 'Rocket' },
            ]),
        ),
        'Cut 1 added.',
    );
});

test("a 2D cut's mark with x and y is accepted as today, and a target alone is not", () => {
    const { run } = planBuilder();
    assert.equal(
        run('add_cut', cut('2d', [{ tool: 'cursor', sentence: 0, x: 960, y: 540 }])),
        'Cut 1 added.',
    );
    assert.throws(
        () => run('add_cut', cut('2d', [{ tool: 'cursor', sentence: 0, target: 'Rocket' }])),
        /points inside the 1920x1080 frame/,
    );
});

test('an audit fix of a 3D cut takes target marks', () => {
    const source = 'a\n';
    const marks = {
        patch: patchOf(source, 'b\n'),
        emphasis: [{ tool: 'cursor', sentence: 0, target: 'Rocket' }],
    };
    assert.throws(() => auditFix(JSON.stringify(marks), {}, 1, 'manim', source));
    assert.deepEqual(
        auditFix(JSON.stringify(marks), {}, 1, 'manim', source, '3d').emphasis,
        marks.emphasis,
    );
});

const keys = [
    { at: 0, position: [0, 2, 12], target: [0, 1, 0] },
    { at: 60, position: [8, 4, 6], target: [1, 0, 0], pace: 2 },
];
const marks = [
    { tool: 'sketch', shape: 'circle', sentence: 0, target: 'Rocket', part: 'nozzle' },
    { tool: 'cursor', sentence: 0, target: 'Rocket' },
];
const at = { Rocket: [2, 1, 0], 'Rocket.nozzle': (f) => [2, 1 - f / 100, 0] };

test('target marks follow the projected set piece as the camera moves', () => {
    for (const f of [0, 20, 45]) {
        const [circle, cursor] = targetMarksAt(marks, keys, at, f);
        const nozzle = screenAt(keys, f, at['Rocket.nozzle'](f)),
            rocket = screenAt(keys, f, at.Rocket);
        const [[ax, ay], [bx, by]] = circle.points;
        assert.ok(
            Math.abs((ax + bx) / 2 - nozzle.x) < 1e-6 && Math.abs((ay + by) / 2 - nozzle.y) < 1e-6,
        );
        assert.deepEqual([cursor.x, cursor.y], [rocket.x, rocket.y]);
        assert.equal(circle.seed, 1, 'the wobble stays steady while points move');
    }
    assert.notDeepEqual(
        targetMarksAt(marks, keys, at, 0)[1],
        targetMarksAt(marks, keys, at, 30)[1],
    );
    // An unknown part falls back to its target; an unknown target or one behind the camera draws nothing.
    assert.equal(
        targetMarksAt([{ ...marks[1], part: 'fin' }], keys, at, 0)[0].x,
        screenAt(keys, 0, at.Rocket).x,
    );
    assert.deepEqual(targetMarksAt([{ ...marks[1], target: 'Moon' }], keys, at, 0), []);
    assert.deepEqual(targetMarksAt(marks, keys, { Rocket: [0, 2, 20] }, 0), []);
});

test("the app overlay skips target marks and the cut's Marks draws them on the set piece", async (t) => {
    const sentences = [{ startFrame: 0, endFrame: 60 }];
    const Scene = () =>
        h(
            'div',
            null,
            h(
                'div',
                { id: 'overlay' },
                h(Sketch, { marks, sentences }),
                h(Cursor, { marks, sentences }),
            ),
            h('div', { id: 'cut' }, h(Marks, { marks, sentences, keys, at })),
        );
    const { container, cleanup } = await render(
        h(Thumbnail, {
            component: Scene,
            compositionWidth: 1920,
            compositionHeight: 1080,
            fps: 30,
            durationInFrames: 60,
            frameToDisplay: 30,
        }),
        ui,
    );
    t.after(cleanup);
    assert.equal(container.querySelector('#overlay path'), null);
    assert.ok(container.querySelector('#cut svg path'), 'the circle is drawn');
    const cursor = [...container.querySelectorAll('#cut div')].find((d) => d.style.left);
    assert.equal(
        parseFloat(cursor.style.left).toFixed(1),
        screenAt(keys, 30, at.Rocket).x.toFixed(1),
    );
});
