import { execFile, spawn } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, win32 } from 'node:path';
import { pathToFileURL } from 'node:url';

// Desktop actions run fixed programs with argument arrays, never a shell; callers pass only server-derived paths.
const runFile = (cmd, args, options = {}) =>
    new Promise((resolve, reject) =>
        execFile(cmd, args, { timeout: 15000, ...options }, (error) =>
            error ? reject(error) : resolve(),
        ),
    );

// For launchers that stay attached to the file manager (xdg-open) or exit non-zero on success (explorer).
const detach = (cmd, args) =>
    new Promise((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
        child.on('error', reject).on('spawn', () => {
            child.unref();
            resolve();
        });
    });

// The path reaches PowerShell as an environment variable, so it is never parsed as script text.
const RECYCLE =
    'Add-Type -AssemblyName Microsoft.VisualBasic; $p = $env:RABBITHOLE_TRASH; ' +
    "$m = if (Test-Path -LiteralPath $p -PathType Container) { 'DeleteDirectory' } else { 'DeleteFile' }; " +
    "[Microsoft.VisualBasic.FileIO.FileSystem]::$m($p, 'OnlyErrorDialogs', 'SendToRecycleBin')";

export function desktopFor(platform = process.platform, run = runFile, open = detach) {
    if (platform === 'win32')
        return {
            reveal: (path) => open('explorer.exe', ['/select,', path]),
            trash: (path) =>
                run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', RECYCLE], {
                    env: { ...process.env, RABBITHOLE_TRASH: path },
                }),
        };
    return {
        // Ask the file manager to open the folder with the file selected; fall back to opening the folder.
        async reveal(path) {
            try {
                await run('gdbus', [
                    'call',
                    '--session',
                    '--dest',
                    'org.freedesktop.FileManager1',
                    '--object-path',
                    '/org/freedesktop/FileManager1',
                    '--method',
                    'org.freedesktop.FileManager1.ShowItems',
                    `[${JSON.stringify(pathToFileURL(path).href)}]`,
                    '""',
                ]);
            } catch {
                await open('xdg-open', [dirname(path)]);
            }
        },
        // Recoverable removal through the desktop trash; there is no permanent-delete fallback.
        trash: (path) => run('gio', ['trash', '--', path]),
    };
}

export const desktop = desktopFor();

// Shared by npm start and the desktop app on the same machine.
export const dataDir = (env = process.env, platform = process.platform, home = homedir()) =>
    platform === 'win32'
        ? win32.join(env.APPDATA, 'rabbithole')
        : join(env.XDG_DATA_HOME ?? join(home, '.local', 'share'), 'rabbithole');
