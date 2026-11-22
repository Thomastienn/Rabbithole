import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { dataDir } from '../../server/desktop.mjs';
import { navigation, saveLayout, serverUrl, startError, toolsDir } from '../../desktop/shell.mjs';

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
