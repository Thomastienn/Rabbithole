import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { foreignBinaries } from '../../scripts/desktop-stage.mjs';

// The first 20 bytes of each format; ELF's machine number sits at byte 18.
const elf = (machine) => {
    const head = Buffer.alloc(20);
    head.writeUInt32BE(0x7f454c46, 0);
    head.writeUInt16LE(machine, 18);
    return head;
};
const FILES = {
    'linux-x64.node': elf(62),
    'linux-arm64.node': elf(183),
    'win/onnxruntime.dll': Buffer.concat([Buffer.from('MZ'), Buffer.alloc(18)]),
    'mac/libonnxruntime.dylib': Buffer.concat([
        Buffer.from([0xcf, 0xfa, 0xed, 0xfe]),
        Buffer.alloc(16),
    ]),
    'mac/universal.node': Buffer.concat([
        Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 2]),
        Buffer.alloc(12),
    ]),
    'Java.class': Buffer.concat([
        Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0, 0, 0, 52]),
        Buffer.alloc(12),
    ]),
    'text.js': Buffer.from('export const x = "a long enough text";'),
    'tiny.bin': Buffer.from('MZ'),
};

test('the stage check names every other OS binary and ELF for another CPU', (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'desktop-stage-'));
    t.after(() => rmSync(dir, { recursive: true }));
    for (const [file, bytes] of Object.entries(FILES)) {
        mkdirSync(join(dir, file, '..'), { recursive: true });
        writeFileSync(join(dir, file), bytes);
    }
    assert.deepEqual(foreignBinaries(dir, 'linux', 'x64').sort(), [
        'linux-arm64.node',
        'mac/libonnxruntime.dylib',
        'mac/universal.node',
        'win/onnxruntime.dll',
    ]);
    assert.deepEqual(foreignBinaries(dir, 'win32', 'x64').sort(), [
        'linux-arm64.node',
        'linux-x64.node',
        'mac/libonnxruntime.dylib',
        'mac/universal.node',
    ]);
});
