import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensurePython } from '../../scripts/python-setup.mjs';
import { PYTHON_PACKAGES } from '../../server/tools/python.mjs';

test('ensurePython installs the pinned packages with uv, skips without bubblewrap, never fails start-up', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tt-pysetup-')),
    venv = join(root, '.venv-python'),
    quiet = { log: () => {}, warn: () => {} };
  let installed = false;
  const calls = [];
  const run = async (command, args) => {
    calls.push([command, ...args]);
    if (args[0] === 'pip') installed = true;
    return 0;
  };
  const check = async (command) => command === 'bwrap' || installed;
  assert.equal((await ensurePython({ run, root, check, ...quiet })).ready, true);
  assert.deepEqual(calls, [
    ['uv', 'venv', '--python', '3.12', venv],
    ['uv', 'pip', 'install', '--python', join(venv, 'bin', 'python'), ...PYTHON_PACKAGES],
  ]);

  const warnings = [];
  const noBwrap = await ensurePython({
    run: assert.fail,
    root,
    check: async () => false,
    log: () => {},
    warn: (m) => warnings.push(m),
  });
  assert.equal(noBwrap.ready, false);
  assert.match(warnings[0], /bubblewrap is missing/);

  const failed = await ensurePython({
    run: async () => 1,
    root,
    check: async (c) => c === 'bwrap',
    ...quiet,
  });
  assert.equal(failed.ready, false);
});
