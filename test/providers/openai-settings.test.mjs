import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync, existsSync, writeFileSync, chmodSync, symlinkSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
import { OpenAI } from '../../server/providers/openai.mjs';
import { fakeOpenAI } from '../support/fake-openai.mjs';
import { open } from '../support/openai-kit.mjs';

test('settings enforce CSRF, loopback and URL boundaries; clear unregisters without fallback and restores from an owner-only file', async (t) => {
    const fake = await fakeOpenAI(t);
    let nativeCalls = 0;
    const claude = {
        models: async () => [{ model: 'sonnet', label: 'Sonnet' }],
        generate: async () => {
            nativeCalls++;
        },
    };
    const { get, post, store, dir, endpoint, origin } = await open(t, { claude });
    const saved = { baseUrl: fake.baseUrl, apiKey: 'settings-fixture-secret' };
    for (const path of [
        '/api/settings/endpoint',
        '/api/settings/endpoint/test',
        '/api/settings/endpoint/clear',
    ]) {
        for (const headers of [
            { 'X-Rabbithole-CSRF': '' },
            { 'Content-Type': 'text/plain' },
            { Origin: 'https://attacker.test' },
            { 'Sec-Fetch-Site': 'cross-site' },
        ])
            assert.equal(
                (await post(path, saved, headers)).status,
                403,
                JSON.stringify({ path, headers }),
            );
        // Node fetch rewrites Host; use raw HTTP to exercise rebinding protection.
        const rebound = await new Promise((resolve) => {
            const req = http.request(
                origin + path,
                { method: 'POST', headers: { Host: 'attacker.test' } },
                (res) => {
                    res.resume();
                    resolve(res.statusCode);
                },
            );
            req.end('{}');
        });
        assert.equal(rebound, 403);
    }
    for (const body of [
        null,
        {},
        { ...saved, baseUrl: 'file:///tmp/foo' },
        { ...saved, baseUrl: 'http://user:x@localhost/v1' },
        { ...saved, baseUrl: fake.baseUrl + '?key=secret' },
        { ...saved, baseUrl: fake.baseUrl + '#secret' },
        { ...saved, baseUrl: fake.baseUrl + '?' },
        { ...saved, baseUrl: fake.baseUrl + '#' },
        { ...saved, baseUrl: fake.baseUrl + '/' + saved.apiKey },
        { ...saved, apiKey: '' },
        { ...saved, apiKey: 'invalid\nkey' },
    ])
        assert.equal((await post('/api/settings/endpoint', body)).status, 400);
    assert.equal(fake.calls.length, 0, 'rejected settings never contact a host');
    assert.equal((await post('/api/settings/endpoint/test')).status, 502);
    assert.equal((await post('/api/settings/endpoint', saved)).status, 200);
    const path = join(dir, 'openai-endpoints.json');
    chmodSync(path, 0o644);
    assert.deepEqual(new OpenAI(dir).status(), { configured: true, baseUrl: fake.baseUrl });
    assert.equal(statSync(path).mode & 0o777, 0o600, 'restart repairs permissive credential mode');
    const root = await (await post('/api/trees')).json();
    assert.equal(root.provider, 'claude', 'saving an endpoint leaves default unchanged');
    assert.equal(
        (await post(`/api/trees/${root.id}/model`, { provider: 'openai', model: 'local-tutor' }))
            .status,
        200,
    );
    await (await post(`/api/trees/${root.id}/messages`, { text: 'First' })).text();
    assert.deepEqual(await (await post('/api/settings/endpoint/clear')).json(), {
        configured: false,
        baseUrl: null,
    });
    assert.equal(existsSync(path), false);
    assert.deepEqual(new OpenAI(dir).status(), { configured: false, baseUrl: null });
    const body = await (
        await post(`/api/trees/${root.id}/messages`, { text: 'After clear' })
    ).text();
    assert.match(body, /Selected provider is unavailable/);
    assert.match(body, /"status":"failed"/);
    assert.equal(nativeCalls, 0, 'no fallback to Claude after clearing');
    assert.equal(store.tree(root.id).provider, 'openai');
    assert.deepEqual(
        (await (await get('/api/models')).json()).models.map((m) => m.provider),
        ['claude'],
    );
    assert.equal((await post('/api/settings/endpoint', saved)).status, 200);
    assert.match(
        await (await post(`/api/trees/${root.id}/messages`, { text: 'Reconfigured' })).text(),
        /"status":"completed"/,
    );
    assert.equal(
        (await post('/api/settings/endpoint', { ...saved, apiKey: 'replacement-fixture-secret' }))
            .status,
        200,
    );
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.doesNotMatch(readFileSync(path, 'utf8'), /settings-fixture-secret/);
    assert.equal((await post('/api/settings/endpoint/clear')).status, 200);
    writeFileSync(path, '{invalid', { mode: 0o600 });
    assert.equal(new OpenAI(dir).status().configured, false);
    await post('/api/settings/endpoint/clear');
    const target = join(dir, 'unrelated');
    writeFileSync(target, JSON.stringify(saved));
    symlinkSync(target, path);
    assert.equal(new OpenAI(dir).status().configured, false, 'credential loader refuses symlinks');
    endpoint.clear();
    assert.equal(existsSync(target), true, 'clear removes the link, preserving unrelated targets');
});

test('catalogue validation, model-change failure and refused redirects preserve settings and send no credential to another host', async (t) => {
    const fake = await fakeOpenAI(t),
        other = await fakeOpenAI(t),
        { get, post, store } = await open(t);
    await post('/api/settings/endpoint', {
        baseUrl: fake.baseUrl,
        apiKey: 'catalogue-fixture-secret',
    });
    const tree = store.create('Catalogue', 'openai');
    store.model(tree.id, 'local-tutor');
    for (const catalogue of [
        {},
        { data: null },
        { data: [] },
        { data: [{ id: 2 }, { id: '' }, { id: 'catalogue-fixture-secret' }] },
    ]) {
        fake.catalogue = catalogue;
        assert.equal((await get('/api/models')).status, 502);
        assert.equal((await post('/api/settings/endpoint/test')).status, 502);
        assert.equal(
            (await post(`/api/trees/${tree.id}/model`, { provider: 'openai', model: 'other' }))
                .status,
            502,
        );
        assert.equal(store.tree(tree.id).model, 'local-tutor');
    }
    delete fake.catalogue;
    fake.models = [
        { id: 'local-tutor', extra: 'ignored' },
        { id: 'local-tutor' },
        { id: 'second-model' },
    ];
    assert.equal((await (await get('/api/models')).json()).models.length, 2);
    fake.modelStatus = 302;
    fake.modelHeaders = { Location: other.baseUrl + '/models' };
    assert.equal((await post('/api/settings/endpoint/test')).status, 502);
    fake.reply = (req, res) => {
        res.writeHead(307, { Location: other.baseUrl + '/chat/completions' });
        res.end();
    };
    assert.match(
        await (await post(`/api/trees/${tree.id}/messages`, { text: 'No redirect' })).text(),
        /"status":"failed"/,
    );
    assert.equal(
        other.calls.length,
        0,
        'no Authorization or inference is sent to a redirected host',
    );
    assert.deepEqual(await (await get('/api/settings/endpoint')).json(), {
        configured: true,
        baseUrl: fake.baseUrl,
    });
});

test('clearing settings interrupts in-flight generations; timeout releases resources', async (t) => {
    const fake = await fakeOpenAI(t),
        { post, store, endpoint } = await open(t);
    await post('/api/settings/endpoint', {
        baseUrl: fake.baseUrl,
        apiKey: 'lifecycle-fixture-secret',
    });
    const tree = store.create('Lifecycle', 'openai');
    store.model(tree.id, 'local-tutor');
    const started = Promise.withResolvers(),
        closed = Promise.withResolvers();
    fake.reply = (req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.flushHeaders();
        res.on('close', closed.resolve);
        started.resolve();
    };
    const response = await post(`/api/trees/${tree.id}/messages`, { text: 'Clear while running' });
    await started.promise;
    await post('/api/settings/endpoint/clear');
    assert.match(await response.text(), /"status":"interrupted"/);
    await closed.promise;
    await post('/api/settings/endpoint', {
        baseUrl: fake.baseUrl,
        apiKey: 'lifecycle-fixture-secret',
    });
    const events = [];
    await assert.rejects(
        endpoint.generate(
            { model: 'local-tutor' },
            'Timeout',
            (e) => events.push(e),
            () => assert.fail('Timeout saved a session'),
            AbortSignal.timeout(50),
        ),
        /stopped responding/,
    );
    assert.deepEqual(events, [{ type: 'status', status: 'failed' }]);
});

test('a saved video retry fails cleanly when its selected endpoint has been cleared', async (t) => {
    const fake = await fakeOpenAI(t),
        { post, get, store } = await open(t);
    await post('/api/settings/endpoint', { baseUrl: fake.baseUrl, apiKey: 'video-fixture-secret' });
    const tree = store.create('Saved video', 'openai');
    const message = store.message(tree.id, 'assistant', 'Requested video', 'completed');
    const job = store.pendingArtifact(
        tree.id,
        message,
        'Saved video',
        'Retry request',
        'video',
        '{}',
    );
    store.cancelVideo(tree.id, job.id);
    await post('/api/settings/endpoint/clear');
    assert.equal((await post(`/api/trees/${tree.id}/artifacts/${job.id}/retry`)).status, 200);
    const artifact = await (await get(`/api/trees/${tree.id}/artifacts/${job.id}`)).json();
    assert.equal(artifact.status, 'failed');
    assert.match(artifact.error, /Selected provider is unavailable/);
    assert.deepEqual(
        (await (await get('/api/state')).json()).videos,
        [],
        'missing provider leaves no running job',
    );
});
