import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../support/tsx.mjs';
import { cameraAt } from '../../server/media/video-kit.tsx';

const gap = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
const near = (a, b) => assert.ok(gap(a, b) < 1e-9, `${a} is not ${b}`);

test('3D cuts move the kit camera through timed keys', () => {
    const keys = [
        { at: 0, position: [0, 0, 12] },
        { at: 30, position: [6, 3, 6], target: [0, 1, 0] },
    ];
    assert.deepEqual(cameraAt(keys, -5), { position: [0, 0, 12], target: [0, 0, 0] });
    assert.deepEqual(cameraAt(keys, 0), { position: [0, 0, 12], target: [0, 0, 0] });
    const end = cameraAt(keys, 30);
    near(end.target, [0, 1, 0]);
    assert.equal(end.position[1], 3);
    // The slow orbit turns the camera about its target but keeps its distance.
    assert.ok(Math.abs(Math.hypot(end.position[0], end.position[2] - 0) - Math.hypot(6, 6)) < 1e-9);
    const mid = cameraAt(keys, 15);
    assert.ok(mid.position[2] < 12 && mid.position[2] > 6);
    near(cameraAt([keys[1]], 0).position, [6, 3, 6]);
});

test('the kit camera never stops, even on one key or past the last', () => {
    for (const keys of [
        [{ at: 0, position: [0, 2, 10] }],
        [
            { at: 0, position: [0, 2, 10] },
            { at: 60, position: [0, 2, 10] },
            { at: 90, position: [4, 1, 8], target: [0, 1, 0], pace: 0 },
        ],
    ])
        for (let f = 0; f < 150; f++)
            assert.ok(
                gap(cameraAt(keys, f).position, cameraAt(keys, f + 1).position) > 1e-4,
                `${f}`,
            );
});

test('the kit camera carries its velocity through a key instead of easing to a stop', () => {
    // A far target on the path's axis keeps the orbit's share of the z motion small.
    const keys = [
        { at: 0, position: [0, 0, 0], target: [0, 0, -100] },
        { at: 30, position: [0, 0, 6], target: [0, 0, -100] },
        { at: 60, position: [0, 0, 12], target: [0, 0, -100] },
    ];
    const step = Math.abs(cameraAt(keys, 31).position[2] - cameraAt(keys, 29).position[2]) / 2;
    assert.ok(step > 0.15, `speed through the key is ${step}, average is 0.2`);
});

test('a slow pace moves the camera less than the default', () => {
    const keys = (pace) => [{ at: 0, position: [0, 2, 10], pace }];
    const moved = (pace) =>
        gap(cameraAt(keys(pace), 0).position, cameraAt(keys(pace), 90).position);
    assert.ok(moved(0.3) < moved(undefined) / 2);
    assert.ok(moved(2) > moved(undefined));
});
