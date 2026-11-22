import assert from 'node:assert/strict';
import test from 'node:test';
import {
    navigation,
    saveLayout,
    serverUrl,
    startError,
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

test('the update banner appears only for a newer release, downloads on Install and quietly ignores a failed check', () => {
    const run = (...events) => events.reduce(updateState, null);
    const available = { type: 'available', version: '1.0.214', current: '1.0.198' };
    assert.equal(run({ type: 'error', message: 'net::ERR_INTERNET_DISCONNECTED' }), null);
    assert.equal(run({ type: 'not-available' }), null);
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
