import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import lockfile from 'proper-lockfile';
import { Store } from './store.mjs';
import { Auth } from './auth.mjs';
import { Codex } from './codex.mjs';
import { Claude } from './claude.mjs';
import { createApp } from './app.mjs';

process.umask(0o077);
const dir = process.env.TREETUTOR_DATA_DIR ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'treetutor');
mkdirSync(dir, { recursive: true, mode: 0o700 });
// A second instance must not race a rotating OAuth refresh token or mark live replies interrupted.
const release = await lockfile.lock(dir, { realpath: true, stale: 10000 });
const store = new Store(join(dir, 'trees.sqlite'));
const auth = new Auth(dir);
const app = createApp({ store, auth, providers: { claude: new Claude(dir), codex: new Codex(auth, dir) }, defaultProvider: 'claude', dir });
app.server.listen(Number(process.env.TREETUTOR_PORT ?? 4317), '127.0.0.1', () => {
  console.log(`TreeTutor: http://127.0.0.1:${app.server.address().port}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { app.stop(); release().finally(() => { store.close(); process.exit(0); }); });
