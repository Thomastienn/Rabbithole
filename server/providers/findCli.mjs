import { accessSync, constants, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

const runnable = (path) => {
  try {
    accessSync(path, constants.X_OK);
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

let npmBin;
// npm's global bin, asked once; a missing npm just skips this folder.
function globalNpmBin(env) {
  const prefix = env.NPM_CONFIG_PREFIX ?? env.npm_config_prefix;
  if (prefix) return join(prefix, 'bin');
  if (npmBin === undefined)
    try {
      npmBin = join(
        execFileSync('npm', ['prefix', '-g'], { encoding: 'utf8', timeout: 5000 }).trim(),
        'bin',
      );
    } catch {
      npmBin = null;
    }
  return npmBin;
}

// PATH first, then the usual Linux install folders. Returns an absolute path, or null when missing.
// shortcut: Linux folders only; Windows folders and .cmd shims come with the Windows build ticket.
export function findCli(
  name,
  { env = process.env, home = homedir(), exists = runnable, npm = () => globalNpmBin(env) } = {},
) {
  const dirs = [
    ...(env.PATH ?? '').split(delimiter).filter(Boolean),
    join(home, '.local', 'bin'),
    join(home, '.claude', 'local'),
    env.HOMEBREW_PREFIX && join(env.HOMEBREW_PREFIX, 'bin'),
    '/home/linuxbrew/.linuxbrew/bin',
    join(home, '.linuxbrew', 'bin'),
  ].filter(Boolean);
  const found = dirs.map((d) => join(d, name)).find(exists);
  if (found) return found;
  const bin = npm();
  return bin && exists(join(bin, name)) ? join(bin, name) : null;
}

// Remembers a found CLI; re-detects when it was missing or has since moved, so "Check again" needs no restart.
export function cliPath(name, find = findCli, exists = runnable) {
  let path = null;
  return () => (path && exists(path) ? path : (path = find(name)));
}
