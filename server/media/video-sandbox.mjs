import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const REPO = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');

// Bundling and Chromium run generated code: no network, an empty home, read-only system, and only this workspace writable.
// The learner's home and app-data directory are hidden; attempts are grouped by their owning artifact.
export const SANDBOX = (workspace) => [
  '--ro-bind',
  '/',
  '/',
  '--tmpfs',
  homedir(),
  '--tmpfs',
  resolve(workspace, /^cut-\d+$/.test(basename(workspace)) ? '../../../..' : '../../..'),
  '--tmpfs',
  '/tmp',
  '--tmpfs',
  '/run/user',
  '--ro-bind',
  join(REPO, 'node_modules'),
  join(REPO, 'node_modules'),
  '--ro-bind',
  join(REPO, 'server', 'media', 'video-render.mjs'),
  join(REPO, 'server', 'media', 'video-render.mjs'),
  '--bind',
  workspace,
  workspace,
  ...['public', 'narration.json'].flatMap((name) =>
    existsSync(join(workspace, name))
      ? ['--ro-bind', join(workspace, name), join(workspace, name)]
      : [],
  ),
  '--chdir',
  workspace,
  '--unshare-all',
  '--die-with-parent',
  '--new-session',
  '--dev',
  '/dev',
  '--proc',
  '/proc',
  '--clearenv',
  '--setenv',
  'PATH',
  '/usr/bin:/bin',
  '--setenv',
  'HOME',
  workspace,
  '--setenv',
  'TMPDIR',
  join(workspace, 'tmp'),
];

export function sandboxProcess(workspace, command, signal, onProgress, budget, binds = []) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('bwrap', [...SANDBOX(workspace), ...binds, ...command], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {},
    });
    let out = '';
    child.stdout.on('data', (chunk) => {
      out = (out + chunk).slice(-4096);
      // Progress lines are {"progress":0..1}; the last line is the result.
      for (const line of out.split('\n').slice(-3, -1)) {
        const value = /^\{"progress":([\d.]+)\}$/.exec(line)?.[1];
        if (value) onProgress(Math.min(1, Number(value)));
      }
    });
    // Diagnostics stay in the job workspace process; never forwarded to chat or tutor.
    child.stderr.resume();
    const kill = () => child.kill('SIGKILL');
    // Rendering scales with narration; retain a finite attempt budget without a short-video duration cap.
    const timer = setTimeout(kill, budget);
    signal.addEventListener('abort', kill, { once: true });
    if (signal.aborted) kill();
    child.on('error', () => reject(new Error('Video renderer could not start.')));
    child.on('close', (code) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', kill);
      if (signal.aborted) return reject(signal.reason ?? new Error('Video generation cancelled.'));
      try {
        if (code) throw new Error();
        const result = JSON.parse(out.trim().split('\n').at(-1));
        if (result.error)
          return reject(
            Object.assign(new Error(result.error), { manimUnavailable: result.unavailable }),
          );
        resolvePromise(result);
      } catch {
        reject(new Error(code === null ? 'Video rendering timed out.' : 'Video rendering failed.'));
      }
    });
  });
}
