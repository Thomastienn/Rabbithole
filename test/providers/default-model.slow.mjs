import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Claude } from '../../server/providers/claude.mjs';
import { Codex } from '../../server/providers/codex.mjs';
import { Store } from '../../server/store.mjs';
import { createApp } from '../../server/app.mjs';

async function open(provider, name, dir) {
    const store = new Store(join(dir, 'trees.sqlite'));
    const app = createApp({
        store,
        providers: { [name]: provider },
        defaultProvider: name,
        auth: { status: () => ({ connected: true }) },
        dir,
    });
    await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${app.server.address().port}`;
    const { csrf } = await (await fetch(`${origin}/api/state`)).json();
    const get = async (path) => (await fetch(origin + path)).json();
    const post = (path, body = {}) =>
        fetch(origin + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Rabbithole-CSRF': csrf },
            body: JSON.stringify(body),
        });
    return {
        store,
        get,
        post,
        close: async () => {
            await app.stop();
            store.close();
        },
    };
}

test('HTTP Claude defaults are saved before inference and override the learner environment on fresh and legacy conversations', async () => {
    const previous = process.env.CLAUDE_MODEL;
    process.env.CLAUDE_MODEL = 'opus';
    const dir = mkdtempSync(join(tmpdir(), 'tt-default-claude-')),
        calls = [];
    const provider = new Claude(
        dir,
        (command, args, options) => {
            // The quick thinking runner starts ahead of time and waits; it runs no inference until a quick call.
            if (args.includes('--session-id') || args.includes('--resume'))
                calls.push({ args, env: options.env });
            return spawn(process.execPath, ['test/support/protocol-fixture.mjs', ...args], {
                ...options,
                cwd: process.cwd(),
            });
        },
        (command, args, options, callback) => callback(null, '{"loggedIn":true}'),
    );
    const env = await open(provider, 'claude', dir);
    try {
        const catalog = await env.get('/api/models');
        assert.deepEqual(
            catalog.models.map((m) => m.model),
            ['opus', 'sonnet', 'haiku'],
        );
        assert.equal(catalog.models.find((m) => m.isDefault).model, 'sonnet');
        const response = await env.post('/api/trees');
        assert.equal(response.status, 201);
        const root = await response.json();
        assert.equal(root.model, 'sonnet');
        assert.equal(env.store.tree(root.id).model, 'sonnet');
        assert.equal(calls.length, 0, 'creation resolves a model without starting paid inference');
        const legacy = env.store.create('Legacy', 'claude');
        env.store.thread(legacy.id, 'legacy-session');
        for (const tree of [root, legacy]) {
            const stream = await env.post(`/api/trees/${tree.id}/messages`, {
                text: 'Explain trees',
            });
            assert.equal(stream.status, 200);
            assert.match(await stream.text(), /"status":"completed"/);
            const call = calls.at(-1);
            assert.equal(call.env.CLAUDE_MODEL, 'opus');
            assert.equal(call.args[call.args.indexOf('--model') + 1], 'sonnet');
            assert.equal((await env.get(`/api/trees/${tree.id}`)).model, 'sonnet');
        }
        assert.equal(
            calls.at(-1).args[calls.at(-1).args.indexOf('--resume') + 1],
            'legacy-session',
        );
        await env.post(`/api/trees/${root.id}/model`, { model: 'haiku' });
        await (await env.post(`/api/trees/${root.id}/messages`, { text: 'Use my choice' })).text();
        assert.equal(calls.at(-1).args[calls.at(-1).args.indexOf('--model') + 1], 'haiku');
        assert.equal(env.store.tree(root.id).model, 'haiku');
        assert.deepEqual(env.store.suggestionSettings(), {
            enabled: true,
            model: null,
            effort: null,
        });
    } finally {
        await env.close();
        if (previous === undefined) delete process.env.CLAUDE_MODEL;
        else process.env.CLAUDE_MODEL = previous;
    }
});

for (const terra of [true, false])
    test(`HTTP Codex saves and explicitly sends ${terra ? 'Terra when listed' : 'the flagged account default when Terra is absent'}`, async () => {
        const dir = mkdtempSync(join(tmpdir(), 'tt-default-codex-')),
            requests = [];
        const provider = new Codex(
            { token: async () => 'synthetic-token' },
            dir,
            (command, args, options) => {
                const child = spawn(
                    process.execPath,
                    ['test/support/protocol-fixture.mjs', ...(terra ? ['--terra'] : [])],
                    { ...options, cwd: process.cwd() },
                );
                const write = child.stdin.write.bind(child.stdin);
                child.stdin.write = (data) => {
                    requests.push(JSON.parse(data));
                    return write(data);
                };
                return child;
            },
        );
        const env = await open(provider, 'codex', dir);
        const expected = terra ? 'gpt-6.1-terra' : 'fixture-model';
        try {
            const catalog = await env.get('/api/models');
            assert.deepEqual(
                catalog.models.filter((m) => m.isDefault).map((m) => m.model),
                [expected],
            );
            assert.equal(!!catalog.models.find((m) => m.isDefault).defaultFallback, !terra);
            const root = await (await env.post('/api/trees')).json();
            assert.equal(root.model, expected);
            assert.equal(env.store.tree(root.id).model, expected);
            assert.equal(
                requests.some((r) => /thread\/|turn\//.test(r.method)),
                false,
                'resolving defaults only lists models',
            );
            const legacy = env.store.create('Legacy', 'codex');
            env.store.thread(legacy.id, 'legacy-thread');
            for (const tree of [root, legacy]) {
                const stream = await env.post(`/api/trees/${tree.id}/messages`, {
                    text: 'Explain trees',
                });
                assert.match(await stream.text(), /"status":"completed"/);
                const saved = await env.get(`/api/trees/${tree.id}`);
                assert.equal(saved.model, expected);
                assert.equal(
                    requests.filter((r) => r.method === 'turn/start').at(-1).params.model,
                    saved.model,
                );
                assert.equal(
                    requests
                        .filter((r) => r.method === 'thread/start' || r.method === 'thread/resume')
                        .at(-1).params.model,
                    saved.model,
                );
            }
            const before = env.store.tree(root.id);
            const child = await (
                await env.post(`/api/trees/${root.id}/branches`, {
                    messageId: before.messages[1].id,
                    start: 0,
                    end: 13,
                    text: 'Authoritative',
                    question: 'Why?',
                })
            ).json();
            assert.equal(child.model, expected, 'branches inherit the resolved parent choice');
            await env.post(`/api/trees/${child.id}/model`, { model: 'fixture-alternate' });
            await (
                await env.post(`/api/trees/${child.id}/messages`, { text: 'Use my choice' })
            ).text();
            assert.equal(env.store.tree(child.id).model, 'fixture-alternate');
            assert.equal(
                requests.filter((r) => r.method === 'turn/start').at(-1).params.model,
                'fixture-alternate',
            );
            assert.equal(env.store.tree(root.id).model, expected);
            assert.deepEqual(env.store.suggestionSettings(), {
                enabled: true,
                model: null,
                effort: null,
            });
        } finally {
            await env.close();
        }
    });

test('failed default lookup leaves no partially created conversation and permits retry', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-default-retry-'));
    let fail = true;
    const env = await open(
        {
            model: async () => {
                if (fail) throw new Error('private account diagnostic');
                return 'gpt-6.1-terra';
            },
        },
        'codex',
        dir,
    );
    try {
        const response = await env.post('/api/trees');
        assert.equal(response.status, 502);
        assert.doesNotMatch(await response.text(), /private account diagnostic/);
        assert.deepEqual(env.store.list(), []);
        fail = false;
        const retried = await env.post('/api/trees');
        assert.equal(retried.status, 201);
        assert.equal((await retried.json()).model, 'gpt-6.1-terra');
    } finally {
        await env.close();
    }
});
