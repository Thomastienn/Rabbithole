import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { app, BrowserWindow, nativeTheme, shell } from 'electron';
import { navigation, saveLayout, serverUrl, startError } from './shell.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// The staged resources (scripts/desktop-stage.mjs), run in place: the AppImage mount is read-only and nothing is copied.
const resources = app.isPackaged ? process.resourcesPath : join(here, 'stage');
const windows = process.platform === 'win32';
const SETPRIV = '/usr/bin/setpriv';
let server,
    origin = null;

const running = () =>
    server?.pid !== undefined && server.exitCode === null && server.signalCode === null;

function showError(window, message) {
    if (window.isDestroyed()) return;
    void window.webContents.executeJavaScript(
        `document.getElementById('status').outerHTML = '<pre id=status></pre>'; document.getElementById('status').textContent = ${JSON.stringify(message)};`,
    );
}

function startServer(window, loaded) {
    const node = join(resources, windows ? 'node.exe' : 'node');
    const args = [join(resources, 'app', 'server', 'main.mjs'), '--port', '0'];
    // On Linux the server gets SIGTERM if the shell dies without quitting, so it still releases the data folder.
    const [command, argv] =
        process.platform === 'linux' && existsSync(SETPRIV)
            ? [SETPRIV, ['--pdeathsig', 'SIGTERM', node, ...args]]
            : [node, args];
    server = spawn(command, argv, {
        cwd: join(resources, 'app'),
        env: {
            ...process.env,
            RABBITHOLE_TOOLS_DIR: join(resources, 'tools'),
            // Model-written code runs through the bundled launcher (desktop/sandbox) beside the Codex helpers.
            ...(windows && { RABBITHOLE_SANDBOX: join(resources, 'rabbithole-sandbox.exe') }),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
    });
    let url = null,
        log = '';
    for (const stream of [server.stdout, server.stderr])
        createInterface({ input: stream }).on('line', (line) => {
            console.log(line);
            if (url) return;
            url = serverUrl(line);
            if (!url) log += `${line}\n`;
            else if (!window.isDestroyed()) {
                origin = new URL(url).origin;
                void window.loadURL(url);
            }
        });
    server.on('error', (error) =>
        loaded.then(() =>
            showError(window, `Rabbithole could not start its server: ${error.message}`),
        ),
    );
    // 'close' comes after both output streams end, so the log is complete.
    server.on('close', (code, signal) => {
        if (!url && server.pid !== undefined)
            loaded.then(() => showError(window, startError(log, code, signal)));
    });
}

app.whenReady().then(() => {
    const window = new BrowserWindow({
        width: 1280,
        height: 840,
        title: 'Rabbithole',
        icon: join(here, 'icons', 'icon.png'),
        autoHideMenuBar: true,
        // starting.html's --bg, so the window does not flash white before the page paints.
        backgroundColor: nativeTheme.shouldUseDarkColors ? '#14171d' : '#f6f8fa',
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    });
    const guard = (event) => {
        if (!event.isMainFrame) return;
        const decision = navigation(event.url, origin);
        if (decision === 'allow') return;
        event.preventDefault();
        if (decision === 'external') void shell.openExternal(event.url);
    };
    // The page saves its pending map layout before the window closes, while the server still runs.
    let saving = false,
        saved = false;
    window.on('close', (event) => {
        if (saved) return;
        event.preventDefault();
        if (saving) return;
        saving = true;
        void saveLayout((code) => window.webContents.executeJavaScript(code)).then(() => {
            saved = true;
            if (!window.isDestroyed()) window.close();
        });
    });
    window.webContents.on('will-navigate', guard);
    window.webContents.on('will-redirect', guard);
    // New windows, such as sign-in pages, are refused; with no origin allowed, their http(s) links go to the default browser.
    window.webContents.setWindowOpenHandler(({ url }) => {
        if (navigation(url, null) === 'external') void shell.openExternal(url);
        return { action: 'deny' };
    });
    // Downloads (an exported MP4) set no save path, so Electron asks where to save with the native dialog.
    // Loading the server's address aborts this page's load; the error only matters for showError's wait.
    const loaded = window.loadFile(join(here, 'starting.html')).catch(() => {});
    startServer(window, loaded);
});

app.on('window-all-closed', () => app.quit());

// SIGTERM lets the server stop jobs, close the database and release its data-folder lock.
app.on('before-quit', (event) => {
    if (!running()) return;
    event.preventDefault();
    // A menu quit or Cmd+Q closes the window first so its page saves; window-all-closed then quits again.
    const open = BrowserWindow.getAllWindows();
    if (open.length) return open.forEach((w) => w.close());
    server.once('close', () => app.quit());
    // shortcut: Windows has no SIGTERM, so kill() ends the server at once and its lock goes stale after 10 s; add a stop request if reopening quickly matters.
    server.kill('SIGTERM');
    setTimeout(() => server.kill('SIGKILL'), 10000).unref();
});
