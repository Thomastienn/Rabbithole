import { execFile, spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

// Desktop actions run fixed programs with argument arrays, never a shell; callers pass only server-derived paths.
const run = (cmd, args) => new Promise((resolve, reject) => execFile(cmd, args, { timeout: 15000 }, error => error ? reject(error) : resolve()));

export const desktop = {
  // Ask the file manager to open the folder with the file selected; fall back to opening the folder.
  async reveal(path) {
    try {
      await run('gdbus', ['call', '--session', '--dest', 'org.freedesktop.FileManager1', '--object-path', '/org/freedesktop/FileManager1',
        '--method', 'org.freedesktop.FileManager1.ShowItems', `[${JSON.stringify(pathToFileURL(path).href)}]`, '""']);
    } catch {
      // xdg-open may stay attached to the launched file manager, so detach once it has started.
      await new Promise((resolve, reject) => {
        const child = spawn('xdg-open', [dirname(path)], { stdio: 'ignore', detached: true });
        child.on('error', reject).on('spawn', () => { child.unref(); resolve(); });
      });
    }
  },
  // Recoverable removal through the desktop trash; there is no permanent-delete fallback.
  trash: path => run('gio', ['trash', '--', path]),
};
