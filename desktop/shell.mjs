import { join, resolve } from 'node:path';

// The shell's decisions, free of Electron so node --test checks them without opening a window.

// The server prints `Rabbithole: <url>` once it listens on loopback.
export function serverUrl(line) {
    return /^Rabbithole: (http:\/\/127\.0\.0\.1:\d+)$/.exec(line.trimEnd())?.[1] ?? null;
}

// The window stays on the server's origin; other web links go to the default browser and other schemes nowhere.
export function navigation(url, origin) {
    let target;
    try {
        target = new URL(url);
    } catch {
        return 'refuse';
    }
    if (target.origin === origin) return 'allow';
    return target.protocol === 'http:' || target.protocol === 'https:' ? 'external' : 'refuse';
}

// Shown in the window when the server exits before printing its address.
export function startError(output, code, signal) {
    return (
        output.trim() ||
        `Rabbithole's server stopped before it started (${signal ?? `exit code ${code}`}).`
    );
}

// Asks the page to write its pending map layout, waiting at most `ms` for a hung page.
export function saveLayout(run, ms = 3000) {
    return Promise.race([
        run('globalThis.rabbitholeSaveLayout?.()').catch(() => {}),
        new Promise((done) => setTimeout(done, ms).unref()),
    ]);
}

// Add-ons install into a tools folder in the server's data folder (server/main.mjs, resolved from the server's cwd),
// so the app never writes into its own, read-only folder and an app update keeps them.
export const toolsDir = (cwd, env, dataDir) =>
    join(resolve(cwd, env.RABBITHOLE_DATA_DIR ?? dataDir()), 'tools');
