// Codex server for verify-release-journey-live.mjs, spawned with --serve <dir> <port>: the real app, store and
// native providers, holding the app-owned auth lock so credentials stay in their original directory.
import { homedir } from 'node:os';
import { join } from 'node:path';

process.umask(0o077);
if (process.argv[2] === '--serve') {
  const [, , , dir, port] = process.argv;
  const [{ default: lockfile }, { Auth }, { Codex }, { Claude }, { Store }, { createApp }] =
    await Promise.all([
      import('proper-lockfile'),
      import('../../../server/providers/auth.mjs'),
      import('../../../server/providers/codex.mjs'),
      import('../../../server/providers/claude.mjs'),
      import('../../../server/store.mjs'),
      import('../../../server/app.mjs'),
    ]);
  let release;
  try {
    const authDir =
      process.env.RABBITHOLE_DATA_DIR ??
      join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'rabbithole');
    release = await lockfile.lock(authDir, { realpath: true, stale: 10000 });
    const auth = new Auth(authDir),
      store = new Store(join(dir, 'trees.sqlite'));
    const app = createApp({
      store,
      auth,
      providers: { claude: new Claude(dir), codex: new Codex(auth, dir) },
      defaultProvider: 'claude',
    });
    app.server.listen(Number(port), '127.0.0.1', () =>
      console.log(`Rabbithole: http://127.0.0.1:${app.server.address().port}`),
    );
    for (const signal of ['SIGINT', 'SIGTERM'])
      process.on(signal, () => {
        app.stop();
        release().finally(() => {
          store.close();
          process.exit(0);
        });
      });
  } catch (error) {
    await release?.();
    // Do not print native auth contents or raw subprocess diagnostics.
    console.error(
      `Native server startup failed: ${error.code ?? 'unknown'} (${error.syscall ?? 'initialization'})`,
    );
    process.exit(1);
  }
}
