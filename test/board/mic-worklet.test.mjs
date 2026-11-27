import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Runs the worklet in a stub AudioWorkletGlobalScope at the device's rate.
async function worklet(sampleRate) {
    const posted = [];
    let Processor;
    vm.runInNewContext(await readFile('public/mic-worklet.js', 'utf8'), {
        sampleRate,
        Float32Array,
        Math,
        AudioWorkletProcessor: class {
            port = { postMessage: (frame) => posted.push(frame) };
        },
        registerProcessor: (_, c) => (Processor = c),
    });
    return { processor: new Processor(), posted };
}

test('mic worklet: 48 kHz audio in 128-sample blocks comes out as 512-sample frames of every third sample', async () => {
    const { processor, posted } = await worklet(48000);
    const ramp = Float32Array.from({ length: 128 * 30 }, (_, i) => i);
    for (let at = 0; at < ramp.length; at += 128)
        processor.process([[ramp.subarray(at, at + 128)]]);
    assert.equal(posted.length, 2);
    assert.ok(posted.every((frame) => frame.length === 512));
    const out = [...posted[0], ...posted[1]];
    assert.deepEqual(
        out,
        out.map((_, i) => i * 3),
    );
});

test('mic worklet: 44.1 kHz audio interpolates between samples across block edges', async () => {
    const { processor, posted } = await worklet(44100);
    const ramp = Float32Array.from({ length: 128 * 20 }, (_, i) => i);
    for (let at = 0; at < ramp.length; at += 128)
        processor.process([[ramp.subarray(at, at + 128)]]);
    const step = 44100 / 16000;
    posted[0].forEach((v, i) => assert.ok(Math.abs(v - i * step) < 1e-3, `sample ${i}: ${v}`));
});
