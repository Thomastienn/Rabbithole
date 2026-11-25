import { accessSync, constants, readFileSync, statSync } from 'node:fs';
import { execFile, execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { delimiter, join, win32 } from 'node:path';

const runnable = (path) => {
    try {
        accessSync(path, constants.X_OK);
        return statSync(path).isFile();
    } catch {
        return false;
    }
};

const npmArgs = ['prefix', '-g'];
const npmOptions = { encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL' };
const npmPrefix = (env) => env.NPM_CONFIG_PREFIX ?? env.npm_config_prefix;
let npmBin;
export let pendingCliLookup;

// Resolve the optional npm fallback without blocking requests for saved trees during startup.
export function prepareCliLookup(...names) {
    if (
        process.platform === 'win32' ||
        npmPrefix(process.env) ||
        npmBin !== undefined ||
        names.every((name) => findCli(name, { npm: () => null }))
    )
        return;
    return (pendingCliLookup ??= new Promise((resolve) => {
        execFile('npm', npmArgs, npmOptions, (error, stdout) => {
            npmBin = error ? null : join(stdout.trim(), 'bin');
            resolve();
        });
    }));
}

// npm's global bin, asked once; a missing npm just skips this folder.
function globalNpmBin(env) {
    const prefix = npmPrefix(env);
    if (prefix) return join(prefix, 'bin');
    if (npmBin === undefined)
        try {
            npmBin = join(execFileSync('npm', npmArgs, npmOptions).trim(), 'bin');
        } catch {
            npmBin = null;
        }
    return npmBin;
}

// npm's .cmd shim ends by running "%dp0%\<target>" (a .exe, or a script after node.exe); spawn cannot run the .cmd without a shell.
const shimTarget = (shim, read) => {
    let source;
    try {
        source = read(shim);
    } catch {
        return null;
    }
    const targets = [...source.matchAll(/"%dp0%\\([^"]+)"/g)]
        .map((m) => m[1])
        .filter((t) => !/^node\.exe$/i.test(t));
    return targets.length ? win32.join(win32.dirname(shim), targets.at(-1)) : null;
};

function findWindowsCli(name, env, exists, read) {
    const dirs = [
        ...(env.PATH ?? '').split(';'),
        env.LOCALAPPDATA,
        // Where Codex's Windows installer puts it.
        env.LOCALAPPDATA && win32.join(env.LOCALAPPDATA, 'Programs', 'OpenAI', 'Codex', 'bin'),
        env.APPDATA && win32.join(env.APPDATA, 'npm'),
        env.USERPROFILE && win32.join(env.USERPROFILE, '.local', 'bin'),
    ].filter(Boolean);
    for (const dir of dirs) {
        const exe = win32.join(dir, `${name}.exe`),
            shim = win32.join(dir, `${name}.cmd`);
        if (exists(exe)) return exe;
        const target = exists(shim) && shimTarget(shim, read);
        if (target && exists(target)) return target;
    }
    return null;
}

// A found script runs with this server's own Node, so no shell or PATH lookup is involved.
export const launchArgs = (bin, args) =>
    /\.[cm]?js$/i.test(bin) ? [process.execPath, [bin, ...args]] : [bin, args];

// PATH first, then the usual install folders. Returns an absolute path, or null when missing.
export function findCli(
    name,
    {
        env = process.env,
        home = homedir(),
        exists = runnable,
        npm = () => globalNpmBin(env),
        platform = process.platform,
        read = (path) => readFileSync(path, 'utf8'),
    } = {},
) {
    if (platform === 'win32') return findWindowsCli(name, env, exists, read);
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
