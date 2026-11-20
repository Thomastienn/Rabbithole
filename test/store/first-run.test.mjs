import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

const path = () => join(mkdtempSync(join(tmpdir(), 'rh-first-run-')), 'trees.sqlite');
const reopen = (file) => {
    const store = new Store(file),
        finished = store.setupFinished();
    store.close();
    return finished;
};
// An upgrade from a build before first-run setup: the database has no first_run table yet.
const upgrade = (file, sql) => {
    new Store(file).close();
    const db = new DatabaseSync(file);
    db.exec(`DROP TABLE first_run; ${sql}`);
    db.close();
    return reopen(file);
};

test('a fresh database shows setup until it ends, then never again', () => {
    const file = path(),
        store = new Store(file);
    assert.equal(store.setupFinished(), false);
    // Choosing a model during setup does not end it; only confirming or "Set up later" does.
    store.saveChatSettings({ provider: 'claude', model: 'chat', effort: null });
    store.close();
    assert.equal(reopen(file), false);
    const again = new Store(file);
    again.finishSetup();
    again.close();
    assert.equal(reopen(file), true);
});

test('an upgraded database with a model profile or a learning tree skips setup', () => {
    assert.equal(upgrade(path(), ''), false);
    assert.equal(
        upgrade(
            path(),
            "INSERT INTO profiles(id,name,smart_follow_effort) VALUES('p','Default',1)",
        ),
        true,
    );
    assert.equal(
        upgrade(path(), "INSERT INTO trees(id,title,created) VALUES('t','Saved tree',1)"),
        true,
    );
});

test('the app reports first-run setup and ends it on request', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'rh-first-run-app-')),
        store = new Store(join(dir, 'trees.sqlite'));
    const app = createApp({
        store,
        providers: {},
        defaultProvider: null,
        auth: { status: () => ({ connected: false }) },
        dir,
        sandbox: { status: () => ({ windows: true, ready: false }), enable: async () => 'enabled' },
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
        app.server.close();
        store.close();
    });
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const state = async () => (await fetch(origin + '/api/state')).json();
    const { csrf, firstRun } = await state();
    assert.equal(firstRun, true);
    const ended = await fetch(origin + '/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
        body: '{}',
    });
    assert.deepEqual(await ended.json(), { firstRun: false });
    assert.equal((await state()).firstRun, false);
    assert.deepEqual(await (await fetch(origin + '/api/setup/sandbox')).json(), {
        windows: true,
        ready: false,
    });
    const enabled = await fetch(origin + '/api/setup/sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
        body: '{}',
    });
    assert.equal(await enabled.json(), 'enabled');
});
