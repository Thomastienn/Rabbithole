import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Store } from '../../server/store.mjs';
import { Claude } from '../../server/providers/claude.mjs';
import { Codex } from '../../server/providers/codex.mjs';
import { createApp } from '../../server/app.mjs';

export const launch = (command, args, options) =>
  spawn(
    process.execPath,
    [
      fileURLToPath(new URL('../support/protocol-fixture.mjs', import.meta.url)),
      ...(command === 'claude' ? args : []),
    ],
    options,
  );

export async function start(dir) {
  const store = new Store(join(dir, 'trees.sqlite'));
  const claude = new Claude(dir, launch, (_c, _a, _o, cb) => cb(null, '{"loggedIn":true}'));
  const codex = new Codex({ token: async () => 'fixture-token' }, dir, launch);
  const app = createApp({
    store,
    dir,
    providers: { claude, codex },
    defaultProvider: 'claude',
    auth: { status: () => ({ connected: true }) },
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const get = async (path) => (await fetch(origin + path)).json();
  const { csrf } = await get('/api/state');
  const post = async (path, data = {}) =>
    (
      await fetch(origin + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
        body: JSON.stringify(data),
      })
    ).text();
  return {
    store,
    get,
    post,
    origin,
    headers: { 'Content-Type': 'application/json', 'X-TreeTutor-CSRF': csrf },
    close: async () => {
      await app.stop();
      store.close();
    },
  };
}
