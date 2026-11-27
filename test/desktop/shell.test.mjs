import assert from 'node:assert/strict';
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { dataDir } from '../../server/desktop.mjs';
import {
    discordActivity,
    discordFrame,
    discordSockets,
    firstLaunch,
    installedDataDir,
    moveOldData,
    navigation,
    permitted,
    saveLayout,
    serverUrl,
    startError,
    toolsDir,
    updateState,
} from '../../desktop/shell.mjs';

test('closing the window waits for the page layout save, but not for a hung or broken page', async () => {
    const order = [];
    await saveLayout(async (code) => {
        assert.equal(code, 'globalThis.rabbitholeSaveLayout?.()');
        await Promise.resolve();
        order.push('saved');
    });
    order.push('closed');
    assert.deepEqual(order, ['saved', 'closed']);
    await saveLayout(() => new Promise(() => {}), 5);
    await saveLayout(() => Promise.reject(new Error('Script failed to execute')));
});

test('the shell reads the server address only from its Rabbithole line', () => {
    assert.equal(serverUrl('Rabbithole: http://127.0.0.1:43117'), 'http://127.0.0.1:43117');
    assert.equal(serverUrl('Rabbithole: http://127.0.0.1:43117\r'), 'http://127.0.0.1:43117');
    for (const line of [
        'Data directory: /home/a/.local/share/rabbithole',
        'Building Rabbithole: built assets are missing or stale.',
        'Rabbithole: http://evil.example:80',
        'Rabbithole: https://127.0.0.1:43117',
        'Note: Rabbithole: http://127.0.0.1:43117',
    ])
        assert.equal(serverUrl(line), null, line);
});

test('the app page gets the mic with no prompt; other pages and the camera do not', () => {
    const origin = 'http://127.0.0.1:43117';
    assert.equal(permitted('media', `${origin}/trees/5`, origin, ['audio']), true);
    assert.equal(permitted('media', `${origin}/trees/5`, origin, ['audio', 'video']), false);
    assert.equal(permitted('media', 'https://example.com/', origin, ['audio']), false);
    assert.equal(permitted('media', `${origin}/`, null, ['audio']), false);
});

test('the window stays on the server origin and sends other web links outside', () => {
    const origin = 'http://127.0.0.1:43117';
    assert.equal(navigation('http://127.0.0.1:43117/trees/5?x=1#top', origin), 'allow');
    assert.equal(navigation('https://en.wikipedia.org/wiki/Fourier', origin), 'external');
    assert.equal(navigation('http://127.0.0.1:4317/', origin), 'external');
    assert.equal(navigation('http://localhost:43117/', origin), 'external');
    for (const url of [
        'file:///etc/passwd',
        'javascript:alert(1)',
        'data:text/html,<p>x',
        'mailto:a@b.c',
        'vscode://open',
        'not a url',
    ])
        assert.equal(navigation(url, origin), 'refuse', url);
    // Before the server is up, and for new windows, nothing stays in the window.
    assert.equal(navigation('http://127.0.0.1:43117/', null), 'external');
    assert.equal(navigation('file:///home/a/starting.html', null), 'refuse');
});

test('an early server exit shows its output, or how it stopped when it printed nothing', () => {
    const locked =
        'Rabbithole is already using data directory /d. Stop that instance before restarting, or choose a different RABBITHOLE_DATA_DIR.';
    assert.equal(startError(`Node 24.22.3\n${locked}\n`, 1, null), `Node 24.22.3\n${locked}`);
    assert.equal(
        startError('\n', 1, null),
        "Rabbithole's server stopped before it started (exit code 1).",
    );
    assert.equal(
        startError('', null, 'SIGKILL'),
        "Rabbithole's server stopped before it started (SIGKILL).",
    );
});

test('add-ons install into a tools folder inside the data folder the server uses', () => {
    const home = (env) => () => dataDir(env, 'linux', '/home/l');
    assert.equal(toolsDir('/app', {}, home({})), resolve('/home/l/.local/share/rabbithole/tools'));
    assert.equal(
        toolsDir('/app', { RABBITHOLE_DATA_DIR: '/d' }, home({ XDG_DATA_HOME: '/x' })),
        resolve('/d/tools'),
    );
    // A relative data folder resolves from the server's working folder, as server/main.mjs resolves it.
    assert.equal(
        toolsDir('/app', { RABBITHOLE_DATA_DIR: 'data' }, home({})),
        resolve('/app/data/tools'),
    );
});

test('the starting progress bar shows only while the data folder has no database yet', () => {
    const dir = mkdtempSync(join(tmpdir(), 'rabbithole-first-'));
    const env = { RABBITHOLE_DATA_DIR: dir };
    const none = () => assert.fail('the data folder variable wins');
    assert.equal(firstLaunch('/app', env, none), true);
    writeFileSync(join(dir, 'trees.sqlite'), '');
    assert.equal(firstLaunch('/app', env, none), false);
});

test('the installed Windows app keeps its data and profile in its install folder; other runs keep the default', () => {
    assert.equal(
        installedDataDir('win32', true, 'D:\\Apps\\Rabbithole\\Rabbithole.exe'),
        'D:\\Apps\\Rabbithole\\data',
    );
    assert.equal(installedDataDir('win32', false, 'C:\\dev\\electron.exe'), null);
    assert.equal(installedDataDir('linux', true, '/tmp/.mount_Rabbit/rabbithole-desktop'), null);
});

// An old %APPDATA% folder with a learning tree database and Electron's profile, and the install folder's data path.
function upgrade() {
    const root = mkdtempSync(join(tmpdir(), 'rabbithole-move-'));
    const [from, to] = [join(root, 'old'), join(root, 'install', 'data')];
    mkdirSync(join(from, 'tools', 'manim'), { recursive: true });
    mkdirSync(join(root, 'install'));
    writeFileSync(join(from, 'trees.sqlite'), 'trees');
    writeFileSync(join(from, 'Preferences'), 'layout');
    writeFileSync(join(from, 'tools', 'manim', 'bin'), 'add-on');
    return { from, to };
}
const kept = (dir) =>
    ['trees.sqlite', 'Preferences', join('tools', 'manim', 'bin')].map((f) =>
        readFileSync(join(dir, f), 'utf8'),
    );
const exdev = () => {
    throw Object.assign(new Error('cross-device link not permitted'), { code: 'EXDEV' });
};

test('an upgrade moves the old data folder into the install folder, by rename or by a checked copy across drives', () => {
    for (const rename of [undefined, exdev]) {
        const { from, to } = upgrade();
        assert.equal(moveOldData(from, to, assert.fail, rename), to);
        assert.deepEqual(kept(to), ['trees', 'layout', 'add-on']);
        assert.equal(existsSync(from), false);
        assert.equal(existsSync(`${to}.moving`), false);
    }
});

test('a failed move keeps the old folder untouched and uses it; data that already moved stays put', () => {
    const logs = [];
    const locked = upgrade();
    const busy = () => {
        throw Object.assign(new Error('resource busy'), { code: 'EBUSY' });
    };
    assert.equal(
        moveOldData(locked.from, locked.to, (l) => logs.push(l), busy),
        locked.from,
    );
    assert.deepEqual(kept(locked.from), ['trees', 'layout', 'add-on']);
    assert.equal(existsSync(locked.to), false);
    // A file the copy cannot read stops it before anything lands in data (root reads it anyway).
    if (process.getuid?.() !== 0) {
        const unreadable = upgrade();
        chmodSync(join(unreadable.from, 'Preferences'), 0);
        assert.equal(
            moveOldData(unreadable.from, unreadable.to, (l) => logs.push(l), exdev),
            unreadable.from,
        );
        chmodSync(join(unreadable.from, 'Preferences'), 0o644);
        assert.deepEqual(kept(unreadable.from), ['trees', 'layout', 'add-on']);
        assert.equal(existsSync(unreadable.to), false);
        assert.equal(existsSync(`${unreadable.to}.moving`), false);
    }
    assert.ok(logs.every((l) => l.includes('could not move')) && logs.length > 0);
    const done = upgrade();
    mkdirSync(done.to);
    writeFileSync(join(done.to, 'trees.sqlite'), 'moved');
    assert.equal(moveOldData(done.from, done.to, assert.fail), done.to);
    assert.deepEqual(kept(done.from), ['trees', 'layout', 'add-on']);
});

test('the update banner appears only for a newer release, downloads on Install and quietly ignores a failed check', () => {
    const run = (...events) => events.reduce(updateState, null);
    const available = { type: 'available', version: '1.0.214', current: '1.0.198' };
    assert.equal(run({ type: 'error', message: 'net::ERR_INTERNET_DISCONNECTED' }), null);
    assert.deepEqual(run({ type: 'not-available', current: '1.0.198' }), {
        stage: 'current',
        version: '1.0.198',
        current: '1.0.198',
    });
    assert.deepEqual(run(available), {
        stage: 'available',
        version: '1.0.214',
        current: '1.0.198',
    });
    assert.equal(run(available, { type: 'error', message: 'x' }).stage, 'available');
    // Progress and a finished download count only after Install.
    assert.equal(run(available, { type: 'progress', percent: 10 }).stage, 'available');
    assert.equal(run(available, { type: 'restart' }).stage, 'available');
    const progress = { type: 'progress', percent: 46.7, transferred: 58e6, total: 126e6 };
    assert.deepEqual(run(available, { type: 'install' }, progress), {
        stage: 'downloading',
        version: '1.0.214',
        current: '1.0.198',
        percent: 46,
        transferred: 58e6,
        total: 126e6,
    });
    const downloaded = run(available, { type: 'install' }, progress, { type: 'downloaded' });
    assert.equal(downloaded.stage, 'ready');
    assert.equal(updateState(downloaded, { type: 'restart' }).stage, 'restarting');
});

test('a failed update download gives a short reason and Install retries it', () => {
    const downloading = [
        null,
        { type: 'available', version: '1.0.214', current: '1.0.198' },
        { type: 'install' },
    ].reduce(updateState);
    const offline = updateState(downloading, {
        type: 'error',
        message: 'net::ERR_CONNECTION_RESET at https://github.com/.../Rabbithole.AppImage',
    });
    const broken = updateState(downloading, { type: 'error', message: 'sha512 checksum mismatch' });
    assert.equal(offline.stage, 'failed');
    assert.notEqual(offline.reason, broken.reason, 'a dropped connection reads differently');
    assert.doesNotMatch(offline.reason + broken.reason, /github|sha512/);
    const retried = updateState(offline, { type: 'install' });
    assert.equal(retried.stage, 'downloading');
    assert.equal(retried.percent, 0);
});

test('the Discord status names the open tree, and only the app with no tree open', () => {
    assert.deepEqual(discordActivity(null, 5), {
        timestamps: { start: 5 },
        assets: { large_image: 'logo', large_text: 'Rabbithole' },
    });
    assert.equal(discordActivity('Black holes', 5).details, 'Learning about Black holes');
    assert.equal(discordActivity('x'.repeat(200), 5).details.length, 128);
});

test('Discord IPC frames carry a little-endian opcode and length before the JSON', () => {
    const frame = discordFrame(1, { a: 1 });
    assert.equal(frame.readInt32LE(0), 1);
    assert.equal(frame.readInt32LE(4), 7);
    assert.equal(frame.subarray(8).toString(), '{"a":1}');
});

test('Discord sockets are named pipes on Windows and include the Flatpak and Snap folders elsewhere', () => {
    assert.equal(discordSockets('win32', {})[0], '\\\\?\\pipe\\discord-ipc-0');
    const linux = discordSockets('linux', { XDG_RUNTIME_DIR: '/run/user/1000' });
    assert.equal(linux[0], '/run/user/1000/discord-ipc-0');
    assert.ok(linux.includes('/run/user/1000/app/com.discordapp.Discord/discord-ipc-0'));
    assert.ok(linux.includes('/run/user/1000/snap.discord/discord-ipc-9'));
});
