import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIsCurrent } from './build-state.mjs';

// Packs the built app, production node_modules and the official Node 24 runtime into desktop/stage/app.tar for Tauri to bundle.
const root = fileURLToPath(new URL('..', import.meta.url));
const stage = join(root, 'desktop', 'stage');
const app = join(stage, 'app');
// Pinned official build; a distro or Homebrew node may link shared libraries the learner lacks.
const NODE = {
  version: '24.22.3',
  'linux-x64': '4f2b175a6d53a5c617a80dba2676238a0688cef28c6da4eba35c7d844e66fcfb',
};
const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, stdio: 'inherit' });

if (!buildIsCurrent()) run('npm', ['run', 'build']);
rmSync(stage, { recursive: true, force: true });
mkdirSync(app, { recursive: true });
for (const name of ['dist', 'server', 'scripts', 'src', 'package.json', 'package-lock.json'])
  cpSync(join(root, name), join(app, name), { recursive: true });
run('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], app);
const target = `${process.platform}-${process.arch}`;
if (!NODE[target]) throw new Error(`The desktop app builds on linux-x64 only; this is ${target}.`);
const name = `node-v${NODE.version}-${target}`;
const archive = join(stage, `${name}.tar.xz`);
run('curl', ['-fsSL', '-o', archive, `https://nodejs.org/dist/v${NODE.version}/${name}.tar.xz`]);
if (createHash('sha256').update(readFileSync(archive)).digest('hex') !== NODE[target])
  throw new Error(`${name}.tar.xz does not match its pinned SHA-256; not bundling it.`);
run('tar', ['-xJf', archive, '-C', app, '--strip-components', '2', `${name}/bin/node`]);
rmSync(archive);
// The shell re-extracts the app when this stamp differs from the one it wrote after the last extraction.
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
writeFileSync(join(stage, 'app.build'), `${commit} ${new Date().toISOString()}\n`);
run('tar', ['-cf', join(stage, 'app.tar'), '-C', app, '.']);
rmSync(app, { recursive: true, force: true });
