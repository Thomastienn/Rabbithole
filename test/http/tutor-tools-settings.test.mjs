import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

test('Tutor tools settings list Run Python with setup steps until offline Python is ready', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'tt-tools-'));
  const store = new Store(join(dir, 'trees.sqlite'));
  let status = { ready: false, error: 'bubblewrap is missing. Run: sudo apt install bubblewrap' };
  const app = createApp({
    store,
    dir,
    providers: {},
    defaultProvider: null,
    auth: { status: () => ({ connected: false }) },
    log: () => {},
    python: { status: async () => status, run: async () => '' },
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await app.stop();
    store.close();
  });
  const url = `http://127.0.0.1:${app.server.address().port}/api/settings/tutor-tools`;
  const python = async () => (await (await fetch(url)).json()).find((x) => x.name === 'run_python');
  assert.deepEqual(await python(), {
    name: 'run_python',
    label: 'Run Python',
    enabled: true,
    setup: status.error,
  });
  status = { ready: true };
  assert.deepEqual(await python(), { name: 'run_python', label: 'Run Python', enabled: true });
});
