import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIsCurrent } from './build-state.mjs';

// Packs the built app, production node_modules and the official Node 24 runtime into desktop/stage/app.tar for Tauri to bundle.
// On Windows it also builds the sandbox launcher and its Codex helpers into desktop/stage.
const root = fileURLToPath(new URL('..', import.meta.url));
const stage = join(root, 'desktop', 'stage');
const app = join(stage, 'app');
// Pinned official build; a distro or Homebrew node may link shared libraries the learner lacks.
const NODE = {
  version: '24.22.3',
  'linux-x64': '4f2b175a6d53a5c617a80dba2676238a0688cef28c6da4eba35c7d844e66fcfb',
  'win32-x64': 'e612af99f626ab415ea225af6bce5c971feb448cb5cae250bb1c3fa50c5f7d9f',
};
const windows = process.platform === 'win32';
// Windows needs a shell to run npm.cmd; its arguments here are fixed words.
const run = (command, args, cwd = root) =>
  execFileSync(command, args, { cwd, stdio: 'inherit', shell: windows && command === 'npm' });
// Windows' own bsdtar reads zips and C:\ paths; a Git-for-Windows GNU tar earlier on PATH does neither.
const tar = windows ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';

if (!buildIsCurrent()) run('npm', ['run', 'build']);
rmSync(stage, { recursive: true, force: true });
mkdirSync(app, { recursive: true });
for (const name of ['dist', 'server', 'scripts', 'src', 'package.json', 'package-lock.json'])
  cpSync(join(root, name), join(app, name), { recursive: true });
run('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], app);
const target = `${process.platform}-${process.arch}`;
if (!NODE[target])
  throw new Error(`The desktop app builds on linux-x64 and win32-x64 only; this is ${target}.`);
const name = `node-v${NODE.version}-${target.replace('win32', 'win')}`;
const file = `${name}.${windows ? 'zip' : 'tar.xz'}`;
const archive = join(stage, file);
run('curl', ['-fsSL', '-o', archive, `https://nodejs.org/dist/v${NODE.version}/${file}`]);
if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== NODE[target])
  throw new Error(`${file} does not match its pinned SHA-256; not bundling it.`);
if (windows) run(tar, ['-xf', archive, '-C', app, '--strip-components', '1', `${name}/node.exe`]);
else run(tar, ['-xJf', archive, '-C', app, '--strip-components', '2', `${name}/bin/node`]);
rmSync(archive);
if (windows) {
  // The Codex helpers must sit beside the launcher (desktop/sandbox/Cargo.toml).
  const bins = ['rabbithole-sandbox', 'codex-command-runner', 'codex-windows-sandbox-setup'];
  const sandbox = join(root, 'desktop', 'sandbox');
  run(
    'cargo',
    [
      'build',
      '--release',
      '-p',
      'rabbithole-sandbox',
      '-p',
      'codex-windows-sandbox',
      ...bins.flatMap((bin) => ['--bin', bin]),
    ],
    sandbox,
  );
  for (const bin of bins)
    cpSync(join(sandbox, 'target', 'release', `${bin}.exe`), join(stage, `${bin}.exe`));
}
// The shell re-extracts the app when this stamp differs from the one it wrote after the last extraction.
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
writeFileSync(join(stage, 'app.build'), `${commit} ${new Date().toISOString()}\n`);
run(tar, ['-cf', join(stage, 'app.tar'), '-C', app, '.']);
rmSync(app, { recursive: true, force: true });
