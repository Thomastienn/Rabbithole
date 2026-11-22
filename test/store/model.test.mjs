import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

const catalog = [
    { model: 'original', label: 'Original' },
    { model: 'alternate', label: 'Alternate' },
    { model: 'no-access', label: 'No access' },
];
async function open(
    provider = {},
    path = join(mkdtempSync(join(tmpdir(), 'rabbithole-model-')), 'trees.sqlite'),
) {
    const store = new Store(path);
    const app = createApp({
        store,
        auth: { status: () => ({ connected: true }) },
        provider: {
            models: async () => catalog,
            generate: async (tree, text, emit, save) => {
                save(tree.thread ?? `thread-${tree.id}`, tree.model ?? 'original');
                emit({ type: 'item', item: 'a', text: 'Original answer' });
                emit({ type: 'status', status: 'completed' });
            },
            ...provider,
        },
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    const post = (path, body) =>
        fetch(`${origin}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
            body: JSON.stringify(body),
        });
    return {
        store,
        app,
        post,
        origin,
        path,
        close() {
            app.stop();
            store.close();
        },
    };
}

test('saved model changes preserve thread, transcript, fixed context and independent parent/child choices after restart', async () => {
    let env = await open();
    const root = env.store.create('Root', 'codex');
    await (await env.post(`/api/trees/${root.id}/messages`, { text: 'Original question' })).text();
    const original = env.store.tree(root.id);
    const anchor = {
        messageId: original.messages[1].id,
        start: 0,
        end: 8,
        text: 'Original',
        question: 'Why?',
    };
    try {
        assert.deepEqual(
            (await (await fetch(`${env.origin}/api/models`)).json()).models,
            catalog.map((m) => ({
                provider: 'codex',
                ...m,
                readsImages: false,
                usesTutorTools: true,
            })),
        );
        assert.equal(
            (await env.post(`/api/trees/${root.id}/model`, { model: 'alternate' })).status,
            200,
        );
        const child = await (await env.post(`/api/trees/${root.id}/branches`, anchor)).json();
        assert.equal(child.model, 'alternate');
        assert.equal(
            (await env.post(`/api/trees/${root.id}/model`, { model: 'original' })).status,
            200,
        );
        assert.equal(env.store.tree(child.id).model, 'alternate');
        const before = env.store.tree(child.id);
        assert.equal(
            (await env.post(`/api/trees/${child.id}/model`, { model: 'original' })).status,
            200,
        );
        assert.deepEqual(env.store.tree(child.id).branch, before.branch);
        const path = env.path;
        env.close();
        let captured;
        env = await open(
            {
                generate: async (tree, text, emit) => {
                    captured = tree;
                    emit({ type: 'status', status: 'completed' });
                },
            },
            path,
        );
        assert.equal(env.store.tree(child.id).model, 'original');
        const reopened = env.store.tree(root.id);
        assert.equal(reopened.thread, original.thread);
        assert.deepEqual(reopened.messages, original.messages);
        await (await env.post(`/api/trees/${root.id}/model`, { model: 'alternate' })).json();
        await (await env.post(`/api/trees/${root.id}/messages`, { text: 'Continue' })).text();
        assert.equal(captured.model, 'alternate');
        assert.equal(captured.thread, original.thread);
        assert.deepEqual(captured.messages, original.messages);
        await (
            await env.post(`/api/trees/${child.id}/messages`, { text: 'Continue branch' })
        ).text();
        assert.equal(captured.model, 'original');
        assert.deepEqual(captured.branch, before.branch);
    } finally {
        env.close();
    }
});

test('unsupported selections and catalog failures keep prior model and all saved content', async () => {
    let fail = false;
    const env = await open({
        models: async () => {
            if (fail) throw new Error('private provider diagnostic');
            return catalog;
        },
    });
    const tree = env.store.create('Saved', 'codex');
    try {
        await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Original' })).text();
        const before = env.store.tree(tree.id);
        for (const model of ['guessed-model', null, 42])
            assert.equal((await env.post(`/api/trees/${tree.id}/model`, { model })).status, 400);
        fail = true;
        const response = await env.post(`/api/trees/${tree.id}/model`, { model: 'alternate' });
        assert.equal(response.status, 502);
        assert.match((await response.json()).error, /previous selection is saved/);
        assert.equal((await fetch(`${env.origin}/api/models`)).status, 502);
        assert.deepEqual(env.store.tree(tree.id), before);
        assert.equal(env.app.jobs.list('reply').length, 0);
    } finally {
        env.close();
    }
});

test('active turn keeps captured model; selection validation serializes with messages and competing changes', async () => {
    let releaseTurn, releaseCatalog, captured;
    const env = await open({
        models: () =>
            new Promise((resolve) => {
                releaseCatalog = () => resolve(catalog);
            }),
        generate: (tree, text, emit, save) =>
            new Promise((resolve) => {
                captured = tree.model;
                save('same-thread', tree.model);
                releaseTurn = () => {
                    emit({ type: 'status', status: 'completed' });
                    resolve();
                };
            }),
    });
    const tree = env.store.create('Busy', 'codex');
    env.store.model(tree.id, 'original');
    try {
        const stream = await env.post(`/api/trees/${tree.id}/messages`, { text: 'Question' });
        assert.equal(
            (await env.post(`/api/trees/${tree.id}/model`, { model: 'alternate' })).status,
            409,
        );
        assert.equal(captured, 'original');
        releaseTurn();
        await stream.text();
        const change = env.post(`/api/trees/${tree.id}/model`, { model: 'alternate' });
        while (!releaseCatalog) await new Promise((resolve) => setImmediate(resolve));
        assert.equal(
            (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Race' })).status,
            409,
        );
        assert.equal(
            (await env.post(`/api/trees/${tree.id}/model`, { model: 'original' })).status,
            409,
        );
        releaseCatalog();
        assert.equal((await change).status, 200);
        assert.equal(env.store.tree(tree.id).model, 'alternate');
        assert.equal(env.store.tree(tree.id).messages.length, 2);
    } finally {
        releaseTurn?.();
        releaseCatalog?.();
        env.close();
    }
});

test('catalog entry without access fails visibly, restores working selection after restart and permits retry', async () => {
    const provider = {
        generate: async (tree, text, emit, save) => {
            save(tree.thread ?? 'saved-thread', tree.model ?? 'original');
            if (tree.model === 'no-access') throw new Error('Model unavailable for this account.');
            emit({ type: 'item', item: 'a', text: 'Saved reply' });
            emit({ type: 'status', status: 'completed' });
        },
    };
    let env = await open(provider);
    const tree = env.store.create('Retry', 'codex');
    try {
        await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Original' })).text();
        const before = env.store.tree(tree.id);
        await env.post(`/api/trees/${tree.id}/model`, { model: 'alternate' });
        await env.post(`/api/trees/${tree.id}/model`, { model: 'no-access' });
        const path = env.path;
        env.close();
        env = await open(provider, path);
        const events = await (
            await env.post(`/api/trees/${tree.id}/messages`, { text: 'Try changed model' })
        ).text();
        assert.match(events, /Model unavailable/);
        assert.match(events, /last working model selection will be restored/);
        const failed = env.store.tree(tree.id);
        assert.equal(failed.model, 'original');
        assert.equal(failed.thread, before.thread);
        assert.deepEqual(failed.messages.slice(0, 2), before.messages);
        assert.equal(failed.messages.at(-1).status, 'failed');
        await (await env.post(`/api/trees/${tree.id}/messages`, { text: 'Retry' })).text();
        assert.equal(env.store.tree(tree.id).messages.at(-1).status, 'completed');
    } finally {
        env.close();
    }
});

test('existing saved models survive working-model migration', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'rabbithole-migration-')), 'trees.sqlite');
    const db = new DatabaseSync(path);
    db.exec(
        "CREATE TABLE trees (id TEXT PRIMARY KEY, title TEXT NOT NULL, thread TEXT, created INTEGER NOT NULL, model TEXT); INSERT INTO trees VALUES ('saved','Saved','thread',1,'existing-model')",
    );
    db.close();
    const store = new Store(path);
    try {
        store.model('saved', 'unusable');
        store.finishModel('saved', false);
        assert.equal(store.tree('saved').model, 'existing-model');
        assert.equal(store.tree('saved').thread, 'thread');
    } finally {
        store.close();
    }
});
