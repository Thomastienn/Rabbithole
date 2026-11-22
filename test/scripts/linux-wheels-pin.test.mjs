import assert from 'node:assert/strict';
import test from 'node:test';
import { missingWheels, repinWheels } from '../../scripts/linux-wheels-pin.mjs';

const old = 'a'.repeat(64);
const pins = {
    'pycairo-1.29.2-cp312-cp312-manylinux_2_28_x86_64.whl': old,
    'manimpango-0.8.0-cp312-cp312-manylinux_2_28_x86_64.whl': old,
};
const released = [
    'SHA256SUMS',
    'pycairo-1.29.2-cp312-cp312-manylinux_2_28_x86_64.whl',
    'manimpango-0.7.1-cp312-cp312-manylinux_2_28_x86_64.whl',
];

test('only a pinned version the wheels release lacks asks for a rebuild', () => {
    assert.deepEqual(missingWheels(pins, released), [
        'manimpango-0.8.0-cp312-cp312-manylinux_2_28_x86_64.whl',
    ]);
    assert.deepEqual(
        missingWheels(pins, [
            ...released,
            'manimpango-0.8.0-cp312-cp312-manylinux_2_28_x86_64.whl',
        ]),
        [],
    );
    // A missing or unreadable release lacks every wheel.
    assert.equal(missingWheels(pins, ['']).length, 2);
});

test('the re-pin takes each name and hash from the released files and keeps older wheels pinned as released', () => {
    const source = `export const LINUX_WHEELS = {\n${Object.keys(pins)
        .map((name) => `    '${name}':\n        '${old}',\n`)
        .join('')}};\n`;
    const cairo = 'c'.repeat(64);
    const pango = 'b'.repeat(64);
    const sums = [
        `${'d'.repeat(64)}  manimpango-0.7.1-cp312-cp312-manylinux_2_28_x86_64.whl`,
        `${cairo}  pycairo-1.29.2-cp312-cp312-manylinux_2_28_x86_64.whl`,
        // The rebuilt wheel may carry a different platform tag than the pin guessed.
        `${pango}  manimpango-0.8.0-cp312-cp312-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl`,
    ].join('\n');
    assert.equal(
        repinWheels(source, `${sums}\n`),
        `export const LINUX_WHEELS = {\n` +
            `    'pycairo-1.29.2-cp312-cp312-manylinux_2_28_x86_64.whl':\n        '${cairo}',\n` +
            `    'manimpango-0.8.0-cp312-cp312-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl':\n        '${pango}',\n` +
            `};\n`,
    );
    assert.throws(() => repinWheels(source, sums.split('\n')[1]), /no manimpango-0\.8\.0-cp312-/);
});
