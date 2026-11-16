import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildIsCurrent } from './build-state.mjs';
import { ensureManim } from './manim-setup.mjs';
import { ensurePython } from './python-setup.mjs';

if (Number(process.versions.node.split('.')[0]) < 24) {
  console.error(
    `Rabbithole requires Node 24 or newer; found ${process.versions.node}. Install Node 24+ from https://nodejs.org/, reopen your terminal, then run npm start.`,
  );
  process.exit(1);
}
process.chdir(fileURLToPath(new URL('..', import.meta.url)));
let child;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child?.kill(signal));
function run(command, args) {
  return new Promise((resolve, reject) => {
    child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      child = null;
      resolve(code ?? (signal === 'SIGINT' ? 130 : 1));
    });
  });
}
async function npm(args) {
  const code = await (process.env.npm_execpath
    ? run(process.execPath, [process.env.npm_execpath, ...args])
    : run('npm', args));
  if (code)
    throw new Error(
      `npm ${args.join(' ')} failed (exit ${code}). Fix the error above, then run npm start again.`,
    );
}
try {
  if (
    !existsSync('node_modules/.package-lock.json') ||
    !existsSync('node_modules/typescript/bin/tsc') ||
    !existsSync('node_modules/vite/bin/vite.js') ||
    !existsSync('node_modules/@andresaya/edge-tts/package.json') ||
    !existsSync('node_modules/@remotion/three/package.json')
  ) {
    console.log(
      'Installing dependencies (npm ci --include=dev). Internet access may be needed on first run.',
    );
    await npm(['ci', '--include=dev']);
  }
  await ensureManim({ run });
  await ensurePython({ run });
  // Import after npm installation so a fresh checkout can provision its dependencies.
  const { ensureBrowser } = await import('@remotion/renderer');
  try {
    await ensureBrowser({ chromeMode: 'headless-shell', logLevel: 'error' });
  } catch {
    console.warn(
      'Video browser setup failed. Check network access and restart to provision it; saved trees and videos remain available.',
    );
  }
  if (!buildIsCurrent()) {
    console.log('Building Rabbithole: built assets are missing or stale.');
    await npm(['run', 'build']);
  }
  process.exitCode = await run(process.execPath, ['server/main.mjs', ...process.argv.slice(2)]);
} catch (error) {
  console.error(
    error.code === 'ENOENT'
      ? 'npm could not be found. Install Node 24+ with npm, reopen your terminal, then run npm start.'
      : error.message,
  );
  process.exitCode = 1;
}
