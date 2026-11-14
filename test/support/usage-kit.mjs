import { observeStore, observeProvider } from './events.mjs';
export { until } from './events.mjs';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { Claude } from '../../server/providers/claude.mjs';
import { Codex } from '../../server/providers/codex.mjs';
import { createApp } from '../../server/app.mjs';

export { fixtureLaunch as launch } from './fixture-launch.mjs';
import { fixtureLaunch as launch } from './fixture-launch.mjs';

export async function start(dir) {
  const store = observeStore(new Store(join(dir, 'trees.sqlite')));
  const claude = new Claude(dir, launch, (_c, _a, _o, cb) => cb(null, '{"loggedIn":true}'));
  const codex = new Codex({ token: async () => 'fixture-token' }, dir, launch);
  observeProvider(claude);
  observeProvider(codex);
  const app = createApp({
    store,
    diagramParse: async () => true,
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
    app,
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
