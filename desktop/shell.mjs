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

// The update banner's state: null (nothing to show), then available, downloading, ready or failed, and restarting.
// A failed check stays null, so being offline shows nothing; only a failed download is shown, with its reason.
export function updateState(state, event) {
    switch (event.type) {
        case 'available':
            return { stage: 'available', version: event.version, current: event.current };
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
