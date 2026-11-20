import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

// Providers that only list one model and record whether they keep a quick thinking runner ready.
const fake = (ready) => ({
    models: async () => [{ model: 'quick', label: 'Quick', isDefault: true, efforts: [] }],
    ready: (on) => ready.push(on),
});

test('only the chosen quick thinking provider keeps a runner, and switching provider closes the old one', async (t) => {
    const store = new Store(
        join(mkdtempSync(join(tmpdir(), 'rabbithole-runner-')), 'trees.sqlite'),
    );
    const claude = [],
        codex = [];
    const app = createApp({
        store,
        providers: { claude: fake(claude), codex: fake(codex) },
        defaultProvider: 'claude',
        auth: { status: () => ({ connected: true }) },
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    t.after(async () => {
        await app.stop();
        store.close();
    });
    // Unset quick thinking follows the chat default's provider, ready from the start.
    assert.deepEqual([claude.at(-1), codex.at(-1)], [true, false]);
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const { csrf } = await (await fetch(origin + '/api/state')).json();
    const save = (model) =>
        fetch(origin + '/api/settings/suggestions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
            body: JSON.stringify({ model }),
        });
    assert.equal((await save({ provider: 'codex', model: 'quick' })).status, 200);
    assert.deepEqual([claude.at(-1), codex.at(-1)], [false, true]);
    assert.equal((await save({ provider: 'claude', model: 'quick' })).status, 200);
    assert.deepEqual([claude.at(-1), codex.at(-1)], [true, false]);
});
