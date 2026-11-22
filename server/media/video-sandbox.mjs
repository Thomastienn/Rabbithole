import { spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readlinkSync } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import { join, basename, dirname, resolve, win32 } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { videoBrowser } from './manim.mjs';

export const REPO = fileURLToPath(new URL('../..', import.meta.url)).replace(/\/$/, '');

// The only host folders model-written code sees besides its own binds: programs, libraries and their config, read-only.
// The rest of the disk (/run with Docker and D-Bus sockets, /media, /mnt, /home) is absent; a distro's /bin or /lib that
// links into /usr stays a link. Debian's TeX Live keeps its formats in /var/lib/texmf, and Homebrew on Linux installs
// Node with its own loader and libraries under /home/linuxbrew.
export const SYSTEM_DIRS = [
    '/usr',
    '/etc',
    '/bin',
    '/sbin',
    '/lib',
    '/lib32',
    '/lib64',
    '/var/lib/texmf',
    '/var/cache/fontconfig',
    '/home/linuxbrew/.linuxbrew',
];
export const systemBinds = () =>
    SYSTEM_DIRS.flatMap((dir) => {
        const entry = lstatSync(dir, { throwIfNoEntry: false });
        if (!entry) return [];
        return entry.isSymbolicLink()
            ? ['--symlink', readlinkSync(dir), dir]
            : ['--ro-bind', dir, dir];
    });

// Bundling and Chromium run generated code: no network, an empty home, read-only system, and only this workspace writable.
// The learner's home and app-data directory are hidden; attempts are grouped by their owning artifact.
export const SANDBOX = (workspace) => [
    ...systemBinds(),
    '--tmpfs',
    homedir(),
    '--tmpfs',
    resolve(workspace, /^cut-\d+$/.test(basename(workspace)) ? '../../../..' : '../../..'),
    '--tmpfs',
    '/tmp',
    '--ro-bind',
    join(REPO, 'node_modules'),
    join(REPO, 'node_modules'),
    // The desktop app's bundled Node lives under the hidden home.
    '--ro-bind',
    process.execPath,
    process.execPath,
    '--ro-bind',
    join(REPO, 'server', 'media', 'video-render.mjs'),
    join(REPO, 'server', 'media', 'video-render.mjs'),
    // The video browser, which a tool root keeps outside node_modules; no network means no download in the sandbox.
    ...(existsSync(videoBrowser())
        ? ['--ro-bind', dirname(videoBrowser()), dirname(videoBrowser())]
        : []),
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
    // LaTeX's font and format caches; TinyTeX would otherwise write them into its own read-only folder.
    '--setenv',
    'TEXMFVAR',
    join(workspace, 'tmp', 'texmf-var'),
];

// bwrap flags and how many values follow each; the first other word starts the command.
const BWRAP = {
    '--ro-bind': 2,
    '--bind': 2,
    '--symlink': 2,
    '--setenv': 2,
    '--tmpfs': 1,
    '--chdir': 1,
    '--dev': 1,
    '--proc': 1,
    '--unshare-all': 0,
    '--die-with-parent': 0,
    '--new-session': 0,
    '--clearenv': 0,
};

// The Windows launcher reads the same rules: read binds become --read and the one writable bind the workspace.
// Hidden mounts and the POSIX system folders need nothing, as the sandbox account cannot see the learner's home or app data
// and reads Windows' own system; PATH holds POSIX folders.
export function launcherArgs(args) {
    const out = [];
    let i = 0;
    for (; i < args.length && args[i] in BWRAP; i += 1 + BWRAP[args[i]]) {
        const [flag, a, b] = args.slice(i, i + 3);
        if (flag === '--bind') out.push('--workspace', a);
        else if (flag === '--ro-bind' && !SYSTEM_DIRS.includes(a)) out.push('--read', a);
        else if (flag === '--setenv' && a !== 'PATH') out.push('--env', `${a}=${b}`);
    }
    return [...out, '--', ...args.slice(i)];
}

// Every model-written code run: bwrap on Linux, the desktop app's codex-windows-sandbox launcher on Windows.
// The trusted launcher keeps the server's environment for its own state; the command gets only the --env values.
// The launcher sits in the install folder beside Node, the server and the tools, which the sandbox account must read:
// it lies under the learner's %LOCALAPPDATA%, which that account cannot otherwise see.
export function sandboxCommand(args, platform = process.platform) {
    const launcher = process.env.RABBITHOLE_SANDBOX;
    return platform === 'win32'
        ? [launcher, ['--read', win32.dirname(launcher), ...launcherArgs(args)], process.env]
        : ['bwrap', args, {}];
}

// Null when model-written code can run; on Windows the launcher must exist and its one-time setup be done.
export function sandboxMissing({
    platform = process.platform,
    launcher = process.env.RABBITHOLE_SANDBOX,
    probe = spawnSync,
} = {}) {
    if (platform !== 'win32') return null;
    if (launcher && probe(launcher, ['--check'], { timeout: 10000 }).status === 0) return null;
    return 'Video making needs the Windows sandbox. Enable it in Settings, then ask again.';
}

// The Windows sandbox's one-time setup, from first-run setup or Settings; `--setup` shows the one UAC prompt.
export function windowsSandbox({
    platform = process.platform,
    launcher = process.env.RABBITHOLE_SANDBOX,
    probe = spawnSync,
    run = spawn,
} = {}) {
    const status = () => ({
        windows: platform === 'win32',
        ready: !sandboxMissing({ platform, launcher, probe }),
    });
    const enable = () =>
        new Promise((done) => {
            if (platform !== 'win32' || !launcher) return done(status());
            // Declining UAC exits non-zero; either way the --check that follows reports the result.
            const child = run(launcher, ['--setup'], { stdio: 'ignore' });
            child.on('error', () => done(status()));
            child.on('close', () => done(status()));
        });
    return { status, enable };
}

export function sandboxProcess(workspace, command, signal, onProgress, budget, binds = []) {
    return new Promise((resolvePromise, reject) => {
        const [program, args, env] = sandboxCommand([...SANDBOX(workspace), ...binds, ...command]);
        const child = spawn(program, args, { stdio: ['ignore', 'pipe', 'pipe'], env });
        let out = '';
        child.stdout.on('data', (chunk) => {
            out = (out + chunk).slice(-4096);
            // Progress lines are {"progress":0..1}; the last line is the result.
            for (const line of out.split('\n').slice(-3, -1)) {
                const value = /^\{"progress":([\d.]+)\}$/.exec(line)?.[1];
                if (value) onProgress(Math.min(1, Number(value)));
            }
        });
        // Diagnostics stay in the server; only their first error line, paths removed, reaches a repair call.
        let err = '';
        child.stderr.on('data', (chunk) => {
            err = (err + chunk).slice(0, 65536);
        });
        const kill = () => child.kill('SIGKILL');
        // Rendering scales with narration; retain a finite attempt budget without a short-video duration cap.
        const timer = setTimeout(kill, budget);
        signal.addEventListener('abort', kill, { once: true });
        if (signal.aborted) kill();
        child.on('error', () => reject(new Error('Video renderer could not start.')));
        child.on('close', (code) => {
            clearTimeout(timer);
            signal.removeEventListener('abort', kill);
            if (signal.aborted)
                return reject(signal.reason ?? new Error('Video generation cancelled.'));
            const diagnostic = code === null ? undefined : firstDiagnostic(err);
            try {
                if (code) throw new Error();
                const result = JSON.parse(out.trim().split('\n').at(-1));
                if (result.error)
                    return reject(
                        Object.assign(new Error(result.error), {
                            manimUnavailable: result.unavailable,
                            diagnostic,
                        }),
                    );
                resolvePromise(result);
            } catch {
                reject(
                    Object.assign(
                        new Error(
                            code === null
                                ? 'Video rendering timed out.'
                                : 'Video rendering failed.',
                        ),
                        { diagnostic },
                    ),
                );
            }
        });
    });
}

// A file the sandbox wrote, as its stat when it is an ordinary file (not a link) directly in the workspace's output, else null.
export async function sandboxOutput(workspace, file) {
    const stat = await lstat(file).catch(() => null);
    const expected = join(await realpath(workspace), 'out', basename(file));
    return stat?.isFile() && (await realpath(file).catch(() => null)) === expected ? stat : null;
}

// Absolute paths (and file:// URLs) name private directories; the line and column after them stay.
export const withoutPaths = (text) =>
    text.replace(/(?:file:\/\/)?(?<![\w.~-])(?:\/[^\s'"`:()<>,/]+)+\/?/g, '[path]');

// The first line naming an error (Node "TypeError: …", Python "ValueError: …"), else the first non-empty line.
export function firstDiagnostic(stderr) {
    const lines = stderr
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    const line = lines.find((l) => /\b\w*(?:Error|Exception)\b(?: \[\w+\])?:/.test(l)) ?? lines[0];
    return line && withoutPaths(line).slice(0, 500);
}
