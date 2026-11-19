import { join, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { execFile, spawn } from 'node:child_process';
import lockfile from 'proper-lockfile';
import { Store } from './store.mjs';
import { Auth } from './providers/auth.mjs';
import { Codex } from './providers/codex.mjs';
import { Claude } from './providers/claude.mjs';
import { cliPath } from './providers/findCli.mjs';
import { dataDir } from './desktop.mjs';
import { OpenAI } from './providers/openai.mjs';
import { createApp } from './app.mjs';
import { localEmbedder } from './media/embedder.mjs';
import { sandboxSnapshot } from './media/videos.mjs';
import { searxngDownload } from './searxng.mjs';
import { pythonTool } from './tools/python.mjs';
import { downloadManager } from './downloads.mjs';
import { videoTools } from './media/video-tools.mjs';

process.umask(0o077);
const dir = resolve(process.env.RABBITHOLE_DATA_DIR ?? dataDir());
const args = process.argv.slice(2);
const portText =
  args[0] === '--port' && args.length === 2 ? args[1] : (process.env.RABBITHOLE_PORT ?? '4317');
if (
  (args.length && !(args[0] === '--port' && args.length === 2)) ||
  !/^\d+$/.test(portText) ||
  Number(portText) > 65535
) {
  console.error(
    'Usage: npm start [-- --port 4318]. Choose a port from 1 to 65535, or 0 for an available port.',
  );
  process.exit(1);
}
const port = Number(portText);
let release, store, app, stopping, searxng;
function shutdown(code = 0) {
  return (stopping ??= (async () => {
    await app?.stop();
    await searxng?.stop();
    store?.close();
    await release?.();
    process.exit(code);
  })());
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    void shutdown();
  });
try {
  console.log(`Node ${process.versions.node}: requires Node 24 or newer.`);
  console.log(`Data directory: ${dir}`);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  // A second instance must not race a rotating OAuth refresh token or mark live replies interrupted.
  release = await lockfile.lock(dir, { realpath: true, stale: 10000 });
  searxng = searxngDownload(dir);
  store = new Store(join(dir, 'trees.sqlite'));
  if (store.backupPath) console.log(`Saved pre-upgrade backup: ${store.backupPath}`);
  store.pruneEmpty();
  const downloads = downloadManager([...videoTools(), searxng.tool]);
  const auth = new Auth(dir),
    claude = new Claude(dir, spawn, execFile, cliPath('claude')),
    endpoint = new OpenAI(dir),
    embed = localEmbedder(dir);
  app = createApp({
    store,
    auth,
    endpoint,
    providers: { claude, codex: new Codex(auth, dir, spawn, null, cliPath('codex')) },
    // Existing installs keep assuming Claude for an unset chat role; a fresh install assumes nothing.
    defaultProvider: store.assumesProvider ? 'claude' : null,
    dir,
    suggestions: true,
    verdicts: true,
    searxng: searxng.status,
    python: pythonTool({ dir }),
    videoEmbed: embed,
    pieceSnapshot: sandboxSnapshot,
    downloads,
  });
  await new Promise((resolve, reject) => {
    app.server.once('error', reject);
    app.server.listen(port, '127.0.0.1', resolve);
  });
  const url = `http://127.0.0.1:${app.server.address().port}`;
  console.log(`Rabbithole: ${url}`);
  // Set by npm start in an interactive terminal; a missing opener only leaves the printed address.
  if (process.env.RABBITHOLE_OPEN === '1')
    spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], {
      stdio: 'ignore',
      detached: true,
    })
      .on('error', () => {})
      .unref();
  // Downloads begin once first-run setup has ended; POST /api/setup starts them otherwise.
  if (store.setupFinished()) void downloads.start();
  // Local diagnostics only. Start listening first so a missing or slow CLI cannot prevent reading saved trees.
  const installed = (command) =>
    new Promise((resolve) =>
      execFile(
        command,
        ['--version'],
        { timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 65536 },
        (error) => resolve(!error),
      ),
    );
  const [hasClaude, hasCodex] = await Promise.all([installed('claude'), installed('codex')]);
  const signedIn = hasClaude && (await claude.status()).connected;
  console.log(
    !hasClaude
      ? 'Claude Code: not installed or could not run. Next: curl -fsSL https://claude.ai/install.sh | bash; then run claude and sign in with your Claude plan.'
      : signedIn
        ? 'Claude Code: installed and signed in. Next: choose New chat to ask a question.'
        : 'Claude Code: installed; signed out or sign-in could not be checked. Next: run claude in a terminal and sign in with your Claude plan; then reload Rabbithole to check sign-in again.',
  );
  console.log(
    !hasCodex
      ? `Codex: not installed or could not run; ChatGPT ${auth.status().connected ? 'connection saved' : 'not connected'}. Next: npm install -g @openai/codex; then Map menu > Settings > ${auth.status().connected ? 'Reconnect ChatGPT if needed' : 'Continue with ChatGPT'}.`
      : auth.status().connected
        ? 'Codex: installed; ChatGPT connection saved. Next: send a question to verify access, or Map menu > Settings > Reconnect ChatGPT if it fails.'
        : 'Codex: installed; ChatGPT not connected. Next: Map menu > Settings > Continue with ChatGPT and approve plan usage.',
  );
  console.log('Saved trees remain available without a provider. Press Ctrl+C to stop Rabbithole.');
} catch (error) {
  if (error.backupPath) console.error(`Saved pre-upgrade backup: ${error.backupPath}`);
  console.error(
    error.code === 'EADDRINUSE'
      ? `Port ${port} on 127.0.0.1 is already in use. Stop the other app or choose another port: npm start -- --port ${port === 65535 ? 4317 : port + 1} (use --port 0 for an available port).`
      : error.code === 'ELOCKED'
        ? `Rabbithole is already using data directory ${dir}. Stop that instance before restarting, or choose a different RABBITHOLE_DATA_DIR.`
        : error.message.startsWith('Database schema ')
          ? error.message
          : `Rabbithole could not start. Check write access and free disk space in ${dir}, then retry. See README.md for backup and restore.`,
  );
  await shutdown(1);
}
