import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkSize } from '../../scripts/check-size.mjs';

test('check-size enforces 500 lines and skips generated files', () => {
  const root = mkdtempSync(join(tmpdir(), 'check-size-'));
  for (const dir of ['src/themes/dusk', 'server', 'scripts', 'test/fixtures']) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  for (const file of ['dusk.js', 'dusk.css', 'dusk.d.ts', 'dusk.doc.mjs']) {
    writeFileSync(join(root, 'src/themes/dusk', file), 'x;\n'.repeat(900));
  }
  writeFileSync(join(root, 'test/fixtures/generated.mjs'), 'x;\n'.repeat(900));
  for (const file of [
    'src/file.ts',
    'server/file.mjs',
    'scripts/file.js',
    'test/file.tsx',
    'src/file.css',
    'src/themes/dusk/duskTheme.ts',
  ]) {
    for (const ending of ['\n', '']) {
      writeFileSync(join(root, file), Array(500).fill('x;').join('\n') + ending);
      assert.deepEqual(checkSize(root), []);
      writeFileSync(join(root, file), Array(501).fill('x;').join('\n') + ending);
      assert.deepEqual(checkSize(root), [`${file}: 501 lines`]);
    }
    writeFileSync(join(root, file), 'x;\n');
  }
});

test('repository passes the size check', () => {
  assert.deepEqual(checkSize(process.cwd()), []);
});
