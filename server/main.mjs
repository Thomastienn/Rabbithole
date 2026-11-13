import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import lockfile from 'proper-lockfile';
import { Store } from './store.mjs';
import { Auth } from './auth.mjs';
import { Codex } from './codex.mjs';
import { Claude } from './claude.mjs';
import { OpenAI } from './openai.mjs';
import { createApp } from './app.mjs';

process.umask(0o077);
const dir = resolve(process.env.TREETUTOR_DATA_DIR ?? join(process.env.XDG_DATA_HOME ?? join(homedir(), '.local', 'share'), 'treetutor'));
const args = process.argv.slice(2);
const portText = args[0] === '--port' && args.length === 2 ? args[1] : process.env.TREETUTOR_PORT ?? '4317';
if ((args.length && !(args[0] === '--port' && args.length === 2)) || !/^\d+$/.test(portText) || Number(portText) > 65535) {
  console.error('Usage: npm start [-- --port 4318]. Choose a port from 1 to 65535, or 0 for an available port.');
  process.exit(1);
}
const port = Number(portText);
let release, store, app, stopping;
function shutdown(code = 0) {
  return stopping ??= (async () => {
    await app?.stop();
    store?.close();
    await release?.();
    process.exit(code);
  })();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void shutdown(); });
try {
  console.log(`Node ${process.versions.node}: requires Node 24 or newer.`);
  console.log(`Data directory: ${dir}`);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  // A second instance must not race a rotating OAuth refresh token or mark live replies interrupted.
  release = await lockfile.lock(dir, { realpath: true, stale: 10000 });
  store = new Store(join(dir, 'trees.sqlite'));
  if (store.backupPath) console.log(`Saved pre-upgrade backup: ${store.backupPath}`);
  store.pruneEmpty();
  const auth = new Auth(dir), claude = new Claude(dir), endpoint = new OpenAI(dir);
  app = createApp({ store, auth, endpoint, providers: { claude, codex: new Codex(auth, dir), ...(endpoint.status().configured && { openai: endpoint }) }, defaultProvider: 'claude', dir, suggestions: true });
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(port, '127.0.0.1', resolve); });
  console.log(`TreeTutor: http://127.0.0.1:${app.server.address().port}`);
  // Local diagnostics only. Start listening first so a missing or slow CLI cannot prevent reading saved trees.
  const installed = command => new Promise(resolve => execFile(command, ['--version'], { timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 65536 }, error => resolve(!error)));
  const [hasClaude, hasCodex] = await Promise.all([installed('claude'), installed('codex')]);
  const signedIn = hasClaude && (await claude.status()).connected;
  console.log(!hasClaude ? 'Claude Code: not installed or could not run. Next: curl -fsSL https://claude.ai/install.sh | bash; then run claude and sign in with your Claude plan.'
    : signedIn ? 'Claude Code: installed and signed in. Next: choose New chat to ask a question.'
    : 'Claude Code: installed; signed out or sign-in could not be checked. Next: run claude in a terminal and sign in with your Claude plan; then reload TreeTutor to check sign-in again.');
  console.log(!hasCodex ? `Codex: not installed or could not run; ChatGPT ${auth.status().connected ? 'connection saved' : 'not connected'}. Next: npm install -g @openai/codex; then Map menu > Settings > ${auth.status().connected ? 'Reconnect ChatGPT if needed' : 'Continue with ChatGPT'}.`
    : auth.status().connected ? 'Codex: installed; ChatGPT connection saved. Next: send a question to verify access, or Map menu > Settings > Reconnect ChatGPT if it fails.'
    : 'Codex: installed; ChatGPT not connected. Next: Map menu > Settings > Continue with ChatGPT and approve plan usage.');
  console.log('Saved trees remain available without a provider. Press Ctrl+C to stop TreeTutor.');
} catch (error) {
  if (error.backupPath) console.error(`Saved pre-upgrade backup: ${error.backupPath}`);
  console.error(error.code === 'EADDRINUSE' ? `Port ${port} on 127.0.0.1 is already in use. Stop the other app or choose another port: npm start -- --port ${port === 65535 ? 4317 : port + 1} (use --port 0 for an available port).`
    : error.code === 'ELOCKED' ? `TreeTutor is already using data directory ${dir}. Stop that instance before restarting, or choose a different TREETUTOR_DATA_DIR.`
    : error.message.startsWith('Database schema ') ? error.message
    : `TreeTutor could not start. Check write access and free disk space in ${dir}, then retry. See README.md for backup and restore.`);
  await shutdown(1);
}
