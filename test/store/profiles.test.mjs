import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

// Seeds a "Default" profile like an existing install unless `fresh`.
async function start(
    dir = mkdtempSync(join(tmpdir(), 'tt-profiles-')),
    names = ['claude', 'codex', 'openai'],
    { fresh = false } = {},
) {
    const store = new Store(join(dir, 'trees.sqlite')),
        calls = [];
    if (!fresh && !store.profiles().profiles.length) store.createProfile('Default');
    const providers = Object.fromEntries(
        names.map((provider) => [
            provider,
            {
                models: async () => [
                    { model: 'chat', label: 'Chat', isDefault: true, efforts: ['low', 'high'] },
                    { model: 'plain', label: 'Plain', efforts: [] },
                ],
                model: async () => 'chat',
                generate: async (tree, text, emit, save) => {
                    calls.push({ provider, model: tree.model });
                    save(`${provider}-${tree.id}`, tree.model);
                    emit({ type: 'status', status: 'completed' });
                },
            },
        ]),
    );
    const app = createApp({
        store,
        providers,
        defaultProvider: fresh ? null : 'claude',
        auth: { status: () => ({ connected: true }) },
        dir,
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const get = async (path) => (await fetch(origin + path)).json();
    const { csrf } = await get('/api/state');
    const post = (path, body = {}) =>
        fetch(origin + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
            body: JSON.stringify(body),
        });
    const roles = async () => ({
        chat: await get('/api/settings/chat'),
        smart: await get('/api/settings/smart'),
        quick: await get('/api/settings/suggestions'),
    });
    return {
        dir,
        get,
        post,
        roles,
        calls,
        close: async () => {
            await app.stop();
            store.close();
        },
    };
}

test('upgrade turns the saved chat, smart and quick thinking choices into an active "Default" profile', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-profiles-migrate-'));
    new Store(join(dir, 'trees.sqlite')).close();
    const db = new DatabaseSync(join(dir, 'trees.sqlite'));
    db.exec(`DROP TABLE active_profile; DROP TABLE profiles;
    INSERT INTO chat_settings VALUES (1, 'codex', 'chat', 'high');
    INSERT INTO smart_settings VALUES (1, 'openai', 'plain', 0, 'low');
    INSERT INTO suggestion_settings VALUES (1, 0, 'openai', 'chat', 'high');`);
    db.close();
    const env = await start(dir);
    t.after(() => env.close());
    const { active, profiles } = await env.get('/api/profiles');
    assert.equal(profiles.length, 1);
    assert.equal(profiles[0].name, 'Default');
    assert.equal(profiles[0].id, active);
    assert.deepEqual(await env.roles(), {
        chat: { provider: 'codex', model: 'chat', effort: 'high' },
        smart: {
            model: { provider: 'openai', model: 'plain' },
            followEffort: false,
            effort: 'low',
            resolved: { provider: 'openai', model: 'plain', effort: 'low' },
        },
        quick: { enabled: false, model: { provider: 'openai', model: 'chat' }, effort: 'high' },
    });
    const root = await (await env.post('/api/trees')).json();
    assert.equal(root.provider, 'codex');
    assert.equal(root.effort, 'high');
});

test('a fresh install has no profile and no provider; Send asks for a chat model; the first profile becomes active', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-profiles-fresh-'));
    const store = new Store(join(dir, 'trees.sqlite'));
    assert.equal(store.profileRow(), null);
    assert.deepEqual(store.profiles(), { active: null, profiles: [] });
    assert.equal(store.assumesProvider, false);
    const blank = store.create();
    assert.equal(blank.provider, null);
    assert.equal(blank.model, null);
    store.close();

    const env = await start(dir, undefined, { fresh: true });
    t.after(() => env.close());
    assert.deepEqual(await env.roles(), {
        chat: { provider: null, model: null, effort: null },
        smart: {
            model: null,
            followEffort: true,
            effort: null,
            resolved: { provider: null, model: null, effort: null },
        },
        quick: { enabled: true, model: null, effort: null },
    });
    const tree = await (await env.post('/api/trees')).json();
    assert.equal(tree.provider, null);
    assert.equal(tree.model, null);
    const refused = await env.post(`/api/trees/${tree.id}/messages`, { text: 'Hello?' });
    assert.equal(refused.status, 409);
    assert.deepEqual(await refused.json(), {
        error: 'Choose a chat model in Settings.',
        code: 'chat_model_unset',
    });
    assert.equal(env.calls.length, 0);
    assert.deepEqual((await env.get(`/api/trees/${tree.id}`)).messages, []);

    const created = await (await env.post('/api/profiles', { name: 'Mine' })).json();
    assert.equal(created.profiles.length, 1);
    assert.equal(created.active, created.profiles[0].id, 'the first profile becomes active');
    assert.deepEqual(created.profiles[0].chat, { provider: null, model: null, effort: null });
    await env.post('/api/settings/chat', { provider: 'codex', model: 'chat', effort: null });
    assert.equal((await env.post('/api/trees')).status, 201);
    assert.equal((await env.get('/api/profiles')).profiles.length, 1);
});

test('choosing a role before any profile exists saves it into an active "Default"', async (t) => {
    const env = await start(undefined, undefined, { fresh: true });
    t.after(() => env.close());
    await env.post('/api/settings/chat', { provider: 'codex', model: 'chat', effort: 'high' });
    const { active, profiles } = await env.get('/api/profiles');
    assert.deepEqual(
        profiles.map((p) => [p.name, p.chat]),
        [['Default', { provider: 'codex', model: 'chat', effort: 'high' }]],
    );
    assert.equal(active, profiles[0].id);
    const tree = await (await env.post('/api/trees')).json();
    assert.equal(tree.provider, 'codex');
    assert.equal(tree.model, 'chat');
});

test('activating a profile swaps all three roles; role routes edit only the active profile; conversations and the suggestions switch stay put', async (t) => {
    let env = await start();
    t.after(() => env.close());
    await env.post('/api/settings/chat', { provider: 'codex', model: 'chat', effort: 'high' });
    await env.post('/api/settings/smart', { followEffort: false, effort: 'low' });
    await env.post('/api/settings/suggestions', {
        model: { provider: 'openai', model: 'chat' },
        effort: 'low',
    });
    const defaults = await env.roles();
    const old = await (await env.post('/api/trees')).json();

    const created = await env.post('/api/profiles', { name: ' Deep study ' });
    assert.equal(created.status, 200);
    const list = await created.json(),
        deep = list.profiles.find((p) => p.name === 'Deep study');
    assert.notEqual(list.active, deep.id, 'creating does not swap');
    assert.deepEqual(deep.chat, defaults.chat, 'a new profile copies the active one');
    assert.equal((await env.post('/api/profiles', { name: 'deep STUDY' })).status, 409);
    assert.equal((await env.post('/api/profiles', { name: '  ' })).status, 400);
    assert.equal((await env.post('/api/profiles/active', { id: 'missing' })).status, 404);

    assert.equal((await env.post('/api/profiles/active', { id: deep.id })).status, 200);
    await env.post('/api/settings/chat', { provider: 'claude', model: 'plain', effort: null });
    await env.post('/api/settings/smart', { model: { provider: 'codex', model: 'chat' } });
    await env.post('/api/settings/suggestions', { model: null, enabled: false });
    const deepRoles = await env.roles();
    assert.deepEqual(deepRoles.chat, { provider: 'claude', model: 'plain', effort: null });
    assert.deepEqual(deepRoles.smart.resolved, { provider: 'codex', model: 'chat', effort: 'low' });
    assert.deepEqual(deepRoles.quick, { enabled: false, model: null, effort: null });
    const fresh = await (await env.post('/api/trees')).json();
    assert.equal(fresh.provider, 'claude');
    assert.equal(fresh.model, 'plain');
    assert.equal(
        (await env.get(`/api/trees/${old.id}`)).provider,
        'codex',
        'existing conversations keep their saved model',
    );

    const back = await (
        await env.post(
            '/api/profiles/active',
            (await env.get('/api/profiles')).profiles.find((p) => p.name === 'Default'),
        )
    ).json();
    assert.equal(back.profiles.find((p) => p.name === 'Default').id, back.active);
    assert.deepEqual(
        await env.roles(),
        { ...defaults, quick: { ...defaults.quick, enabled: false } },
        'Default is untouched by Deep study edits; on/off is global',
    );

    await env.post('/api/profiles/active', { id: deep.id });
    const dir = env.dir;
    await env.close();
    env = await start(dir);
    assert.equal(
        (await env.get('/api/profiles')).active,
        deep.id,
        'the active profile survives a restart',
    );
    assert.deepEqual(await env.roles(), deepRoles);
    await env.close();
});

test('a profile whose model is unavailable still swaps in and fails visibly instead of falling back', async (t) => {
    let env = await start();
    t.after(() => env.close());
    await (await env.post('/api/profiles', { name: 'Local' })).json();
    const local = (await env.get('/api/profiles')).profiles.find((p) => p.name === 'Local');
    await env.post('/api/profiles/active', { id: local.id });
    await env.post('/api/settings/chat', { provider: 'openai', model: 'chat', effort: null });
    await env.post('/api/profiles/active', {
        id: (await env.get('/api/profiles')).profiles.find((p) => p.name === 'Default').id,
    });
    const dir = env.dir;
    await env.close();
    env = await start(dir, ['claude', 'codex']);
    assert.equal(
        (await env.post('/api/profiles/active', { id: local.id })).status,
        200,
        'activation never checks availability',
    );
    assert.deepEqual(await env.get('/api/settings/chat'), {
        provider: 'openai',
        model: 'chat',
        effort: null,
    });
    const response = await env.post('/api/trees');
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /unavailable/);
    assert.equal(env.calls.length, 0);
    await env.close();
});

test('rename, duplicate and delete profiles over HTTP: unique names, last one kept, deleting the active one activates another, all persist', async (t) => {
    let env = await start();
    t.after(() => env.close());
    const json = async (path, body) => {
        const r = await env.post(path, body);
        return { status: r.status, body: await r.json() };
    };
    const def = (await env.get('/api/profiles')).profiles[0];
    assert.equal(
        (await json(`/api/profiles/${def.id}/delete`)).status,
        409,
        'the last profile cannot be deleted',
    );
    await env.post('/api/settings/chat', { provider: 'codex', model: 'chat', effort: 'high' });

    const renamed = await json(`/api/profiles/${def.id}/rename`, { name: ' Everyday ' });
    assert.equal(renamed.status, 200);
    assert.deepEqual(
        renamed.body.profiles.map((p) => p.name),
        ['Everyday'],
    );
    assert.equal(
        (await json(`/api/profiles/${def.id}/rename`, { name: 'EVERYDAY' })).status,
        200,
        'a profile may change the case of its own name',
    );
    assert.equal((await json(`/api/profiles/${def.id}/rename`, { name: '' })).status, 400);
    assert.equal((await json('/api/profiles/missing/rename', { name: 'X' })).status, 404);

    const dup = (await json(`/api/profiles/${def.id}/duplicate`)).body;
    assert.deepEqual(
        dup.profiles.map((p) => p.name),
        ['EVERYDAY', 'EVERYDAY copy'],
    );
    assert.deepEqual(
        dup.profiles[1].chat,
        { provider: 'codex', model: 'chat', effort: 'high' },
        'a duplicate copies its source',
    );
    assert.equal(dup.active, def.id, 'duplicating does not swap');
    assert.deepEqual(
        (await json(`/api/profiles/${def.id}/duplicate`)).body.profiles.map((p) => p.name).slice(2),
        ['EVERYDAY copy 2'],
    );
    const copy = dup.profiles[1];
    assert.equal(
        (await json(`/api/profiles/${copy.id}/rename`, { name: 'everyday' })).status,
        409,
        'rename rejects a name another profile holds',
    );
    assert.equal(
        (await json('/api/profiles', { name: 'Everyday copy' })).status,
        409,
        'create rejects a duplicate name',
    );
    assert.equal((await json(`/api/profiles/${copy.id}/rename`, { name: 'Offline' })).status, 200);

    await env.post('/api/profiles/active', { id: copy.id });
    const afterDelete = (await json(`/api/profiles/${copy.id}/delete`)).body;
    assert.deepEqual(
        afterDelete.profiles.map((p) => p.name),
        ['EVERYDAY', 'EVERYDAY copy 2'],
    );
    assert.equal(afterDelete.active, def.id, 'deleting the active profile activates another');
    assert.deepEqual(await env.get('/api/settings/chat'), {
        provider: 'codex',
        model: 'chat',
        effort: 'high',
    });
    const other = afterDelete.profiles[1];
    assert.equal(
        (await json(`/api/profiles/${other.id}/delete`)).body.active,
        def.id,
        'deleting an inactive profile keeps the active one',
    );
    assert.equal((await json(`/api/profiles/${other.id}/delete`)).status, 404);

    const dir = env.dir;
    await env.close();
    env = await start(dir);
    const after = await env.get('/api/profiles');
    assert.deepEqual(
        after.profiles.map((p) => p.name),
        ['EVERYDAY'],
        'rename and deletes survive a restart',
    );
    assert.equal(after.active, def.id);
    await env.close();
});
