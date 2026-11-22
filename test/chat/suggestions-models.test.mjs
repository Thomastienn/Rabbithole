import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../server/store.mjs';
import { fakeOpenAI, streamReply } from '../support/fake-openai.mjs';
import { start } from '../support/suggestion-kit.mjs';
import { taskOf } from '../support/model-task.mjs';

test('a saved suggestion model applies across conversations and restart; unpinning restores each provider’s cheap model', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-suggest-settings-'));
    let env = await start(dir);
    t.after(async () => {
        await env.close();
    });
    assert.deepEqual(await env.get('/api/settings/suggestions'), {
        enabled: true,
        model: null,
        effort: null,
    });
    const model = { provider: 'claude', model: 'sonnet' };
    assert.deepEqual(JSON.parse(await env.post('/api/settings/suggestions', { model })), {
        enabled: true,
        model,
        effort: null,
    });
    const a = JSON.parse(await env.post('/api/trees'));
    await env.post(`/api/trees/${a.id}/messages`, { text: 'Explain, suggestion model: sonnet' });
    await env.settled();
    const b = JSON.parse(await env.post('/api/trees'));
    await env.post(`/api/trees/${b.id}/model`, { provider: 'codex', model: 'fixture-model' });
    await env.post(`/api/trees/${b.id}/messages`, { text: 'Explain, suggestion model: sonnet' });
    await env.settled();
    assert.deepEqual(
        env.suggestionCalls().map((c) => c.model),
        ['sonnet', 'sonnet'],
    );
    for (const id of [a.id, b.id])
        assert.equal((await env.get(`/api/trees/${id}`)).suggestions[0].status, 'ready');
    const tutor = await env.get(`/api/trees/${b.id}`);
    assert.equal(tutor.provider, 'codex');
    assert.equal(tutor.model, 'fixture-model');
    await env.close();

    env = await start(dir);
    assert.deepEqual(await env.get('/api/settings/suggestions'), {
        enabled: true,
        model,
        effort: null,
    });
    await env.post(`/api/trees/${b.id}/messages`, { text: 'Continue, suggestion model: sonnet' });
    await env.settled();
    assert.equal(env.suggestionCalls()[0].model, 'sonnet');
    assert.deepEqual(JSON.parse(await env.post('/api/settings/suggestions', { model: null })), {
        enabled: true,
        model: null,
        effort: null,
    });
    await env.post(`/api/trees/${a.id}/messages`, { text: 'Default Claude suggestions' });
    await env.post(`/api/trees/${b.id}/messages`, { text: 'Default Codex suggestions' });
    await env.settled();
    assert.equal(env.suggestionCalls().at(-1).model, 'haiku');
    for (const id of [a.id, b.id])
        assert.equal((await env.get(`/api/trees/${id}`)).suggestions.at(-1).status, 'ready');

    // A Codex pin also overrides a Claude conversation, with no fallback to Luna.
    await env.post('/api/settings/suggestions', {
        model: { provider: 'codex', model: 'fixture-alternate' },
    });
    await env.post(`/api/trees/${a.id}/messages`, {
        text: 'Continue, suggestion model: fixture-alternate',
    });
    await env.settled();
    assert.equal((await env.get(`/api/trees/${a.id}`)).suggestions.at(-1).status, 'ready');
});

test('off prevents new suggestion calls, persists after restart and keeps saved suggestions; re-enabling never backfills', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-suggest-off-'));
    let env = await start(dir);
    t.after(async () => {
        await env.close();
    });
    const tree = JSON.parse(await env.post('/api/trees'));
    await env.post('/api/settings/suggestions', { model: { provider: 'claude', model: 'haiku' } });
    await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain, slow suggestions' });
    assert.ok((await env.get('/api/state')).suggesting.includes(tree.id));
    assert.deepEqual(JSON.parse(await env.post('/api/settings/suggestions', { enabled: false })), {
        enabled: false,
        model: { provider: 'claude', model: 'haiku' },
        effort: null,
    });
    await env.post(`/api/trees/${tree.id}/messages`, { text: 'No suggestions for this reply' });
    env.release();
    await env.settled();
    const saved = (await env.get(`/api/trees/${tree.id}`)).suggestions;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].status, 'ready', 'a call already started can finish and save its usage');
    assert.equal(env.suggestionCalls().length, 1);
    const usage = (await env.get('/api/state')).usage;
    // Two replies, one suggestion call and the first question's title call.
    assert.deepEqual(usage, { input: 412, output: 28, cacheRead: 160, replies: 2 });
    await env.close();

    env = await start(dir);
    assert.equal((await env.get('/api/settings/suggestions')).enabled, false);
    await env.post(`/api/trees/${tree.id}/messages`, { text: 'Still off after restart' });
    await env.settled();
    assert.equal(env.suggestionCalls().length, 0);
    assert.deepEqual((await env.get(`/api/trees/${tree.id}`)).suggestions, saved);
    await env.post('/api/settings/suggestions', { enabled: true });
    await env.settled();
    assert.equal(env.suggestionCalls().length, 0);
    await env.post(`/api/trees/${tree.id}/messages`, { text: 'Suggestions again' });
    await env.settled();
    assert.equal(env.suggestionCalls().length, 1);
    assert.equal((await env.get(`/api/trees/${tree.id}`)).suggestions.length, 2);
});

test('only signed-in subscription models can be pinned; stale pins fail without a provider or API-key fallback', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-suggest-auth-'));
    const connected = { claude: false, codex: true },
        env = await start(dir, true, connected),
        fake = await fakeOpenAI(t);
    t.after(async () => {
        await env.close();
    });
    const [{ id }] = JSON.parse(
        await env.post('/api/settings/endpoints', {
            name: 'Custom endpoint',
            baseUrl: fake.baseUrl,
            apiKey: 'suggestions-key-fixture',
        }),
    );
    const offered = await env.get('/api/models');
    assert.equal(offered.providers.claude.connected, false);
    assert.ok(!offered.models.some((m) => m.provider === 'claude'));
    for (const [body, status] of [
        [{ model: { provider: 'claude', model: 'haiku' } }, 502],
        [{ model: { provider: 'codex', model: 'missing' } }, 400],
        [{ model: { provider: 'codex', model: 'fixture-model' }, effort: 'ultra' }, 400],
        [{ effort: 'low' }, 400],
        [{ model: {} }, 400],
        [{ model: 'haiku' }, 400],
        [{ model: 1 }, 400],
        [{ enabled: 'off' }, 400],
        [null, 400],
    ]) {
        assert.equal(
            (await env.request('/api/settings/suggestions', body)).status,
            status,
            JSON.stringify(body),
        );
        assert.deepEqual(await env.get('/api/settings/suggestions'), {
            enabled: true,
            model: null,
            effort: null,
        });
    }
    assert.equal(
        (
            await env.request(
                '/api/settings/suggestions',
                { enabled: false },
                { 'X-Rabbithole-CSRF': '' },
            )
        ).status,
        403,
    );
    connected.claude = true;
    await env.post('/api/settings/suggestions', { model: { provider: 'claude', model: 'sonnet' } });
    connected.claude = false;
    // Signing out reaches the app on its next sign-in check; models() reuses a signed-in answer for 30 s.
    await env.claude.status();
    const tree = JSON.parse(await env.post('/api/trees'));
    await env.post(`/api/trees/${tree.id}/model`, { provider: 'codex', model: 'fixture-model' });
    await env.post(`/api/trees/${tree.id}/messages`, { text: 'Stale Claude pin' });
    await env.settled();
    assert.equal((await env.get(`/api/trees/${tree.id}`)).suggestions[0].status, 'failed');
    assert.equal(env.suggestionCalls().length, 0, 'signed-out Claude is never invoked');
    assert.equal(fake.calls.filter((c) => c.body).length, 0, 'custom endpoint is never a fallback');
    // Off and unpin remain usable when the pinned provider is signed out.
    assert.equal((await env.request('/api/settings/suggestions', { enabled: false })).status, 200);
    assert.equal((await env.request('/api/settings/suggestions', { model: null })).status, 200);
    await env.post('/api/settings/suggestions', { enabled: true });
    await env.post(`/api/trees/${tree.id}/model`, { provider: id, model: 'local-tutor' });
    await env.post(`/api/trees/${tree.id}/messages`, { text: 'Custom endpoint conversation' });
    await env.settled();
    assert.equal((await env.get(`/api/trees/${tree.id}`)).suggestions.at(-1).status, 'failed');
    assert.equal(
        fake.calls.filter((c) => c.body).length,
        1,
        'only the explicit tutor call uses the API key',
    );
    connected.codex = false;
    assert.equal(
        (
            await env.request('/api/settings/suggestions', {
                model: { provider: 'codex', model: 'fixture-luna' },
            })
        ).status,
        502,
    );
});

test('quick thinking routes suggestions to its own provider, model and effort, including the custom endpoint, without borrowing chat effort', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-quick-thinking-')),
        fake = await fakeOpenAI(t);
    fake.models[0].supported_reasoning_efforts = ['low', 'high'];
    const quick = [];
    fake.reply = (req, res, body) => {
        if (!taskOf(body.messages.at(-1).content)?.answer)
            return streamReply(res, ['Peterson ', 'uses two flags.']);
        quick.push(body);
        streamReply(res, [JSON.stringify({ suggestions: [{ text: 'two flags' }] })]);
    };
    let env = await start(dir);
    t.after(async () => {
        await env.close();
    });
    const [{ id }] = JSON.parse(
        await env.post('/api/settings/endpoints', {
            name: 'Custom endpoint',
            baseUrl: fake.baseUrl,
            apiKey: 'quick-key-fixture',
        }),
    );
    const tree = JSON.parse(await env.post('/api/trees'));
    await env.post(`/api/trees/${tree.id}/model`, {
        provider: 'claude',
        model: 'sonnet',
        effort: 'max',
    });
    // Unset quick thinking keeps the cheap provider default and leaves effort to the provider.
    await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain, suggestion model: haiku' });
    await env.settled();
    assert.deepEqual(
        env.suggestionCalls().map((c) => [c.model, c.effort]),
        [['haiku', null]],
    );
    assert.deepEqual(
        JSON.parse(
            await env.post('/api/settings/suggestions', {
                model: { provider: 'claude', model: 'sonnet' },
                effort: 'low',
            }),
        ),
        { enabled: true, model: { provider: 'claude', model: 'sonnet' }, effort: 'low' },
    );
    await env.post(`/api/trees/${tree.id}/messages`, { text: 'Explain, suggestion model: sonnet' });
    await env.settled();
    assert.deepEqual(env.suggestionCalls().at(-1).effort, 'low');
    assert.equal(env.calls.at(-2).effort, 'max', 'the tutor keeps its own effort');

    await env.post('/api/settings/suggestions', {
        model: { provider: 'codex', model: 'fixture-model' },
        effort: 'high',
    });
    await env.post(`/api/trees/${tree.id}/messages`, {
        text: 'Explain, suggestion model: fixture-model',
    });
    await env.settled();
    assert.equal(env.turns.at(-1).model, 'fixture-model');
    assert.equal(env.turns.at(-1).effort, 'high');

    assert.deepEqual(
        JSON.parse(
            await env.post('/api/settings/suggestions', {
                model: { provider: id, model: 'local-tutor' },
                effort: 'high',
            }),
        ),
        { enabled: true, model: { provider: id, model: 'local-tutor' }, effort: 'high' },
    );
    assert.equal(
        (await env.request('/api/settings/suggestions', { effort: 'max level!' })).status,
        400,
        'a typed endpoint effort must be 1-32 letters, digits, - or _',
    );
    assert.equal(quick.length, 0, 'saving quick thinking starts no model call');
    await env.close();

    env = await start(dir);
    assert.deepEqual(await env.get('/api/settings/suggestions'), {
        enabled: true,
        model: { provider: id, model: 'local-tutor' },
        effort: 'high',
    });
    const custom = JSON.parse(await env.post('/api/trees'));
    await env.post(`/api/trees/${custom.id}/model`, { provider: id, model: 'second-model' });
    await env.post(`/api/trees/${custom.id}/messages`, { text: 'Custom endpoint conversation' });
    await env.settled();
    assert.deepEqual(
        quick.map((b) => [b.model, b.reasoning_effort]),
        [['local-tutor', 'high']],
    );
    const saved = await env.get(`/api/trees/${custom.id}`);
    assert.equal(saved.suggestions[0].status, 'ready');
    assert.deepEqual(
        saved.suggestions[0].passages.map((p) => p.text),
        ['two flags'],
    );
    assert.equal(saved.messages.length, 2, 'the suggestion call stays out of tutor history');
});

test('a pre-role suggestion pin migrates to quick thinking with provider-default effort', async (t) => {
    const dir = mkdtempSync(join(tmpdir(), 'tt-quick-migrate-'));
    const { DatabaseSync } = await import('node:sqlite');
    new Store(join(dir, 'trees.sqlite')).close();
    const db = new DatabaseSync(join(dir, 'trees.sqlite'));
    db.exec(
        "CREATE TABLE suggestion_settings_old AS SELECT * FROM suggestion_settings; DROP TABLE suggestion_settings; CREATE TABLE suggestion_settings (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL CHECK(enabled IN (0,1)), provider TEXT, model TEXT); INSERT INTO suggestion_settings VALUES (1, 0, 'codex', 'fixture-luna'); DROP TABLE suggestion_settings_old; DROP TABLE active_profile; DROP TABLE profiles",
    );
    db.close();
    const env = await start(dir);
    t.after(async () => {
        await env.close();
    });
    assert.deepEqual(await env.get('/api/settings/suggestions'), {
        enabled: false,
        model: { provider: 'codex', model: 'fixture-luna' },
        effort: null,
    });
});
