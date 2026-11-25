import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron';
import electronUpdater from 'electron-updater';
import {
    firstLaunch,
    navigation,
    saveLayout,
    serverUrl,
    startError,
    toolsDir,
    updateState,
} from './shell.mjs';

const here = dirname(fileURLToPath(import.meta.url));
// The staged resources (scripts/desktop-stage.mjs), run in place: the AppImage mount is read-only and nothing is copied.
const resources = app.isPackaged ? process.resourcesPath : join(here, 'stage');
const windows = process.platform === 'win32';
const SETPRIV = '/usr/bin/setpriv';
// The server's own data-folder rule, from the staged app, so the shell and the server agree on it.
const { dataDir } = await import(
    pathToFileURL(join(resources, 'app', 'server', 'desktop.mjs')).href
);
let server,
    origin = null;

const running = () =>
    server?.pid !== undefined && server.exitCode === null && server.signalCode === null;

// SIGTERM lets the server stop jobs, close the database and release its data-folder lock.
function stopServer() {
    return new Promise((done) => {
        if (!running()) return done();
        server.once('close', done);
        // shortcut: Windows has no SIGTERM, so kill() ends the server at once and its lock goes stale after 10 s; add a stop request if reopening quickly matters.
        server.kill('SIGTERM');
        setTimeout(() => server.kill('SIGKILL'), 10000).unref();
    });
}

// Checks published releases once; nothing downloads until the page asks, and nothing installs on quit.
function offerUpdates(window, restart) {
    const { autoUpdater } = electronUpdater;
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    let update = null;
    const set = (event) => {
        update = updateState(update, event);
        if (!window.isDestroyed()) window.webContents.send('update', update);
    };
    autoUpdater.on('update-available', ({ version }) =>
        set({ type: 'available', version, current: app.getVersion() }),
    );
    autoUpdater.on('update-not-available', () =>
        set({ type: 'not-available', current: app.getVersion() }),
    );
    autoUpdater.on('download-progress', (progress) => set({ type: 'progress', ...progress }));
    autoUpdater.on('update-downloaded', () => set({ type: 'downloaded' }));
    autoUpdater.on('error', (error) => {
        // A failed install does not quit, and the server is already stopped: close, so the old version opens again.
        if (update?.stage === 'restarting') return app.quit();
        set({ type: 'error', message: error?.message });
    });
    ipcMain.handle('update', async (event, action) => {
        if (!event.senderFrame?.url.startsWith(`${origin}/`)) return null;
        if (action === 'install' && ['available', 'failed'].includes(update?.stage)) {
            set({ type: 'install' });
            // A failed download also emits 'error', which the banner shows.
            autoUpdater.downloadUpdate().catch(() => {});
        } else if (action === 'restart' && update?.stage === 'ready') {
            set({ type: 'restart' });
            await restart();
            autoUpdater.quitAndInstall();
        }
        return update;
    });
    // A failed check (offline, no published release) also emits 'error', which leaves the banner hidden.
    autoUpdater.checkForUpdates().catch(() => {});
}

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
    const cwd = join(resources, 'app');
    // starting.html shows its progress bar for the 'first' class and fills it for 'ready'.
    const mark = (name) =>
        loaded
            .then(() =>
                window.webContents.executeJavaScript(`document.body.classList.add('${name}')`),
            )
            .catch(() => {});
    // Checked before the spawn, since the server creates its database on start.
    const first = firstLaunch(cwd, process.env, dataDir);
    if (first) void mark('first');
    server = spawn(command, argv, {
        cwd,
        env: {
            ...process.env,
            RABBITHOLE_TOOLS_DIR: toolsDir(cwd, process.env, dataDir),
            // CI stamps only the shell's version, so Settings learns it from here.
            RABBITHOLE_VERSION: app.getVersion(),
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
                // The bar fills before the window leaves the starting page.
                void (first ? mark('ready') : Promise.resolve()).then(
                    () => !window.isDestroyed() && window.loadURL(url),
                );
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
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            preload: join(here, 'preload.cjs'),
        },
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
    // Restart saves the layout and stops the server first, so the new version finds the data folder free.
    offerUpdates(window, async () => {
        await saveLayout((code) => window.webContents.executeJavaScript(code));
        saved = true;
        await stopServer();
    });
});

app.on('window-all-closed', () => app.quit());

app.on('before-quit', (event) => {
    if (!running()) return;
    event.preventDefault();
    // A menu quit or Cmd+Q closes the window first so its page saves; window-all-closed then quits again.
    const open = BrowserWindow.getAllWindows();
    if (open.length) return open.forEach((w) => w.close());
    void stopServer().then(() => app.quit());
});
