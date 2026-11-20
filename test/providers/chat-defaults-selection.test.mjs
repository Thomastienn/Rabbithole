import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { start } from '../support/chat-defaults-kit.mjs';

test('chat defaults snapshot into roots; overrides and recursive branches persist without changing other discussion', async () => {
    let env = await start();
    try {
        assert.deepEqual(await env.get('/api/settings/chat'), {
            provider: 'claude',
            model: null,
            effort: null,
        });
        const chosen = { provider: 'codex', model: 'chat', effort: 'high' };
        assert.equal((await env.post('/api/settings/chat', chosen)).status, 200);
        assert.equal(env.calls.length, 0, 'saving settings never starts inference');
        const root = await (await env.post('/api/trees')).json();
        for (const [key, value] of Object.entries(chosen)) assert.equal(root[key], value);
        await env.send(root.id);
        const initial = await env.get(`/api/trees/${root.id}`);
        const current = { provider: 'openai', model: 'chat', effort: 'low' };
        assert.equal((await env.post(`/api/trees/${root.id}/model`, current)).status, 200);
        const branch = async (id) => {
            const tree = await env.get(`/api/trees/${id}`),
                source = tree.messages.find((m) => m.role === 'assistant');
            const response = await env.post(`/api/trees/${id}/branches`, {
                messageId: source.id,
                start: 2,
                end: 15,
                text: 'fixed passage',
                question: 'Why trees?',
            });
            assert.equal(response.status, 201);
            return response.json();
        };
        const child = await branch(root.id);
        for (const [key, value] of Object.entries(current)) assert.equal(child[key], value);
        await env.send(child.id);
        await env.post(`/api/trees/${child.id}/model`, { ...chosen, effort: 'low' });
        const grandchild = await branch(child.id);
        assert.equal(grandchild.provider, 'codex');
        assert.equal(grandchild.effort, 'low');
        await env.send(grandchild.id);
        // Branch-first: the inherited context is filled once the first reply's wait for compaction ends.
        const snapshot = (await env.get(`/api/trees/${grandchild.id}`)).branch;
        await env.post(`/api/trees/${grandchild.id}/model`, { ...chosen, effort: 'high' });
        const before = await env.get(`/api/trees/${grandchild.id}`);
        await env.post('/api/settings/chat', { provider: 'claude', model: 'plain', effort: null });
        assert.deepEqual(await env.get(`/api/trees/${grandchild.id}`), before);
        assert.deepEqual((await env.get(`/api/trees/${root.id}`)).messages, initial.messages);
        const next = await (await env.post('/api/trees')).json();
        assert.equal(next.provider, 'claude');
        assert.equal(next.model, 'plain');
        assert.equal(next.effort, null);
        const dir = env.dir;
        await env.close();
        env = await start(dir);
        assert.deepEqual(await env.get('/api/settings/chat'), {
            provider: 'claude',
            model: 'plain',
            effort: null,
        });
        assert.deepEqual(await env.get(`/api/trees/${grandchild.id}`), before);
        await env.send(grandchild.id, 'After restart');
        const call = env.calls.at(-1).tree;
        assert.equal(call.effort, 'high');
        assert.equal(call.thread, before.thread);
        assert.deepEqual(call.messages, before.messages);
        assert.deepEqual(call.branch, snapshot);
    } finally {
        await env.close();
    }
});

test('first send creates the tree with the model picked before sending, without the unavailable global default', async () => {
    const env = await start(),
        saved = { provider: 'claude', model: 'chat', effort: 'high' };
    try {
        await env.post('/api/settings/chat', saved);
        env.providers.claude.models = async () => {
            throw new Error('Synthetic unavailable default');
        };
        const choice = { provider: 'codex', model: 'chat', effort: 'low' };
        for (const invalid of [
            { ...choice, model: 'missing' },
            { ...choice, effort: 'max' },
            { provider: 'codex' },
        ]) {
            assert.equal((await env.post('/api/trees', invalid)).status, 400);
            assert.equal(env.store.list().length, 0, 'invalid choice never creates a tree');
        }
        const response = await env.post('/api/trees', choice);
        assert.equal(response.status, 201);
        const root = await response.json();
        for (const [key, value] of Object.entries(choice)) assert.equal(root[key], value);
        assert.deepEqual(await env.get('/api/settings/chat'), saved);
        assert.equal(env.calls.length, 0, 'creating never starts inference');
        await env.send(root.id, 'First question');
        assert.equal(env.calls[0].tree.provider, 'codex');
        assert.equal(env.calls[0].tree.model, 'chat');
        assert.equal(env.calls[0].tree.effort, 'low');
        assert.deepEqual(await env.get('/api/settings/chat'), saved);
        assert.equal(
            (await env.post('/api/trees')).status,
            502,
            'ordinary New chat still uses the saved default',
        );
    } finally {
        await env.close();
    }
});

test('invalid or disconnected choices never replace saved defaults or conversation choices', async () => {
    const env = await start(),
        chosen = { provider: 'codex', model: 'chat', effort: 'high' };
    try {
        await env.post('/api/settings/chat', chosen);
        const root = await (await env.post('/api/trees')).json();
        await env.send(root.id);
        const before = await env.get(`/api/trees/${root.id}`);
        for (const selection of [
            { ...chosen, effort: 'max' },
            { ...chosen, effort: 1 },
            { ...chosen, effort: {} },
            { ...chosen, model: 'plain' },
            { ...chosen, model: 'missing' },
            { ...chosen, provider: 'missing' },
        ]) {
            for (const path of ['/api/settings/chat', `/api/trees/${root.id}/model`]) {
                const response = await env.post(path, selection);
                assert.equal(response.status, 400);
                assert.match((await response.json()).error, /[Cc]hoose|[Cc]onfigure|[Rr]efresh/);
            }
            assert.deepEqual(await env.get('/api/settings/chat'), chosen);
            assert.deepEqual(await env.get(`/api/trees/${root.id}`), before);
        }
        env.providers.codex.models = async () => {
            throw new Error('private provider diagnostic');
        };
        for (const path of ['/api/settings/chat', `/api/trees/${root.id}/model`, '/api/trees']) {
            const response = await env.post(path, chosen);
            assert.equal(response.status, 502);
            assert.doesNotMatch(await response.text(), /private provider diagnostic/);
        }
        delete env.providers.codex;
        const response = await env.post('/api/trees');
        assert.equal(response.status, 400);
        assert.match((await response.json()).error, /Chat default provider is unavailable/);
        assert.equal(env.store.list().length, 1);
        assert.deepEqual(await env.get(`/api/trees/${root.id}`), before);
    } finally {
        await env.close();
    }
});

test('active turns freeze effort; failed changes restore the last working provider, model, effort and session', async () => {
    const env = await start();
    let finish;
    try {
        await env.post('/api/settings/chat', { provider: 'codex', model: 'chat', effort: 'low' });
        const root = await (await env.post('/api/trees')).json();
        await env.send(root.id);
        const original = await env.get(`/api/trees/${root.id}`);
        env.providers.codex.generate = (tree, text, emit) =>
            new Promise((resolve) => {
                assert.equal(tree.effort, 'low');
                finish = () => {
                    emit({ type: 'status', status: 'completed' });
                    resolve();
                };
            });
        const stream = await env.post(`/api/trees/${root.id}/messages`, { text: 'Keep working' });
        assert.equal(
            (await env.post(`/api/trees/${root.id}/model`, { effort: 'high' })).status,
            409,
        );
        await env.post('/api/settings/chat', { provider: 'openai', model: 'chat', effort: 'high' });
        finish();
        await stream.text();
        const before = await env.get(`/api/trees/${root.id}`);
        assert.equal(before.effort, 'low');
        await env.post(`/api/trees/${root.id}/model`, {
            provider: 'openai',
            model: 'chat',
            effort: 'high',
        });
        env.providers.openai.generate = async (tree, text, emit, save) => {
            save('failed-session', tree.model);
            throw new Error('Chosen effort is unavailable for this account.');
        };
        const failed = await env.post(`/api/trees/${root.id}/messages`, { text: 'Try new choice' });
        assert.match(await failed.text(), /Chosen effort is unavailable/);
        const restored = await env.get(`/api/trees/${root.id}`);
        assert.equal(restored.provider, 'codex');
        assert.equal(restored.effort, 'low');
        assert.equal(restored.thread, original.thread);
        assert.deepEqual(restored.messages.slice(0, -2), before.messages);
    } finally {
        finish?.();
        await env.close();
    }
});

test('legacy schema gains nullable effort without changing history, provider defaults or working selection', async () => {
    let env = await start();
    const root = env.store.create('Older conversation', 'codex', 'chat');
    await env.send(root.id);
    const before = await env.get(`/api/trees/${root.id}`),
        dir = env.dir;
    await env.close();
    const db = new DatabaseSync(join(dir, 'trees.sqlite'));
    db.exec(
        'ALTER TABLE trees DROP COLUMN effort; ALTER TABLE trees DROP COLUMN working_effort; DROP TABLE chat_settings',
    );
    db.close();
    env = await start(dir);
    try {
        assert.deepEqual(await env.get(`/api/trees/${root.id}`), before);
        assert.equal(before.effort, null);
        assert.equal(before.working_effort, null);
        await env.send(root.id);
        assert.equal(env.calls.at(-1).tree.effort, null);
        assert.equal(env.calls.at(-1).tree.thread, before.thread);
    } finally {
        await env.close();
    }
});
