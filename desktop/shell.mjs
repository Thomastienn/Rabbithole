import { cpSync, existsSync, readdirSync, renameSync, rmdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve, win32 } from 'node:path';

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

// The installed Windows app keeps the learner's data, its add-ons and Electron's profile in a data folder inside the
// install folder (ADR 0025), beside Rabbithole.exe; Linux and unpackaged runs keep the server's default.
export const installedDataDir = (platform, packaged, execPath) =>
    platform === 'win32' && packaged ? win32.join(win32.dirname(execPath), 'data') : null;

// Same entries with the same sizes, so a copy is known complete before its source is deleted.
const sameFiles = (a, b) =>
    readdirSync(a, { recursive: true }).every((entry) => {
        const [x, y] = [statSync(join(a, entry)), statSync(join(b, entry), { throwIfNoEntry: false })];
        return y && x.isDirectory() === y.isDirectory() && (x.isDirectory() || x.size === y.size);
    });

// An upgrade from a version that kept data (and Electron's profile) in `from` moves it into `to` before the server
// starts: a rename on one drive, otherwise a checked copy, then the old folder goes. Returns the folder to use: `from`
// when the move failed, which stays untouched. The copy lands in a staging folder first, so a half-finished one never
// leaves a database in `to` that would stop the next launch from trying again.
export function moveOldData(from, to, log = console.error, rename = renameSync) {
    if (existsSync(join(to, 'trees.sqlite')) || !existsSync(from)) return to;
    const staging = `${to}.moving`;
    try {
        // Only an empty data folder gives way; one with files but no database is left alone.
        if (existsSync(to)) rmdirSync(to);
        try {
            rename(from, to);
            return to;
        } catch (error) {
            if (error.code !== 'EXDEV') throw error;
        }
        rmSync(staging, { recursive: true, force: true });
        cpSync(from, staging, { recursive: true });
        if (!sameFiles(from, staging)) throw new Error(`the copy in ${staging} does not match`);
        renameSync(staging, to);
    } catch (error) {
        log(`Rabbithole could not move its data from ${from} to ${to}, so it uses ${from}: ${error.message}`);
        // Best effort, so startup goes on: the next launch clears the staging folder before it copies again.
        try {
            rmSync(staging, { recursive: true, force: true });
        } catch {}
        return from;
    }
    try {
        rmSync(from, { recursive: true });
    } catch (error) {
        log(`Rabbithole moved its data to ${to} but could not delete ${from}: ${error.message}`);
    }
    return to;
}

// The update banner's state: null (nothing to show), then available, downloading, ready or failed, and restarting;
// current when the check found nothing newer, which only Settings shows.
// A failed check stays null, so being offline shows nothing; only a failed download is shown, with its reason.
export function updateState(state, event) {
    switch (event.type) {
        case 'available':
            return { stage: 'available', version: event.version, current: event.current };
        case 'not-available':
            return { stage: 'current', version: event.current, current: event.current };
        case 'install':
            return state?.stage === 'available' || state?.stage === 'failed'
                ? { ...state, stage: 'downloading', percent: 0, transferred: 0, total: 0 }
                : state;
        case 'progress':
            return state?.stage === 'downloading'
                ? {
                      ...state,
                      percent: Math.floor(event.percent),
                      transferred: event.transferred,
                      total: event.total,
                  }
                : state;
        case 'downloaded':
            return state && { ...state, stage: 'ready' };
        case 'restart':
            return state?.stage === 'ready' ? { ...state, stage: 'restarting' } : state;
        case 'error':
            return state?.stage === 'downloading'
                ? { ...state, stage: 'failed', reason: updateFailure(event.message) }
                : state;
        default:
            return state;
    }
}

// electron-updater's errors carry URLs and stack-like detail; the banner shows one short sentence.
function updateFailure(message = '') {
    return /net::|ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|socket|network/i.test(message)
        ? 'The connection dropped. Check it, then retry.'
        : 'Something went wrong while downloading. Try again.';
}
