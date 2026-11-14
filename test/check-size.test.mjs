import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkSize } from '../scripts/check-size.mjs';

test('check-size flags new oversized files and stale entries', () => {
  const root = mkdtempSync(join(tmpdir(), 'check-size-'));
  for (const dir of ['src/themes/dusk', 'server', 'scripts', 'test']) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  writeFileSync(join(root, 'src/big.ts'), 'x;\n'.repeat(501));
  writeFileSync(join(root, 'src/limit.ts'), 'x;\n'.repeat(500));
  writeFileSync(join(root, 'src/small.ts'), 'x;\n');
  writeFileSync(join(root, 'src/themes/dusk/dusk.js'), 'x;\n'.repeat(900));
  assert.deepEqual(checkSize(root, ['src/small.ts', 'src/gone.ts']), [
    'src/big.ts: 501 lines',
    'src/small.ts: stale oversized entry, remove it',
    'src/gone.ts: stale oversized entry, remove it',
  ]);
  assert.deepEqual(checkSize(root, ['src/big.ts']), []);
});

test('repository passes the size check', () => {
  assert.deepEqual(checkSize(process.cwd()), []);
});
